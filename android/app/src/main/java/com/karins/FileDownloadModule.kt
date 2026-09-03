package com.karins

import android.content.ContentValues
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import java.io.File
import java.io.FileOutputStream

/**
 * Saves export bytes into the public Downloads collection so the user gets a
 * real download (visible in Files / Downloads) — not a share sheet.
 *
 * Implements TurboModule so RN 0.86 bridgeless can invoke saveToDownloads via
 * TurboModuleRegistry; legacy NativeModules.FileDownload is no longer callable.
 */
@ReactModule(name = FileDownloadModule.NAME)
class FileDownloadModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  TurboModule {

  override fun getName(): String = NAME

  @ReactMethod
  fun saveToDownloads(
    base64: String,
    filename: String,
    mimeType: String,
    promise: Promise,
  ) {
    try {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      if (bytes.isEmpty()) {
        promise.reject("DOWNLOAD_EMPTY", "Export returned an empty file.")
        return
      }

      val safeName = filename.replace(Regex("[^\\w.\\-]"), "_")
      val resolvedMime = mimeType.ifBlank { "application/octet-stream" }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        saveViaMediaStore(safeName, resolvedMime, bytes)
      } else {
        saveViaLegacyDownloads(safeName, resolvedMime, bytes)
      }

      promise.resolve("Downloads/$safeName")
    } catch (error: Exception) {
      promise.reject("DOWNLOAD_ERROR", error.message ?: "Could not save file.", error)
    }
  }

  /** Android 10+ — insert into MediaStore Downloads (no broad storage permission). */
  private fun saveViaMediaStore(filename: String, mimeType: String, bytes: ByteArray) {
    val resolver = reactApplicationContext.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, filename)
      put(MediaStore.Downloads.MIME_TYPE, mimeType)
      put(MediaStore.Downloads.IS_PENDING, 1)
    }

    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val uri = resolver.insert(collection, values)
      ?: throw IllegalStateException("Could not create Downloads entry.")

    try {
      resolver.openOutputStream(uri)?.use { output ->
        output.write(bytes)
        output.flush()
      } ?: throw IllegalStateException("Could not open Downloads output stream.")

      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
    } catch (error: Exception) {
      // Roll back a half-written pending row so Downloads stays clean.
      resolver.delete(uri, null, null)
      throw error
    }
  }

  /** Pre-Android 10 — write directly under public Downloads. */
  private fun saveViaLegacyDownloads(filename: String, mimeType: String, bytes: ByteArray) {
    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    if (!dir.exists() && !dir.mkdirs()) {
      throw IllegalStateException("Could not access Downloads folder.")
    }

    val file = File(dir, filename)
    if (file.exists()) {
      file.delete()
    }

    FileOutputStream(file).use { output ->
      output.write(bytes)
      output.flush()
    }

    MediaScannerConnection.scanFile(
      reactApplicationContext,
      arrayOf(file.absolutePath),
      arrayOf(mimeType),
      null,
    )
  }

  companion object {
    const val NAME = "NativeFileDownload"
  }
}
