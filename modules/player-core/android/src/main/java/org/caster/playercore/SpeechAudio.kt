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
 * reads. Decodes with Android's MediaCodec, mixes to mono and resamples on the way, writing
 * straight to the file so an hour-long episode never sits in memory.
 */
internal object SpeechAudio {
  private const val RATE = 16_000

  fun decodeToWav(source: String, out: File, onProgress: (Double) -> Unit) {
    val extractor = MediaExtractor()
    extractor.setDataSource(source.removePrefix("file://"))
    val track = (0 until extractor.trackCount).firstOrNull {
      extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
    } ?: throw IOException("No audio track")
    extractor.selectTrack(track)
    val format = extractor.getTrackFormat(track)
    val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
    val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    codec.configure(format, null, null, 0)
    codec.start()

    val file = RandomAccessFile(out, "rw")
    file.setLength(0)
    file.write(ByteArray(44)) // header, filled in at the end
    var written = 0L
    var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    var inRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    // Resampling state: position in input frames of the next output sample.
    var nextOut = 0.0
    var inIndex = 0L
    var previous = 0f
    val outBuffer = ByteBuffer.allocate(64 * 1024).order(ByteOrder.LITTLE_ENDIAN)
    val info = MediaCodec.BufferInfo()
    var inputDone = false
    var outputDone = false
    var lastProgress = -1

    fun flushOut() {
      file.write(outBuffer.array(), 0, outBuffer.position())
      written += outBuffer.position()
      outBuffer.clear()
    }

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
            val step = inRate.toDouble() / RATE
            while (pcm.remaining() >= channels) {
              var sum = 0f
              repeat(channels) { sum += pcm.get() }
              val sample = sum / channels
              // Linear interpolation between this input frame and the previous one.
              while (nextOut <= inIndex) {
                val t = (nextOut - (inIndex - 1)).toFloat().coerceIn(0f, 1f)
                val value = previous + (sample - previous) * t
                outBuffer.putShort(value.toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort())
                if (outBuffer.remaining() < 2) flushOut()
                nextOut += step
              }
              previous = sample
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
      flushOut()
      writeHeader(file, written)
    } finally {
      file.close()
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
