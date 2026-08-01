#include <android/log.h>
#include <jni.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

#include <libdivecomputer/ble.h>
#include <libdivecomputer/context.h>
#include <libdivecomputer/custom.h>
#include <libdivecomputer/datetime.h>
#include <libdivecomputer/descriptor.h>
#include <libdivecomputer/device.h>
#include <libdivecomputer/parser.h>
#include <libdivecomputer/version.h>

#define PROFILE_CAPTURE_MAX 2048
#define PROFILE_OUTPUT_MAX 48

typedef struct {
    JNIEnv *env;
    jobject collector;
    jmethodID on_devinfo;
    jmethodID on_dive;
    jmethodID on_progress;
    unsigned int dive_limit;
    unsigned int dive_count;
    int cancelled;
    dc_context_t *context;
    dc_descriptor_t *descriptor;
    dc_device_t *device;
    jclass parsed_class;
} download_state_t;

typedef struct {
    JNIEnv *env;
    jclass native_class;
} ble_bridge_t;

static JavaVM *g_jvm = NULL;

static const char *status_message(dc_status_t status);

static jobject
parse_dive(
    JNIEnv *env,
    dc_context_t *context,
    dc_descriptor_t *descriptor,
    dc_device_t *device,
    const unsigned char *data,
    size_t size,
    jclass parsed_class);

#define LOG_TAG "DiveFrameDC"
#define LOG_TAIL_LINES 24
#define LOG_TAIL_LINE_LEN 160

static char g_log_tail[LOG_TAIL_LINES][LOG_TAIL_LINE_LEN];
static unsigned int g_log_count = 0;

static void
log_tail_reset(void)
{
    g_log_count = 0;
    memset(g_log_tail, 0, sizeof(g_log_tail));
}

static void
log_tail_append(const char *line)
{
    unsigned int slot = g_log_count % LOG_TAIL_LINES;
    strncpy(g_log_tail[slot], line, LOG_TAIL_LINE_LEN - 1);
    g_log_tail[slot][LOG_TAIL_LINE_LEN - 1] = '\0';
    g_log_count++;
}

static void
log_tail_join(char *buffer, size_t size)
{
    if (size == 0) {
        return;
    }
    buffer[0] = '\0';

    unsigned int total = g_log_count < LOG_TAIL_LINES ? g_log_count : LOG_TAIL_LINES;
    unsigned int start = g_log_count < LOG_TAIL_LINES ? 0 : g_log_count % LOG_TAIL_LINES;
    for (unsigned int i = 0; i < total; ++i) {
        unsigned int slot = (start + i) % LOG_TAIL_LINES;
        strncat(buffer, g_log_tail[slot], size - strlen(buffer) - 1);
        strncat(buffer, "\n", size - strlen(buffer) - 1);
    }
}

static void
dc_log_cb(
    dc_context_t *context,
    dc_loglevel_t loglevel,
    const char *file,
    unsigned int line,
    const char *function,
    const char *message,
    void *userdata)
{
    (void) context;
    (void) file;
    (void) line;
    (void) function;
    (void) userdata;

    static const char *levels[] = {"NONE", "ERROR", "WARN", "INFO", "DEBUG", "ALL"};
    const char *level = (loglevel <= DC_LOGLEVEL_ALL) ? levels[loglevel] : "?";

    int android_level = ANDROID_LOG_INFO;
    if (loglevel <= DC_LOGLEVEL_ERROR) {
        android_level = ANDROID_LOG_ERROR;
    } else if (loglevel == DC_LOGLEVEL_WARNING) {
        android_level = ANDROID_LOG_WARN;
    }

    __android_log_print(android_level, LOG_TAG, "%s: %s", level, message);

    if (loglevel <= DC_LOGLEVEL_WARNING) {
        char line_buffer[LOG_TAIL_LINE_LEN];
        snprintf(line_buffer, sizeof(line_buffer), "%s: %s", level, message);
        log_tail_append(line_buffer);
    }
}

static int
status_from_java(jint value)
{
    if (value >= 0) {
        return DC_STATUS_SUCCESS;
    }
    return (dc_status_t) value;
}

static ble_bridge_t
bridge_from_userdata(void *userdata)
{
    return *(ble_bridge_t *) userdata;
}

static dc_status_t
ble_set_timeout(void *userdata, int timeout)
{
    ble_bridge_t bridge = bridge_from_userdata(userdata);
    jmethodID method = (*bridge.env)->GetStaticMethodID(
        bridge.env, bridge.native_class, "bleSetTimeout", "(I)I");
    if (method == NULL) {
        return DC_STATUS_IO;
    }
    return status_from_java(
        (*bridge.env)->CallStaticIntMethod(
            bridge.env, bridge.native_class, method, timeout));
}

