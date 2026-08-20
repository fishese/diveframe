package cc.fishese.divelog;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final int DEFAULT_TEXT_ZOOM_PERCENT = 100;
    private static final String LOCAL_ORIGIN = "https://localhost";
    private static final String HANDLE_BACK_JS =
        "(function(){try{"
            + "if(typeof window.__diveFrameHandleBack!=='function')return 'pending';"
            + "return window.__diveFrameHandleBack()?'true':'false';"
            + "}catch(e){return 'pending';}})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DiveComputerPlugin.class);
        registerPlugin(FileExportPlugin.class);
        registerPlugin(PhotoLocationPlugin.class);
        super.onCreate(savedInstanceState);
        // Draw edge-to-edge; CSS owns the inset via --safe-area-inset-* so What's
        // New can sit below the status bar without being sticky itself.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setAppearanceLightStatusBars(false);
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.addJavascriptInterface(new DiveFrameJsBridge(), "DiveFrameNative");
            webView.getSettings().setTextZoom(DEFAULT_TEXT_ZOOM_PERCENT);
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
                applySafeAreaCssVariables(webView, windowInsets);
                return windowInsets;
            });
            ViewCompat.requestApplyInsets(webView);
            // Re-apply after first layout / document ready; early evaluateJavascript
            // can run before the HTML document exists.
            webView.post(() -> ViewCompat.requestApplyInsets(webView));
            webView.postDelayed(() -> ViewCompat.requestApplyInsets(webView), 250);
            webView.postDelayed(() -> ViewCompat.requestApplyInsets(webView), 1000);
            handleLaunchPath(getIntent());
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleAppBack();
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchPath(intent);
    }

    private void handleLaunchPath(Intent intent) {
        if (intent == null || getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        Uri data = intent.getData();
        if (data == null) {
            return;
        }
        String path = data.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) {
            return;
        }
        StringBuilder url = new StringBuilder(LOCAL_ORIGIN);
        url.append(nativeStaticPath(path));
        if (data.getEncodedQuery() != null) {
            url.append('?').append(data.getEncodedQuery());
        }
        String target = url.toString();
        WebView webView = getBridge().getWebView();
        // Capacitor may already be loading "/"; navigate after the bridge is up.
        webView.post(() -> webView.loadUrl(target));
        webView.postDelayed(() -> {
            String current = webView.getUrl();
            if (current == null || !current.startsWith(target.split("\\?", 2)[0])) {
                webView.loadUrl(target);
            }
        }, 350);
        // Consume so configuration changes do not re-apply the shortcut route.
        intent.setData(null);
        setIntent(intent);
    }

    private void handleAppBack() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            finish();
            return;
        }
        WebView webView = getBridge().getWebView();
        webView.evaluateJavascript(HANDLE_BACK_JS, value -> {
            if (jsReturnedTrue(value)) {
                return;
            }
            if (navigateUpFromUrl(webView.getUrl())) {
                return;
            }
            finish();
        });
    }

    private boolean navigateUpFromUrl(String current) {
        if (current == null || getBridge() == null || getBridge().getWebView() == null) {
            return false;
        }
        Uri uri = Uri.parse(current);
        String parent = parentAppHref(uri.getPath(), uri.getEncodedQuery());
        if (parent == null) {
            return false;
        }
        getBridge().getWebView().loadUrl(LOCAL_ORIGIN + toNativeAssetHref(parent));
        return true;
    }

    static String parentAppHref(String path, String encodedQuery) {
        String normalized = normalizeAppPath(path);
        String dive = queryParam(encodedQuery, "dive");
        if ("/compose".equals(normalized)) {
            return dive != null && !dive.isEmpty() ? "/?dive=" + Uri.encode(dive) : "/";
        }
        if ("/catalog/supplement".equals(normalized)
            || "/catalog/device-additions".equals(normalized)) {
            return "/catalog";
        }
        if ("/".equals(normalized)) {
            return dive != null && !dive.isEmpty() ? "/" : null;
        }
        return "/";
    }

    private static String normalizeAppPath(String path) {
        if (path == null || path.isEmpty() || "/index.html".equals(path) || "/index".equals(path)) {
            return "/";
        }
        String normalized = path.endsWith("/") && path.length() > 1
            ? path.substring(0, path.length() - 1)
            : path;
        if (normalized.endsWith(".html")) {
            normalized = normalized.substring(0, normalized.length() - 5);
        }
        return normalized.isEmpty() ? "/" : normalized;
    }

    private static String queryParam(String encodedQuery, String key) {
        if (encodedQuery == null || encodedQuery.isEmpty()) {
            return null;
        }
        for (String part : encodedQuery.split("&")) {
            int split = part.indexOf('=');
            String name = split == -1 ? part : part.substring(0, split);
            if (key.equals(name)) {
                return split == -1 ? "" : Uri.decode(part.substring(split + 1));
            }
        }
        return null;
    }

    private static String toNativeAssetHref(String href) {
        int queryAt = href.indexOf('?');
        String path = queryAt == -1 ? href : href.substring(0, queryAt);
        String query = queryAt == -1 ? "" : href.substring(queryAt);
        return nativeStaticPath(path) + query;
    }

    private static boolean jsReturnedTrue(String value) {
        return "true".equals(unwrapJsValue(value));
    }

    private static String unwrapJsValue(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static String nativeStaticPath(String path) {
        String normalized = path.endsWith("/") && path.length() > 1
            ? path.substring(0, path.length() - 1)
            : path;
        if (normalized.isEmpty() || "/".equals(normalized) || "/index.html".equals(normalized)) {
            return "/";
        }
        if (normalized.endsWith(".html") || normalized.matches(".*/[^/]+\\.[^/]+$")) {
            return normalized;
        }
        return normalized + ".html";
    }

    private final class DiveFrameJsBridge {
        @JavascriptInterface
        public void setLightStatusBars(final boolean light) {
            runOnUiThread(() ->
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                    .setAppearanceLightStatusBars(light)
            );
        }

        @JavascriptInterface
        public void refreshSafeAreaInsets() {
            runOnUiThread(() -> {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    return;
                }
                WebView webView = getBridge().getWebView();
                WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(webView);
                if (windowInsets != null) {
                    applySafeAreaCssVariables(webView, windowInsets);
                }
                ViewCompat.requestApplyInsets(webView);
            });
        }
    }

    private static void applySafeAreaCssVariables(WebView webView, WindowInsetsCompat windowInsets) {
        Insets bars = windowInsets.getInsetsIgnoringVisibility(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        );
        float density = webView.getResources().getDisplayMetrics().density;
        if (density <= 0f) {
            density = 1f;
        }
        String script = String.format(
            Locale.US,
            "(function(){var r=document.documentElement;"
                + "r.style.setProperty('--safe-area-inset-top','%.2fpx');"
                + "r.style.setProperty('--safe-area-inset-right','%.2fpx');"
                + "r.style.setProperty('--safe-area-inset-bottom','%.2fpx');"
                + "r.style.setProperty('--safe-area-inset-left','%.2fpx');"
                + "try{localStorage.setItem('diveframe-native-safe-area-top','%.2fpx');"
                + "localStorage.setItem('diveframe-native-safe-area-right','%.2fpx');"
                + "localStorage.setItem('diveframe-native-safe-area-bottom','%.2fpx');"
                + "localStorage.setItem('diveframe-native-safe-area-left','%.2fpx');}catch(e){}"
                + "})();",
            bars.top / density,
            bars.right / density,
            bars.bottom / density,
            bars.left / density,
            bars.top / density,
            bars.right / density,
            bars.bottom / density,
            bars.left / density
        );
        webView.evaluateJavascript(script, null);
    }
}
