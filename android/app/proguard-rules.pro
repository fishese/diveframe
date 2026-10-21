# Add project specific ProGuard rules here.
# JNI looks up these classes and members by their original names during
# dive-computer downloads; Capacitor's consumer rules cover plugin methods.
-keep class cc.fishese.divelog.DiveComputerNative { *; }
-keep class cc.fishese.divelog.DiveComputerNative$* { *; }
-keep class cc.fishese.divelog.DiveComputerDownloadCollector { *; }
# Capacitor reads this class's plugin annotation field when requesting
# Bluetooth permissions. R8 otherwise removes the field and scanning crashes.
-keep class com.getcapacitor.PluginHandle { *; }
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
