@file:OptIn(UnstableApi::class)

package org.caster.playercore

import androidx.annotation.OptIn
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.AudioProcessorChain
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.SilenceSkippingAudioProcessor

/**
 * The audio sink's processing chain: Media3's default (silence skipping, then Sonic for speed),
 * but with two silence levels instead of one. Keeping silence skipping in this slot, rather than
 * as an extra processor, lets ExoPlayer account for the skipped audio, so positions stay exact.
 *
 * The level is read whenever skip silence is switched on; [PlayerCore] re-toggles it to apply a
 * new level.
 */
class TrimSilenceChain : AudioProcessorChain {
  /** Media3's built-in level: trims pauses longer than 0.1 s down to a fifth, at most 2 s. */
  private val mild = SilenceSkippingAudioProcessor()

  /** Shorter pauses count as silence, and less of each pause is kept. */
  private val aggressive =
    SilenceSkippingAudioProcessor(
      /* minimumSilenceDurationUs = */ 60_000,
      /* silenceRetentionRatio = */ 0.08f,
      /* maxSilenceToKeepDurationUs = */ 250_000,
      /* minVolumeToKeepPercentageWhenMuting = */ 0,
      /* silenceThresholdLevel = */ 1536,
    )

  private val sonic = SonicAudioProcessor()
  private val processors = arrayOf<AudioProcessor>(mild, aggressive, sonic)

  @Volatile var aggressiveMode = false

  override fun getAudioProcessors(): Array<AudioProcessor> = processors

  override fun applyPlaybackParameters(playbackParameters: PlaybackParameters): PlaybackParameters {
    sonic.setSpeed(playbackParameters.speed)
    sonic.setPitch(playbackParameters.pitch)
    return playbackParameters
  }

  override fun applySkipSilenceEnabled(skipSilenceEnabled: Boolean): Boolean {
    mild.setEnabled(skipSilenceEnabled && !aggressiveMode)
    aggressive.setEnabled(skipSilenceEnabled && aggressiveMode)
    return skipSilenceEnabled
  }

  override fun getMediaDuration(playoutDuration: Long): Long =
    if (sonic.isActive) sonic.getMediaDuration(playoutDuration) else playoutDuration

  override fun getSkippedOutputFrameCount(): Long = mild.skippedFrames + aggressive.skippedFrames
}
