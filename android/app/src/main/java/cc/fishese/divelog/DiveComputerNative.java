package cc.fishese.divelog;

import android.util.Base64;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * JNI surface for the pinned libdivecomputer build. The active GATT client is
 * installed only for the duration of a download on a worker thread.
 */
final class DiveComputerNative {
    static {
        System.loadLibrary("diveframe_dc");
    }

    private static final Object LOCK = new Object();
    private static DiveComputerGattClient activeTransport;
    private static final AtomicBoolean CANCEL_REQUESTED = new AtomicBoolean(false);

    private DiveComputerNative() {}

    static native String libdivecomputerVersion();

    /**
     * Runs a limited Shearwater download over the installed GATT transport.
     * Must be called from a background thread while {@link #installTransport}
     * is active. {@code fingerprint} is the optional libdivecomputer checkpoint
     * (raw bytes); download stops when that dive is reached and does not
     * include it.
     */
    static native DownloadResult nativeDownload(
        String productName,
        int limit,
        byte[] fingerprint
    );

    interface DownloadListener {
        void onProgress(int current, int maximum, int diveCount);

        void onDiveCaptured(
            int index,
            int size,
            String fingerprintHex,
            String dataBase64,
            ParsedDive parsed,
            int serial
        );
    }

    private static volatile DownloadListener downloadListener;

    static void setDownloadListener(DownloadListener listener) {
        downloadListener = listener;
    }

    static void emitProgress(int current, int maximum, int diveCount) {
        DownloadListener listener = downloadListener;
        if (listener != null) {
            listener.onProgress(current, maximum, diveCount);
        }
    }

    static void emitDiveCaptured(
        int index,
        int size,
        String fingerprintHex,
        String dataBase64,
        ParsedDive parsed,
        int serial
    ) {
        DownloadListener listener = downloadListener;
        if (listener != null) {
            listener.onDiveCaptured(
                index,
                size,
                fingerprintHex,
                dataBase64 == null ? "" : dataBase64,
                parsed,
                serial
            );
        }
    }

    static void installTransport(DiveComputerGattClient transport) {
        synchronized (LOCK) {
            activeTransport = transport;
            CANCEL_REQUESTED.set(false);
        }
    }

    static void clearTransport() {
        synchronized (LOCK) {
            activeTransport = null;
            CANCEL_REQUESTED.set(false);
        }
    }

    static void requestCancel() {
        CANCEL_REQUESTED.set(true);
    }

    // Called from JNI on the download worker thread.
    static boolean isCancelRequested() {
        return CANCEL_REQUESTED.get();
    }

    static int bleSetTimeout(int timeoutMs) {
        DiveComputerGattClient transport = activeTransport();
        if (transport == null) {
            return statusIo();
        }
        transport.setTimeoutMs(timeoutMs);
        return 0;
    }

    static int blePoll(int timeoutMs) {
        DiveComputerGattClient transport = activeTransport();
        if (transport == null) {
            return statusIo();
        }
        try {
            int code = transport.poll(timeoutMs);
            return code == 0 ? 0 : statusTimeout();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return statusCancelled();
        } catch (RuntimeException error) {
            return statusIo();
        }
    }

    static int bleRead(byte[] buffer) {
        DiveComputerGattClient transport = activeTransport();
        if (transport == null || buffer == null) {
            return statusIo();
        }
        try {
            return transport.read(buffer);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return statusCancelled();
        } catch (IllegalStateException timeoutOrClosed) {
            String message = timeoutOrClosed.getMessage();
            if (message != null && message.contains("timed out")) {
                return statusTimeout();
            }
            return statusIo();
        } catch (RuntimeException error) {
            return statusIo();
        }
    }

    static int bleWrite(byte[] buffer) {
        DiveComputerGattClient transport = activeTransport();
        if (transport == null || buffer == null) {
            return statusIo();
        }
        try {
            return transport.write(buffer);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return statusCancelled();
        } catch (RuntimeException error) {
            return statusIo();
        }
    }

    static int blePurge() {
        DiveComputerGattClient transport = activeTransport();
        if (transport == null) {
            return statusIo();
        }
        transport.purgeInput();
        return 0;
    }

    static int bleSleep(int milliseconds) {
        try {
            Thread.sleep(Math.max(0, milliseconds));
            return 0;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return statusCancelled();
        }
    }

    static String bleGetName() {
        DiveComputerGattClient transport = activeTransport();
        if (transport == null) {
            return "";
        }
        String name = transport.deviceName();
        return name == null ? "" : name;
    }

    static int bleClose() {
        // Session owns GATT lifetime; iostream close must not disconnect.
        return 0;
    }

    private static DiveComputerGattClient activeTransport() {
        synchronized (LOCK) {
            return activeTransport;
        }
    }

    // Match libdivecomputer/dc_status_t numeric values used by JNI.
    private static int statusIo() {
        return -6;
    }

