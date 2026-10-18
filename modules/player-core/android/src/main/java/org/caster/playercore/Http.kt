package org.caster.playercore

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

internal const val USER_AGENT = "PodWizard/1.0 (Android; open-source podcast player)"

/**
 * Sign-ins for private feeds, by host, handed over by the app (kept in memory only; the app
 * holds them in encrypted storage). Only ever sent to the host they were given for.
 */
internal object HostAuth {
  private val byHost = ConcurrentHashMap<String, String>()

  fun put(host: String, authorization: String) {
    byHost[host.lowercase()] = authorization
  }

  fun forUrl(url: String): String? =
    runCatching { URL(url).host?.lowercase() }.getOrNull()?.let { byHost[it] }
}

/**
 * Opens a GET connection, following redirects by hand: podcast hosts and tracking prefixes
 * chain several, sometimes from https to http, which HttpURLConnection won't follow itself.
 */
internal fun openFollowingRedirects(
  url: String,
  headers: Map<String, String> = emptyMap(),
  maxRedirects: Int = 10,
): HttpURLConnection {
  var current = url
  repeat(maxRedirects + 1) {
    val connection = (URL(current).openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = false
      connectTimeout = 15_000
      readTimeout = 30_000
      setRequestProperty("User-Agent", USER_AGENT)
      headers.forEach { (k, v) -> setRequestProperty(k, v) }
      // A private feed's sign-in goes to its own host on each hop, never to another one.
      HostAuth.forUrl(current)?.let { setRequestProperty("Authorization", it) }
    }
    val code = connection.responseCode
    if (code in 300..399 && code != 304) {
      val location = connection.getHeaderField("Location") ?: throw IOException("Redirect without a location")
      connection.disconnect()
      current = URL(URL(current), location).toString()
      return@repeat
    }
    return connection
  }
  throw IOException("Too many redirects")
}