static dc_status_t
ble_poll(void *userdata, int timeout)
{
    ble_bridge_t bridge = bridge_from_userdata(userdata);
    jmethodID method = (*bridge.env)->GetStaticMethodID(
        bridge.env, bridge.native_class, "blePoll", "(I)I");
    if (method == NULL) {
        return DC_STATUS_IO;
    }
    return status_from_java(
        (*bridge.env)->CallStaticIntMethod(
            bridge.env, bridge.native_class, method, timeout));
}

static dc_status_t
ble_read(void *userdata, void *data, size_t size, size_t *actual)
{
    ble_bridge_t bridge = bridge_from_userdata(userdata);
    jmethodID method = (*bridge.env)->GetStaticMethodID(
        bridge.env, bridge.native_class, "bleRead", "([B)I");
    if (method == NULL || data == NULL || size == 0) {
        return DC_STATUS_IO;
    }

    jbyteArray buffer = (*bridge.env)->NewByteArray(bridge.env, (jsize) size);
    if (buffer == NULL) {
        return DC_STATUS_NOMEMORY;
    }

    jint result = (*bridge.env)->CallStaticIntMethod(
        bridge.env, bridge.native_class, method, buffer);
    if (result < 0) {
        (*bridge.env)->DeleteLocalRef(bridge.env, buffer);
        return status_from_java(result);
    }

    jsize copied = result;
    if ((size_t) copied > size) {
        copied = (jsize) size;
    }
    (*bridge.env)->GetByteArrayRegion(
        bridge.env, buffer, 0, copied, (jbyte *) data);
    (*bridge.env)->DeleteLocalRef(bridge.env, buffer);
    if (actual) {
        *actual = (size_t) copied;
    }
    return DC_STATUS_SUCCESS;
}

static dc_status_t
ble_write(void *userdata, const void *data, size_t size, size_t *actual)
{
    ble_bridge_t bridge = bridge_from_userdata(userdata);
    jmethodID method = (*bridge.env)->GetStaticMethodID(
        bridge.env, bridge.native_class, "bleWrite", "([B)I");
    if (method == NULL || data == NULL) {
        return DC_STATUS_IO;
    }

    jbyteArray buffer = (*bridge.env)->NewByteArray(bridge.env, (jsize) size);
    if (buffer == NULL) {
        return DC_STATUS_NOMEMORY;
    }
    (*bridge.env)->SetByteArrayRegion(
        bridge.env, buffer, 0, (jsize) size, (const jbyte *) data);

    jint result = (*bridge.env)->CallStaticIntMethod(
        bridge.env, bridge.native_class, method, buffer);
    (*bridge.env)->DeleteLocalRef(bridge.env, buffer);
    if (result < 0) {
        return status_from_java(result);
    }
    if (actual) {
        *actual = (size_t) result;
    }
    return DC_STATUS_SUCCESS;
}

static dc_status_t
ble_ioctl(void *userdata, unsigned int request, void *data, size_t size)
{
    if (request != DC_IOCTL_BLE_GET_NAME) {
        return DC_STATUS_UNSUPPORTED;
    }
    if (data == NULL || size == 0) {
        return DC_STATUS_INVALIDARGS;
    }

    ble_bridge_t bridge = bridge_from_userdata(userdata);
    jmethodID method = (*bridge.env)->GetStaticMethodID(
        bridge.env, bridge.native_class, "bleGetName", "()Ljava/lang/String;");
    if (method == NULL) {
        return DC_STATUS_IO;
    }

    jstring name = (jstring) (*bridge.env)->CallStaticObjectMethod(
        bridge.env, bridge.native_class, method);
    if (name == NULL) {
        ((char *) data)[0] = '\0';
        return DC_STATUS_SUCCESS;
    }

    const char *utf = (*bridge.env)->GetStringUTFChars(bridge.env, name, NULL);
    if (utf == NULL) {
        (*bridge.env)->DeleteLocalRef(bridge.env, name);
        return DC_STATUS_NOMEMORY;
    }
    strncpy((char *) data, utf, size - 1);
    ((char *) data)[size - 1] = '\0';
    (*bridge.env)->ReleaseStringUTFChars(bridge.env, name, utf);
    (*bridge.env)->DeleteLocalRef(bridge.env, name);
    return DC_STATUS_SUCCESS;
}

static dc_status_t
ble_purge(void *userdata, dc_direction_t direction)
{
    (void) direction;
    ble_bridge_t bridge = bridge_from_userdata(userdata);
    jmethodID method = (*bridge.env)->GetStaticMethodID(
        bridge.env, bridge.native_class, "blePurge", "()I");
    if (method == NULL) {
        return DC_STATUS_IO;
    }
    return status_from_java(
        (*bridge.env)->CallStaticIntMethod(bridge.env, bridge.native_class, method));
}

