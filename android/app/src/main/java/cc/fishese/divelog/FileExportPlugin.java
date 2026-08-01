package cc.fishese.divelog;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Writes exports (app backups, updated logs, share cards) into the public
 * Downloads folder. The WebView ignores {@code <a download>} blob URLs, so
 * every browser-style download in the app has to come through here instead.
 *
 * Payloads arrive as base64 chunks so a multi-hundred-megabyte backup never
 * has to exist as a single bridge string.
 */
@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {
    private static final String DEFAULT_MIME = "application/octet-stream";

    private static final class PendingFile {
        OutputStream stream;
        Uri uri;
        File file;
        String fileName;
        String mimeType;
        long bytesWritten;
    }

    private final Map<String, PendingFile> pendingFiles = new ConcurrentHashMap<>();
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void beginFile(PluginCall call) {
        String fileName = call.getString("fileName", null);
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("fileName is required.", "invalid_args");
            return;
        }
        String mimeType = call.getString("mimeType", DEFAULT_MIME);
        String safeName = sanitizeFilename(fileName.trim());
        ioExecutor.execute(() -> {
            try {
                PendingFile pending = openPendingFile(safeName, mimeType);
                String token = UUID.randomUUID().toString();
                pendingFiles.put(token, pending);

                JSObject result = new JSObject();
                result.put("token", token);
                result.put("fileName", pending.fileName);
                result.put("location", locationOf(pending));
                call.resolve(result);
            } catch (Exception error) {
                call.reject(messageOf(error, "Unable to start the file export."), "open_failed", error);
            }
        });
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String token = call.getString("token", null);
        String dataBase64 = call.getString("dataBase64", null);
        if (token == null || dataBase64 == null) {
            call.reject("token and dataBase64 are required.", "invalid_args");
            return;
        }
        ioExecutor.execute(() -> {
            PendingFile pending = pendingFiles.get(token);
            if (pending == null) {
                call.reject("This export is no longer open.", "unknown_token");
                return;
            }
            try {
                byte[] bytes = Base64.decode(dataBase64, Base64.DEFAULT);
                pending.stream.write(bytes);
                pending.bytesWritten += bytes.length;

                JSObject result = new JSObject();
                result.put("bytesWritten", pending.bytesWritten);
                call.resolve(result);
            } catch (Exception error) {
                discard(token);
                call.reject(messageOf(error, "Unable to write the export."), "write_failed", error);
            }
        });
    }

    @PluginMethod
    public void finishFile(PluginCall call) {
        String token = call.getString("token", null);
        if (token == null) {
            call.reject("token is required.", "invalid_args");
            return;
        }
        ioExecutor.execute(() -> {
            PendingFile pending = pendingFiles.remove(token);
            if (pending == null) {
                call.reject("This export is no longer open.", "unknown_token");
                return;
            }
            try {
                pending.stream.flush();
                pending.stream.close();
                if (pending.uri != null) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContext().getContentResolver().update(pending.uri, values, null, null);
                }

                JSObject result = new JSObject();
                result.put("saved", true);
                result.put("fileName", pending.fileName);
                result.put("uri", pending.uri != null ? pending.uri.toString() : pending.file.toURI().toString());
                result.put("location", locationOf(pending));
                result.put("bytes", pending.bytesWritten);
                result.put("shareable", pending.uri != null);
                call.resolve(result);
            } catch (Exception error) {
                deletePendingFile(pending);
                call.reject(messageOf(error, "Unable to finish the export."), "close_failed", error);
            }
        });
    }

    @PluginMethod
    public void abortFile(PluginCall call) {
        String token = call.getString("token", null);
        if (token == null) {
            call.reject("token is required.", "invalid_args");
            return;
        }
        ioExecutor.execute(() -> {
            discard(token);
            JSObject result = new JSObject();
            result.put("aborted", true);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String uri = call.getString("uri", null);
        if (uri == null || !uri.startsWith("content://")) {
            call.reject("A saved content:// file is required to share.", "invalid_args");
            return;
        }
        String mimeType = call.getString("mimeType", DEFAULT_MIME);
        String title = call.getString("title", "DiveFrame export");
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType);
            send.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
            send.putExtra(Intent.EXTRA_TITLE, title);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("shared", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(messageOf(error, "Unable to open the share sheet."), "share_failed", error);
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (String token : pendingFiles.keySet()) {
            discard(token);
        }
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private PendingFile openPendingFile(String fileName, String mimeType) throws Exception {
        PendingFile pending = new PendingFile();
        pending.fileName = fileName;
        pending.mimeType = mimeType;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = getContext()
                .getContentResolver()
                .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IllegalStateException("MediaStore refused the Downloads insert.");
            }
            OutputStream stream = getContext().getContentResolver().openOutputStream(uri);
            if (stream == null) {
                getContext().getContentResolver().delete(uri, null, null);
                throw new IllegalStateException("Unable to open the Downloads output stream.");
            }
            pending.uri = uri;
            pending.stream = stream;
            return pending;
        }

        File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) {
            directory = getContext().getFilesDir();
        }
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Unable to create the app Downloads directory.");
        }
        File file = new File(directory, fileName);
        pending.file = file;
        pending.stream = new FileOutputStream(file);
        return pending;
    }

    private void discard(String token) {
        PendingFile pending = pendingFiles.remove(token);
        if (pending != null) {
            deletePendingFile(pending);
        }
    }

    private void deletePendingFile(PendingFile pending) {
        try {
            pending.stream.close();
        } catch (Exception ignored) {
            // Closing a half-written export is best effort.
        }
        try {
            if (pending.uri != null) {
                getContext().getContentResolver().delete(pending.uri, null, null);
            } else if (pending.file != null) {
                pending.file.delete();
            }
        } catch (Exception ignored) {
            // Leaving a stray partial file is better than crashing the export.
        }
    }

    private static String locationOf(PendingFile pending) {
        return pending.uri != null ? "Downloads" : pending.file.getAbsolutePath();
    }

    private static String messageOf(Exception error, String fallback) {
        return error.getMessage() == null ? fallback : error.getMessage();
    }

    private static String sanitizeFilename(String fileName) {
        String base = fileName.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) {
            base = base.substring(slash + 1);
        }
        base = base.replaceAll("[^A-Za-z0-9._-]", "_");
        return base.isEmpty() ? "diveframe-export" : base;
    }
}
