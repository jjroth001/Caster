# Caster

A podcast player for Android, built to be an open-source alternative to Pocket Casts.
Every feature is free, there is no account, and nothing leaves your phone except requests
to podcast hosts and the search service you choose.

Not on the Play Store and no Google Play services: install the signed APK directly.

- [SPEC.md](SPEC.md): the full feature list, design and build order.
- [BUILDING.md](BUILDING.md): how to build and sign the APK.
- [docs/TESTING.md](docs/TESTING.md): the checklist to try on a phone before each release.

## Features

- **Find and follow:** search Apple's public directory, paste a feed or Apple Podcasts link,
  top charts, OPML import and export; private feeds with a username and password (kept
  encrypted on the phone).
- **Library:** grid, large grid or list; coloured folders; new-episode counts.
- **Listening:** background playback with notification, lock-screen and headset controls;
  speed 0.5–3×; trim silence (mild or strong); volume boost; sleep timer with fade-out;
  configurable skip intervals; headphone double/triple press actions.
- **Per podcast:** its own speed, trim, boost, skip intro and outro, auto-download,
  notifications and episode order.
- **Up Next, playlists and bookmarks:** queue with shuffle, manual and smart playlists,
  bookmarks (smart titles from transcripts).
- **Chapters:** Podcasting 2.0 and ID3 chapters with artwork; untick chapters to skip them.
- **Transcripts:** publisher transcripts that follow along and search; or make one on the
  phone with Whisper (opt-in model download).
- **Ad skipping:** chapters titled like ads, and whole ad reads found in transcripts (it
  learns sponsor names as it goes), with "Skipped · Undo" and a per-podcast off switch.
- **Video:** video episodes show in the player; full screen with rotation, and a floating
  picture-in-picture window.
- **Downloads and refresh:** downloads that finish with the app closed; auto-download of
  chosen podcasts, Up Next and playlists, with limits and Wi-Fi/charging/storage rules; a
  storage limit; background checks with new-episode notifications.
- **Android Auto:** browse Up Next, playlists, podcasts and downloads in the car.
- **Clips and sharing:** share an episode or a moment, or a clip as audio or cover-art video.
- **Your data:** full backup and merging restore, plus automatic daily or weekly backups into
  a folder you choose (a synced Nextcloud or Syncthing folder works); listening stats.
- **Looks:** Paper, Dusk and Midnight themes, optional tint from the cover art.

Not yet: repeated-audio ad detection (audio fingerprinting).

**Android Auto with a sideloaded app:** Android Auto hides apps that didn't come from the
Play Store. In Android Auto's settings, tap the version number 10 times, then turn on
"Unknown sources" in its developer settings.

Status: early test builds; see Releases.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). The app started from Expo's project template
([LICENSE-expo-template](LICENSE-expo-template), MIT).