static dc_status_t
ble_sleep(void *userdata, unsigned int milliseconds)
{
    ble_bridge_t bridge = bridge_from_userdata(userdata);
    jmethodID method = (*bridge.env)->GetStaticMethodID(
        bridge.env, bridge.native_class, "bleSleep", "(I)I");
    if (method == NULL) {
        return DC_STATUS_IO;
    }
    return status_from_java(
        (*bridge.env)->CallStaticIntMethod(
            bridge.env, bridge.native_class, method, (jint) milliseconds));
}

static dc_status_t
ble_close(void *userdata)
{
    ble_bridge_t bridge = bridge_from_userdata(userdata);
    jmethodID method = (*bridge.env)->GetStaticMethodID(
        bridge.env, bridge.native_class, "bleClose", "()I");
    if (method == NULL) {
        return DC_STATUS_SUCCESS;
    }
    return status_from_java(
        (*bridge.env)->CallStaticIntMethod(bridge.env, bridge.native_class, method));
}

static int
cancel_cb(void *userdata)
{
    download_state_t *state = (download_state_t *) userdata;
    jclass native_class = (*state->env)->FindClass(
        state->env, "cc/fishese/divelog/DiveComputerNative");
    if (native_class == NULL) {
        return state->cancelled;
    }
    jmethodID method = (*state->env)->GetStaticMethodID(
        state->env, native_class, "isCancelRequested", "()Z");
    if (method == NULL) {
        (*state->env)->DeleteLocalRef(state->env, native_class);
        return state->cancelled;
    }
    jboolean cancelled = (*state->env)->CallStaticBooleanMethod(
        state->env, native_class, method);
    (*state->env)->DeleteLocalRef(state->env, native_class);
    if (cancelled) {
        state->cancelled = 1;
    }
    return state->cancelled;
}

static void
event_cb(dc_device_t *device, dc_event_type_t event, const void *data, void *userdata)
{
    download_state_t *state = (download_state_t *) userdata;
    (void) device;

    if (event == DC_EVENT_DEVINFO && data != NULL && state->on_devinfo != NULL) {
        const dc_event_devinfo_t *devinfo = (const dc_event_devinfo_t *) data;
        (*state->env)->CallVoidMethod(
            state->env,
            state->collector,
            state->on_devinfo,
            (jint) devinfo->model,
            (jint) devinfo->firmware,
            (jint) devinfo->serial);
    } else if (event == DC_EVENT_PROGRESS && data != NULL && state->on_progress != NULL) {
        const dc_event_progress_t *progress = (const dc_event_progress_t *) data;
        (*state->env)->CallVoidMethod(
            state->env,
            state->collector,
            state->on_progress,
            (jint) progress->current,
            (jint) progress->maximum);
    }
}

static int
dive_cb(
    const unsigned char *data,
    unsigned int size,
    const unsigned char *fingerprint,
    unsigned int fsize,
    void *userdata)
{
    download_state_t *state = (download_state_t *) userdata;
    if (state->on_dive == NULL || data == NULL) {
        return 0;
    }

    jbyteArray dive = (*state->env)->NewByteArray(state->env, (jsize) size);
    jbyteArray fp = (*state->env)->NewByteArray(state->env, (jsize) fsize);
    if (dive == NULL || fp == NULL) {
        if (dive) {
            (*state->env)->DeleteLocalRef(state->env, dive);
        }
        if (fp) {
            (*state->env)->DeleteLocalRef(state->env, fp);
        }
        return 0;
    }

    (*state->env)->SetByteArrayRegion(
        state->env, dive, 0, (jsize) size, (const jbyte *) data);
    if (fingerprint != NULL && fsize > 0) {
        (*state->env)->SetByteArrayRegion(
            state->env, fp, 0, (jsize) fsize, (const jbyte *) fingerprint);
    }

    jobject parsed = NULL;
    if (state->context != NULL && state->descriptor != NULL && state->parsed_class != NULL) {
        parsed = parse_dive(
            state->env,
            state->context,
            state->descriptor,
            state->device,
            data,
            (size_t) size,
            state->parsed_class);
    }

    (*state->env)->CallVoidMethod(
        state->env, state->collector, state->on_dive, dive, fp, parsed);
    (*state->env)->DeleteLocalRef(state->env, dive);
    (*state->env)->DeleteLocalRef(state->env, fp);
    if (parsed) {
        (*state->env)->DeleteLocalRef(state->env, parsed);
    }

    state->dive_count++;
    if (state->dive_limit > 0 && state->dive_count >= state->dive_limit) {
        return 0;
    }
    return 1;
}

