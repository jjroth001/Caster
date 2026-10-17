@file:OptIn(UnstableApi::class)

package org.caster.playercore

import android.content.Context
import android.media.audiofx.LoudnessEnhancer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.extractor.metadata.id3.ChapterFrame
import androidx.media3.extractor.metadata.id3.TextInformationFrame
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession

enum class TrimLevel { OFF, MILD, AGGRESSIVE }

/** What the JS side hears about. Always called on the main thread. */
interface PlayerCoreListener {
  fun onStateChanged()

  fun onEnded(id: String)

  fun onError(id: String?, code: String, message: String)

  /** Chapters embedded in the file (ID3 CHAP frames), once the player has read them. */
  fun onChapters(id: String, chapters: List<Map<String, Any?>>)

  /** A headset press mapped to something the app does (next chapter, bookmark). */
  fun onHeadsetAction(action: String)
}

/**
 * The one player for the whole app process, shared by [PlaybackService] (media session,
 * notification, headset buttons) and [PlayerCoreModule] (the JS API). Main thread only.
 */
object PlayerCore {
  private const val USER_AGENT = "Caster/1.0 (Android; open-source podcast player)"
  private const val BOOST_GAIN_MB = 800 // +8 dB; LoudnessEnhancer limits peaks itself.

  private var exo: ExoPlayer? = null
  private var forwarding: CasterPlayer? = null
  private var chain: TrimSilenceChain? = null
  private var enhancer: LoudnessEnhancer? = null
  private val handler = Handler(Looper.getMainLooper())

  var listener: PlayerCoreListener? = null
  var session: MediaSession? = null
    set(value) {
      field = value
      value?.setMediaButtonPreferences(mediaButtons())
    }

  var skipBackMs = 10_000L
    private set
  var skipForwardMs = 30_000L
    private set
  var trimLevel = TrimLevel.OFF
    private set
  var volumeBoost = false
    private set

  /** When the sleep timer pauses playback (elapsedRealtime ms), or 0 when it's off. */
  private var sleepAt = 0L
  private const val FADE_MS = 10_000L

  val isCreated: Boolean
    get() = exo != null

  /** The player if it exists, without creating one. */
  fun current(): CasterPlayer? = forwarding

