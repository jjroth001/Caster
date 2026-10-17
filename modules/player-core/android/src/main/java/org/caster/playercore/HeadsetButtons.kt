package org.caster.playercore

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent

/**
 * Single, double and triple presses of a headset's play/pause button. One press plays or
 * pauses; double and triple presses do what the user picked (skip, next chapter, bookmark).
 */
internal object HeadsetButtons {
  private const val WINDOW_MS = 450L

  var doubleAction = "skipForward"
  var tripleAction = "skipBack"

  private var presses = 0
  private val handler = Handler(Looper.getMainLooper())
  private val resolve = Runnable {
    val count = presses
    presses = 0
    when {
      count == 1 -> togglePlay()
      count == 2 -> perform(doubleAction)
      count >= 3 -> perform(tripleAction)
    }
  }

  /** Returns true when the event was a play/pause press we took care of. */
  fun handle(intent: Intent): Boolean {
    val event =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
      } else {
        @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
      } ?: return false
    if (event.keyCode != KeyEvent.KEYCODE_HEADSETHOOK && event.keyCode != KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
      return false
    }
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
      presses++
      handler.removeCallbacks(resolve)
      handler.postDelayed(resolve, WINDOW_MS)
    }
    return true
  }

  private fun togglePlay() {
    val player = PlayerCore.current() ?: return
    if (player.playWhenReady) player.pause() else player.play()
  }

  private fun perform(action: String) {
    val player = PlayerCore.current() ?: return
    when (action) {
      "skipForward" -> player.seekForward()
      "skipBack" -> player.seekBack()
      "playPause" -> togglePlay()
      "none" -> Unit
      // Chapters and bookmarks live in the app's library.
      else -> PlayerCore.listener?.onHeadsetAction(action)
    }
  }
}