static const char *
divemode_name(dc_divemode_t mode)
{
    switch (mode) {
    case DC_DIVEMODE_FREEDIVE:
        return "freedive";
    case DC_DIVEMODE_GAUGE:
        return "gauge";
    case DC_DIVEMODE_OC:
        return "oc";
    case DC_DIVEMODE_CCR:
        return "ccr";
    case DC_DIVEMODE_SCR:
        return "scr";
    default:
        return "unknown";
    }
}

typedef struct {
    unsigned int sample_count;
    unsigned int last_time_ms;
    unsigned int times[PROFILE_CAPTURE_MAX];
    double depths[PROFILE_CAPTURE_MAX];
    unsigned int n_points;
} sample_collect_t;

static void
sample_cb(dc_sample_type_t type, const dc_sample_value_t *value, void *userdata)
{
    sample_collect_t *state = (sample_collect_t *) userdata;
    if (value == NULL || state == NULL) {
        return;
    }

    if (type == DC_SAMPLE_TIME) {
        state->last_time_ms = value->time;
        state->sample_count++;
        return;
    }

    if (type == DC_SAMPLE_DEPTH && state->n_points < PROFILE_CAPTURE_MAX) {
        state->times[state->n_points] = state->last_time_ms;
        state->depths[state->n_points] = value->depth;
        state->n_points++;
    }
}

static void
append_profile_points(JNIEnv *env, jobject parsed, jmethodID add_profile, sample_collect_t *samples)
{
    if (samples->n_points == 0) {
        return;
    }

    unsigned int step = 1;
    if (samples->n_points > PROFILE_OUTPUT_MAX) {
        step = samples->n_points / PROFILE_OUTPUT_MAX;
        if (step == 0) {
            step = 1;
        }
    }

    for (unsigned int i = 0; i < samples->n_points; i += step) {
        (*env)->CallVoidMethod(
            env,
            parsed,
            add_profile,
            (jint) samples->times[i],
            (jdouble) samples->depths[i]);
    }

    unsigned int last = samples->n_points - 1;
    if (last % step != 0) {
        (*env)->CallVoidMethod(
            env,
            parsed,
            add_profile,
            (jint) samples->times[last],
            (jdouble) samples->depths[last]);
    }
}

