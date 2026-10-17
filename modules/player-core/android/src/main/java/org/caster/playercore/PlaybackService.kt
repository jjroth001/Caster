@file:OptIn(UnstableApi::class)

package org.caster.playercore

import android.app.PendingIntent
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Keeps playback going with the screen off or the app closed, and owns the media session:
 * the notification, lock-screen and Bluetooth/headset controls. Media3 moves the service in and
 * out of the foreground as playback starts and stops; when the app is swiped away while paused,
 * Media3's default onTaskRemoved stops it.
 */
class PlaybackService : MediaSessionService() {
  private var session: MediaSession? = null

  override fun onCreate() {
    super.onCreate()
    val builder = MediaSession.Builder(this, PlayerCore.player(this))
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      builder.setSessionActivity(
        PendingIntent.getActivity(
          this,
          0,
          launch,
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
      )
    }
    session = builder.build().also { PlayerCore.session = it }
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  override fun onDestroy() {
    PlayerCore.session = null
    session?.release()
    session = null
    PlayerCore.release()
    super.onDestroy()
  }
}
