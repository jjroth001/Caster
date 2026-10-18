# Caster

A podcast player for Android, built to be an open-source alternative to Pocket Casts.
Every feature is free, there is no account, and nothing leaves your phone except requests
to podcast hosts and the search service you choose.

Not on the Play Store and no Google Play services: install the signed APK directly.

- [SPEC.md](SPEC.md): the full feature list, design and build order.
- [BUILDING.md](BUILDING.md): how to build and sign the APK.
- [docs/TESTING.md](docs/TESTING.md): the checklist to try on a phone before each release.

## Features

- **Find and follow:** search Apple's public directory (and Podcast Index with your own free
  key), paste a feed or Apple Podcasts link, top and trending charts, OPML import and export;
  private feeds with a username and password (kept encrypted on the phone).
- **Library:** grid, large grid or list; coloured folders; sort by date added, latest
  episode, recently played, name, or your own drag-and-drop order; drop a podcast on a folder
  to file it.
- **Listening:** background playback with notification, lock-screen and headset controls;
  speed 0.5–3×; trim silence (mild or strong); volume boost; sleep timer with fade-out and
  shake to extend; configurable skip intervals; headphone double/triple press actions.
- **Per podcast:** its own speed, trim, boost, skip intro and outro, auto-download,
  auto-archive, notifications and episode order.
- **Up Next, playlists and bookmarks:** queue with shuffle, manual and smart playlists,
  bookmarks (smart titles from transcripts).
- **Chapters:** Podcasting 2.0 and ID3 chapters with artwork; untick chapters to skip them.
- **Transcripts:** publisher transcripts that follow along and search; or make one on the
  phone with Whisper (opt-in model download), on request or automatically while charging.
- **Ad skipping:** chapters titled like ads, whole ad reads found in transcripts (it learns
  sponsor names as it goes, and takes your own ad phrases), and the same audio turning up in
  more than one downloaded episode (audio fingerprints made on the phone). "Skipped · Undo",
  a list of every ad in an episode, "That was an ad" for ones it missed, and a per-podcast
  off switch.
- **Video:** video episodes show in the player; full screen with rotation, and a floating
  picture-in-picture window.
- **Downloads and refresh:** downloads that finish with the app closed; auto-download of
  chosen podcasts, Up Next and playlists, with limits and Wi-Fi/charging/storage rules;
  auto-archive; a storage limit; background checks with new-episode notifications.
- **Android Auto:** browse Up Next, playlists, podcasts and downloads in the car.
- **Clips and sharing:** share an episode or a moment, or a clip as audio or cover-art video.
- **Your data:** full backup and merging restore, plus automatic daily or weekly backups into
  a folder you choose (a synced Nextcloud or Syncthing folder works); listening stats.
- **Looks:** Paper, Dusk and Midnight themes, optional tint from the cover art.

## Using Caster

**Installing.** Download the APK from [Releases](../../releases) on your phone and open it.
Android asks once to allow installs from your browser or file manager. New versions install
over the old one and keep everything.

**First steps.**
1. **Discover** tab: search for a show, or paste its feed or Apple Podcasts link, then
   **Follow**. Coming from another app? Settings → Backup & import → Import subscriptions
   (an OPML file).
2. Tap an episode's play button. The mini player stays at the bottom of every screen; tap it
   for the full player, swipe down to close it.
3. Settings → New episodes: choose how often to check, and turn on notifications if you like.
   If Settings shows "Let Caster work in the background", tap Allow so Android doesn't stop
   those checks.

**Good to know.**
- **Up Next:** "Play next" and "Play last" on any episode; the queue button on the mini player
  shows how many are waiting.
- **Folders and order:** the folder button in the library header makes folders; press and
  hold a podcast to drag it (onto a folder to file it).
- **Downloads:** download an episode for offline listening, or set up Settings → Downloads &
  storage → Auto-download.
- **Ad skipping** works best with downloaded episodes: Caster reads transcripts and compares
  the audio of your downloads. Player ⋯ → Ads in this episode shows what it found.
- **Transcripts on the phone:** Settings → Transcripts & bookmarks → pick a speech model
  (a one-time download), then make transcripts by hand or automatically while charging.
- **Private feeds:** paste the feed; Caster asks for the username and password.
- **Backups:** Settings → Backup & import. An automatic backup into a synced folder means a
  new phone is one restore away.

**Android Auto with a sideloaded app:** Android Auto hides apps that didn't come from the
Play Store. In Android Auto's settings, tap the version number 10 times, then turn on
"Unknown sources" in its developer settings.

**Privacy.** No account, no ads, no analytics. Caster talks only to the podcast hosts you
follow, Apple's public directory for search and charts, Podcast Index if you add a key, and
Hugging Face once if you download a speech model. Everything else stays on your phone.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). The app started from Expo's project template
([LICENSE-expo-template](LICENSE-expo-template), MIT).
