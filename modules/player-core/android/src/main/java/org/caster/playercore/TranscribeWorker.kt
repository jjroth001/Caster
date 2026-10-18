package org.caster.playercore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Must match AppRegistry.registerHeadlessTask in index.js. */
const val TRANSCRIBE_TASK_KEY = "CasterTranscribe"

/**
 * Work on downloads while Caster is closed: transcripts (if you chose "any time") and audio
 * fingerprints for repeated-ad detection. WorkManager wakes this while the phone is charging,
 * it shows a quiet notification (Android requires one), starts React Native without the app's
 * screen and runs the app's task until it's done or the phone is unplugged. The app keeps
 * counts of episodes waiting (and finished downloads add to them), so there's nothing to start
 * otherwise.
 */
internal object BackgroundTranscribe {
  const val WORK = "caster-transcribe"
  private const val CHANNEL = "transcripts"
  private const val PREFS = "caster-transcribe"

  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun configure(context: Context, enabled: Boolean) {
    val work = WorkManager.getInstance(context)
    if (!enabled) {
      work.cancelUniqueWork(WORK)
      return
    }
    val request = PeriodicWorkRequestBuilder<TranscribeWorker>(1, TimeUnit.HOURS)
      .setConstraints(Constraints.Builder().setRequiresCharging(true).setRequiresBatteryNotLow(true).build())
      .build()
    work.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
  }

  fun setPending(context: Context, count: Int) = prefs(context).edit().putInt("pending", count).apply()

  fun pending(context: Context) = prefs(context).getInt("pending", 0)

  fun setFingerprintPending(context: Context, count: Int) =
    prefs(context).edit().putInt("fingerprints", count).apply()

  /** A download finished (maybe with the app closed): there may be work for both. */
  fun afterDownload(context: Context) {
    val p = prefs(context)
    p.edit().putInt("pending", p.getInt("pending", 0) + 1).putInt("fingerprints", p.getInt("fingerprints", 0) + 1).apply()
  }

  fun hasWork(context: Context) = pending(context) > 0 || prefs(context).getInt("fingerprints", 0) > 0

  fun notification(context: Context): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL, "Getting episodes ready", NotificationManager.IMPORTANCE_MIN)
      channel.description = "Shown while Caster makes transcripts and finds ads in downloads as the phone charges"
      channel.setShowBadge(false)
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    @Suppress("DEPRECATION")
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL)
      else Notification.Builder(context).setPriority(Notification.PRIORITY_MIN)
    return builder
      .setSmallIcon(icon)
      .setContentTitle("Getting episodes ready")
      .setContentText("Transcripts and ad finding while your phone charges · stops when you unplug")
      .setOngoing(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .apply {
        if (launch != null) setContentIntent(PendingIntent.getActivity(context, 3, launch, PendingIntent.FLAG_IMMUTABLE))
      }
      .build()
  }
}

class TranscribeWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    if (!BackgroundTranscribe.hasWork(applicationContext)) return Result.success()
    val host = (applicationContext as? ReactApplication)?.reactHost ?: return Result.success()
    // Transcribing can take a while: run as a foreground service so Android lets it finish.
    val info =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ForegroundInfo(7400, BackgroundTranscribe.notification(applicationContext), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        ForegroundInfo(7400, BackgroundTranscribe.notification(applicationContext))
      }
    runCatching { setForegroundAsync(info).get() }

    val done = CountDownLatch(1)
    var taskId: Int? = null
    var reactContext: ReactContext? = null

    fun start(context: ReactContext) {
      reactContext = context
      UiThreadUtil.runOnUiThread {
        val tasks = HeadlessJsTaskContext.getInstance(context)
        tasks.addTaskEventListener(
          object : HeadlessJsTaskEventListener {
            override fun onHeadlessJsTaskStart(id: Int) {}

            override fun onHeadlessJsTaskFinish(id: Int) {
              if (id == taskId) {
                tasks.removeTaskEventListener(this)
                done.countDown()
              }
            }
          }
        )
        // No time limit; allowed even while the app is open (the task then just checks in).
        taskId = tasks.startTask(HeadlessJsTaskConfig(TRANSCRIBE_TASK_KEY, Arguments.createMap(), 0, true))
      }
    }

    UiThreadUtil.runOnUiThread {
      val current = host.currentReactContext
      if (current != null) {
        start(current)
      } else {
        host.addReactInstanceEventListener(
          object : ReactInstanceEventListener {
            override fun onReactContextInitialized(context: ReactContext) {
              host.removeReactInstanceEventListener(this)
              start(context)
            }
          }
        )
        host.start()
      }
    }

    // Wait for the task, checking every few seconds whether Android wants us to stop
    // (unplugged, battery low): then ask the task to stop its current episode.
    while (!done.await(5, TimeUnit.SECONDS)) {
      if (isStopped) {
        val context = reactContext
        if (context != null) {
          runCatching { context.emitDeviceEvent("CasterStopTranscribe", null) }
          UiThreadUtil.runOnUiThread {
            val id = taskId
            val tasks = HeadlessJsTaskContext.getInstance(context)
            if (id != null && tasks.isTaskRunning(id)) tasks.finishTask(id)
          }
        }
        break
      }
    }
    return Result.success()
  }
}