    private static int statusTimeout() {
        return -7;
    }

    private static int statusCancelled() {
        return -10;
    }

    static final class DownloadResult {
        final int status;
        final String message;
        final String vendor;
        final String product;
        final int family;
        final int model;
        final int firmware;
        final int serial;
        final List<RawDive> dives;
        final String logTail;

        DownloadResult(
            int status,
            String message,
            String vendor,
            String product,
            int family,
            int model,
            int firmware,
            int serial,
            List<RawDive> dives,
            String logTail
        ) {
            this.status = status;
            this.message = message == null ? "" : message;
            this.vendor = vendor == null ? "" : vendor;
            this.product = product == null ? "" : product;
            this.family = family;
            this.model = model;
            this.firmware = firmware;
            this.serial = serial;
            this.dives = dives == null ? new ArrayList<>() : dives;
            this.logTail = logTail == null ? "" : logTail;
        }

        static DownloadResult failure(int status, String message) {
            return new DownloadResult(status, message, "", "", 0, 0, 0, 0, null, "");
        }
    }

    static final class RawDive {
        final byte[] data;
        final byte[] fingerprint;
        final ParsedDive parsed;

        RawDive(byte[] data, byte[] fingerprint, ParsedDive parsed) {
            this.data = data == null ? new byte[0] : data;
            this.fingerprint = fingerprint == null ? new byte[0] : fingerprint;
            this.parsed = parsed;
        }

        String dataBase64() {
            return Base64.encodeToString(data, Base64.NO_WRAP);
        }

        String fingerprintHex() {
            StringBuilder builder = new StringBuilder(fingerprint.length * 2);
            for (byte value : fingerprint) {
                builder.append(String.format("%02X", value));
            }
            return builder.toString();
        }
    }

    /**
     * Structured fields from {@code dc_parser}. Filled from JNI; optional
     * doubles use {@link Double#isNaN(double)} when unsupported.
     */
    static final class ParsedDive {
        int parseStatus;
        String parseMessage = "";
        String datetime = "";
        int diveTimeSeconds;
        double maxDepthM = Double.NaN;
        double avgDepthM = Double.NaN;
        double temperatureMinC = Double.NaN;
        double temperatureMaxC = Double.NaN;
        double temperatureSurfaceC = Double.NaN;
        double atmosphericBar = Double.NaN;
        String diveMode = "";
        int sampleCount;
        final List<GasMix> gasmixes = new ArrayList<>();
        final List<TankInfo> tanks = new ArrayList<>();
        final List<ProfilePoint> profile = new ArrayList<>();

        ParsedDive() {}

        void setParseStatus(int status, String message) {
            parseStatus = status;
            parseMessage = message == null ? "" : message;
        }

        void setDatetime(String value) {
            datetime = value == null ? "" : value;
        }

        void setDiveTimeSeconds(int seconds) {
            diveTimeSeconds = seconds;
        }

        void setMaxDepthM(double meters) {
            maxDepthM = meters;
        }

        void setAvgDepthM(double meters) {
            avgDepthM = meters;
        }

        void setTemperatureMinC(double celsius) {
            temperatureMinC = celsius;
        }

        void setTemperatureMaxC(double celsius) {
            temperatureMaxC = celsius;
        }

        void setTemperatureSurfaceC(double celsius) {
            temperatureSurfaceC = celsius;
        }

        void setAtmosphericBar(double bar) {
            atmosphericBar = bar;
        }

        void setDiveMode(String mode) {
            diveMode = mode == null ? "" : mode;
        }

        void setSampleCount(int count) {
            sampleCount = count;
        }

        void addGasMix(double oxygen, double helium, double nitrogen) {
            gasmixes.add(new GasMix(oxygen, helium, nitrogen));
        }

        void addTank(double beginBar, double endBar, int gasmixIndex) {
            tanks.add(new TankInfo(beginBar, endBar, gasmixIndex));
        }

        void addProfilePoint(int timeMs, double depthM) {
            profile.add(new ProfilePoint(timeMs, depthM));
        }
    }

    static final class GasMix {
        final double oxygen;
        final double helium;
        final double nitrogen;

        GasMix(double oxygen, double helium, double nitrogen) {
            this.oxygen = oxygen;
            this.helium = helium;
            this.nitrogen = nitrogen;
        }
    }

    static final class TankInfo {
        final double beginPressureBar;
        final double endPressureBar;
        final int gasmixIndex;

        TankInfo(double beginPressureBar, double endPressureBar, int gasmixIndex) {
            this.beginPressureBar = beginPressureBar;
            this.endPressureBar = endPressureBar;
            this.gasmixIndex = gasmixIndex;
        }
    }

    static final class ProfilePoint {
        final int timeMs;
        final double depthM;

        ProfilePoint(int timeMs, double depthM) {
            this.timeMs = timeMs;
            this.depthM = depthM;
        }
    }
}
