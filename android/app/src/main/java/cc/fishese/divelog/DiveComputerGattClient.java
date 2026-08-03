package cc.fishese.divelog;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.ArrayDeque;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Classic Shearwater GATT transport behind libdivecomputer's
 * {@code dc_custom_open} callbacks. It selects service {@code fe25c237-…},
 * enables notifications on {@code 27b7570b-…}, and exposes the blocking I/O
 * operations consumed by the JNI download thread.
 */
final class DiveComputerGattClient {
    static final UUID SHEARWATER_CLASSIC_SERVICE =
        UUID.fromString("fe25c237-0ece-443c-b0aa-e02033e7029d");
    static final UUID SHEARWATER_CLASSIC_RX_TX =
        UUID.fromString("27b7570b-359e-45a3-91bb-cf7e70049bd2");
    static final UUID CLIENT_CHARACTERISTIC_CONFIG =
        UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static final String TAG = "DiveFrameGatt";
    private static final int DEFAULT_TIMEOUT_MS = 12_000;
    private static final int MAX_RX_QUEUE = 64;
    // libdivecomputer reads Shearwater packets of up to 514 bytes.
    private static final int PREFERRED_MTU = 517;
    private static final long MTU_FALLBACK_MS = 3_000;

    interface Callback {
        void onReady(String serviceUuid);

        void onClosed(String reason);

        void onError(String code, String message);
    }

