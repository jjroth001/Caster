package org.caster.playercore

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlin.math.sqrt

/**
 * "Shake to add 5 minutes" for the sleep timer: listens to the accelerometer only during the
 * timer's last minute (no battery cost otherwise) and counts two firm shakes within a second
 * and a half as one request.
 */
internal object ShakeToExtend {
  var enabled = true

  private const val THRESHOLD_G = 2.4f
  private const val WINDOW_MS = 1_500L
  private const val DEBOUNCE_MS = 250L

  private var manager: SensorManager? = null
  private var onShake: (() -> Unit)? = null
  private var firstAt = 0L
  private var lastAt = 0L

  private val listener =
    object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        val (x, y, z) = Triple(event.values[0], event.values[1], event.values[2])
        val g = sqrt(x * x + y * y + z * z) / SensorManager.GRAVITY_EARTH
        if (g < THRESHOLD_G) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastAt < DEBOUNCE_MS) return
        lastAt = now
        if (firstAt == 0L || now - firstAt > WINDOW_MS) {
          firstAt = now
          return
        }
        firstAt = 0L
        onShake?.invoke()
      }

      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

  val listening: Boolean
    get() = onShake != null

  fun start(context: Context, action: () -> Unit) {
    if (!enabled || listening) return
    val sensors = context.getSystemService(SensorManager::class.java) ?: return
    val accelerometer = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
    manager = sensors
    onShake = action
    firstAt = 0L
    sensors.registerListener(listener, accelerometer, SensorManager.SENSOR_DELAY_UI)
  }

  fun stop() {
    manager?.unregisterListener(listener)
    manager = null
    onShake = null
  }

  /** A short buzz so you know it worked without looking. */
  fun buzz(context: Context) {
    runCatching {
      val vibrator =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
          @Suppress("DEPRECATION") context.getSystemService(Vibrator::class.java)
        }
      vibrator?.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE))
    }
  }
}
