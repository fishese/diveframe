package cc.fishese.divelog;

import android.util.Base64;

import java.util.ArrayList;
import java.util.List;

/**
 * Mutable download sink filled from JNI callbacks during a capture.
 * Forwards progress and per-dive notifications (with raw + parsed payload)
 * to {@link DiveComputerNative}'s active download listener for incremental
 * IndexedDB persist on the JavaScript side.
 */
final class DiveComputerDownloadCollector {
    private final List<byte[]> dives = new ArrayList<>();
    private final List<byte[]> fingerprints = new ArrayList<>();
    private final List<DiveComputerNative.ParsedDive> parsedDives = new ArrayList<>();
    private int model;
    private int firmware;
    private int serial;
    private int progressCurrent;
    private int progressMaximum;

    void onDevInfo(int model, int firmware, int serial) {
        this.model = model;
        this.firmware = firmware;
        this.serial = serial;
    }

    void onDive(byte[] data, byte[] fingerprint, DiveComputerNative.ParsedDive parsed) {
        byte[] diveData = data == null ? new byte[0] : data;
        byte[] fp = fingerprint == null ? new byte[0] : fingerprint;
        dives.add(diveData);
        fingerprints.add(fp);
        parsedDives.add(parsed);
        DiveComputerNative.emitDiveCaptured(
            dives.size(),
            diveData.length,
            fingerprintHex(fp),
            Base64.encodeToString(diveData, Base64.NO_WRAP),
            parsed,
            serial
        );
    }

    void onProgress(int current, int maximum) {
        progressCurrent = current;
        progressMaximum = maximum;
        DiveComputerNative.emitProgress(current, maximum, dives.size());
    }

    int diveCount() {
        return dives.size();
    }

    byte[] diveAt(int index) {
        return dives.get(index);
    }

    byte[] fingerprintAt(int index) {
        return fingerprints.get(index);
    }

    DiveComputerNative.ParsedDive parsedAt(int index) {
        return parsedDives.get(index);
    }

    int model() {
        return model;
    }

    int firmware() {
        return firmware;
    }

    int serial() {
        return serial;
    }

    int progressCurrent() {
        return progressCurrent;
    }

    int progressMaximum() {
        return progressMaximum;
    }

    private static String fingerprintHex(byte[] fingerprint) {
        StringBuilder builder = new StringBuilder(fingerprint.length * 2);
        for (byte value : fingerprint) {
            builder.append(String.format("%02X", value));
        }
        return builder.toString();
    }
}
