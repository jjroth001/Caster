@file:OptIn(UnstableApi::class)

package org.caster.playercore

import android.content.Context
import android.media.audiofx.LoudnessEnhancer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
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

  val isCreated: Boolean
    get() = exo != null

  /** The player the media session and JS controls use (skip buttons follow our intervals). */
  fun player(context: Context): CasterPlayer {
    forwarding?.let { return it }
    val appContext = context.applicationContext
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
    val player =
      ExoPlayer.Builder(appContext, renderers)
        .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(appContext, http)))
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

  fun stop() {
    exo?.run {
      stop()
      clearMediaItems()
    }
  }

  /** Called when the playback service goes away while nothing is playing. */
  fun release() {
    handler.removeCallbacksAndMessages(null)
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
    listOf(
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
        }
      }

      override fun onPlayerError(error: PlaybackException) {
        listener?.onError(exo?.currentMediaItem?.mediaId, error.errorCodeName, error.message ?: "")
      }

      override fun onAudioSessionIdChanged(audioSessionId: Int) {
        attachEnhancer(audioSessionId)
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
