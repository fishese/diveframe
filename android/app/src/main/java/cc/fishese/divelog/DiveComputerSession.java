package cc.fishese.divelog;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Foreground-only capture state machine for the research spike.
 *
 * States: idle → scanning → connecting → ready → downloading, with cancel from
 * any active state returning to idle. Persistence into the web logbook is not
 * implemented here.
 */
final class DiveComputerSession {
    enum Phase {
        IDLE,
        SCANNING,
        CONNECTING,
        READY,
        DOWNLOADING,
        CANCELLING,
    }

    interface Listener {
        void onPhaseChanged(Phase phase);

        void onDeviceFound(String address, String name, int rssi);

        void onScanStopped(String reason);

        void onTransportReady(String address, String name, String serviceUuid);

        void onTransportClosed(String reason);

        void onError(String code, String message);

        void onDownloadProgress(int current, int maximum, int diveCount);

        void onDiveCaptured(int index, int size, String fingerprintHex);
    }

    private final Context appContext;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicReference<Phase> phase = new AtomicReference<>(Phase.IDLE);
    private final AtomicBoolean cancelRequested = new AtomicBoolean(false);

    private Listener listener;
    private DiveComputerBleScanner scanner;
    private DiveComputerGattClient gattClient;
    private String connectedAddress;
    private String connectedName;

    DiveComputerSession(Context context) {
        this.appContext = context.getApplicationContext();
    }

    void setListener(Listener listener) {
        this.listener = listener;
    }

    Phase phase() {
        return phase.get();
    }

    boolean isCaptureActive() {
        Phase current = phase.get();
        return current == Phase.SCANNING
            || current == Phase.CONNECTING
            || current == Phase.READY
            || current == Phase.DOWNLOADING
            || current == Phase.CANCELLING;
    }

    boolean isTransportReady() {
        return phase.get() == Phase.READY
            && gattClient != null
            && gattClient.isReady();
    }

    String connectedAddress() {
        return connectedAddress;
    }

    String connectedName() {
        return connectedName;
    }

    DiveComputerGattClient gattClient() {
        return gattClient;
    }

    synchronized void startScan(long timeoutMs) {
        ensureBluetoothReady();
        if (!phase.compareAndSet(Phase.IDLE, Phase.SCANNING)) {
            throw new IllegalStateException(
                "Scan is only available while idle (current=" + phase.get() + ")."
            );
        }
        cancelRequested.set(false);
        notifyPhase();

        scanner = new DiveComputerBleScanner(appContext, new DiveComputerBleScanner.Callback() {
            @Override
            public void onDeviceFound(String address, String name, int rssi) {
                if (cancelRequested.get() || phase.get() != Phase.SCANNING) {
                    return;
                }
                Listener active = listener;
                if (active != null) {
                    active.onDeviceFound(address, name, rssi);
                }
            }

            @Override
            public void onScanFailed(int errorCode) {
                finishScan("scan_failed_" + errorCode);
            }

            @Override
            public void onScanFinished(String reason) {
                finishScan(reason);
            }
        });
        scanner.start(timeoutMs);
    }

    synchronized void stopScan() {
        if (phase.get() != Phase.SCANNING || scanner == null) {
            return;
        }
        scanner.stop("stopped");
    }

    synchronized void connect(String address, String name) {
        ensureBluetoothReady();
        if (address == null || address.isEmpty()) {
            throw new IllegalArgumentException("Device address is required.");
        }
        if (name != null
            && !name.isEmpty()
            && !DiveComputerNames.isClassicShearwaterTarget(name)) {
            throw new IllegalArgumentException(
                "Only classic Shearwater BLE names are supported in this spike."
            );
        }

        Phase current = phase.get();
        if (current == Phase.SCANNING) {
            DiveComputerBleScanner activeScanner = scanner;
            scanner = null;
            if (activeScanner != null) {
                activeScanner.stop("connecting");
            }
            phase.set(Phase.IDLE);
        } else if (current != Phase.IDLE) {
            throw new IllegalStateException(
                "Connect is only available while idle or scanning (current="
                    + current
                    + ")."
            );
        }

        if (!phase.compareAndSet(Phase.IDLE, Phase.CONNECTING)) {
            throw new IllegalStateException(
                "Unable to enter connecting state (current=" + phase.get() + ")."
            );
        }

        cancelRequested.set(false);
        connectedAddress = address;
        connectedName = name == null ? "" : name;
        notifyPhase();

        BluetoothAdapter adapter = bluetoothAdapter();
        BluetoothDevice device = adapter.getRemoteDevice(address);
        gattClient = new DiveComputerGattClient(appContext, new DiveComputerGattClient.Callback() {
            @Override
            public void onReady(String serviceUuid) {
                if (cancelRequested.get()) {
                    closeTransport("cancelled");
                    return;
                }
                if (!phase.compareAndSet(Phase.CONNECTING, Phase.READY)) {
                    return;
                }
                notifyPhase();
                Listener active = listener;
                if (active != null) {
                    active.onTransportReady(connectedAddress, connectedName, serviceUuid);
                }
            }

            @Override
            public void onClosed(String reason) {
                closeTransport(reason);
            }

            @Override
            public void onError(String code, String message) {
                Listener active = listener;
                if (active != null) {
                    active.onError(code, message);
                }
                closeTransport(code);
            }
        });
        gattClient.connect(device, connectedName);
    }

