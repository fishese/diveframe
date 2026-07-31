package cc.fishese.divelog;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import java.util.HashSet;
import java.util.Set;

/**
 * BLE scanner that emits only advertisements matching libdivecomputer's
 * Shearwater name filter. Location is never requested on Android 12+.
 */
final class DiveComputerBleScanner {
    interface Callback {
        void onDeviceFound(String address, String name, int rssi);

        void onScanFailed(int errorCode);

        void onScanFinished(String reason);
    }

    private final Context appContext;
    private final Callback callback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Set<String> seenAddresses = new HashSet<>();

    private BluetoothLeScanner scanner;
    private boolean scanning;
    private final Runnable timeoutRunnable = () -> stop("timeout");

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (!scanning || result == null || result.getDevice() == null) {
                return;
            }
            String name = result.getScanRecord() != null
                ? result.getScanRecord().getDeviceName()
                : null;
            if (name == null) {
                name = result.getDevice().getName();
            }
            if (!DiveComputerNames.matchesShearwaterAdvertisement(name)) {
                return;
            }
            String address = result.getDevice().getAddress();
            if (!seenAddresses.add(address)) {
                return;
            }
            callback.onDeviceFound(address, name, result.getRssi());
        }

        @Override
        public void onScanFailed(int errorCode) {
            scanning = false;
            mainHandler.removeCallbacks(timeoutRunnable);
            callback.onScanFailed(errorCode);
        }
    };

    DiveComputerBleScanner(Context context, Callback callback) {
        this.appContext = context.getApplicationContext();
        this.callback = callback;
    }

    @SuppressLint("MissingPermission")
    void start(long timeoutMs) {
        if (scanning) {
            return;
        }
        BluetoothManager manager =
            (BluetoothManager) appContext.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) {
            callback.onScanFailed(-1);
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            callback.onScanFailed(-2);
            return;
        }

        seenAddresses.clear();
        scanning = true;
        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();
        scanner.startScan(null, settings, scanCallback);

        long boundedTimeout = Math.max(1_000L, Math.min(timeoutMs, 60_000L));
        mainHandler.postDelayed(timeoutRunnable, boundedTimeout);
    }

    @SuppressLint("MissingPermission")
    void stop(String reason) {
        if (!scanning) {
            return;
        }
        scanning = false;
        mainHandler.removeCallbacks(timeoutRunnable);
        try {
            if (scanner != null) {
                scanner.stopScan(scanCallback);
            }
        } catch (SecurityException ignored) {
            // Permission may have been revoked mid-scan.
        }
        callback.onScanFinished(reason);
    }
}
