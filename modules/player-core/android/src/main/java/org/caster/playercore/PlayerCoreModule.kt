@file:OptIn(UnstableApi::class)

package org.caster.playercore

import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class LoadItem : Record {
  @Field val id: String = ""
  @Field val url: String = ""
  @Field val title: String? = null
  @Field val artist: String? = null
  @Field val album: String? = null
  @Field val artworkUrl: String? = null
  @Field val startPositionMs: Double = 0.0
  @Field val playWhenReady: Boolean = true
}

/** JS API for the shared [PlayerCore] player. Every call runs on the main thread. */
class PlayerCoreModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val handler = Handler(Looper.getMainLooper())

  // Connecting a controller binds PlaybackService, which then owns the notification and keeps
  // playback alive in the background.
  private var controller: ListenableFuture<MediaController>? = null

  private val progressTicker =
    object : Runnable {
      override fun run() {
        sendEvent("onProgress", PlayerCore.snapshot())
        handler.postDelayed(this, 500)
      }
    }

  private val listener =
    object : PlayerCoreListener {
      override fun onStateChanged() {
        val state = PlayerCore.snapshot()
        sendEvent("onState", state)
        handler.removeCallbacks(progressTicker)
        if (state["playing"] == true) handler.postDelayed(progressTicker, 500)
      }

      override fun onEnded(id: String) = sendEvent("onEnded", mapOf("id" to id))

      override fun onError(id: String?, code: String, message: String) =
        sendEvent("onError", mapOf("id" to id, "code" to code, "message" to message))
    }

  override fun definition() = ModuleDefinition {
    Name("PlayerCore")

    Events("onState", "onProgress", "onEnded", "onError")

    OnCreate { handler.post { PlayerCore.listener = listener } }

    OnDestroy {
      handler.post {
        handler.removeCallbacks(progressTicker)
        if (PlayerCore.listener === listener) PlayerCore.listener = null
        controller?.let { MediaController.releaseFuture(it) }
        controller = null
      }
    }

    AsyncFunction("load") { item: LoadItem ->
      PlayerCore.listener = listener
      PlayerCore.load(
        context,
        id = item.id,
        url = item.url,
        title = item.title,
        artist = item.artist,
        album = item.album,
        artworkUrl = item.artworkUrl,
        startPositionMs = item.startPositionMs.toLong(),
        playWhenReady = item.playWhenReady,
      )
      connectService()
    }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("play") {
      PlayerCore.player(context).play()
      connectService()
    }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("pause") { if (PlayerCore.isCreated) PlayerCore.player(context).pause() }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("seekTo") { positionMs: Double ->
      if (PlayerCore.isCreated) PlayerCore.player(context).seekTo(positionMs.toLong().coerceAtLeast(0))
    }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("skipBack") { if (PlayerCore.isCreated) PlayerCore.player(context).seekBack() }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("skipForward") {
      if (PlayerCore.isCreated) PlayerCore.player(context).seekForward()
    }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("setSpeed") { speed: Double -> PlayerCore.setSpeed(speed.toFloat()) }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("setTrimSilence") { level: String ->
      PlayerCore.setTrimLevel(
        when (level) {
          "mild" -> TrimLevel.MILD
          "aggressive" -> TrimLevel.AGGRESSIVE
          else -> TrimLevel.OFF
        }
      )
    }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("setVolumeBoost") { enabled: Boolean -> PlayerCore.setVolumeBoost(enabled) }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("setSkipIntervals") { backSeconds: Double, forwardSeconds: Double ->
      PlayerCore.setSkipIntervals((backSeconds * 1000).toLong(), (forwardSeconds * 1000).toLong())
    }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("stop") { PlayerCore.stop() }.runOnQueue(Queues.MAIN)

    AsyncFunction("getState") { PlayerCore.snapshot() }.runOnQueue(Queues.MAIN)
  }

  private fun connectService() {
    if (controller != null) return
    val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
    controller = MediaController.Builder(context, token).buildAsync()
  }
}
