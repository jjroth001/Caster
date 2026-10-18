package org.caster.playercore

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Cover art for Android Auto and the media notification. The car only shows artwork an app
 * hands it through a content:// address, never a web address, so covers are fetched here once,
 * shrunk to a sensible size and kept in the cache.
 *
 * Only covers Pod Wizard registered (from your library) are served: other apps can't use this
 * to make it fetch anything else.
 */
internal object Artwork {
  private const val MAX_SIDE = 512
  private val known = ConcurrentHashMap<String, String>()

  /**
   * Covers are named with a secret only this install knows, so another app can't work out a
   * well-known show's cover name and ask for it to learn whether you follow that show.
   */
  @Volatile private var salt: String? = null

  private fun salt(context: Context): String =
    salt ?: synchronized(this) {
      val prefs = context.getSharedPreferences("caster-artwork", Context.MODE_PRIVATE)
      prefs.getString("salt", null) ?: UUID.randomUUID().toString().also {
        prefs.edit().putString("salt", it).apply()
      }
    }.also { salt = it }

  private fun hash(context: Context, url: String) =
    MessageDigest.getInstance("SHA-1").digest((salt(context) + url).toByteArray()).joinToString("") { "%02x".format(it) }

  fun dir(context: Context) = File(context.cacheDir, "artwork").apply { mkdirs() }

  /** The content:// address to give the car (and notification) for a cover's web address. */
  fun uriFor(context: Context, url: String?): Uri? {
    if (url.isNullOrBlank()) return null
    if (!url.startsWith("http://") && !url.startsWith("https://")) return Uri.parse(url)
    val key = hash(context, url)
    known[key] = url
    return Uri.Builder().scheme("content").authority("${context.packageName}.artwork").appendPath("$key.jpg").build()
  }

  /** The cached file for a key, fetching and shrinking the cover the first time. */
  fun file(context: Context, key: String): File {
    if (!key.matches(Regex("[0-9a-f]{40}"))) throw FileNotFoundException()
    val cached = File(dir(context), "$key.jpg")
    if (cached.exists() && cached.length() > 0) return cached
    val url = known[key] ?: throw FileNotFoundException()
    val connection = openFollowingRedirects(url)
    val bytes =
      try {
        if (connection.responseCode !in 200..299) throw FileNotFoundException()
        connection.inputStream.use { it.readBytes() }
      } finally {
        connection.disconnect()
      }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= MAX_SIDE && bounds.outHeight / (sample * 2) >= MAX_SIDE) sample *= 2
    val bitmap =
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: throw FileNotFoundException()
    val part = File(cached.path + ".part")
    part.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 88, it) }
    bitmap.recycle()
    if (!part.renameTo(cached)) throw FileNotFoundException()
    return cached
  }
}

class ArtworkProvider : ContentProvider() {
  override fun onCreate() = true

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    if (mode != "r") throw SecurityException("Read only")
    val context = context ?: throw FileNotFoundException()
    val key = uri.lastPathSegment?.removeSuffix(".jpg") ?: throw FileNotFoundException()
    return ParcelFileDescriptor.open(Artwork.file(context, key), ParcelFileDescriptor.MODE_READ_ONLY)
  }

  override fun getType(uri: Uri) = "image/jpeg"

  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0

  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
}
