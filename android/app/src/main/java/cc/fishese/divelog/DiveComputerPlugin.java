package cc.fishese.divelog;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "DiveComputer",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
            }
        ),
        @Permission(
            alias = "bluetoothLegacy",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
            }
        ),
        @Permission(
            alias = "mediaLocation",
            strings = {
                Manifest.permission.ACCESS_MEDIA_LOCATION,
            }
        ),
    }
)
public class DiveComputerPlugin extends Plugin {
    private static final String API_VERSION = "0.6-spike";
    private static final String LIBDIVECOMPUTER_COMMIT =
        "8e564eb5cf9fb4318af3d540895abb916e1809b0";
    private static final long DEFAULT_SCAN_TIMEOUT_MS = 15_000L;

    private DiveComputerSession session;
    private final ExecutorService downloadExecutor =
        Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        session = new DiveComputerSession(getContext());
        session.setListener(new DiveComputerSession.Listener() {
            @Override
            public void onPhaseChanged(DiveComputerSession.Phase phase) {
                JSObject event = new JSObject();
                event.put("phase", phase.name().toLowerCase());
                event.put("captureActive", session.isCaptureActive());
                event.put("transportReady", session.isTransportReady());
                notifyListeners("phaseChanged", event);
            }

            @Override
            public void onDeviceFound(String address, String name, int rssi) {
                JSObject event = new JSObject();
                event.put("address", address);
                event.put("name", name);
                event.put("rssi", rssi);
                notifyListeners("deviceFound", event);
            }

            @Override
            public void onScanStopped(String reason) {
                JSObject event = new JSObject();
                event.put("reason", reason);
                notifyListeners("scanStopped", event);
            }

            @Override
            public void onTransportReady(String address, String name, String serviceUuid) {
                JSObject event = new JSObject();
                event.put("address", address);
                event.put("name", name);
                event.put("serviceUuid", serviceUuid);
                notifyListeners("transportReady", event);
            }

            @Override
            public void onTransportClosed(String reason) {
                JSObject event = new JSObject();
                event.put("reason", reason);
                notifyListeners("transportClosed", event);
            }

            @Override
            public void onError(String code, String message) {
                JSObject event = new JSObject();
                event.put("code", code);
                event.put("message", message);
                notifyListeners("transportError", event);
            }

            @Override
            public void onDownloadProgress(int current, int maximum, int diveCount) {
                JSObject event = new JSObject();
                event.put("current", current);
                event.put("maximum", maximum);
                event.put("diveCount", diveCount);
                notifyListeners("downloadProgress", event);
            }

            @Override
            public void onDiveCaptured(
                int index,
                int size,
                String fingerprintHex,
                String dataBase64,
                DiveComputerNative.ParsedDive parsed,
                int serial
            ) {
                JSObject event = new JSObject();
                event.put("index", index);
                event.put("size", size);
                event.put("fingerprintHex", fingerprintHex == null ? "" : fingerprintHex);
                event.put("dataBase64", dataBase64 == null ? "" : dataBase64);
                event.put("serial", Integer.toUnsignedLong(serial));
                event.put("serialHex", String.format("%08X", serial));
                String product = session != null ? session.connectedName() : "";
                if (product == null) {
                    product = "";
                }
                event.put("product", product);
                if (parsed != null) {
                    event.put("parsed", parsedToJson(parsed));
                }
                notifyListeners("diveCaptured", event);
            }
        });
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSArray operations = new JSArray();
        operations.put("getCapabilities");
        operations.put("requestPermissions");
        operations.put("requestMediaLocationPermission");
        operations.put("startScan");
        operations.put("stopScan");
        operations.put("connect");
        operations.put("disconnect");
        operations.put("downloadDives");
        operations.put("saveCaptureFixture");
        operations.put("cancel");

        JSObject result = new JSObject();
        result.put("apiVersion", API_VERSION);
        result.put("bridgeAvailable", true);
        result.put("platform", "android");
        result.put(
            "libdivecomputerVersion",
            DiveComputerNative.libdivecomputerVersion()
        );
        result.put("libdivecomputerCommit", LIBDIVECOMPUTER_COMMIT);
        result.put("transportReady", session != null && session.isTransportReady());
        result.put("phase", session == null ? "idle" : session.phase().name().toLowerCase());
        result.put("supportedOperations", operations);
        result.put(
            "classicServiceUuid",
            DiveComputerGattClient.SHEARWATER_CLASSIC_SERVICE.toString()
        );
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        requestPermissionForAlias(bluetoothAlias(), call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("bluetooth", getPermissionState(bluetoothAlias()).name());
        call.resolve(result);
    }

