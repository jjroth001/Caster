package org.caster.playercore

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sin

/**
 * Audio fingerprints for finding the same stretch of audio (an ad) in different episodes.
 *
 * The classic Haitsma–Kalker scheme: 8 kHz mono audio is cut into 256 ms slices every 16 ms;
 * each slice's energy in 33 frequency bands (300–2000 Hz, spaced like hearing) gives a 32-bit
 * code, one bit per pair of neighbouring bands: did the difference between them grow or shrink
 * since the previous slice? The codes survive re-encoding, a different bitrate and volume
 * changes, so the same ad inserted into two episodes produces nearly the same run of codes.
 */
internal class FingerprintBuilder {
  companion object {
    const val RATE = 8_000
    // Long slices that overlap a lot, so the same audio starting at a different moment (as an
    // inserted ad always does) still gives nearly the same codes.
    const val FRAME = 2048
    const val HOP = 128
    /** Codes per second. */
    const val FPS = RATE.toDouble() / HOP
    private const val BANDS = 33
    private const val LOW_HZ = 300.0
    private const val HIGH_HZ = 2000.0

    /** FFT bin ranges for each band, spaced logarithmically like hearing. */
    private val bandEdges: IntArray =
      IntArray(BANDS + 1) { b ->
        val hz = exp(ln(LOW_HZ) + (ln(HIGH_HZ) - ln(LOW_HZ)) * b / BANDS)
        (hz * FRAME / RATE).toInt()
      }

    private val window = FloatArray(FRAME) { (0.5 - 0.5 * cos(2 * PI * it / (FRAME - 1))).toFloat() }
  }

  private val ring = FloatArray(FRAME)
  private var filled = 0
  private var sinceLast = 0
  private val re = FloatArray(FRAME)
  private val im = FloatArray(FRAME)
  private var previous: FloatArray? = null
  private var codes = IntArray(4096)
  private var count = 0

  fun add(sample: Float) {
    ring[filled % FRAME] = sample
    filled++
    sinceLast++
    if (filled >= FRAME && sinceLast >= HOP) {
      sinceLast = 0
      frame()
    }
  }

  fun result(): IntArray = codes.copyOf(count)

  private fun frame() {
    // The newest FRAME samples, oldest first, windowed.
    val start = filled % FRAME
    for (i in 0 until FRAME) {
      re[i] = ring[(start + i) % FRAME] * window[i]
      im[i] = 0f
    }
    fft(re, im)
    val energy = FloatArray(BANDS)
    for (b in 0 until BANDS) {
      var e = 0f
      for (k in bandEdges[b] until maxOf(bandEdges[b + 1], bandEdges[b] + 1)) e += re[k] * re[k] + im[k] * im[k]
      energy[b] = e
    }
    val prev = previous
    previous = energy
    if (prev == null) return
    var code = 0
    for (m in 0 until 32) {
      val d = (energy[m] - energy[m + 1]) - (prev[m] - prev[m + 1])
      if (d > 0) code = code or (1 shl m)
    }
    if (count == codes.size) codes = codes.copyOf(codes.size * 2)
    codes[count++] = code
  }

  /** In-place iterative radix-2 FFT. */
  private fun fft(re: FloatArray, im: FloatArray) {
    val n = re.size
    var j = 0
    for (i in 1 until n) {
      var bit = n shr 1
      while (j and bit != 0) {
        j = j xor bit
        bit = bit shr 1
      }
      j = j xor bit
      if (i < j) {
        var t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }
    var len = 2
    while (len <= n) {
      val angle = -2 * PI / len
      val wRe = cos(angle).toFloat()
      val wIm = sin(angle).toFloat()
      var i = 0
      while (i < n) {
        var curRe = 1f
        var curIm = 0f
        for (k in 0 until len / 2) {
          val aRe = re[i + k]
          val aIm = im[i + k]
          val bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
          val bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe
          re[i + k] = aRe + bRe
          im[i + k] = aIm + bIm
          re[i + k + len / 2] = aRe - bRe
          im[i + k + len / 2] = aIm - bIm
          val nextRe = curRe * wRe - curIm * wIm
          curIm = curRe * wIm + curIm * wRe
          curRe = nextRe
        }
        i += len
      }
      len = len shl 1
    }
  }
}

/** A stretch of one episode that also plays in another. Times in seconds. */
internal data class Repeat(val start: Double, val end: Double, val otherKey: String, val otherStart: Double)

/**
 * Finds stretches of `target` that also appear in other episodes' fingerprints: codes that match
 * exactly vote for a time offset between the two; offsets with enough votes are then checked
 * slice by slice (how many of the 32 bits differ), and runs that stay similar for long enough
 * are repeats.
 */
internal class RepeatFinder(private val target: IntArray) {
  companion object {
    /** Shortest repeat worth reporting (an intro sting is shorter than an ad). */
    const val MIN_SECONDS = 15.0
    /** Longer than this, two episodes share content (a rerun), not an ad. */
    const val MAX_SECONDS = 240.0
    /** Share of differing bits below which two runs count as the same audio. */
    const val MAX_BIT_ERRORS = 0.35
    private const val WINDOW = 125 // ~2 s of codes, for judging similarity
    private const val EDGE = 6 // ~0.1 s either side, for finding a repeat's exact edges
    private const val MIN_VOTES = 25
    private const val COMMON_KEY = 40 // half-codes this frequent (silence, tones) don't vote
  }