  /** The player the media session and JS controls use (skip buttons follow our intervals). */
  fun player(context: Context): CasterPlayer {
    forwarding?.let { return it }
    val appContext = context.applicationContext
    this.appContext = appContext
    val trim = TrimSilenceChain()
    val renderers =
      object : DefaultRenderersFactory(appContext) {
        override fun buildAudioSink(
          context: Context,
          enableFloatOutput: Boolean,
          enableAudioOutputPlaybackParams: Boolean,
        ): AudioSink =
          DefaultAudioSink.Builder(context)
            .setEnableFloatOutput(enableFloatOutput)
            .setEnableAudioOutputPlaybackParameters(enableAudioOutputPlaybackParams)
            .setAudioProcessorChain(trim)
            .build()
      }
    // Podcast hosts and tracking prefixes redirect a lot, sometimes from https to http.
    val http =
      DefaultHttpDataSource.Factory()
        .setUserAgent(USER_AGENT)
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(20_000)
    // Private feeds: add the sign-in for hosts the app has one for.
    val signedIn =
      ResolvingDataSource.Factory(http) { spec ->
        HostAuth.forUrl(spec.uri.toString())?.let { spec.withAdditionalHeaders(mapOf("Authorization" to it)) }
          ?: spec
      }
    val player =
      ExoPlayer.Builder(appContext, renderers)
        .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(appContext, signedIn)))
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
            .build(),
          /* handleAudioFocus = */ true,
        )
        .setHandleAudioBecomingNoisy(true) // pause when headphones are unplugged
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .build()
    player.addListener(events)
    exo = player
    chain = trim
    applyTrim()
    attachEnhancer(player.audioSessionId)
    return CasterPlayer(player).also { forwarding = it }
  }

  fun load(
    context: Context,
    id: String,
    url: String,
    title: String?,
    artist: String?,
    album: String?,
    artworkUrl: String?,
    startPositionMs: Long,
    playWhenReady: Boolean,
  ) {
    val player = player(context)
    val metadata =
      MediaMetadata.Builder()
        .setTitle(title)
        .setArtist(artist)
        .setAlbumTitle(album)
        .setArtworkUri(artworkUrl?.let(Uri::parse))
        .setMediaType(MediaMetadata.MEDIA_TYPE_PODCAST_EPISODE)
        .setIsPlayable(true)
        .setIsBrowsable(false)
        .build()
    val item = MediaItem.Builder().setMediaId(id).setUri(url).setMediaMetadata(metadata).build()
    player.setMediaItem(item, startPositionMs.coerceAtLeast(0))
    player.prepare()
    player.playWhenReady = playWhenReady
  }

  fun setSpeed(speed: Float) {
    exo?.setPlaybackSpeed(speed.coerceIn(0.5f, 3f))
  }

  fun setTrimLevel(level: TrimLevel) {
    val wasOn = trimLevel != TrimLevel.OFF
    trimLevel = level
    applyTrim()
    // The chain reads the level when skip silence is switched on, so switch it off and on again
    // to move between mild and aggressive.
    if (wasOn && level != TrimLevel.OFF) {
      exo?.skipSilenceEnabled = false
      handler.postDelayed({ applyTrim() }, 150)
    }
  }

  fun setVolumeBoost(enabled: Boolean) {
    volumeBoost = enabled
    enhancer?.enabled = enabled
    listener?.onStateChanged()
  }

  fun setSkipIntervals(backMs: Long, forwardMs: Long) {
    skipBackMs = backMs.coerceIn(1_000, 600_000)
    skipForwardMs = forwardMs.coerceIn(1_000, 600_000)
    session?.setMediaButtonPreferences(mediaButtons())
  }

  /** Pauses after `ms`, fading out over the last 10 seconds; 0 turns the timer off. */
  fun setSleepTimer(ms: Long) {
    handler.removeCallbacks(sleepTick)
    exo?.volume = 1f
    sleepAt = if (ms > 0) SystemClock.elapsedRealtime() + ms else 0L
    if (sleepAt > 0) handler.post(sleepTick)
    listener?.onStateChanged()
  }

  private val sleepTick =
    object : Runnable {
      override fun run() {
        val player = exo ?: return
        val left = sleepAt - SystemClock.elapsedRealtime()
        if (left <= 0) {
          player.pause()
          player.volume = 1f
          sleepAt = 0L
          listener?.onStateChanged()
          return
        }
        // Only fade while actually playing; a paused timer keeps counting down.
        player.volume = if (left < FADE_MS) (left.toFloat() / FADE_MS).coerceIn(0f, 1f) else 1f
        handler.postDelayed(this, if (left < FADE_MS) 100L else 1_000L)
      }
    }

  fun stop() {
    exo?.run {
      stop()
      clearMediaItems()
    }
  }

  // --- Playback started outside the app (Android Auto, headsets) with the app's JS not running ---

  private const val PENDING = "caster-pending"
  private var appContext: Context? = null

  /**
   * With no app listening, remember the episode's position (and whether it finished) so the
   * app can save it to its library the next time it runs.
   */
  fun savePendingPosition(context: Context, ended: Boolean = false) {
    if (listener != null) return
    val player = exo ?: return
    val id = player.currentMediaItem?.mediaId ?: return
    context.getSharedPreferences(PENDING, Context.MODE_PRIVATE).edit()
      .putString("pos:$id", "${player.currentPosition}|${System.currentTimeMillis()}|${if (ended) 1 else 0}")
      .putString("nowPlaying", id)
      .apply()
  }

  fun bookmarkFromOutside(context: Context) {
    val l = listener
    if (l != null) {
      l.onHeadsetAction("bookmark")
      return
    }
    val player = exo ?: return
    val id = player.currentMediaItem?.mediaId ?: return
    val prefs = context.getSharedPreferences(PENDING, Context.MODE_PRIVATE)
    val list = prefs.getString("bookmarks", "") ?: ""
    prefs.edit().putString("bookmarks", "$list$id|${player.currentPosition}|${System.currentTimeMillis()};").apply()
  }

  /** Positions, finishes and bookmarks recorded while the app wasn't running; clears them. */
  fun takePending(context: Context): Map<String, Any?> {
    val prefs = context.getSharedPreferences(PENDING, Context.MODE_PRIVATE)
    val positions = prefs.all.filterKeys { it.startsWith("pos:") }.mapNotNull { (key, value) ->
      val parts = (value as? String)?.split('|') ?: return@mapNotNull null
      if (parts.size < 3) return@mapNotNull null
      mapOf(
        "id" to key.removePrefix("pos:"),
        "positionMs" to parts[0].toDouble(),
        "at" to parts[1].toDouble(),
        "ended" to (parts[2] == "1"),
      )
    }
    val bookmarks = (prefs.getString("bookmarks", "") ?: "").split(';').filter { it.isNotBlank() }.mapNotNull { line ->
      val parts = line.split('|')
      if (parts.size < 3) null else mapOf("id" to parts[0], "positionMs" to parts[1].toDouble(), "at" to parts[2].toDouble())
    }
    val nowPlaying = prefs.getString("nowPlaying", null)
    prefs.edit().clear().apply()
    return mapOf("positions" to positions, "bookmarks" to bookmarks, "nowPlaying" to nowPlaying)
  }

  /** Called when the playback service goes away while nothing is playing. */
  fun release() {
    handler.removeCallbacksAndMessages(null)
    sleepAt = 0L
    enhancer?.release()
    enhancer = null
    exo?.removeListener(events)
    exo?.release()
    exo = null
    forwarding = null
    chain = null
  }

  fun snapshot(): Map<String, Any?> {
    val player = exo
    val duration = player?.duration ?: C.TIME_UNSET
    return mapOf(
      "id" to player?.currentMediaItem?.mediaId,
      "state" to
        when (player?.playbackState) {
          Player.STATE_BUFFERING -> "buffering"
          Player.STATE_READY -> "ready"
          Player.STATE_ENDED -> "ended"
          else -> "idle"
        },
      "playing" to (player?.isPlaying ?: false),
      "playWhenReady" to (player?.playWhenReady ?: false),
      "positionMs" to (player?.currentPosition ?: 0L).toDouble(),
      "durationMs" to if (duration == C.TIME_UNSET) null else duration.toDouble(),
      "bufferedMs" to (player?.bufferedPosition ?: 0L).toDouble(),
      "speed" to (player?.playbackParameters?.speed ?: 1f).toDouble(),
      "trimSilence" to trimLevel.name.lowercase(),
      "volumeBoost" to volumeBoost,
      "sleepRemainingMs" to
        if (sleepAt > 0) (sleepAt - SystemClock.elapsedRealtime()).coerceAtLeast(0).toDouble()
        else null,
    )
  }

  private fun applyTrim() {
    chain?.aggressiveMode = trimLevel == TrimLevel.AGGRESSIVE
    exo?.skipSilenceEnabled = trimLevel != TrimLevel.OFF
    listener?.onStateChanged()
  }

  private fun attachEnhancer(audioSessionId: Int) {
    enhancer?.release()
    enhancer = null
    if (audioSessionId == C.AUDIO_SESSION_ID_UNSET) return
    enhancer =
      try {
        LoudnessEnhancer(audioSessionId).apply {
          setTargetGain(BOOST_GAIN_MB)
          enabled = volumeBoost
        }
      } catch (_: RuntimeException) {
        null // Some devices don't offer audio effects; boost then does nothing.
      }
  }

  /** Notification and lock-screen buttons: skip back and forward by the user's intervals. */
  private fun mediaButtons(): List<CommandButton> =
    AutoLibrary.extraButtons() + listOf(
      CommandButton.Builder(skipBackIcon(skipBackMs))
        .setDisplayName("Skip back")
        .setPlayerCommand(Player.COMMAND_SEEK_BACK)
        .setSlots(CommandButton.SLOT_BACK)
        .build(),
      CommandButton.Builder(skipForwardIcon(skipForwardMs))
        .setDisplayName("Skip forward")
        .setPlayerCommand(Player.COMMAND_SEEK_FORWARD)
        .setSlots(CommandButton.SLOT_FORWARD)
        .build(),
    )

  private fun skipBackIcon(ms: Long) =
    when (ms) {
      5_000L -> CommandButton.ICON_SKIP_BACK_5
      10_000L -> CommandButton.ICON_SKIP_BACK_10
      15_000L -> CommandButton.ICON_SKIP_BACK_15
      30_000L -> CommandButton.ICON_SKIP_BACK_30
      else -> CommandButton.ICON_SKIP_BACK
    }

  private fun skipForwardIcon(ms: Long) =
    when (ms) {
      5_000L -> CommandButton.ICON_SKIP_FORWARD_5
      10_000L -> CommandButton.ICON_SKIP_FORWARD_10
      15_000L -> CommandButton.ICON_SKIP_FORWARD_15
      30_000L -> CommandButton.ICON_SKIP_FORWARD_30
      else -> CommandButton.ICON_SKIP_FORWARD
    }

  private val events =
    object : Player.Listener {
      override fun onEvents(player: Player, events: Player.Events) {
        if (
          events.containsAny(
            Player.EVENT_PLAYBACK_STATE_CHANGED,
            Player.EVENT_IS_PLAYING_CHANGED,
            Player.EVENT_PLAY_WHEN_READY_CHANGED,
            Player.EVENT_PLAYBACK_PARAMETERS_CHANGED,
            Player.EVENT_MEDIA_ITEM_TRANSITION,
            Player.EVENT_POSITION_DISCONTINUITY,
          )
        ) {
          listener?.onStateChanged()
        }
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED) {
          exo?.currentMediaItem?.mediaId?.let { listener?.onEnded(it) }
          appContext?.let { savePendingPosition(it, ended = true) }
        }
      }

      override fun onIsPlayingChanged(isPlaying: Boolean) {
        // Paused from the car or a headset with the app closed: keep the place.
        if (!isPlaying) appContext?.let { savePendingPosition(it) }
      }

      override fun onPlayerError(error: PlaybackException) {
        listener?.onError(exo?.currentMediaItem?.mediaId, error.errorCodeName, error.message ?: "")
      }

      override fun onAudioSessionIdChanged(audioSessionId: Int) {
        attachEnhancer(audioSessionId)
      }

      override fun onTracksChanged(tracks: Tracks) {
        val id = exo?.currentMediaItem?.mediaId ?: return
        val chapters = mutableListOf<Map<String, Any?>>()
        for (group in tracks.groups) {
          for (i in 0 until group.length) {
            val metadata = group.getTrackFormat(i).metadata ?: continue
            for (j in 0 until metadata.length()) {
              val entry = metadata.get(j)
              if (entry !is ChapterFrame) continue
              var title: String? = null
              for (k in 0 until entry.subFrameCount) {
                val sub = entry.getSubFrame(k)
                if (sub is TextInformationFrame && sub.id == "TIT2") title = sub.values.firstOrNull()
              }
              chapters += mapOf(
                "startMs" to entry.startTimeMs.toDouble(),
                "endMs" to entry.endTimeMs.toDouble(),
                "title" to title,
              )
            }
          }
        }
        if (chapters.isNotEmpty()) {
          listener?.onChapters(id, chapters.sortedBy { it["startMs"] as Double }.distinctBy { it["startMs"] })
        }
      }
    }
}

