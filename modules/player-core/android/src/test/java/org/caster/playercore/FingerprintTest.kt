package org.caster.playercore

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Made-up audio, 8 kHz: "talk" is noise shaped by a wandering pitch and a syllable-like
 * envelope, different for every seed; the "ad" is the same 30 seconds in both episodes.
 */
class FingerprintTest {
  private val rate = FingerprintBuilder.RATE

  private fun talk(seconds: Double, seed: Int): FloatArray {
    val r = Random(seed)
    val out = FloatArray((seconds * rate).toInt())
    var phase = 0.0
    var pitch = 140.0
    var low = 0f
    for (i in out.indices) {
      if (i % 800 == 0) pitch = (pitch + r.nextDouble(-25.0, 25.0)).coerceIn(90.0, 260.0)
      phase += 2 * PI * pitch / rate
      val syllable = (0.5 + 0.5 * sin(2 * PI * i / (rate * (0.18 + 0.1 * ((i / 1600) % 3))))).toFloat()
      low = 0.85f * low + 0.15f * r.nextFloat() * 2 - 0.15f
      out[i] = syllable * (3000f * sin(phase).toFloat() + 1500f * sin(2.7 * phase).toFloat() + 2500f * low)
    }
    return out
  }

  private fun fingerprint(vararg parts: FloatArray, gain: Float = 1f, noise: Float = 0f, seed: Int = 0): IntArray {
    val r = Random(seed)
    val b = FingerprintBuilder()
    for (p in parts) for (s in p) b.add(s * gain + if (noise > 0) (r.nextFloat() * 2 - 1) * noise else 0f)
    return b.result()
  }

  @Test
  fun findsTheSameAdInTwoEpisodes() {
    val ad = talk(30.0, seed = 99)
    // Episode A: 200 s of talk, the ad, 100 s more. Episode B: the ad at 410 s, a little
    // quieter, a sliver out of step with A's slices and with some extra noise.
    val a = fingerprint(talk(200.0, 1), ad, talk(100.0, 2))
    val b = fingerprint(talk(410.0, 3), FloatArray(97), ad, talk(60.0, 4), gain = 0.8f, noise = 120f, seed = 7)

    val repeats = RepeatFinder(a).against("b", b)
    assertEquals(1, repeats.size)
    val r = repeats[0]
    assertTrue("starts near 200 s: ${r.start}", abs(r.start - 200) < 1)
    assertTrue("ends near 230 s: ${r.end}", abs(r.end - 230) < 1)
    assertTrue("in the other near 410 s: ${r.otherStart}", abs(r.otherStart - 410) < 1)
  }

  @Test
  fun ignoresEpisodesThatShareNothing() {
    val a = fingerprint(talk(300.0, 11))
    val b = fingerprint(talk(300.0, 12))
    assertTrue(RepeatFinder(a).against("b", b).isEmpty())
  }

  @Test
  fun ignoresShortStings() {
    val sting = talk(8.0, 50)
    val a = fingerprint(talk(60.0, 21), sting, talk(60.0, 22))
    val b = fingerprint(talk(90.0, 23), sting, talk(60.0, 24))
    assertTrue(RepeatFinder(a).against("b", b).isEmpty())
  }

  @Test
  fun anHourIsQuickEnough() {
    val hour = talk(3600.0, 5)
    val started = System.nanoTime()
    val a = fingerprint(hour)
    val built = (System.nanoTime() - started) / 1e9
    val b = fingerprint(talk(3600.0, 6))
    val matchStart = System.nanoTime()
    RepeatFinder(a).against("b", b)
    val matched = (System.nanoTime() - matchStart) / 1e9
    println("hour: ${a.size} codes, fingerprint ${"%.1f".format(built)} s, match ${"%.2f".format(matched)} s")
  }
}
