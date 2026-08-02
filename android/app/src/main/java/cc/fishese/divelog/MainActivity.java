package cc.fishese.divelog;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DiveComputerPlugin.class);
        registerPlugin(FileExportPlugin.class);
        registerPlugin(PhotoLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