    synchronized void disconnect() {
        closeTransport("disconnected");
    }

    /**
     * Downloads up to {@code limit} raw dives over the ready GATT transport.
     * Optional {@code fingerprint} is the libdivecomputer checkpoint (stop
     * before that dive). Must be called from a background thread. Does not
     * write the web logbook.
     */
    DiveComputerNative.DownloadResult downloadDives(int limit, byte[] fingerprint) {
        DiveComputerGattClient transport;
        String productName;
        synchronized (this) {
            if (!isTransportReady()) {
                throw new IllegalStateException(
                    "GATT transport is not ready. Connect first."
                );
            }
            if (!phase.compareAndSet(Phase.READY, Phase.DOWNLOADING)) {
                throw new IllegalStateException(
                    "Download is only available while ready (current="
                        + phase.get()
                        + ")."
                );
            }
            cancelRequested.set(false);
            transport = gattClient;
            productName = connectedName;
            notifyPhase();
        }

        DiveComputerNative.setDownloadListener(new DiveComputerNative.DownloadListener() {
            @Override
            public void onProgress(int current, int maximum, int diveCount) {
                Listener active = listener;
                if (active != null) {
                    active.onDownloadProgress(current, maximum, diveCount);
                }
            }

            @Override
            public void onDiveCaptured(int index, int size, String fingerprintHex) {
                Listener active = listener;
                if (active != null) {
                    active.onDiveCaptured(index, size, fingerprintHex);
                }
            }
        });

        try {
            DiveComputerNative.installTransport(transport);
            // limit <= 0 means unlimited (full computer history); otherwise honor
            // the requested count with no artificial upper clamp.
            int effectiveLimit = limit <= 0 ? 0 : limit;
            return DiveComputerNative.nativeDownload(
                productName,
                effectiveLimit,
                fingerprint
            );
        } finally {
            DiveComputerNative.setDownloadListener(null);
            DiveComputerNative.clearTransport();
            synchronized (this) {
                if (phase.get() == Phase.DOWNLOADING) {
                    phase.set(Phase.READY);
                    notifyPhase();
                }
            }
        }
    }

    /**
     * Cancels scan, download, or an in-flight/ready GATT session. Safe when idle.
     *
     * @return true when an active operation was cancelled
     */
    synchronized boolean cancel() {
        Phase current = phase.get();
        if (current == Phase.IDLE) {
            return false;
        }
        cancelRequested.set(true);
        DiveComputerNative.requestCancel();
        phase.set(Phase.CANCELLING);
        notifyPhase();

        if (scanner != null) {
            scanner.stop("cancelled");
            scanner = null;
        }
        if (gattClient != null) {
            DiveComputerGattClient client = gattClient;
            gattClient = null;
            client.close("cancelled");
        }
        connectedAddress = null;
        connectedName = null;
        phase.set(Phase.IDLE);
        notifyPhase();
        Listener active = listener;
        if (active != null) {
            active.onTransportClosed("cancelled");
        }
        return true;
    }

    private void finishScan(String reason) {
        mainHandler.post(() -> {
            synchronized (DiveComputerSession.this) {
                scanner = null;
                if (phase.get() == Phase.SCANNING) {
                    phase.set(Phase.IDLE);
                    notifyPhase();
                }
                // "connecting" means connect() already advanced the session.
                if (!"connecting".equals(reason)) {
                    Listener active = listener;
                    if (active != null) {
                        active.onScanStopped(reason);
                    }
                }
            }
        });
    }

    private void closeTransport(String reason) {
        mainHandler.post(() -> {
            synchronized (DiveComputerSession.this) {
                if (gattClient != null) {
                    DiveComputerGattClient client = gattClient;
                    gattClient = null;
                    if (!"cancelled".equals(reason)) {
                        client.close(reason);
                    }
                }
                boolean wasActive = phase.get() == Phase.CONNECTING
                    || phase.get() == Phase.READY
                    || phase.get() == Phase.DOWNLOADING
                    || phase.get() == Phase.CANCELLING;
                connectedAddress = null;
                connectedName = null;
                if (wasActive) {
                    phase.set(Phase.IDLE);
                    notifyPhase();
                }
                if (!"cancelled".equals(reason)) {
                    Listener active = listener;
                    if (active != null) {
                        active.onTransportClosed(reason);
                    }
                }
            }
        });
    }

    private void notifyPhase() {
        Listener active = listener;
        if (active != null) {
            Phase current = phase.get();
            mainHandler.post(() -> active.onPhaseChanged(current));
        }
    }

    private void ensureBluetoothReady() {
        BluetoothAdapter adapter = bluetoothAdapter();
        if (adapter == null) {
            throw new IllegalStateException("Bluetooth is unavailable on this device.");
        }
        if (!adapter.isEnabled()) {
            throw new IllegalStateException("Bluetooth is turned off.");
        }
    }

    private BluetoothAdapter bluetoothAdapter() {
        BluetoothManager manager =
            (BluetoothManager) appContext.getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }
}
