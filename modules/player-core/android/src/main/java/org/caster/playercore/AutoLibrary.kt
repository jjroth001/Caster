@file:OptIn(UnstableApi::class)

package org.caster.playercore

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * What Android Auto (and other media browsers) can browse: a snapshot the app writes to
 * `auto.json` with its lists (Up Next, In progress, New, Downloads, playlists, podcasts).
 * Reading a file, not the app's database, keeps the database single-writer.
 */
internal object AutoLibrary {
  const val ROOT = "root"
  const val CMD_SPEED = "caster.speed"
  const val CMD_BOOKMARK = "caster.bookmark"
  private val SPEEDS = listOf(1f, 1.2f, 1.5f, 1.8f, 2f, 0.8f)

  private data class Episode(
    val id: String,
    val title: String,
    val subtitle: String?,
    val artwork: String?,
    val uri: String,
    val positionMs: Long,
  )

  private data class Node(val id: String, val title: String, val artwork: String?, val children: List<Node>, val episodes: List<String>)

  private var loadedAt = 0L
  private var root: Node = Node(ROOT, "Pod Wizard", null, emptyList(), emptyList())
  private val nodes = HashMap<String, Node>()
  private val episodes = HashMap<String, Episode>()

  fun file(context: Context) = File(context.filesDir, "auto.json")

  fun write(context: Context, json: String) {
    file(context).writeText(json)
    loadedAt = 0
  }

  private fun load(context: Context) {
    val f = file(context)
    if (!f.exists() || f.lastModified() == loadedAt) return
    loadedAt = f.lastModified()
    nodes.clear()
    episodes.clear()
    val json = runCatching { JSONObject(f.readText()) }.getOrNull() ?: return
    fun parseEpisodes(array: JSONArray?): List<String> {
      if (array == null) return emptyList()
      return (0 until array.length()).map { i ->
        val e = array.getJSONObject(i)
        val id = "ep:${e.getLong("id")}"
        episodes[id] = Episode(
          id,
          e.getString("title"),
          e.optString("podcast").ifEmpty { null },
          e.optString("artwork").ifEmpty { null },
          e.getString("uri"),
          e.optLong("positionMs", 0),
        )
        id
      }
    }
    fun parseNode(o: JSONObject): Node {
      val children = o.optJSONArray("children")?.let { a -> (0 until a.length()).map { parseNode(a.getJSONObject(it)) } } ?: emptyList()
      val node = Node(o.getString("id"), o.getString("title"), o.optString("artwork").ifEmpty { null }, children, parseEpisodes(o.optJSONArray("episodes")))
      nodes[node.id] = node
      return node
    }
    val sections = json.optJSONArray("sections") ?: JSONArray()
    root = Node(ROOT, "Pod Wizard", null, (0 until sections.length()).map { parseNode(sections.getJSONObject(it)) }, emptyList())
    nodes[ROOT] = root
  }

  private fun folderItem(node: Node): MediaItem =
    MediaItem.Builder()
      .setMediaId(node.id)
      .setMediaMetadata(
        MediaMetadata.Builder()
          .setTitle(node.title)
          .setArtworkUri(node.artwork?.let(Uri::parse))
          .setIsBrowsable(true)
          .setIsPlayable(false)
          .setMediaType(if (node.id.startsWith("pod:")) MediaMetadata.MEDIA_TYPE_PODCAST else MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
          .build()
      )
      .build()

  private fun episodeItem(e: Episode): MediaItem =
    MediaItem.Builder()
      .setMediaId(e.id)
      .setUri(e.uri)
      .setMediaMetadata(
        MediaMetadata.Builder()
          .setTitle(e.title)
          .setArtist(e.subtitle)
          .setAlbumTitle(e.subtitle)
          .setArtworkUri(e.artwork?.let(Uri::parse))
          .setIsBrowsable(false)
          .setIsPlayable(true)
          .setMediaType(MediaMetadata.MEDIA_TYPE_PODCAST_EPISODE)
          .build()
      )
      .build()

  /** The engine's own ids are the bare episode ids. */
  private fun forPlayer(e: Episode): MediaItem = episodeItem(e).buildUpon().setMediaId(e.id.removePrefix("ep:")).build()

  /**
   * Who may browse your library (podcasts, Up Next, what you're partway through) and use the
   * speed and bookmark buttons: Pod Wizard itself, the system's media controls, Android Auto,
   * and system apps Android itself trusts (Bluetooth, for car stereos). Any other app may still
   * play, pause and skip, like headphone buttons, but can't read the library.
   */
  private fun trusted(context: Context, session: MediaSession, controller: MediaSession.ControllerInfo) =
    controller.packageName == context.packageName ||
      controller.isTrusted ||
      session.isMediaNotificationController(controller) ||
      session.isAutoCompanionController(controller) ||
      session.isAutomotiveController(controller)

  fun callback(context: Context) =
    object : MediaLibrarySession.Callback {
      override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
        if (!trusted(context, session, controller)) {
          return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
            .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS)
            .build()
        }
        val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
          .add(SessionCommand(CMD_SPEED, Bundle.EMPTY))
          .add(SessionCommand(CMD_BOOKMARK, Bundle.EMPTY))
          .build()
        return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
          .setAvailableSessionCommands(commands)
          .build()
      }

