package com.karins

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
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
 * Posts fleet tray + heads-up alerts.
 *
 * Left-side Karins logo is ALWAYS supplied via setLargeIcon + DecoratedCustomViewStyle
 * (system chrome). That is the slot OEMs reliably render; embedding a bitmap inside
 * RemoteViews left the avatar blank on some devices after binder/recycle failures.
 * Custom RemoteViews only carry title + multi-line body (no expand/collapse).
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
    data: ReadableMap?,
    onlyAlertOnce: Boolean,
    promise: Promise,
  ) {
    try {
      val context = reactApplicationContext
      // Fresh ARGB copy every post — never reuse a Drawable's cached bitmap
      // (NotificationManager may recycle it and blank the left logo on the next alert).
      val logoBitmap = loadLargeIconBitmap()

      // Short single-line fallback for OEMs that ignore custom RemoteViews.
      val summaryFromData = if (
        data != null
        && data.hasKey("traySummary")
        && !data.isNull("traySummary")
      ) {
        data.getString("traySummary")?.trim()?.takeIf { it.isNotEmpty() }
      } else {
        null
      }
      val summaryLine = summaryFromData
        ?: body.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() }
        ?: body.trim()

      val contentView = buildTextView(R.layout.notification_fleet_content, title, body)
      // Shorter heads-up layout — tall custom banners are rejected on some skins.
      val headsUpView = buildTextView(R.layout.notification_fleet_heads_up, title, body)

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

      val builder = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(R.drawable.ic_stat_notification)
        .setColor(ContextCompat.getColor(context, R.color.notification_accent))
        .setContentTitle(title)
        .setContentText(summaryLine)
        // System draws app name + left largeIcon; custom views are text-only.
        .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        .setCustomContentView(contentView)
        .setCustomHeadsUpContentView(headsUpView)
        // Never setCustomBigContentView — that adds expand/collapse.
        .setContentIntent(contentIntent)
        .setAutoCancel(true)
        .setOnlyAlertOnce(onlyAlertOnce)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_STATUS)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .setShowWhen(true)

      if (logoBitmap != null) {
        builder.setLargeIcon(logoBitmap)
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

  /** Bind title/body into a text-only RemoteViews row (logo is system largeIcon). */
  private fun buildTextView(layoutId: Int, title: String, body: String): RemoteViews {
    val context = reactApplicationContext
    val view = RemoteViews(context.packageName, layoutId)
    view.setTextViewText(R.id.notif_title, title)
    view.setTextViewText(R.id.notif_body, body)
    return view
  }

  /**
   * Render the flat centered-K plate into a new bitmap owned by this notification.
   * Uses drawable/ic_notification_large — never mipmap/ic_launcher (AdaptiveIcon
   * XML decodes to null / blank left avatar on API 26+ OEMs).
   */
  private fun loadLargeIconBitmap(): Bitmap? {
    val context = reactApplicationContext
    val flat = ContextCompat.getDrawable(context, R.drawable.ic_notification_large)
    if (flat != null) {
      return renderToBitmap(flat, LARGE_ICON_SIZE_PX)
    }

    return try {
      renderToBitmap(
        context.packageManager.getApplicationIcon(context.packageName),
        LARGE_ICON_SIZE_PX,
      )
    } catch (_: Exception) {
      null
    }
  }

  /**
   * Always allocate a fresh bitmap and draw into it.
   * Returning BitmapDrawable.bitmap directly lets the framework recycle the
   * shared asset and leaves the left logo empty on later posts / some OEMs.
   */
  private fun renderToBitmap(drawable: Drawable, size: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, size, size)
    drawable.draw(canvas)
    return bitmap
  }

  companion object {
    // Must match specs/NativeFleetTrayNotification.ts TurboModuleRegistry key.
    const val NAME = "NativeFleetTrayNotification"
    const val EXTRA_OPEN_NOTIFICATIONS = "karins_open_notifications"
    const val EXTRA_NOTIFICATION_ID = "karins_notification_id"
    // ~xxxhdpi tray avatar; small enough for binder, sharp enough after circular crop.
    private const val LARGE_ICON_SIZE_PX = 256

    @Volatile
    var pendingOpenNotifications: Boolean = false

    fun stableNotifyId(id: String): Int {
      // Stable positive id so re-posts update the same shade row.
      return id.hashCode() and 0x7fffffff
    }
  }
}