    @PluginMethod
    public void requestMediaLocationPermission(PluginCall call) {
        // ACCESS_MEDIA_LOCATION was introduced in Android 10. On older
        // versions the platform does not redact shared-photo EXIF metadata.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            JSObject result = new JSObject();
            result.put("mediaLocation", "granted");
            call.resolve(result);
            return;
        }
        requestPermissionForAlias(
            "mediaLocation",
            call,
            "mediaLocationPermissionCallback"
        );
    }

    @PermissionCallback
    private void mediaLocationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("mediaLocation", getPermissionState("mediaLocation").name());
        call.resolve(result);
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (getPermissionState(bluetoothAlias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(bluetoothAlias(), call, "scanPermissionCallback");
            return;
        }
        beginScan(call);
    }

    @PermissionCallback
    private void scanPermissionCallback(PluginCall call) {
        if (getPermissionState(bluetoothAlias()) != PermissionState.GRANTED) {
            call.reject("Bluetooth permission was denied.", "permission_denied");
            return;
        }
        beginScan(call);
    }

    private void beginScan(PluginCall call) {
        long timeoutMs = call.getLong("timeoutMs", DEFAULT_SCAN_TIMEOUT_MS);
        try {
            session.startScan(timeoutMs);
            JSObject result = new JSObject();
            result.put("scanning", true);
            result.put("timeoutMs", timeoutMs);
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject(error.getMessage(), "scan_start_failed", error);
        }
    }

    private String bluetoothAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? "bluetooth"
            : "bluetoothLegacy";
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        session.stopScan();
        JSObject result = new JSObject();
        result.put("scanning", false);
        call.resolve(result);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        String name = call.getString("name", "");
        try {
            session.connect(address, name);
            JSObject result = new JSObject();
            result.put("connecting", true);
            result.put("address", address);
            result.put("name", name);
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject(error.getMessage(), "connect_failed", error);
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        session.disconnect();
        JSObject result = new JSObject();
        result.put("disconnected", true);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadDives(PluginCall call) {
        int limit = call.getInt("limit", 5);
        String fingerprintHex = call.getString("fingerprintHex", null);
        byte[] fingerprint;
        try {
            fingerprint = parseFingerprintHex(fingerprintHex);
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), "invalid_fingerprint");
            return;
        }
        final byte[] checkpoint = fingerprint;
        final int requestedLimit = limit;
        downloadExecutor.execute(() -> {
            setKeepScreenOn(true);
            try {
                DiveComputerNative.DownloadResult download =
                    session.downloadDives(requestedLimit, checkpoint);
                JSObject result = new JSObject();
                result.put("status", download.status);
                result.put("message", download.message);
                result.put("vendor", download.vendor);
                result.put("product", download.product);
                result.put("family", download.family);
                result.put("model", download.model);
                result.put("firmware", download.firmware);
                result.put("serial", Integer.toUnsignedLong(download.serial));
                result.put(
                    "serialHex",
                    String.format("%08X", download.serial)
                );
                result.put("cancelled", download.status == -10);
                result.put("persisted", false);
                result.put("limit", requestedLimit);
                result.put(
                    "fingerprintHexUsed",
                    fingerprintHex == null || fingerprintHex.isEmpty()
                        ? ""
                        : fingerprintHex.trim().toUpperCase()
                );
                result.put("logTail", download.logTail);

                JSArray dives = new JSArray();
                String newestFingerprint = "";
                for (DiveComputerNative.RawDive dive : download.dives) {
                    JSObject item = new JSObject();
                    item.put("size", dive.data.length);
                    String fp = dive.fingerprintHex();
                    item.put("fingerprintHex", fp);
                    if (newestFingerprint.isEmpty() && !fp.isEmpty()) {
                        newestFingerprint = fp;
                    }
                    item.put("dataBase64", dive.dataBase64());
                    if (dive.parsed != null) {
                        item.put("parsed", parsedToJson(dive.parsed));
                    }
                    dives.put(item);
                }
                result.put("dives", dives);
                result.put("diveCount", download.dives.size());
                result.put("newestFingerprintHex", newestFingerprint);
                call.resolve(result);
            } catch (RuntimeException error) {
                call.reject(error.getMessage(), "download_failed", error);
            } finally {
                setKeepScreenOn(false);
            }
        });
    }

    private void setKeepScreenOn(boolean enabled) {
        Activity activity = getActivity();
        if (activity == null) {
            return;
        }
        activity.runOnUiThread(() -> {
            if (enabled) {
                activity
                    .getWindow()
                    .addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity
                    .getWindow()
                    .clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    /**
     * Writes a text fixture into the public Downloads folder (MediaStore on
     * Android 10+) so the spike UI does not rely on WebView blob downloads,
     * which often fail silently.
     */
    @PluginMethod
    public void saveCaptureFixture(PluginCall call) {
        String filename = call.getString("filename", null);
        String contents = call.getString("contents", null);
        if (filename == null || filename.trim().isEmpty()) {
            call.reject("filename is required.", "invalid_args");
            return;
        }
        if (contents == null) {
            call.reject("contents is required.", "invalid_args");
            return;
        }
        String safeName = sanitizeFilename(filename.trim());
        downloadExecutor.execute(() -> {
            try {
                JSObject result = writeFixtureFile(safeName, contents);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(
                    error.getMessage() == null
                        ? "Unable to save capture fixture."
                        : error.getMessage(),
                    "save_failed",
                    error
                );
            }
        });
    }

    private JSObject writeFixtureFile(String filename, String contents) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = getContext()
                .getContentResolver()
                .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IllegalStateException("MediaStore refused the Downloads insert.");
            }
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri)) {
                if (stream == null) {
                    throw new IllegalStateException("Unable to open Downloads output stream.");
                }
                try (OutputStreamWriter writer =
                    new OutputStreamWriter(stream, StandardCharsets.UTF_8)) {
                    writer.write(contents);
                }
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, values, null, null);

            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("filename", filename);
            result.put("uri", uri.toString());
            result.put("location", "Downloads");
            result.put(
                "hint",
                "Open the system Files / Downloads app and look for " + filename
            );
            return result;
        }

        File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) {
            directory = getContext().getFilesDir();
        }
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Unable to create app Downloads directory.");
        }
        File file = new File(directory, filename);
        try (FileOutputStream stream = new FileOutputStream(file);
             OutputStreamWriter writer =
                 new OutputStreamWriter(stream, StandardCharsets.UTF_8)) {
            writer.write(contents);
        }
        JSObject result = new JSObject();
        result.put("saved", true);
        result.put("filename", filename);
        result.put("uri", file.toURI().toString());
        result.put("location", file.getAbsolutePath());
        result.put(
            "hint",
            "Saved under the app’s private Downloads folder (pre-Android 10 path)."
        );
        return result;
    }

    private static String sanitizeFilename(String filename) {
        String base = filename.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) {
            base = base.substring(slash + 1);
        }
        base = base.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!base.toLowerCase().endsWith(".json")) {
            base = base + ".json";
        }
        return base;
    }

    private static byte[] parseFingerprintHex(String fingerprintHex) {
        if (fingerprintHex == null) {
            return null;
        }
        String trimmed = fingerprintHex.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if ((trimmed.length() % 2) != 0) {
            throw new IllegalArgumentException(
                "fingerprintHex must have an even number of hex digits."
            );
        }
        int length = trimmed.length() / 2;
        byte[] bytes = new byte[length];
        for (int i = 0; i < length; i++) {
            int index = i * 2;
            bytes[i] = (byte) Integer.parseInt(trimmed.substring(index, index + 2), 16);
        }
        return bytes;
    }

    private static JSObject parsedToJson(DiveComputerNative.ParsedDive parsed) {
        JSObject out = new JSObject();
        out.put("parseStatus", parsed.parseStatus);
        out.put("parseMessage", parsed.parseMessage);
        out.put("datetime", parsed.datetime);
        out.put("diveTimeSeconds", parsed.diveTimeSeconds);
        putOptionalDouble(out, "maxDepthM", parsed.maxDepthM);
        putOptionalDouble(out, "avgDepthM", parsed.avgDepthM);
        putOptionalDouble(out, "temperatureMinC", parsed.temperatureMinC);
        putOptionalDouble(out, "temperatureMaxC", parsed.temperatureMaxC);
        putOptionalDouble(out, "temperatureSurfaceC", parsed.temperatureSurfaceC);
        putOptionalDouble(out, "atmosphericBar", parsed.atmosphericBar);
        out.put("diveMode", parsed.diveMode);
        out.put("sampleCount", parsed.sampleCount);
        putOptionalDouble(out, "gpsEntryLat", parsed.entryLatitude);
        putOptionalDouble(out, "gpsEntryLng", parsed.entryLongitude);
        putOptionalDouble(out, "gpsExitLat", parsed.exitLatitude);
        putOptionalDouble(out, "gpsExitLng", parsed.exitLongitude);

        JSArray gasmixes = new JSArray();
        for (DiveComputerNative.GasMix mix : parsed.gasmixes) {
            JSObject gas = new JSObject();
            gas.put("oxygen", mix.oxygen);
            gas.put("helium", mix.helium);
            gas.put("nitrogen", mix.nitrogen);
            gas.put("o2Percent", Math.round(mix.oxygen * 1000.0) / 10.0);
            gas.put("hePercent", Math.round(mix.helium * 1000.0) / 10.0);
            gasmixes.put(gas);
        }
        out.put("gasmixes", gasmixes);

        JSArray tanks = new JSArray();
        for (DiveComputerNative.TankInfo tank : parsed.tanks) {
            JSObject item = new JSObject();
            item.put("beginPressureBar", tank.beginPressureBar);
            item.put("endPressureBar", tank.endPressureBar);
            item.put("gasmixIndex", tank.gasmixIndex);
            tanks.put(item);
        }
        out.put("tanks", tanks);

        JSArray profile = new JSArray();
        for (DiveComputerNative.ProfilePoint point : parsed.profile) {
            JSObject item = new JSObject();
            item.put("timeMs", point.timeMs);
            item.put("depthM", point.depthM);
            profile.put(item);
        }
        out.put("profile", profile);
        return out;
    }

    private static void putOptionalDouble(JSObject target, String key, double value) {
        if (!Double.isNaN(value)) {
            target.put(key, value);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        boolean cancelled = session.cancel();
        JSObject result = new JSObject();
        result.put("cancelled", cancelled);
        result.put("captureActive", session.isCaptureActive());
        call.resolve(result);
    }
}
