package cc.fishese.divelog;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Selects one image and reads unredacted EXIF GPS without retaining it. */
@CapacitorPlugin(
    name = "PhotoLocation",
    permissions = {
        @Permission(
            alias = "mediaLocation",
            strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }
        ),
    }
)
public class PhotoLocationPlugin extends Plugin {
    private static final String CACHE_DIRECTORY = "photo-location";

    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pickPhotoLocation(PluginCall call) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("mediaLocation") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias(
                "mediaLocation",
                call,
                "mediaLocationPermissionCallback"
            );
            return;
        }
        launchPhotoPicker(call);
    }

    @PermissionCallback
    private void mediaLocationPermissionCallback(PluginCall call) {
        if (getPermissionState("mediaLocation") != PermissionState.GRANTED) {
            resolveStatus(call, "permission-denied");
            return;
        }
        launchPhotoPicker(call);
    }

    private void launchPhotoPicker(PluginCall call) {
        // This workflow deliberately uses the MediaStore picker rather than
        // Android's privacy-focused Photo Picker. The returned MediaStore URI
        // can be marked require-original below so EXIF GPS is not redacted.
        // Dive gallery and overlay photos continue to use their regular picker.
        final Intent intent = new Intent(
            Intent.ACTION_PICK,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        );
        intent.setType("image/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "photoPickerResult");
    }

    @ActivityCallback
    private void photoPickerResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        Intent data = activityResult.getData();
        Uri selectedUri = data == null ? null : data.getData();
        if (activityResult.getResultCode() != Activity.RESULT_OK || selectedUri == null) {
            resolveStatus(call, "cancelled");
            return;
        }

        boolean includePhoto = Boolean.TRUE.equals(call.getBoolean("includePhoto", false));
        ioExecutor.execute(() -> readSelectedPhoto(call, selectedUri, includePhoto));
    }

    private void readSelectedPhoto(
        PluginCall call,
        Uri selectedUri,
        boolean includePhoto
    ) {
        Uri readUri = selectedUri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                readUri = MediaStore.setRequireOriginal(selectedUri);
            } catch (IllegalArgumentException | SecurityException ignored) {
                // Keep a defensive fallback for vendor picker implementations
                // that return a non-standard URI despite the MediaStore intent.
                readUri = selectedUri;
            }
        }

        try {
            double[] coordinates;
            try {
                coordinates = readExifCoordinates(readUri);
            } catch (IllegalArgumentException | SecurityException | UnsupportedOperationException error) {
                if (readUri.equals(selectedUri)) throw error;
                // Some vendor media providers reject the original marker even
                // when direct access to the selected URI is still allowed.
                readUri = selectedUri;
                coordinates = readExifCoordinates(readUri);
            }

            JSObject result = new JSObject();
            if (
                coordinates != null &&
                coordinates.length >= 2 &&
                Double.isFinite(coordinates[0]) &&
                Double.isFinite(coordinates[1]) &&
                !(coordinates[0] == 0d && coordinates[1] == 0d)
            ) {
                result.put("status", "found");
                result.put("latitude", coordinates[0]);
                result.put("longitude", coordinates[1]);
            } else {
                result.put("status", "missing");
            }

            if (includePhoto) {
                try {
                    appendTemporaryPhoto(result, readUri);
                } catch (Exception ignored) {
                    result.put("photoCopyFailed", true);
                }
            }
            call.resolve(result);
        } catch (SecurityException error) {
            resolveStatus(call, "permission-denied");
        } catch (Exception error) {
            JSObject result = new JSObject();
            result.put("status", "error");
            result.put("message", messageOf(error));
            call.resolve(result);
        }
    }

    private double[] readExifCoordinates(Uri uri) throws Exception {
        try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
            if (stream == null) {
                throw new IllegalStateException("Unable to open the selected photo.");
            }
            return new ExifInterface(stream).getLatLong();
        }
    }

    private void appendTemporaryPhoto(JSObject result, Uri sourceUri) throws Exception {
        String contentType = getContext().getContentResolver().getType(sourceUri);
        if (contentType == null || contentType.isBlank()) contentType = "image/jpeg";
        String displayName = displayNameOf(sourceUri);
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(contentType);
        if (extension == null || extension.isBlank()) extension = extensionOf(displayName);
        if (extension == null || extension.isBlank()) extension = "jpg";

        File directory = cacheDirectory();
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Unable to prepare the temporary photo folder.");
        }
        File temporary = new File(
            directory,
            UUID.randomUUID().toString() + "." + extension.toLowerCase(Locale.ROOT)
        );
        try (
            InputStream input = getContext().getContentResolver().openInputStream(sourceUri);
            OutputStream output = new FileOutputStream(temporary)
        ) {
            if (input == null) throw new IllegalStateException("Unable to copy the selected photo.");
            byte[] buffer = new byte[64 * 1024];
            int length;
            while ((length = input.read(buffer)) >= 0) {
                if (length > 0) output.write(buffer, 0, length);
            }
        }
        result.put("tempFileUri", Uri.fromFile(temporary).toString());
        result.put("fileName", displayName);
        result.put("contentType", contentType);
    }

    @PluginMethod
    public void releasePickedPhoto(PluginCall call) {
        String uriValue = call.getString("tempFileUri", null);
        boolean released = false;
        if (uriValue != null) {
            try {
                Uri uri = Uri.parse(uriValue);
                File candidate = new File(uri.getPath()).getCanonicalFile();
                File directory = cacheDirectory().getCanonicalFile();
                String directoryPrefix = directory.getPath() + File.separator;
                if (candidate.getPath().startsWith(directoryPrefix)) {
                    released = !candidate.exists() || candidate.delete();
                }
            } catch (Exception ignored) {
                released = false;
            }
        }
        JSObject result = new JSObject();
        result.put("released", released);
        call.resolve(result);
    }

    private File cacheDirectory() {
        return new File(getContext().getCacheDir(), CACHE_DIRECTORY);
    }

    private String displayNameOf(Uri uri) {
        try (
            Cursor cursor = getContext().getContentResolver().query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null && !name.isBlank()) return name;
                }
            }
        } catch (Exception ignored) {
            // A stable fallback is sufficient for IndexedDB attachment metadata.
        }
        return "location-photo.jpg";
    }

    private static String extensionOf(String fileName) {
        int dot = fileName == null ? -1 : fileName.lastIndexOf('.');
        return dot >= 0 && dot + 1 < fileName.length() ? fileName.substring(dot + 1) : null;
    }

    private static void resolveStatus(PluginCall call, String status) {
        JSObject result = new JSObject();
        result.put("status", status);
        call.resolve(result);
    }

    private static String messageOf(Exception error) {
        String message = error.getMessage();
        return message == null || message.isBlank()
            ? "Unable to read the selected photo."
            : message;
    }

    @Override
    protected void handleOnDestroy() {
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
