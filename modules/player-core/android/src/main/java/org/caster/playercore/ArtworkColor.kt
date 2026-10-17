package org.caster.playercore

import android.graphics.BitmapFactory
import androidx.palette.graphics.Palette

/** The colour a cover art "reads as", for tinting the player and podcast pages. */
internal object ArtworkColor {
  private val cache = HashMap<String, String?>()

  fun of(url: String): String? {
    cache[url]?.let { return it }
    val bytes =
      if (url.startsWith("file://")) java.io.File(url.removePrefix("file://")).readBytes()
      else openFollowingRedirects(url).let { c -> try { c.inputStream.use { it.readBytes() } } finally { c.disconnect() } }
    // A small copy is plenty for picking a colour.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= 96) sample *= 2
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: return null
    val palette = Palette.from(bitmap).generate()
    bitmap.recycle()
    val swatch = palette.darkVibrantSwatch ?: palette.vibrantSwatch ?: palette.darkMutedSwatch ?: palette.dominantSwatch
    val color = swatch?.rgb?.let { "#%06X".format(it and 0xFFFFFF) }
    cache[url] = color
    return color
  }
}
