package org.caster.playercore

import android.content.Context
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.IOException
import java.security.MessageDigest

/**
 * Where episode fingerprints live: one small file each (about 450 KB an hour) holding the
 * episode's key and its codes, so the app can tell which episodes have one.
 */
internal object Fingerprints {
  private const val MAGIC = 0x43465031 // "CFP1"

  private fun dir(context: Context) = File(context.filesDir, "fingerprints").apply { mkdirs() }

  private fun fileFor(context: Context, key: String): File {
    val hash = MessageDigest.getInstance("SHA-1").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
    return File(dir(context), "$hash.fp")
  }

  /** Decodes the episode and saves its fingerprint. Returns how many codes it has. */
  fun compute(context: Context, key: String, source: String): Int {
    val builder = FingerprintBuilder()
    SpeechAudio.decodeMono(source, FingerprintBuilder.RATE, onProgress = {}) { builder.add(it) }
    val codes = builder.result()
    if (codes.isEmpty()) throw IOException("No audio")
    val file = fileFor(context, key)
    val part = File(file.path + ".part")
    DataOutputStream(part.outputStream().buffered()).use { out ->
      out.writeInt(MAGIC)
      out.writeUTF(key)
      out.writeInt(codes.size)
      for (c in codes) out.writeInt(c)
    }
    if (!part.renameTo(file)) throw IOException("Couldn't save the fingerprint")
    return codes.size
  }

  fun read(context: Context, key: String): IntArray? {
    val file = fileFor(context, key)
    if (!file.exists()) return null
    return runCatching {
      DataInputStream(file.inputStream().buffered()).use { input ->
        if (input.readInt() != MAGIC) return null
        input.readUTF()
        IntArray(input.readInt()) { input.readInt() }
      }
    }.getOrNull()
  }

  /** Keys of the episodes that have a fingerprint. */
  fun list(context: Context): List<String> =
    dir(context).listFiles { f -> f.name.endsWith(".fp") }?.mapNotNull { f ->
      runCatching {
        DataInputStream(f.inputStream().buffered()).use { input ->
          if (input.readInt() == MAGIC) input.readUTF() else null
        }
      }.getOrNull()
    } ?: emptyList()

  fun delete(context: Context, key: String) {
    fileFor(context, key).delete()
  }

  /** Stretches of this episode that also play in the others (only ones with a fingerprint). */
  fun findRepeats(context: Context, key: String, others: List<String>): List<Map<String, Any>> {
    val target = read(context, key) ?: return emptyList()
    val finder = RepeatFinder(target)
    val found = mutableListOf<Repeat>()
    for (other in others) {
      if (other == key) continue
      val codes = read(context, other) ?: continue
      found += finder.against(other, codes)
    }
    return found.map {
      mapOf("start" to it.start, "end" to it.end, "otherKey" to it.otherKey, "otherStart" to it.otherStart)
    }
  }
}
