package com.karins

import android.os.Bundle
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.view.WindowManager

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "KarinsFleet"

  /**
   * react-native-screens crashes with "Screen fragments should never be restored" when the OS
   * recreates the activity from a saved state (process death in background, reload, rotation).
   * Passing null discards that fragment state so RN rebuilds the navigation tree from scratch.
   *
   * Do NOT call androidx.activity.enableEdgeToEdge() — it still invokes deprecated
   * Window.setStatusBarColor / setNavigationBarColor / SHORT_EDGES (Play Console).
   * Theme.EdgeToEdge + edgeToEdgeEnabled=true + WindowCompat handle drawing behind bars;
   * SystemBars (JS) controls icon contrast without those APIs.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  // Prevent screenshots, screen recording, and Android Recents
  // thumbnails from exposing sensitive application content (MM-01 / MASVS-PLATFORM-3).
  window.setFlags(
    WindowManager.LayoutParams.FLAG_SECURE,
    WindowManager.LayoutParams.FLAG_SECURE
  )
    // Match Theme.EdgeToEdge: content draws behind system bars on API 24–34 as well.
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).apply {
      // Navy UI → light status/nav icons (same as former SystemBarStyle.dark).
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
