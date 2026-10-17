package org.caster.playercore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Episode downloads, run by WorkManager so they finish with the app closed. A download is
 * identified by a key, "<podcastId>:<guid>", because the background refresh can start one for
 * an episode the app hasn't added to its database yet. The app matches keys to episodes.
 */
internal object Downloads {
  const val TAG = "caster-download"
  const val CHANNEL = "downloads"

  fun dir(context: Context) = File(context.filesDir, "episodes").apply { mkdirs() }

  private fun hash(key: String): String =
    MessageDigest.getInstance("SHA-1").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }.take(20)

  fun extension(url: String, mime: String?): String {
    val fromMime = when (mime?.lowercase()) {
      "audio/mpeg", "audio/mp3" -> "mp3"
      "audio/mp4", "audio/x-m4a", "audio/aac" -> "m4a"
      "video/mp4" -> "mp4"
      "audio/ogg" -> "ogg"
      "audio/opus" -> "opus"
      else -> null
    }
    if (fromMime != null) return fromMime
    val path = Uri.parse(url).lastPathSegment ?: ""
    val ext = path.substringAfterLast('.', "").lowercase()
    return if (ext.length in 2..4 && ext.all { it.isLetterOrDigit() }) ext else "mp3"
  }

  fun file(context: Context, key: String, ext: String) = File(dir(context), "${hash(key)}.$ext")

  private fun meta(context: Context, key: String) = File(dir(context), "${hash(key)}.json")

  fun workName(key: String) = "download:$key"

  fun enqueue(
    context: Context,
    key: String,
    url: String,
    mime: String?,
    title: String,
    wifiOnly: Boolean,
    chargingOnly: Boolean,
  ) {
    val ext = extension(url, mime)
    // A sidecar so a finished file can be traced back to its episode after a restart.
    meta(context, key).writeText(JSONObject().put("key", key).put("ext", ext).put("title", title).toString())
    val request = OneTimeWorkRequestBuilder<DownloadWorker>()
      .setInputData(workDataOf("key" to key, "url" to url, "ext" to ext, "title" to title))
      .setConstraints(
        Constraints.Builder()
          .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
          .setRequiresCharging(chargingOnly)
          .build()
      )
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .addTag(TAG)
      .addTag("key:$key")
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(workName(key), ExistingWorkPolicy.KEEP, request)
  }

  fun cancel(context: Context, key: String) {
    WorkManager.getInstance(context).cancelUniqueWork(workName(key))
  }

  /** Removes a download (finished or partial) and its sidecar. */
  fun delete(context: Context, key: String) {
    cancel(context, key)
    val h = hash(key)
    dir(context).listFiles()?.filter { it.name.startsWith("$h.") }?.forEach { it.delete() }
  }

  /** Finished downloads: key, file URI and size. */
  fun finished(context: Context): List<Map<String, Any>> =
    dir(context).listFiles()?.filter { it.name.endsWith(".json") }?.mapNotNull { metaFile ->
      runCatching {
        val json = JSONObject(metaFile.readText())
        val file = File(dir(context), "${metaFile.nameWithoutExtension}.${json.getString("ext")}")
        if (!file.exists()) return@mapNotNull null
        mapOf("key" to json.getString("key"), "uri" to Uri.fromFile(file).toString(), "bytes" to file.length().toDouble())
      }.getOrNull()
    } ?: emptyList()

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Progress while episodes download"
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  fun progressNotification(context: Context, title: String, percent: Int): Notification {
    ensureChannel(context)
    @Suppress("DEPRECATION")
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL)
      else Notification.Builder(context)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    return builder
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle("Downloading")
      .setContentText(title)
      .setProgress(100, percent, percent <= 0)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .apply {
        if (launch != null) {
          setContentIntent(PendingIntent.getActivity(context, 2, launch, PendingIntent.FLAG_IMMUTABLE))
        }
      }
      .build()
  }
}

class DownloadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val key = inputData.getString("key") ?: return Result.failure()
    val url = inputData.getString("url") ?: return Result.failure()
    val ext = inputData.getString("ext") ?: "mp3"
    val title = inputData.getString("title") ?: "Episode"
    val target = Downloads.file(applicationContext, key, ext)
    if (target.exists()) return Result.success(done(target))
    val part = File(target.path + ".part")
    // Long downloads run as a foreground service so Android doesn't stop them after 10 minutes.
    runCatching { setForegroundAsync(foregroundInfo(title, 0)).get() }

    return try {
      val resumeFrom = if (part.exists()) part.length() else 0L
      val headers = if (resumeFrom > 0) mapOf("Range" to "bytes=$resumeFrom-") else emptyMap()
      val connection = openFollowingRedirects(url, headers)
      try {
        val code = connection.responseCode
        if (code == 416) part.delete() // the partial file is stale; start over next attempt
        if (code !in 200..299) throw IOException("HTTP $code")
        val append = code == 206 && resumeFrom > 0
        if (!append) part.delete()
        val total = connection.contentLengthLong.let { if (it > 0) it + (if (append) resumeFrom else 0) else -1 }
        var written = if (append) resumeFrom else 0L
        var lastPercent = -1
        var lastReported = 0L
        connection.inputStream.use { input ->
          FileOutputStream(part, append).use { output ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              if (isStopped) return Result.failure()
              val n = input.read(buffer)
              if (n < 0) break
              output.write(buffer, 0, n)
              written += n
              if (total > 0) {
                val percent = ((written * 100) / total).toInt()
                if (percent != lastPercent) {
                  lastPercent = percent
                  setProgressAsync(workDataOf("progress" to percent / 100.0, "written" to written, "key" to key))
                  runCatching { setForegroundAsync(foregroundInfo(title, percent)) }
                }
              } else if (written - lastReported >= 1_000_000) {
                // The server didn't say how big the file is: report megabytes so far instead.
                lastReported = written
                setProgressAsync(workDataOf("progress" to -1.0, "written" to written, "key" to key))
              }
            }
          }
        }
      } finally {
        connection.disconnect()
      }
      if (!part.renameTo(target)) throw IOException("Couldn't save the file")
      Result.success(done(target))
    } catch (e: java.io.FileNotFoundException) {
      Result.failure(workDataOf("key" to key, "error" to "The file isn't there any more (404)"))
    } catch (e: IOException) {
      if (runAttemptCount < 4) Result.retry()
      else Result.failure(workDataOf("key" to key, "error" to (e.message ?: "Download failed")))
    }
  }

  private fun done(file: File): Data =
    workDataOf("key" to inputData.getString("key"), "uri" to Uri.fromFile(file).toString(), "bytes" to file.length())

  private fun foregroundInfo(title: String, percent: Int): ForegroundInfo {
    val notification = Downloads.progressNotification(applicationContext, title, percent)
    val id = 7300 + (inputData.getString("key")?.hashCode()?.and(0xfff) ?: 0)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      ForegroundInfo(id, notification)
    }
  }
}