      override fun onCustomCommand(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
        customCommand: SessionCommand,
        args: Bundle,
      ): ListenableFuture<SessionResult> {
        val player = PlayerCore.current()
        when (customCommand.customAction) {
          CMD_SPEED -> {
            val current = player?.playbackParameters?.speed ?: 1f
            val next = SPEEDS[(SPEEDS.indexOfFirst { kotlin.math.abs(it - current) < 0.01f } + 1) % SPEEDS.size]
            PlayerCore.setSpeed(next)
          }
          CMD_BOOKMARK -> PlayerCore.bookmarkFromOutside(context)
        }
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }

      override fun onMediaButtonEvent(
        session: MediaSession,
        controllerInfo: MediaSession.ControllerInfo,
        intent: Intent,
      ): Boolean = HeadsetButtons.handle(intent)

      override fun onGetLibraryRoot(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        params: LibraryParams?,
      ): ListenableFuture<LibraryResult<MediaItem>> {
        if (!trusted(context, session, browser)) {
          return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_PERMISSION_DENIED))
        }
        load(context)
        return Futures.immediateFuture(LibraryResult.ofItem(folderItem(root), params))
      }

      override fun onGetChildren(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        parentId: String,
        page: Int,
        pageSize: Int,
        params: LibraryParams?,
      ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        if (!trusted(context, session, browser)) {
          return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_PERMISSION_DENIED))
        }
        load(context)
        val node = nodes[parentId] ?: return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE))
        val all = node.children.map(::folderItem) + node.episodes.mapNotNull { episodes[it] }.map(::episodeItem)
        val from = (page * pageSize).coerceAtMost(all.size)
        val to = (from + pageSize).coerceAtMost(all.size)
        return Futures.immediateFuture(LibraryResult.ofItemList(all.subList(from, to), params))
      }

      override fun onGetItem(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        mediaId: String,
      ): ListenableFuture<LibraryResult<MediaItem>> {
        if (!trusted(context, session, browser)) {
          return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_PERMISSION_DENIED))
        }
        load(context)
        val item = episodes[mediaId]?.let(::episodeItem) ?: nodes[mediaId]?.let(::folderItem)
        return Futures.immediateFuture(
          item?.let { LibraryResult.ofItem(it, null) } ?: LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE)
        )
      }

      override fun onAddMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: MutableList<MediaItem>,
      ): ListenableFuture<MutableList<MediaItem>> {
        load(context)
        val resolved = mediaItems.mapNotNull { item ->
          episodes[item.mediaId]?.let(::forPlayer)
            ?: item.takeIf { it.localConfiguration != null } // already playable (from the app)
        }
        return Futures.immediateFuture(resolved.toMutableList())
      }

      override fun onSetMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: MutableList<MediaItem>,
        startIndex: Int,
        startPositionMs: Long,
      ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
        load(context)
        val resolved = mediaItems.mapNotNull { item ->
          episodes[item.mediaId]?.let(::forPlayer) ?: item.takeIf { it.localConfiguration != null }
        }
        // Picked in the car: resume where the app last saved this episode.
        val resume = mediaItems.firstOrNull()?.let { episodes[it.mediaId]?.positionMs }
        val position = if (startPositionMs == C.TIME_UNSET && resume != null) resume else startPositionMs
        return Futures.immediateFuture(
          MediaSession.MediaItemsWithStartPosition(resolved, if (startIndex == C.INDEX_UNSET) 0 else startIndex, position)
        )
      }
    }

  /** Car and notification buttons beyond skip: change speed, add a bookmark. */
  fun extraButtons(): List<CommandButton> =
    listOf(
      CommandButton.Builder(CommandButton.ICON_PLAYBACK_SPEED)
        .setDisplayName("Speed")
        .setSessionCommand(SessionCommand(CMD_SPEED, Bundle.EMPTY))
        .setSlots(CommandButton.SLOT_OVERFLOW)
        .build(),
      CommandButton.Builder(CommandButton.ICON_BOOKMARK_UNFILLED)
        .setDisplayName("Bookmark")
        .setSessionCommand(SessionCommand(CMD_BOOKMARK, Bundle.EMPTY))
        .setSlots(CommandButton.SLOT_OVERFLOW)
        .build(),
    )
}
