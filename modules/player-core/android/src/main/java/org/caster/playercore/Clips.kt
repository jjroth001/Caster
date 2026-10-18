@file:OptIn(UnstableApi::class)

package org.caster.playercore

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import com.google.common.collect.ImmutableSet
import java.io.File

/**
 * Clips with Media3 Transformer: a stretch of an episode as an M4A file, or as an MP4 video with
 * the cover art (square or 9:16 for stories). Runs on the main thread; reports when done.
 */
internal object Clips {
  fun dir(context: Context) = File(context.cacheDir, "clips").apply { mkdirs() }

  fun make(
    context: Context,
    source: String,
    startMs: Long,
    endMs: Long,
    artworkUrl: String?,
    format: String,
    onDone: (String) -> Unit,
    onError: (String) -> Unit,
  ) {
    // Old clips are only needed until they've been shared.
    dir(context).listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }?.forEach { it.delete() }
    val video = format != "audio" && !artworkUrl.isNullOrBlank()
    val out = File(dir(context), "podwizard-clip-${System.currentTimeMillis()}.${if (video) "mp4" else "m4a"}")
    val clipped = MediaItem.Builder()
      .setUri(source)
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder().setStartPositionMs(startMs).setEndPositionMs(endMs).build()
      )
      .build()
    val audio = EditedMediaItem.Builder(clipped).setRemoveVideo(true).build()

    val transformer = Transformer.Builder(context)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .apply { if (video) setVideoMimeType(MimeTypes.VIDEO_H264) }
      .addListener(
        object : Transformer.Listener {
          override fun onCompleted(composition: Composition, exportResult: ExportResult) {
            onDone(Uri.fromFile(out).toString())
          }

          override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
            out.delete()
            onError(exportException.errorCodeName)
          }
        }
      )
      .build()

    if (!video) {
      transformer.start(audio, out.path)
      return
    }
    // The cover art shown for the length of the clip, scaled into the frame.
    val (width, height) = if (format == "story") 1080 to 1920 else 1080 to 1080
    val image = EditedMediaItem.Builder(
      MediaItem.Builder().setUri(artworkUrl).setImageDurationMs(endMs - startMs).build()
    )
      .setFrameRate(30)
      .setEffects(Effects(emptyList(), listOf(Presentation.createForWidthAndHeight(width, height, Presentation.LAYOUT_SCALE_TO_FIT))))
      .build()
    val composition = Composition.Builder(
      EditedMediaItemSequence.Builder(ImmutableSet.of(C.TRACK_TYPE_VIDEO)).addItem(image).build(),
      EditedMediaItemSequence.Builder(ImmutableSet.of(C.TRACK_TYPE_AUDIO)).addItem(audio).build(),
    ).build()
    transformer.start(composition, out.path)
  }
}
