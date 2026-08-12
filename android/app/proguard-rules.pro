# App-specific R8 / ProGuard rules for release minify + optimize.
# Library consumer rules (React Native, Notifee, Reanimated, etc.) are merged automatically.
#
# Goal: raise Play Console shrinking / optimization / obfuscation scores and satisfy
# the "Repackage Classes" recommendation — without blanket -keep { *; } on SDKs.

# ---------------------------------------------------------------------------
# Play Console: Repackage Classes
# Move obfuscated classes into a short package so DEX metadata is smaller.
# -allowaccessmodification already comes from proguard-android-optimize.txt.
# ---------------------------------------------------------------------------
-repackageclasses

# Keep readable stack traces in crash reports after obfuscation.
-keepattributes SourceFile,LineNumberTable,Signature,InnerClasses,EnclosingMethod,*Annotation*
-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# App entry points referenced by AndroidManifest / ComponentName.
# Do NOT -keep com.karins.** { *; } — that blocks renaming of helpers
# (FaceTemplate, storage, synthetics) and tanks the obfuscation score.
# React Native already keeps NativeModule / ReactPackage implementations.
# ---------------------------------------------------------------------------
-keep class com.karins.MainApplication { *; }
-keep class com.karins.MainActivity { *; }
-keep class com.karins.FaceLockCameraActivity { *; }
-keep class com.karins.FileDownloadModule { *; }
-keep class com.karins.FileDownloadPackage { *; }
-keep class com.karins.BiometricAuthModule { *; }
-keep class com.karins.BiometricAuthPackage { *; }

# ---------------------------------------------------------------------------
# WorkManager + Room (Notifee / FCM)
# Prefer library consumer rules. Only pin the generated Room DB impl that R8
# previously stripped, which crashed InitializationProvider on release APKs.
# ---------------------------------------------------------------------------
-keep class androidx.work.impl.WorkDatabase { *; }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class androidx.work.impl.** { *; }
-dontwarn androidx.work.impl.**

# Notifee / Firebase — missing keep rules cause release-only native crashes
# when the first tray alert posts after login on OEM phones.
-keep class app.notifee.** { *; }
-keep class io.invertase.firebase.** { *; }
-keep class com.google.firebase.messaging.** { *; }

# Notifee Room DB — R8 stripped NotifeeCoreDatabase and crashed RebootBroadcastReceiver
# on Vivo/Android 16 release builds (log: Failed to create NotifeeCoreDatabase).
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class *
-keep class app.notifee.core.database.** { *; }
-keep class app.notifee.core.RebootBroadcastReceiver { *; }

# OkHttp / Okio warnings that appear under full R8 optimize mode.
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn com.google.common.util.concurrent.**
-dontwarn androidx.camera.**
-dontwarn com.google.mlkit.**
-dontwarn com.google.firebase.**
-dontwarn app.notifee.**
-dontwarn io.invertase.**