/**
 * Podcast-style controls on top of ExoPlayer: skip back/forward use the user's intervals, and a
 * headset's "previous"/"next" buttons skip back/forward within the episode.
 */
class CasterPlayer(player: ExoPlayer) : ForwardingPlayer(player) {
  override fun getSeekBackIncrement() = PlayerCore.skipBackMs

  override fun getSeekForwardIncrement() = PlayerCore.skipForwardMs

  override fun seekBack() = seekTo((currentPosition - PlayerCore.skipBackMs).coerceAtLeast(0))

  override fun seekForward() {
    val target = currentPosition + PlayerCore.skipForwardMs
    val end = duration
    seekTo(if (end == C.TIME_UNSET) target else target.coerceAtMost(end))
  }

  override fun seekToPrevious() = seekBack()

  override fun seekToPreviousMediaItem() = seekBack()

  override fun seekToNext() = seekForward()

  override fun seekToNextMediaItem() = seekForward()

  override fun getAvailableCommands(): Player.Commands =
    super.getAvailableCommands()
      .buildUpon()
      .addAll(
        Player.COMMAND_SEEK_BACK,
        Player.COMMAND_SEEK_FORWARD,
        Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_NEXT,
      )
      .build()

  override fun isCommandAvailable(command: Int): Boolean =
    availableCommands.contains(command)
}
