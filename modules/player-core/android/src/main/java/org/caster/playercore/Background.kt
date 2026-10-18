package org.caster.playercore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Background feed checks. The app hands over a snapshot of what it follows (`background.json`);
 * the worker downloads changed feeds into an inbox that the app parses and saves the next time
 * it runs. Only the app writes to its database (two SQLite libraries in one process mustn't
 * share a file), so the worker just notifies and starts auto-downloads.
 */
internal object Background {
  const val WORK = "caster-refresh"
  const val CHANNEL = "new-episodes"
  private const val PREFS = "caster-background"

  fun configFile(context: Context) = File(context.filesDir, "background.json")

  fun inbox(context: Context) = File(context.filesDir, "feed-inbox").apply { mkdirs() }

  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Saves the app's snapshot and (re)schedules the periodic check. */
  fun configure(context: Context, json: String) {
    val config = JSONObject(json)
    // Private feeds' sign-ins are sealed before anything is written to a file.
    config.optJSONArray("podcasts")?.let { list ->
      for (i in 0 until list.length()) {
        val p = list.getJSONObject(i)
        if (p.isNull("authorization")) {
          p.remove("authorization")
          continue
        }
        val auth = p.getString("authorization").ifEmpty { null } ?: continue
        p.remove("authorization")
        p.put("authSealed", SecretBox.encrypt(auth))
      }
    }
    configFile(context).writeText(config.toString())
    val hours = config.optJSONObject("settings")?.optInt("refreshHours", 0) ?: 0
    val work = WorkManager.getInstance(context)
    if (hours <= 0) {
      work.cancelUniqueWork(WORK)
      return
    }
    val request = PeriodicWorkRequestBuilder<RefreshWorker>(hours.toLong(), TimeUnit.HOURS)
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .build()
    // UPDATE keeps the schedule's timing unless the interval changed.
    work.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
  }

  /** Feeds fetched while the app was closed: podcast id, XML and cache headers. */
  fun readInbox(context: Context): List<Map<String, Any?>> =
    inbox(context).listFiles()?.filter { it.name.endsWith(".xml") }?.mapNotNull { file ->
      val id = file.nameWithoutExtension.toLongOrNull() ?: return@mapNotNull null
      val headers = File(file.parentFile, "$id.json").takeIf { it.exists() }?.let { JSONObject(it.readText()) }
      mapOf(
        "podcastId" to id.toDouble(),
        "xml" to file.readText(),
        "etag" to headers?.optString("etag")?.ifEmpty { null },
        "lastModified" to headers?.optString("lastModified")?.ifEmpty { null },
      )
    } ?: emptyList()

  fun clearInbox(context: Context, podcastId: Long) {
    File(inbox(context), "$podcastId.xml").delete()
    File(inbox(context), "$podcastId.json").delete()
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL, "New episodes", NotificationManager.IMPORTANCE_DEFAULT)
    channel.description = "When a podcast you follow has a new episode"
    manager.createNotificationChannel(channel)
  }

  fun notifyNewEpisodes(context: Context, podcastId: Long, podcastTitle: String, titles: List<String>) {
    ensureChannel(context)
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) return
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon
    @Suppress("DEPRECATION")
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL)
      else Notification.Builder(context)
    val text = if (titles.size == 1) titles[0] else "${titles.size} new episodes · ${titles[0]}"
    val notification = builder
      .setSmallIcon(icon)
      .setContentTitle(podcastTitle)
      .setContentText(text)
      .setStyle(Notification.InboxStyle().also { style -> titles.take(5).forEach { style.addLine(it) } })
      .setAutoCancel(true)
      .setGroup("new-episodes")
      .apply {
        if (launch != null) {
          setContentIntent(PendingIntent.getActivity(context, podcastId.toInt(), launch, PendingIntent.FLAG_IMMUTABLE))
        }
      }
      .build()
    // One notification per podcast, replaced as more episodes arrive.
    manager.notify("podcast", podcastId.toInt(), notification)
  }
}

class RefreshWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val context = applicationContext
    val file = Background.configFile(context)
    if (!file.exists()) return Result.success()
    val config = runCatching { JSONObject(file.readText()) }.getOrNull() ?: return Result.success()
    val settings = config.optJSONObject("settings") ?: JSONObject()
    val podcasts = config.optJSONArray("podcasts") ?: return Result.success()
    val prefs = Background.prefs(context)
    val edit = prefs.edit()

    for (i in 0 until podcasts.length()) {
      if (isStopped) break
      val p = podcasts.getJSONObject(i)
      val id = p.getLong("id")
      val feedUrl = p.getString("feedUrl")
      // A private feed: open its sealed sign-in for this check (sent to its own host only).
      val auth = p.optString("authSealed").ifEmpty { null }?.let { SecretBox.decrypt(it) }
      if (p.has("authSealed") && auth == null) continue
      if (auth != null) runCatching { java.net.URL(feedUrl).host }.getOrNull()?.let { HostAuth.put(it, auth) }
      val etag = prefs.getString("etag:$id", null) ?: p.optString("etag").ifEmpty { null }
      val lastModified = prefs.getString("lm:$id", null) ?: p.optString("lastModified").ifEmpty { null }
      // Episodes newer than this count as new (whichever is later: the app's view or our last run).
      val seen = maxOf(p.optLong("latestPub", 0), prefs.getLong("seen:$id", 0))
      try {
        val headers = buildMap {
          put("Accept", "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5")
          etag?.let { put("If-None-Match", it) }
          lastModified?.let { put("If-Modified-Since", it) }
        }
        val connection = openFollowingRedirects(feedUrl, headers)
        val xml = try {
          if (connection.responseCode == 304 || connection.responseCode !in 200..299) null
          else connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
          connection.disconnect()
        }
        if (xml == null) continue
        val newEtag = connection.getHeaderField("ETag")
        val newLm = connection.getHeaderField("Last-Modified")
        File(Background.inbox(context), "$id.xml").writeText(xml)
        File(Background.inbox(context), "$id.json").writeText(
          JSONObject().put("etag", newEtag ?: "").put("lastModified", newLm ?: "").toString()
        )
        newEtag?.let { edit.putString("etag:$id", it) }
        newLm?.let { edit.putString("lm:$id", it) }

        val fresh = peekFeed(xml).filter { it.pubDate > seen && seen > 0 }.sortedByDescending { it.pubDate }
        if (fresh.isEmpty()) continue
        edit.putLong("seen:$id", fresh.first().pubDate)
        val title = p.optString("title", "Podcast")
        if (p.optBoolean("notify", false)) {
          Background.notifyNewEpisodes(context, id, title, fresh.map { it.title })
        }
        val autoN = p.optInt("autoDownload", 0)
        fresh.take(autoN).forEach { item ->
          Downloads.enqueue(
            context,
            key = "$id:${item.guid}",
            url = item.enclosureUrl,
            mime = item.mime,
            title = item.title,
            wifiOnly = settings.optBoolean("wifiOnly", true),
            chargingOnly = settings.optBoolean("chargingOnly", false),
            storageNotLow = settings.optBoolean("storageNotLow", true),
            authorization = auth,
          )
        }
      } catch (_: Exception) {
        // This feed failed; the others still get checked. The app retries when it opens.
      }
    }
    edit.apply()
    return Result.success()
  }
}
