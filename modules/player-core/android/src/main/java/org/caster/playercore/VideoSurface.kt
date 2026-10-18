@file:OptIn(UnstableApi::class)

package org.caster.playercore

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Build
import android.util.Rational
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Shows the playing episode's video. Only one surface can show it at a time: the newest one
 * attached takes it, and when that one goes away the one under it gets it back (the player's
 * inline video under the full-screen view). With no surface, playback simply carries on as
 * audio.
 */
class VideoSurfaceView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val playerView =
    PlayerView(context).apply {
      useController = false
      resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
      setShutterBackgroundColor(Color.BLACK)
      setKeepContentOnPlayerReset(true)
      layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }

  init {
    addView(playerView)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    take(this)
  }

  override fun onDetachedFromWindow() {
    release(this)
    super.onDetachedFromWindow()
  }

  companion object {
    private val stack = mutableListOf<VideoSurfaceView>()

    private fun take(view: VideoSurfaceView) {
      val player = PlayerCore.current() ?: return
      val previous = stack.lastOrNull()
      stack.remove(view)
      stack.add(view)
      PlayerView.switchTargetView(player, previous?.playerView, view.playerView)
    }

    private fun release(view: VideoSurfaceView) {
      val wasTop = stack.lastOrNull() === view
      stack.remove(view)
      val player = PlayerCore.current()
      if (!wasTop || player == null) {
        view.playerView.player = null
        return
      }
      PlayerView.switchTargetView(player, view.playerView, stack.lastOrNull()?.playerView)
    }
  }
}

/** The full-screen video screen: rotation, hiding the system bars, picture-in-picture. */
internal object VideoScreen {
  private val ratio = Rational(16, 9)

  /** Open: the phone may rotate and Pod Wizard shrinks to a floating window when you leave it. */
  fun setOpen(activity: Activity?, open: Boolean) {
    activity ?: return
    activity.requestedOrientation =
      if (open) ActivityInfo.SCREEN_ORIENTATION_FULL_USER else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      runCatching {
        activity.setPictureInPictureParams(
          PictureInPictureParams.Builder().setAspectRatio(ratio).setAutoEnterEnabled(open).build()
        )
      }
    }
    if (!open) setImmersive(activity, false)
  }

  fun setImmersive(activity: Activity?, on: Boolean) {
    val window = activity?.window ?: return
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    if (on) {
      controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.hide(WindowInsetsCompat.Type.systemBars())
    } else {
      controller.show(WindowInsetsCompat.Type.systemBars())
    }
  }

  fun enterPictureInPicture(activity: Activity?): Boolean {
    activity ?: return false
    return runCatching {
      activity.enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(ratio).build())
    }.getOrDefault(false)
  }
}
