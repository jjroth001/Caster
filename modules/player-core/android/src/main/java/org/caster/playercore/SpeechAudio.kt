package org.caster.playercore

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Turns a downloaded episode (MP3, M4A…) into the 16 kHz mono 16-bit WAV that whisper.cpp
 * reads (and, at a lower rate, what audio fingerprints are made from). Decodes with Android's
 * MediaCodec, mixes to mono and resamples on the way, so an hour-long episode never sits in
 * memory.
 */
internal object SpeechAudio {
  const val RATE = 16_000

  fun decodeToWav(source: String, out: File, onProgress: (Double) -> Unit) {
    val file = RandomAccessFile(out, "rw")
    file.setLength(0)
    file.write(ByteArray(44)) // header, filled in at the end
    var written = 0L
    val outBuffer = ByteBuffer.allocate(64 * 1024).order(ByteOrder.LITTLE_ENDIAN)
    fun flushOut() {
      file.write(outBuffer.array(), 0, outBuffer.position())
      written += outBuffer.position()
      outBuffer.clear()
    }
    try {
      decodeMono(source, RATE, onProgress) { value ->
        outBuffer.putShort(value.toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort())
        if (outBuffer.remaining() < 2) flushOut()
      }
      flushOut()
      writeHeader(file, written)
    } finally {
      file.close()
    }
  }

  /**
   * Decodes any audio file Android can play to mono samples at [rate], handing each one to
   * [sample] as it goes (an hour-long episode never sits in memory).
   */
  inline fun decodeMono(source: String, rate: Int, onProgress: (Double) -> Unit, sample: (Float) -> Unit) {
    val extractor = MediaExtractor()
    extractor.setDataSource(source.removePrefix("file://"))
    val track = (0 until extractor.trackCount).firstOrNull {
      extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
    } ?: run {
      extractor.release()
      throw IOException("No audio track")
    }
    extractor.selectTrack(track)
    val format = extractor.getTrackFormat(track)
    val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
    val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    codec.configure(format, null, null, 0)
    codec.start()

    var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    var inRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    // Resampling state: position in input frames of the next output sample.
    var nextOut = 0.0
    var inIndex = 0L
    var previous = 0f
    val info = MediaCodec.BufferInfo()
    var inputDone = false
    var outputDone = false
    var lastProgress = -1

    try {
      while (!outputDone) {
        if (!inputDone) {
          val i = codec.dequeueInputBuffer(10_000)
          if (i >= 0) {
            val buffer = codec.getInputBuffer(i)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(i, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val o = codec.dequeueOutputBuffer(info, 10_000)
        when {
          o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            channels = codec.outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            inRate = codec.outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          }
          o >= 0 -> {
            val pcm = codec.getOutputBuffer(o)!!.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
            val step = inRate.toDouble() / rate
            while (pcm.remaining() >= channels) {
              var sum = 0f
              repeat(channels) { sum += pcm.get() }
              val value = sum / channels
              // Linear interpolation between this input frame and the previous one.
              while (nextOut <= inIndex) {
                val t = (nextOut - (inIndex - 1)).toFloat().coerceIn(0f, 1f)
                sample(previous + (value - previous) * t)
                nextOut += step
              }
              previous = value
              inIndex++
            }
            codec.releaseOutputBuffer(o, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
            if (durationUs > 0) {
              val p = ((info.presentationTimeUs * 100) / durationUs).toInt()
              if (p != lastProgress) {
                lastProgress = p
                onProgress(p / 100.0)
              }
            }
          }
        }
      }
    } finally {
      codec.stop()
      codec.release()
      extractor.release()
    }
  }

  private fun writeHeader(file: RandomAccessFile, dataBytes: Long) {
    val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    h.put("RIFF".toByteArray()).putInt((36 + dataBytes).toInt()).put("WAVE".toByteArray())
    h.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(RATE).putInt(RATE * 2).putShort(2).putShort(16)
    h.put("data".toByteArray()).putInt(dataBytes.toInt())
    file.seek(0)
    file.write(h.array())
  }
}