static jobject
parse_dive(
    JNIEnv *env,
    dc_context_t *context,
    dc_descriptor_t *descriptor,
    dc_device_t *device,
    const unsigned char *data,
    size_t size,
    jclass parsed_class)
{
    jmethodID parsed_ctor = (*env)->GetMethodID(env, parsed_class, "<init>", "()V");
    jmethodID set_status = (*env)->GetMethodID(
        env, parsed_class, "setParseStatus", "(ILjava/lang/String;)V");
    jmethodID set_datetime = (*env)->GetMethodID(
        env, parsed_class, "setDatetime", "(Ljava/lang/String;)V");
    jmethodID set_divetime = (*env)->GetMethodID(
        env, parsed_class, "setDiveTimeSeconds", "(I)V");
    jmethodID set_maxdepth = (*env)->GetMethodID(
        env, parsed_class, "setMaxDepthM", "(D)V");
    jmethodID set_avgdepth = (*env)->GetMethodID(
        env, parsed_class, "setAvgDepthM", "(D)V");
    jmethodID set_tmin = (*env)->GetMethodID(
        env, parsed_class, "setTemperatureMinC", "(D)V");
    jmethodID set_tmax = (*env)->GetMethodID(
        env, parsed_class, "setTemperatureMaxC", "(D)V");
    jmethodID set_tsurf = (*env)->GetMethodID(
        env, parsed_class, "setTemperatureSurfaceC", "(D)V");
    jmethodID set_atm = (*env)->GetMethodID(
        env, parsed_class, "setAtmosphericBar", "(D)V");
    jmethodID set_mode = (*env)->GetMethodID(
        env, parsed_class, "setDiveMode", "(Ljava/lang/String;)V");
    jmethodID set_samples = (*env)->GetMethodID(
        env, parsed_class, "setSampleCount", "(I)V");
    jmethodID add_gas = (*env)->GetMethodID(
        env, parsed_class, "addGasMix", "(DDD)V");
    jmethodID add_tank = (*env)->GetMethodID(
        env, parsed_class, "addTank", "(DDI)V");
    jmethodID add_profile = (*env)->GetMethodID(
        env, parsed_class, "addProfilePoint", "(ID)V");

    if (!parsed_ctor || !set_status || !set_datetime || !set_divetime
        || !set_maxdepth || !set_avgdepth || !set_tmin || !set_tmax
        || !set_tsurf || !set_atm || !set_mode || !set_samples
        || !add_gas || !add_tank || !add_profile) {
        return NULL;
    }

    jobject parsed = (*env)->NewObject(env, parsed_class, parsed_ctor);
    if (parsed == NULL) {
        return NULL;
    }

    dc_parser_t *parser = NULL;
    dc_status_t status = DC_STATUS_SUCCESS;
    if (device != NULL) {
        status = dc_parser_new(&parser, device, data, size);
    } else {
        status = dc_parser_new2(&parser, context, descriptor, data, size);
    }

    if (status != DC_STATUS_SUCCESS || parser == NULL) {
        jstring message = (*env)->NewStringUTF(env, status_message(status));
        (*env)->CallVoidMethod(env, parsed, set_status, (jint) status, message);
        (*env)->DeleteLocalRef(env, message);
        return parsed;
    }

    dc_datetime_t dt;
    memset(&dt, 0, sizeof(dt));
    status = dc_parser_get_datetime(parser, &dt);
    if (status == DC_STATUS_SUCCESS) {
        char datetime[40];
        snprintf(
            datetime,
            sizeof(datetime),
            "%04d-%02d-%02dT%02d:%02d:%02d",
            dt.year,
            dt.month,
            dt.day,
            dt.hour,
            dt.minute,
            dt.second);
        jstring datetime_str = (*env)->NewStringUTF(env, datetime);
        (*env)->CallVoidMethod(env, parsed, set_datetime, datetime_str);
        (*env)->DeleteLocalRef(env, datetime_str);
    }

    unsigned int divetime = 0;
    if (dc_parser_get_field(parser, DC_FIELD_DIVETIME, 0, &divetime) == DC_STATUS_SUCCESS) {
        (*env)->CallVoidMethod(env, parsed, set_divetime, (jint) divetime);
    }

    double maxdepth = 0.0;
    if (dc_parser_get_field(parser, DC_FIELD_MAXDEPTH, 0, &maxdepth) == DC_STATUS_SUCCESS) {
        (*env)->CallVoidMethod(env, parsed, set_maxdepth, (jdouble) maxdepth);
    }

    double avgdepth = 0.0;
    if (dc_parser_get_field(parser, DC_FIELD_AVGDEPTH, 0, &avgdepth) == DC_STATUS_SUCCESS) {
        (*env)->CallVoidMethod(env, parsed, set_avgdepth, (jdouble) avgdepth);
    }

    double temperature = 0.0;
    if (dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_MINIMUM, 0, &temperature)
        == DC_STATUS_SUCCESS) {
        (*env)->CallVoidMethod(env, parsed, set_tmin, (jdouble) temperature);
    }
    if (dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_MAXIMUM, 0, &temperature)
        == DC_STATUS_SUCCESS) {
        (*env)->CallVoidMethod(env, parsed, set_tmax, (jdouble) temperature);
    }
    if (dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_SURFACE, 0, &temperature)
        == DC_STATUS_SUCCESS) {
        (*env)->CallVoidMethod(env, parsed, set_tsurf, (jdouble) temperature);
    }

    double atmospheric = 0.0;
    if (dc_parser_get_field(parser, DC_FIELD_ATMOSPHERIC, 0, &atmospheric)
        == DC_STATUS_SUCCESS) {
        (*env)->CallVoidMethod(env, parsed, set_atm, (jdouble) atmospheric);
    }

    dc_divemode_t divemode = DC_DIVEMODE_OC;
    if (dc_parser_get_field(parser, DC_FIELD_DIVEMODE, 0, &divemode) == DC_STATUS_SUCCESS) {
        jstring mode_str = (*env)->NewStringUTF(env, divemode_name(divemode));
        (*env)->CallVoidMethod(env, parsed, set_mode, mode_str);
        (*env)->DeleteLocalRef(env, mode_str);
    }

    unsigned int ngases = 0;
    if (dc_parser_get_field(parser, DC_FIELD_GASMIX_COUNT, 0, &ngases) == DC_STATUS_SUCCESS) {
        for (unsigned int i = 0; i < ngases; ++i) {
            dc_gasmix_t gasmix;
            memset(&gasmix, 0, sizeof(gasmix));
            if (dc_parser_get_field(parser, DC_FIELD_GASMIX, i, &gasmix) == DC_STATUS_SUCCESS) {
                (*env)->CallVoidMethod(
                    env,
                    parsed,
                    add_gas,
                    (jdouble) gasmix.oxygen,
                    (jdouble) gasmix.helium,
                    (jdouble) gasmix.nitrogen);
            }
        }
    }

    unsigned int ntanks = 0;
    if (dc_parser_get_field(parser, DC_FIELD_TANK_COUNT, 0, &ntanks) == DC_STATUS_SUCCESS) {
        for (unsigned int i = 0; i < ntanks; ++i) {
            dc_tank_t tank;
            memset(&tank, 0, sizeof(tank));
            if (dc_parser_get_field(parser, DC_FIELD_TANK, i, &tank) == DC_STATUS_SUCCESS) {
                int gasmix_index =
                    tank.gasmix == DC_GASMIX_UNKNOWN ? -1 : (int) tank.gasmix;
                (*env)->CallVoidMethod(
                    env,
                    parsed,
                    add_tank,
                    (jdouble) tank.beginpressure,
                    (jdouble) tank.endpressure,
                    (jint) gasmix_index);
            }
        }
    }

    sample_collect_t samples;
    memset(&samples, 0, sizeof(samples));
    status = dc_parser_samples_foreach(parser, sample_cb, &samples);
    if (status == DC_STATUS_SUCCESS) {
        (*env)->CallVoidMethod(env, parsed, set_samples, (jint) samples.sample_count);
        append_profile_points(env, parsed, add_profile, &samples);
    }

    jstring ok_message = (*env)->NewStringUTF(env, status_message(status));
    (*env)->CallVoidMethod(env, parsed, set_status, (jint) status, ok_message);
    (*env)->DeleteLocalRef(env, ok_message);

    dc_parser_destroy(parser);
    return parsed;
}

