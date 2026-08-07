package cc.fishese.divelog;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final int DEFAULT_TEXT_ZOOM_PERCENT = 100;
    private static final String LOCAL_ORIGIN = "https://localhost";

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
        url.append(path);
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

    private final class DiveFrameJsBridge {
        @JavascriptInterface
        public void setLightStatusBars(final boolean light) {
            runOnUiThread(() ->
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                    .setAppearanceLightStatusBars(light)
            );
        }
    }

    private static void applySafeAreaCssVariables(WebView webView, WindowInsetsCompat windowInsets) {
        Insets bars = windowInsets.getInsets(
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
                + "})();",
            bars.top / density,
            bars.right / density,
            bars.bottom / density,
            bars.left / density
        );
        webView.evaluateJavascript(script, null);
    }
}
