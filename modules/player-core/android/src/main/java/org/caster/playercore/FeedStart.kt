package org.caster.playercore

/**
 * The start of a feed, read off the main thread: just enough to hold its newest episodes, so a
 * show being opened can show them while the whole feed downloads. Reading stops (and the
 * download is dropped) once the wanted number of episodes is in.
 */
internal object FeedStart {
  private const val MAX_BYTES = 4 * 1024 * 1024
  private val END = "</item>".toByteArray(Charsets.UTF_8)

  /** Up to the end of the `items`-th episode (all of it if the feed is shorter), or null. */
  fun read(url: String, items: Int): String? {
    val connection =
      try {
        openFollowingRedirects(
          url,
          mapOf("Accept" to "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5"),
        )
      } catch (e: Exception) {
        return null
      }
    try {
      if (connection.responseCode !in 200..299) return null
      var data = ByteArray(64 * 1024)
      var size = 0
      var found = 0
      var scanned = 0
      val buffer = ByteArray(16 * 1024)
      connection.inputStream.use { input ->
        while (size < MAX_BYTES) {
          val n = input.read(buffer)
          if (n < 0) break
          if (size + n > data.size) data = data.copyOf(maxOf(data.size * 2, size + n))
          System.arraycopy(buffer, 0, data, size, n)
          size += n
          // Look for episode ends in what just arrived (and the few bytes before it).
          var i = maxOf(0, scanned - END.size + 1)
          while (i <= size - END.size) {
            if (matchesEnd(data, i)) {
              found++
              if (found == items) return String(data, 0, i + END.size, Charsets.UTF_8)
              i += END.size
            } else {
              i++
            }
          }
          scanned = size
        }
      }
      return String(data, 0, size, Charsets.UTF_8)
    } catch (e: Exception) {
      return null
    } finally {
      connection.disconnect()
    }
  }

  private fun matchesEnd(data: ByteArray, at: Int): Boolean {
    for (j in END.indices) if (data[at + j] != END[j]) return false
    return true
  }
}
