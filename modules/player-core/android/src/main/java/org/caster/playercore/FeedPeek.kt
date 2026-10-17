package org.caster.playercore

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader
import java.util.Locale
import java.util.TimeZone

/** The few item fields the background refresh needs for notifications and auto-download. */
internal data class PeekItem(
  val guid: String,
  val title: String,
  val enclosureUrl: String,
  val mime: String?,
  val pubDate: Long,
)

/**
 * A light pass over a feed (the app does the full parse later): items with an enclosure,
 * guid falling back to the enclosure URL, same as the JS parser.
 */
internal fun peekFeed(xml: String): List<PeekItem> {
  val parser = Xml.newPullParser()
  parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
  parser.setInput(StringReader(xml))
  val items = mutableListOf<PeekItem>()
  var inItem = false
  var field: String? = null
  var guid: String? = null
  var title: String? = null
  var url: String? = null
  var mime: String? = null
  var pub: String? = null
  val text = StringBuilder()
  try {
    var event = parser.eventType
    while (event != XmlPullParser.END_DOCUMENT) {
      when (event) {
        XmlPullParser.START_TAG -> {
          val name = parser.name
          if (name == "item") {
            inItem = true
            guid = null; title = null; url = null; mime = null; pub = null
          } else if (inItem) {
            when (name) {
              "enclosure" -> if (url == null) {
                url = parser.getAttributeValue(null, "url")
                mime = parser.getAttributeValue(null, "type")
              }
              "guid", "title", "pubDate" -> {
                field = name
                text.setLength(0)
              }
            }
          }
        }
        XmlPullParser.TEXT -> if (field != null) text.append(parser.text)
        XmlPullParser.END_TAG -> {
          val name = parser.name
          if (inItem && name == field) {
            val value = text.toString().trim()
            when (name) {
              "guid" -> guid = value.ifEmpty { null }
              "title" -> if (title == null) title = value
              "pubDate" -> pub = value
            }
            field = null
          } else if (name == "item") {
            inItem = false
            val enclosure = url
            if (!enclosure.isNullOrBlank()) {
              items += PeekItem(guid ?: enclosure, title ?: "New episode", enclosure, mime, parseRfc822(pub))
            }
          }
        }
      }
      event = parser.next() // merges CDATA and built-in entities into TEXT
    }
  } catch (_: Exception) {
    // A malformed tail (or an HTML entity XML doesn't know) ends the peek; keep what we have.
  }
  return items
}

private val MONTHS = listOf("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
private val ZONES = mapOf(
  "ut" to 0, "utc" to 0, "gmt" to 0, "z" to 0, "est" to -300, "edt" to -240, "cst" to -360,
  "cdt" to -300, "mst" to -420, "mdt" to -360, "pst" to -480, "pdt" to -420,
)
private val RFC = Regex(
  """^(?:[A-Za-z]{3,},?\s+)?(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[A-Za-z]{1,4})?"""
)

/** RSS dates (same rules as src/feeds/text.ts); 0 when unreadable. */
internal fun parseRfc822(value: String?): Long {
  val m = RFC.find(value?.trim() ?: return 0) ?: return 0
  val (day, mon, yearText, hh, mm, ss, zone) = m.destructured
  val month = MONTHS.indexOf(mon.lowercase(Locale.ROOT)).takeIf { it >= 0 } ?: return 0
  var year = yearText.toInt()
  if (year < 100) year += if (year < 70) 2000 else 1900
  val offset = when {
    zone.matches(Regex("[+-]\\d{4}")) ->
      (if (zone[0] == '-') -1 else 1) * (zone.substring(1, 3).toInt() * 60 + zone.substring(3).toInt())
    zone.isNotEmpty() -> ZONES[zone.lowercase(Locale.ROOT)] ?: 0
    else -> 0
  }
  val cal = java.util.Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
    clear()
    set(year, month, day.toInt(), hh.toInt(), mm.toInt(), ss.ifEmpty { "0" }.toInt())
  }
  return cal.timeInMillis - offset * 60_000L
}
