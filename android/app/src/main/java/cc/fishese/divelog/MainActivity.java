package cc.fishese.divelog;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final int DEFAULT_TEXT_ZOOM_PERCENT = 100;

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