static dc_status_t
find_descriptor(dc_descriptor_t **out, const char *product_name)
{
    dc_iterator_t *iterator = NULL;
    dc_status_t rc = dc_descriptor_iterator_new(&iterator, NULL);
    if (rc != DC_STATUS_SUCCESS) {
        return rc;
    }

    dc_descriptor_t *match = NULL;
    dc_descriptor_t *descriptor = NULL;
    while ((rc = dc_iterator_next(iterator, &descriptor)) == DC_STATUS_SUCCESS) {
        const char *vendor = dc_descriptor_get_vendor(descriptor);
        const char *product = dc_descriptor_get_product(descriptor);
        unsigned int transports = dc_descriptor_get_transports(descriptor);
        int vendor_ok = vendor && strcasecmp(vendor, "Shearwater") == 0;
        int product_ok =
            product && product_name && strcasecmp(product, product_name) == 0;
        int ble_ok = (transports & DC_TRANSPORT_BLE) != 0;

        if (vendor_ok && product_ok && ble_ok) {
            match = descriptor;
            break;
        }
        dc_descriptor_free(descriptor);
    }

    dc_iterator_free(iterator);
    if (match == NULL) {
        return DC_STATUS_UNSUPPORTED;
    }
    *out = match;
    return DC_STATUS_SUCCESS;
}

static const char *
status_message(dc_status_t status)
{
    switch (status) {
    case DC_STATUS_SUCCESS:
        return "Success";
    case DC_STATUS_UNSUPPORTED:
        return "Unsupported operation";
    case DC_STATUS_INVALIDARGS:
        return "Invalid arguments";
    case DC_STATUS_NOMEMORY:
        return "Out of memory";
    case DC_STATUS_NODEVICE:
        return "No device found";
    case DC_STATUS_NOACCESS:
        return "Access denied";
    case DC_STATUS_IO:
        return "Input/output error";
    case DC_STATUS_TIMEOUT:
        return "Timeout";
    case DC_STATUS_PROTOCOL:
        return "Protocol error";
    case DC_STATUS_DATAFORMAT:
        return "Data format error";
    case DC_STATUS_CANCELLED:
        return "Cancelled";
    default:
        return "Unknown error";
    }
}

static jobject
failure_result(JNIEnv *env, jclass result_class, jmethodID result_fail, dc_status_t status, const char *message)
{
    jstring message_str = (*env)->NewStringUTF(env, message);
    return (*env)->CallStaticObjectMethod(
        env, result_class, result_fail, (jint) status, message_str);
}

JNIEXPORT jint JNICALL
JNI_OnLoad(JavaVM *vm, void *reserved)
{
    (void) reserved;
    g_jvm = vm;
    return JNI_VERSION_1_6;
}

JNIEXPORT jstring JNICALL
Java_cc_fishese_divelog_DiveComputerNative_libdivecomputerVersion(
    JNIEnv *env,
    jclass clazz)
{
    (void) clazz;
    return (*env)->NewStringUTF(env, dc_version(NULL));
}

