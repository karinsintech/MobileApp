package com.karins

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(BiometricAuthPackage())
          add(FileDownloadPackage())
          add(FleetTrayNotificationPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Register before JS boots so Text styles with fontFamily: "Audiowide" resolve.
    ReactFontManager.getInstance().addCustomFont(this, "Audiowide", R.font.audiowide)
    ReactFontManager.getInstance().addCustomFont(this, "Audiowide-Regular", R.font.audiowide)
    // Create the FCM channel before JS boots — Android 8+ drops tray notifications
    // when the channel ID from firebase.json does not exist yet.
    createFleetNotificationChannel()
    loadReactNative(this)
  }

  private fun createFleetNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val channel = NotificationChannel(
      FLEET_ALERTS_CHANNEL_ID,
      "Karins Fleet Alerts",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Wallet, challan, compliance, and fleet alerts"
      enableVibration(true)
    }

    val manager = getSystemService(NotificationManager::class.java)
    manager?.createNotificationChannel(channel)
  }

  companion object {
    // Must match firebase.json + Notifee ANDROID_CHANNEL_ID in pushService.ts
    private const val FLEET_ALERTS_CHANNEL_ID = "karins_fleet_alerts_high"
  }
}