    private final Context appContext;
    private final Callback callback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object rxLock = new Object();
    private final Queue<byte[]> rxQueue = new ArrayDeque<>();
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final AtomicBoolean mtuRequested = new AtomicBoolean(false);
    private final AtomicBoolean notificationsRequested = new AtomicBoolean(false);

    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic rxTx;
    private String deviceName = "";
    private volatile int timeoutMs = DEFAULT_TIMEOUT_MS;
    private volatile boolean ready;
    private CountDownLatch writeLatch;
    private CountDownLatch cccdLatch;

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (closed.get()) {
                return;
            }
            if (status != BluetoothGatt.GATT_SUCCESS) {
                fail("gatt_status_" + status, "GATT connection failed with status " + status);
                return;
            }
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                boolean started = gatt.discoverServices();
                if (!started) {
                    fail("discover_failed", "Unable to start GATT service discovery.");
                }
                return;
            }
            if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                ready = false;
                notifyClosed("disconnected");
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (closed.get()) {
                return;
            }
            if (status != BluetoothGatt.GATT_SUCCESS) {
                fail("discover_status_" + status, "Service discovery failed.");
                return;
            }

            BluetoothGattService service = gatt.getService(SHEARWATER_CLASSIC_SERVICE);
            if (service == null) {
                fail(
                    "classic_service_missing",
                    "Classic Shearwater GATT service was not found."
                );
                return;
            }

            BluetoothGattCharacteristic characteristic =
                service.getCharacteristic(SHEARWATER_CLASSIC_RX_TX);
            if (characteristic == null) {
                fail(
                    "classic_characteristic_missing",
                    "Classic Shearwater Rx/Tx characteristic was not found."
                );
                return;
            }

            rxTx = characteristic;
            Log.i(TAG, "rxTx properties=0x" + Integer.toHexString(characteristic.getProperties()));

            // Shearwater replies in packets of up to 514 bytes. On the default
            // 23-byte ATT MTU the tail of a response is silently dropped, so the
            // MTU has to grow before notifications are enabled.
            if (!requestLargeMtu(gatt)) {
                startNotifications(gatt);
            }
        }

        @Override
        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
            if (closed.get()) {
                return;
            }
            Log.i(TAG, "onMtuChanged mtu=" + mtu + " status=" + status);
            startNotifications(gatt);
        }

        @Override
        public void onDescriptorWrite(
            BluetoothGatt gatt,
            BluetoothGattDescriptor descriptor,
            int status
        ) {
            if (closed.get()) {
                return;
            }
            if (status != BluetoothGatt.GATT_SUCCESS) {
                fail("cccd_status_" + status, "Failed to write CCCD for notifications.");
                return;
            }
            CountDownLatch latch = cccdLatch;
            if (latch != null) {
                latch.countDown();
            }
            ready = true;
            callback.onReady(SHEARWATER_CLASSIC_SERVICE.toString());
        }

        @Override
        public void onCharacteristicChanged(
            BluetoothGatt gatt,
            BluetoothGattCharacteristic characteristic,
            byte[] value
        ) {
            enqueueRx(value);
        }

        // Older Android delivers notifications through this overload.
        @Override
        @SuppressWarnings("deprecation")
        public void onCharacteristicChanged(
            BluetoothGatt gatt,
            BluetoothGattCharacteristic characteristic
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return;
            }
            enqueueRx(characteristic.getValue());
        }

        @Override
        public void onCharacteristicWrite(
            BluetoothGatt gatt,
            BluetoothGattCharacteristic characteristic,
            int status
        ) {
            CountDownLatch latch = writeLatch;
            if (latch != null) {
                latch.countDown();
            }
            Log.i(TAG, "onCharacteristicWrite status=" + status);
            if (status != BluetoothGatt.GATT_SUCCESS) {
                fail("write_status_" + status, "BLE characteristic write failed.");
            }
        }
    };

    DiveComputerGattClient(Context context, Callback callback) {
        this.appContext = context.getApplicationContext();
        this.callback = callback;
    }

    boolean isReady() {
        return ready && !closed.get();
    }

    String deviceName() {
        return deviceName;
    }

    void setTimeoutMs(int timeoutMs) {
        this.timeoutMs = timeoutMs < 0 ? DEFAULT_TIMEOUT_MS : timeoutMs;
    }

    @SuppressLint("MissingPermission")
    void connect(BluetoothDevice device, String name) {
        if (closed.get()) {
            throw new IllegalStateException("GATT client is closed.");
        }
        deviceName = name == null ? "" : name;
        if (deviceName.isEmpty() && device.getName() != null) {
            deviceName = device.getName();
        }
        gatt = device.connectGatt(appContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
        if (gatt == null) {
            fail("connect_failed", "Unable to open a GATT connection.");
        }
    }

    int write(byte[] data) throws InterruptedException {
        requireReady();
        if (data == null || data.length == 0) {
            return 0;
        }
        writeLatch = new CountDownLatch(1);
        int writeType = preferredWriteType();
        boolean queued;
        synchronized (this) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                queued =
                    gatt.writeCharacteristic(rxTx, data, writeType)
                        == BluetoothGatt.GATT_SUCCESS;
            } else {
                @SuppressWarnings("deprecation")
                boolean legacy = writeLegacy(data, writeType);
                queued = legacy;
            }
        }
        Log.i(
            TAG,
            "write " + data.length + "B type=" + writeType + " queued=" + queued
        );
        if (!queued) {
            throw new IllegalStateException("Unable to queue BLE write.");
        }
        // WRITE_TYPE_NO_RESPONSE may not always callback; don't hard-fail on timeout.
        writeLatch.await(Math.max(timeoutMs, 1), TimeUnit.MILLISECONDS);
        return data.length;
    }

    int poll(int timeout) throws InterruptedException {
        requireReady();
        synchronized (rxLock) {
            if (!rxQueue.isEmpty()) {
                return 0;
            }
            if (timeout == 0) {
                return 1; // timed out / no data
            }
            long waitMs = timeout < 0 ? timeoutMs : timeout;
            long deadline = System.currentTimeMillis() + Math.max(waitMs, 1);
            while (rxQueue.isEmpty() && !closed.get()) {
                long remaining = deadline - System.currentTimeMillis();
                if (remaining <= 0) {
                    return 1;
                }
                rxLock.wait(remaining);
            }
            return rxQueue.isEmpty() ? 1 : 0;
        }
    }

    int read(byte[] destination) throws InterruptedException {
        requireReady();
        if (destination == null || destination.length == 0) {
            return 0;
        }
        synchronized (rxLock) {
            while (rxQueue.isEmpty() && !closed.get()) {
                rxLock.wait(Math.max(timeoutMs, 1));
                if (rxQueue.isEmpty()) {
                    throw new IllegalStateException("BLE read timed out.");
                }
            }
            byte[] packet = rxQueue.poll();
            if (packet == null) {
                throw new IllegalStateException("BLE transport closed during read.");
            }
            int copy = Math.min(packet.length, destination.length);
            System.arraycopy(packet, 0, destination, 0, copy);
            if (packet.length > destination.length) {
                throw new IllegalStateException("BLE packet larger than read buffer.");
            }
            return copy;
        }
    }

    void purgeInput() {
        synchronized (rxLock) {
            rxQueue.clear();
            rxLock.notifyAll();
        }
    }

    @SuppressLint("MissingPermission")
    void close(String reason) {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        ready = false;
        mainHandler.post(() -> {
            try {
                if (gatt != null) {
                    gatt.disconnect();
                    gatt.close();
                }
            } catch (SecurityException ignored) {
                // Permission may have been revoked.
            } finally {
                gatt = null;
                rxTx = null;
                synchronized (rxLock) {
                    rxQueue.clear();
                    rxLock.notifyAll();
                }
            }
        });
    }

    @SuppressLint("MissingPermission")
    private boolean requestLargeMtu(BluetoothGatt gatt) {
        if (!mtuRequested.compareAndSet(false, true)) {
            return false;
        }
        boolean started = gatt.requestMtu(PREFERRED_MTU);
        Log.i(TAG, "requestMtu(" + PREFERRED_MTU + ") started=" + started);
        if (started) {
            // Some stacks never deliver onMtuChanged; continue on the default MTU
            // rather than leaving the connection stuck.
            mainHandler.postDelayed(() -> {
                if (!closed.get()) {
                    startNotifications(gatt);
                }
            }, MTU_FALLBACK_MS);
        }
        return started;
    }

    private void startNotifications(BluetoothGatt gatt) {
        if (!notificationsRequested.compareAndSet(false, true)) {
            return;
        }
        BluetoothGattCharacteristic characteristic = rxTx;
        if (characteristic == null) {
            fail("classic_characteristic_missing", "Rx/Tx characteristic went away.");
            return;
        }
        if (!enableNotifications(gatt, characteristic)) {
            fail("notify_enable_failed", "Unable to enable BLE notifications.");
        }
    }

    @SuppressLint("MissingPermission")
    private boolean enableNotifications(
        BluetoothGatt gatt,
        BluetoothGattCharacteristic characteristic
    ) {
        if (!gatt.setCharacteristicNotification(characteristic, true)) {
            return false;
        }
        BluetoothGattDescriptor cccd = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG);
        if (cccd == null) {
            return false;
        }
        cccdLatch = new CountDownLatch(1);
        byte[] enable = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return gatt.writeDescriptor(cccd, enable) == BluetoothGatt.GATT_SUCCESS;
        }
        @SuppressWarnings("deprecation")
        boolean legacy = writeDescriptorLegacy(cccd, enable);
        return legacy;
    }

    /**
     * Shearwater advertises write-without-response, but fall back to an
     * acknowledged write when a unit only exposes the plain write property.
     */
    private int preferredWriteType() {
        int properties = rxTx.getProperties();
        boolean noResponse =
            (properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
        return noResponse
            ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("MissingPermission")
    private boolean writeLegacy(byte[] data, int writeType) {
        rxTx.setWriteType(writeType);
        rxTx.setValue(data);
        return gatt.writeCharacteristic(rxTx);
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("MissingPermission")
    private boolean writeDescriptorLegacy(BluetoothGattDescriptor cccd, byte[] enable) {
        cccd.setValue(enable);
        return gatt.writeDescriptor(cccd);
    }

    private void enqueueRx(byte[] value) {
        if (value == null || value.length == 0 || closed.get()) {
            return;
        }
        Log.i(TAG, "notify " + value.length + "B");
        synchronized (rxLock) {
            if (rxQueue.size() >= MAX_RX_QUEUE) {
                rxQueue.poll();
            }
            byte[] copy = new byte[value.length];
            System.arraycopy(value, 0, copy, 0, value.length);
            rxQueue.add(copy);
            rxLock.notifyAll();
        }
    }

    private void requireReady() {
        if (!isReady()) {
            throw new IllegalStateException("GATT transport is not ready.");
        }
    }

    private void fail(String code, String message) {
        if (closed.get()) {
            return;
        }
        ready = false;
        callback.onError(code, message);
        close(code);
    }

    private void notifyClosed(String reason) {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        ready = false;
        callback.onClosed(reason);
    }
}
