package com.karins

import android.app.PendingIntent
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule

/**
 * Posts fleet tray alerts with a multi-line collapsed custom layout — iOS-like
 * full body visible without Android's BigText expand/collapse chevron.
 *
 * Intentionally omits setCustomBigContentView so the shade never offers expand.
 */
@ReactModule(name = FleetTrayNotificationModule.NAME)
class FleetTrayNotificationModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  TurboModule {

  override fun getName(): String = NAME

  @ReactMethod
  fun display(
    id: String,
    title: String,
    body: String,
    channelId: String,
    @Suppress("UNUSED_PARAMETER") data: ReadableMap?,
    promise: Promise,
  ) {
    try {
      val context = reactApplicationContext
      val contentView = RemoteViews(context.packageName, R.layout.notification_fleet_content)
      contentView.setTextViewText(R.id.notif_title, title)
      contentView.setTextViewText(R.id.notif_body, body)

      // Inbox rows are upserted in JS before display — tap only needs to open Notifications.
      val launchIntent = Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_MAIN
        addCategory(Intent.CATEGORY_LAUNCHER)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra(EXTRA_OPEN_NOTIFICATIONS, true)
        putExtra(EXTRA_NOTIFICATION_ID, id)
      }

      val requestCode = id.hashCode()
      val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
      val contentIntent = PendingIntent.getActivity(
        context,
        requestCode,
        launchIntent,
        pendingFlags,
      )

      val largeIcon = BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher)
      // Short system fallback only — full copy lives in the custom RemoteViews so
      // OEM "Title • body" compact rows cannot truncate mid-word with a chevron.
      val fallbackLine = if (body.length > 60) body.take(57) + "…" else body
      val builder = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(R.drawable.ic_stat_notification)
        .setColor(ContextCompat.getColor(context, R.color.notification_accent))
        .setContentTitle(title)
        .setContentText(fallbackLine)
        .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        .setCustomContentView(contentView)
        // Critical: never setCustomBigContentView — that is what adds expand/collapse.
        .setContentIntent(contentIntent)
        .setAutoCancel(true)
        .setOnlyAlertOnce(false)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_STATUS)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .setShowWhen(true)

      if (largeIcon != null) {
        builder.setLargeIcon(largeIcon)
      }

      NotificationManagerCompat.from(context).notify(stableNotifyId(id), builder.build())
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("FLEET_TRAY_DISPLAY_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun cancel(id: String, promise: Promise) {
    try {
      NotificationManagerCompat.from(reactApplicationContext).cancel(stableNotifyId(id))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("FLEET_TRAY_CANCEL_ERROR", error.message, error)
    }
  }

  /** JS polls after resume / sessionReady for cold-start tray taps. */
  @ReactMethod
  fun consumeOpenNotificationsIntent(promise: Promise) {
    val pending = pendingOpenNotifications
    pendingOpenNotifications = false
    promise.resolve(pending)
  }

  companion object {
    // Must match specs/NativeFleetTrayNotification.ts TurboModuleRegistry key.
    const val NAME = "NativeFleetTrayNotification"
    const val EXTRA_OPEN_NOTIFICATIONS = "karins_open_notifications"
    const val EXTRA_NOTIFICATION_ID = "karins_notification_id"

    @Volatile
    var pendingOpenNotifications: Boolean = false

    fun stableNotifyId(id: String): Int {
      // Stable positive id so re-posts update the same shade row.
      return id.hashCode() and 0x7fffffff
    }
  }
}