JNIEXPORT jobject JNICALL
Java_cc_fishese_divelog_DiveComputerNative_nativeDownload(
    JNIEnv *env,
    jclass clazz,
    jstring product_name,
    jint limit,
    jbyteArray fingerprint)
{
    jclass result_class = (*env)->FindClass(
        env, "cc/fishese/divelog/DiveComputerNative$DownloadResult");
    jclass raw_dive_class = (*env)->FindClass(
        env, "cc/fishese/divelog/DiveComputerNative$RawDive");
    jclass parsed_class = (*env)->FindClass(
        env, "cc/fishese/divelog/DiveComputerNative$ParsedDive");
    jclass arraylist_class = (*env)->FindClass(env, "java/util/ArrayList");
    jclass collector_class = (*env)->FindClass(
        env, "cc/fishese/divelog/DiveComputerDownloadCollector");

    if (!result_class || !raw_dive_class || !parsed_class || !arraylist_class
        || !collector_class) {
        return NULL;
    }

    jmethodID result_fail = (*env)->GetStaticMethodID(
        env,
        result_class,
        "failure",
        "(ILjava/lang/String;)Lcc/fishese/divelog/DiveComputerNative$DownloadResult;");
    jmethodID result_ctor = (*env)->GetMethodID(
        env,
        result_class,
        "<init>",
        "(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;IIIILjava/util/List;Ljava/lang/String;)V");
    jmethodID raw_ctor = (*env)->GetMethodID(
        env,
        raw_dive_class,
        "<init>",
        "([B[BLcc/fishese/divelog/DiveComputerNative$ParsedDive;)V");
    jmethodID arraylist_ctor = (*env)->GetMethodID(env, arraylist_class, "<init>", "()V");
    jmethodID arraylist_add = (*env)->GetMethodID(
        env, arraylist_class, "add", "(Ljava/lang/Object;)Z");
    jmethodID collector_ctor = (*env)->GetMethodID(env, collector_class, "<init>", "()V");
    jmethodID on_devinfo = (*env)->GetMethodID(env, collector_class, "onDevInfo", "(III)V");
    jmethodID on_dive = (*env)->GetMethodID(
        env,
        collector_class,
        "onDive",
        "([B[BLcc/fishese/divelog/DiveComputerNative$ParsedDive;)V");
    jmethodID on_progress = (*env)->GetMethodID(env, collector_class, "onProgress", "(II)V");
    jmethodID dive_count_method = (*env)->GetMethodID(env, collector_class, "diveCount", "()I");
    jmethodID dive_at = (*env)->GetMethodID(env, collector_class, "diveAt", "(I)[B");
    jmethodID fp_at = (*env)->GetMethodID(env, collector_class, "fingerprintAt", "(I)[B");
    jmethodID parsed_at = (*env)->GetMethodID(
        env,
        collector_class,
        "parsedAt",
        "(I)Lcc/fishese/divelog/DiveComputerNative$ParsedDive;");
    jmethodID model_get = (*env)->GetMethodID(env, collector_class, "model", "()I");
    jmethodID firmware_get = (*env)->GetMethodID(env, collector_class, "firmware", "()I");
    jmethodID serial_get = (*env)->GetMethodID(env, collector_class, "serial", "()I");

    if (!result_fail || !result_ctor || !raw_ctor || !arraylist_ctor || !arraylist_add
        || !collector_ctor || !on_devinfo || !on_dive || !on_progress
        || !dive_count_method || !dive_at || !fp_at || !parsed_at || !model_get
        || !firmware_get || !serial_get) {
        return NULL;
    }

    if (product_name == NULL) {
        return failure_result(
            env, result_class, result_fail, DC_STATUS_INVALIDARGS, "Product name is required.");
    }

    const char *product = (*env)->GetStringUTFChars(env, product_name, NULL);
    if (product == NULL) {
        return failure_result(
            env, result_class, result_fail, DC_STATUS_NOMEMORY, "Unable to read product name.");
    }

    jobject collector = (*env)->NewObject(env, collector_class, collector_ctor);
    jobject dive_list = (*env)->NewObject(env, arraylist_class, arraylist_ctor);

    download_state_t state;
    memset(&state, 0, sizeof(state));
    state.env = env;
    state.collector = collector;
    state.on_devinfo = on_devinfo;
    state.on_dive = on_dive;
    state.on_progress = on_progress;
    /* limit <= 0 means unlimited (full import); positive values cap dive_cb. */
    state.dive_limit = limit > 0 ? (unsigned int) limit : 0;
    state.dive_count = 0;
    state.cancelled = 0;
    state.parsed_class = parsed_class;

    dc_context_t *context = NULL;
    dc_descriptor_t *descriptor = NULL;
    dc_iostream_t *iostream = NULL;
    dc_device_t *device = NULL;
    dc_status_t status = DC_STATUS_SUCCESS;
    dc_family_t family = DC_FAMILY_SHEARWATER_PETREL;
    const char *vendor_cstr = "Shearwater";
    char product_copy[64];
    strncpy(product_copy, product, sizeof(product_copy) - 1);
    product_copy[sizeof(product_copy) - 1] = '\0';

    ble_bridge_t bridge;
    bridge.env = env;
    bridge.native_class = clazz;

    const dc_custom_cbs_t callbacks = {
        .set_timeout = ble_set_timeout,
        .set_break = NULL,
        .set_dtr = NULL,
        .set_rts = NULL,
        .get_lines = NULL,
        .get_available = NULL,
        .configure = NULL,
        .poll = ble_poll,
        .read = ble_read,
        .write = ble_write,
        .ioctl = ble_ioctl,
        .flush = NULL,
        .purge = ble_purge,
        .sleep = ble_sleep,
        .close = ble_close,
    };

    log_tail_reset();

    status = dc_context_new(&context);
    if (status != DC_STATUS_SUCCESS) {
        goto finish;
    }

    dc_context_set_loglevel(context, DC_LOGLEVEL_WARNING);
    dc_context_set_logfunc(context, dc_log_cb, NULL);

    status = find_descriptor(&descriptor, product);
    if (status != DC_STATUS_SUCCESS) {
        goto finish;
    }

    vendor_cstr = dc_descriptor_get_vendor(descriptor);
    family = dc_descriptor_get_type(descriptor);

    status = dc_custom_open(&iostream, context, DC_TRANSPORT_BLE, &callbacks, &bridge);
    if (status != DC_STATUS_SUCCESS) {
        goto finish;
    }

    status = dc_device_open(&device, context, descriptor, iostream);
    if (status != DC_STATUS_SUCCESS) {
        goto finish;
    }

    if (fingerprint != NULL) {
        jsize fp_size = (*env)->GetArrayLength(env, fingerprint);
        if (fp_size > 0) {
            jbyte *fp_bytes = (*env)->GetByteArrayElements(env, fingerprint, NULL);
            if (fp_bytes == NULL) {
                status = DC_STATUS_NOMEMORY;
                goto finish;
            }
            status = dc_device_set_fingerprint(
                device,
                (const unsigned char *) fp_bytes,
                (unsigned int) fp_size);
            (*env)->ReleaseByteArrayElements(env, fingerprint, fp_bytes, JNI_ABORT);
            if (status != DC_STATUS_SUCCESS) {
                goto finish;
            }
        }
    }

    dc_device_set_cancel(device, cancel_cb, &state);
    dc_device_set_events(
        device,
        DC_EVENT_DEVINFO | DC_EVENT_PROGRESS | DC_EVENT_WAITING,
        event_cb,
        &state);

    state.context = context;
    state.descriptor = descriptor;
    state.device = device;

    status = dc_device_foreach(device, dive_cb, &state);

finish:
    jint model = (*env)->CallIntMethod(env, collector, model_get);
    jint firmware = (*env)->CallIntMethod(env, collector, firmware_get);
    jint serial = (*env)->CallIntMethod(env, collector, serial_get);
    jint count = (*env)->CallIntMethod(env, collector, dive_count_method);
    for (jint i = 0; i < count; ++i) {
        jbyteArray dive = (jbyteArray) (*env)->CallObjectMethod(env, collector, dive_at, i);
        jbyteArray fp = (jbyteArray) (*env)->CallObjectMethod(env, collector, fp_at, i);
        jobject parsed = (*env)->CallObjectMethod(env, collector, parsed_at, i);

        jobject raw = (*env)->NewObject(env, raw_dive_class, raw_ctor, dive, fp, parsed);
        (*env)->CallBooleanMethod(env, dive_list, arraylist_add, raw);
        (*env)->DeleteLocalRef(env, dive);
        (*env)->DeleteLocalRef(env, fp);
        if (parsed) {
            (*env)->DeleteLocalRef(env, parsed);
        }
        (*env)->DeleteLocalRef(env, raw);
    }

    if (device) {
        dc_device_close(device);
    } else if (iostream) {
        dc_iostream_close(iostream);
    }

    char log_tail[LOG_TAIL_LINES * LOG_TAIL_LINE_LEN];
    log_tail_join(log_tail, sizeof(log_tail));

    jstring vendor_str = (*env)->NewStringUTF(env, vendor_cstr ? vendor_cstr : "Shearwater");
    jstring product_str = (*env)->NewStringUTF(env, product_copy);
    jstring message_str = (*env)->NewStringUTF(env, status_message(status));
    jstring log_str = (*env)->NewStringUTF(env, log_tail);

    jobject result = (*env)->NewObject(
        env,
        result_class,
        result_ctor,
        (jint) status,
        message_str,
        vendor_str,
        product_str,
        (jint) family,
        model,
        firmware,
        serial,
        dive_list,
        log_str);

    if (descriptor) {
        dc_descriptor_free(descriptor);
    }
    if (context) {
        dc_context_free(context);
    }
    (*env)->ReleaseStringUTFChars(env, product_name, product);
    return result;
}