  // Half-codes (top and bottom 16 bits) → the target positions they appear at. Whole 32-bit
  // codes rarely match exactly between two encodings of the same audio; halves often do.
  private val high = indexOf { it ushr 16 }
  private val low = indexOf { it and 0xffff }

  private fun indexOf(key: (Int) -> Int): HashMap<Int, IntArray> {
    val positions = HashMap<Int, MutableList<Int>>()
    target.forEachIndexed { i, c -> positions.getOrPut(key(c)) { mutableListOf() }.add(i) }
    val index = HashMap<Int, IntArray>()
    for ((k, list) in positions) if (list.size <= COMMON_KEY) index[k] = list.toIntArray()
    return index
  }

  fun against(otherKey: String, other: IntArray): List<Repeat> {
    // Votes per offset (other position − target position), shifted to start at 0.
    val shift = target.size
    val votes = IntArray(target.size + other.size + 1)
    for (j in other.indices) {
      val c = other[j]
      high[c ushr 16]?.let { hits -> for (i in hits) votes[j - i + shift]++ }
      low[c and 0xffff]?.let { hits -> for (i in hits) votes[j - i + shift]++ }
    }
    // Neighbouring offsets are the same match a slice out of step: score each offset with its
    // neighbours, then check the best few.
    val scored = mutableListOf<Pair<Int, Int>>()
    for (k in 1 until votes.size - 1) {
      val score = votes[k - 1] + votes[k] + votes[k + 1]
      if (score >= MIN_VOTES && votes[k] >= votes[k - 1] && votes[k] >= votes[k + 1]) {
        scored += (k - shift) to score
      }
    }
    scored.sortByDescending { it.second }
    val found = mutableListOf<Repeat>()
    val tried = mutableListOf<Int>()
    for ((d, _) in scored) {
      if (tried.any { kotlin.math.abs(it - d) <= 4 }) continue
      tried.add(d)
      if (tried.size > 12) break
      found += runsAt(d, otherKey, other)
    }
    return found
  }

  private fun runsAt(d: Int, otherKey: String, other: IntArray): List<Repeat> {
    val from = maxOf(0, -d)
    val to = minOf(target.size, other.size - d)
    if (to - from < WINDOW) return emptyList()
    // Bit errors per slice, then a sliding window over them.
    val errors = IntArray(to - from) { Integer.bitCount(target[from + it] xor other[from + it + d]) }
    val similar = BooleanArray(errors.size)
    var sum = 0
    for (i in errors.indices) {
      sum += errors[i]
      if (i >= WINDOW) sum -= errors[i - WINDOW]
      if (i >= WINDOW - 1 && sum < MAX_BIT_ERRORS * 32 * WINDOW) {
        for (k in i - WINDOW + 1..i) similar[k] = true
      }
    }
    val result = mutableListOf<Repeat>()
    var i = 0
    while (i < similar.size) {
      if (!similar[i]) {
        i++
        continue
      }
      var j = i
      while (j < similar.size && similar[j]) j++
      val next = j
      // The window marks a little either side of the real edges; trim back to where the
      // slices themselves stop matching, so none of the show is skipped.
      fun closeAt(k: Int): Boolean {
        var e = 0
        var n = 0
        for (q in maxOf(i, k - EDGE)..minOf(next - 1, k + EDGE)) {
          e += errors[q]
          n++
        }
        return e < MAX_BIT_ERRORS * 32 * n
      }
      while (i < j && !closeAt(i)) i++
      while (j > i && !closeAt(j - 1)) j--
      val seconds = (j - i) / FingerprintBuilder.FPS
      if (seconds >= MIN_SECONDS && seconds <= MAX_SECONDS) {
        result +=
          Repeat(
            start = (from + i) / FingerprintBuilder.FPS,
            end = (from + j) / FingerprintBuilder.FPS,
            otherKey = otherKey,
            otherStart = (from + i + d) / FingerprintBuilder.FPS,
          )
      }
      i = next
    }
    return result
  }
}
