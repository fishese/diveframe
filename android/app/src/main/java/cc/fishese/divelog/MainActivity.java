package cc.fishese.divelog;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int DEFAULT_TEXT_ZOOM_PERCENT = 100;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DiveComputerPlugin.class);
        registerPlugin(FileExportPlugin.class);
        registerPlugin(PhotoLocationPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 24, 32));
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setAppearanceLightStatusBars(false);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(DEFAULT_TEXT_ZOOM_PERCENT);
        }
    }
}
