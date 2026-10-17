# Caster — Spec Sheet

## Overview

Caster is an Android podcast player (phone and Android Auto) that matches Pocket Casts feature for feature, with every Plus and Patron feature free, no account, and nothing leaving the device. Same pattern as LibreBaby: Expo/React Native, TypeScript, local-first storage, installed directly as a signed APK. **No Google Play reliance:** no Play Store listing, and no Google Play services code anywhere in the app.

**Decisions locked in:**

| Area | Decision | What it means |
| --- | --- | --- |
| Name | Caster | Package `org.caster.app` |
| Platforms | Android phone + Android Auto | No iOS, CarPlay, Wear OS, Apple Watch, web or desktop |
| Distribution | Signed APK, sideloaded | No Play Store. F-Droid possible later, since there is no proprietary code |
| Google Play services | None | Chromecast and the Wear OS app are dropped (both require Play services) |
| Sync | Local only + export | No accounts. Cross-device sync and cloud file storage are replaced by backup/restore |
| AI features | On-device Whisper | Generated transcripts and Smart Bookmarks run on the phone, opt-in model download |
| Audio engine | Custom Expo module on AndroidX Media3 | Apache-2.0 ExoPlayer gives skip silence, speed and the Android Auto browse tree natively |
| Ad skipping | Layers 1–4, all on-device | Intro/outro, chapter rules, repeated-audio fingerprinting, transcript classification |
| License | GPL-3.0-or-later | |

**Android Auto and sideloading.** Android Auto hides media apps that weren't installed from the Play Store. To use Caster in the car, turn on Android Auto's developer settings (tap its version number 10 times) and enable "Unknown sources". Nothing in Caster itself depends on Google code.

**Testing in Expo Go.** The `player-core` native module is loaded with `requireOptionalNativeModule`. In Expo Go it is missing, and the app falls back to a simple `expo-audio` player (play, pause, seek, speed) so library, queue and settings screens can still be tried there. Background playback, trim silence, volume boost, downloads in the background, Android Auto, transcription and fingerprinting need an installed APK.

Pocket Casts' own Android and iOS clients have been open source under the [Mozilla Public License since October 2022](https://blog.pocketcasts.com/2022/10/19/pocket-casts-mobile-apps-are-now-open-source/). The paywall lives in Automattic's servers and account checks, so this app's real job is replacing the server-backed features with on-device equivalents. Copying their client code is allowed under MPL if file-level notices are kept, but the stack here is different (React Native vs. Kotlin), so treat their repo as a reference for behavior, not a code source.

## Pocket Casts feature inventory

Every Pocket Casts feature below ships free in this app, except the server-only ones marked "Replaced" or "Dropped." Pocket Casts prices for reference: Plus $3.99/mo or $39.99/yr, Patron $9.99/mo or $99.99/yr ([App Store listing](https://apps.apple.com/us/app/pocket-casts-podcast-player/id414834813)).

| Feature | Pocket Casts tier | This app | Notes |
| --- | --- | --- | --- |
| Subscribe by search, RSS URL, or Apple Podcasts link | Free | Yes | Search via Apple Search API (no key) + optional Podcast Index |
| Discover: charts, categories, networks, curated picks | Free | Partial | Charts and categories from Apple/Podcast Index; no hand-curated lists |
| OPML import/export | Free | Yes | |
| Up Next queue | Free | Yes | |
| Variable speed 0.5x–3x | Free | Yes | Global + per-podcast |
| Trim silence | Free | Yes | Media3 `setSkipSilenceEnabled` |
| Volume boost | Free | Yes | Android `LoudnessEnhancer` + compressor |
| Skip intro / outro per podcast, custom skip intervals | Free | Yes | Also the first layer of ad skipping |
| Sleep timer (time, end of episode, end of chapter) | Free | Yes | Shake to extend |
| Chapters (MP3 ID3, M4A, Podcasting 2.0 JSON) with artwork | Free | Yes | |
| Video podcasts, audio/video toggle, full-screen player | Free | Yes | Media3 handles both |
| Streaming, auto-download, storage management | Free | Yes | WorkManager downloads, Wi-Fi/charging rules |
| New-episode notifications | Free | Yes | Device-side refresh (see Replaced) |
| Archive, star, mark played, episode filters | Free | Yes | |
| Manual playlists | Free | Yes | [Launched Nov 2025](https://blog.pocketcasts.com/2025/11/24/playlists-a-new-way-to-organize-your-listening/) |
| Smart playlists (rules: unplayed, downloaded, length, date) | Free | Yes | Rule engine over SQLite |
| Publisher transcripts (Podcasting 2.0 tag), search, share | Free | Yes | |
| Share podcast, episode, timestamp | Free | Yes | Share RSS/website URL with `?t=`; no pca.st short links |
| Clip sharing as audio file or video | Free on mobile, Plus on web/desktop | Yes | Media3 Transformer trims audio; video = waveform over cover art |
| Android Auto | Free | Yes | Media3 `MediaLibraryService` |
| Chromecast | Free | Dropped | Requires Google Play services |
| Light, dark, Extra Dark themes | Free | Yes | Paper, Dusk, Midnight |
| Folders | Plus | Yes | |
| Bookmarks (incl. headphone-triggered) | Plus | Yes | Headphone double/triple-press action |
| Preselect Chapters (skip unwanted chapters) | Plus | Yes | |
| Up Next Shuffle | Plus | Yes | |
| Wear OS app, watch-speaker playback | Plus | Dropped | Phone link requires Google Play services |
| Extra themes and app icons | Plus / Patron | Yes | Android activity-alias icons |
| Generated transcripts | Plus | Yes | On-device Whisper, opt-in |
| Smart Bookmarks (AI title + transcript passage) | Plus | Yes | Passage from local transcript; title from heuristic or small on-device model |
| Cross-device sync (subs, positions, queue, history) | Free account | Replaced | Local only; JSON backup/restore |
| Server-side refresh for new episodes | Free account | Replaced | WorkManager periodic refresh on device |
| Cloud file storage (20GB Plus / 100GB Patron) | Plus / Patron | Replaced | Local files only: play any audio/video file from device storage |
| Web player, Mac/Windows apps | Free | Dropped | Out of platform scope |
| Early access, supporter badge, Slumber Studios content | Patron / Plus | Dropped | Business perks, no feature content |
| Automatic ad skipping | Not offered | Added | [Pocket Casts has declined to build it](https://forums.pocketcasts.com/forums/topic/automatic-ad-skipping/); this app adds it |

Tier sources: [Plus feature list](https://www.fonearena.com/blog/448603/pocket-casts-web-desktop-free-download.html/amp), [Patron perks](https://pocketcasts.com/plus), [Bookmarks](https://support.pocketcasts.com/knowledge-base/bookmarks), [Preselect Chapters](https://support.pocketcasts.com/knowledge-base/preselect-chapters/), [generated transcripts](https://blog.pocketcasts.com/2025/04/29/generated-transcripts-are-here/), [clip sharing](https://9to5google.com/2024/09/20/pocket-casts-clip-sharing-transcripts/).

## Stack and architecture

The React Native layer owns UI, library data and rules; one native Kotlin module owns everything that has to keep running with the screen off (playback, downloads, refresh, transcription, fingerprinting). Expo Go won't run any of this, so development uses a dev build (`expo-dev-client`) from day one.

| Layer | Choice | Why |
| --- | --- | --- |
| App shell | Expo SDK (current), React Native, TypeScript, Expo Router | Same as Plantaloon and LibreBaby |
| Local database | `expo-sqlite` + Drizzle ORM | Typed queries and migrations; smart playlists compile to SQL |
| State | Zustand (UI state), SQLite as source of truth | Player state streams from native events |
| Audio/video engine | Custom Expo module `player-core` on AndroidX Media3 (ExoPlayer + `MediaLibraryService`) | Apache-2.0; skip silence, speed, Android Auto browse tree |
| Expo Go fallback | `expo-audio` | Basic playback when `player-core` isn't present |
| Volume boost | `android.media.audiofx.LoudnessEnhancer` on the player's audio session | Built into Android |
| Feed parsing | `fast-xml-parser` in JS, or Kotlin in the refresh worker | Must read Podcasting 2.0 tags: `transcript`, `chapters`, `person`, `funding`, `guid` |
| Downloads + refresh | WorkManager jobs inside `player-core` | Survives app close; Wi-Fi/charging constraints |
| Search/discovery | Apple Search API (no key) default; Podcast Index optional | Podcast Index keys can't be safely embedded in a public repo, so users paste their own |
| Transcription | `whisper.rn` (whisper.cpp) | On-device, opt-in model download |
| Audio fingerprinting | Chromaprint via JNI inside `player-core` | LGPL-2.1, links fine with MPL/GPL |
| Clip export | Media3 Transformer (trim + image/waveform video) | FFmpegKit was retired in 2025, so avoid it |
| Charts (listening stats) | `react-native-gifted-charts` | Same as earlier apps |
| Backup | JSON + OPML export via `expo-sharing`; restore via document picker | Replaces cloud sync |

**Pending verification before build:** that Media3 Transformer can produce the waveform-over-cover-art clip video in one composition. If it can't, clip video falls back to a cover-art still with audio, which Transformer definitely supports.

## Feature specs

### Library and discovery

- Add a podcast by search, pasted RSS URL, Apple Podcasts link (resolve via Apple lookup API to the feed URL), or OPML import.
- Private/paid feeds: support HTTP basic auth and token-in-URL feeds; store credentials in `expo-secure-store`, never in backups unless the user opts in.
- Discover tab: Apple top charts by country and category. Podcast Index trending and "value" feeds appear only when the user has added an API key in Settings.
- Folders: user-named, colored, one level deep (matches Pocket Casts). Sort podcasts by name, date added, latest episode, or drag order.
- Per-podcast settings: speed, trim silence, volume boost, skip first/last N seconds, auto-download, auto-archive rules, notification on/off, episode sort.

### Playback

- Speed 0.5x–3x in 0.1 steps, global default with per-podcast override.
- Trim silence with two levels (mild/aggressive), shown as "time saved" in stats. Media3 offers one built-in level; the aggressive level needs a custom `AudioProcessor` with a lower threshold.
- Volume boost: `LoudnessEnhancer` gain plus a light dynamics compressor so quiet guests come up without clipping.
- Skip back/forward intervals configurable separately (defaults 10s/30s).
- Headphone and Bluetooth controls: single press play/pause; double and triple press each mappable to skip forward, skip back, next chapter, or add bookmark.
- Sleep timer: minutes, end of episode, end of chapter; shake phone in the last minute to add 5 minutes; gentle fade-out over the final 10 seconds.
- Chapters: read ID3 CHAP frames, M4A chapter atoms, and Podcasting 2.0 JSON chapters (JSON wins when both exist). Chapter artwork replaces cover art while active.
- Preselect Chapters: per-episode checklist of chapters; unchecked ones are skipped during playback. Not available for local files without chapters.
- Video: same player, toggle to audio-only (keeps playing in background), full-screen with landscape rotation, picture-in-picture.

### Queue, playlists and filters

- Up Next: drag reorder, play next / play last, clear, shuffle (Up Next Shuffle picks randomly from the queue each time an episode ends instead of reordering the list).
- Manual playlists: any episode, including from podcasts the user doesn't follow (fetched by feed URL, stored as a hidden subscription).
- Smart playlists: rules for podcasts (all or chosen), played status, downloaded status, starred, release date window, duration range, media type (audio/video). Rules are stored as JSON and compiled to a SQL `WHERE` clause. Ship defaults: New Releases, In Progress, Starred, Quick Listens (under 25 min).

### Refresh, downloads and notifications

- Background refresh with WorkManager every 1, 2, 4, 6 or 12 hours (user choice; Android won't run it more often than every 15 min). Uses `ETag` / `Last-Modified` so unchanged feeds cost one small request.
- New-episode notifications are local notifications fired by the refresh worker, grouped per podcast.
- Auto-download: per podcast, latest N episodes, Wi-Fi only and charging-only toggles, storage cap with oldest-played-first cleanup.
- Episode guid dedup: Podcasting 2.0 `guid`, then RSS `guid`, then enclosure URL as fallback.

### Transcripts and Smart Bookmarks

- Publisher transcripts (VTT, SRT, JSON, HTML) load first. Generated transcripts fill in only when none exists, same rule as Pocket Casts.
- Generation is opt-in. Settings offers Whisper models by size (tiny, base, small) with download size shown before download. Jobs run only on downloaded episodes, queued in WorkManager with a charging + idle constraint by default, and the user can override per episode.
- Transcript view: auto-scroll synced to playback with a "follow" toggle, tap a line to seek, search with result count, share a selected passage with its timestamp.
- Bookmarks: title (editable), timestamp, created date; list per episode and a global bookmarks screen. Add from player button, notification action, or headphone action.
- Smart Bookmarks: when a transcript exists, the bookmark stores the surrounding transcript passage (about 20 seconds before the mark) and proposes a title from that passage. Without an on-device language model, the title is the passage's first clause trimmed to 60 characters. Unlike Pocket Casts, a setting turns Smart Bookmarks off.

### Ad skipping (beyond Pocket Casts parity)

All four layers run on the downloaded file, so dynamically inserted ads that shift position between downloads don't break them. Streaming playback gets layers 1 and 2 only.

1. **Skip intro/outro:** per-podcast seconds to skip at start and end (parity feature).
2. **Chapter rules:** auto-skip chapters whose titles match a user-editable keyword list (defaults: sponsor, advertisement, ad break, promo). Works through the Preselect Chapters mechanism.
3. **Repeated-audio detection:** after download, compute Chromaprint fingerprints over short sliding windows and store them in a local index. A stretch of at least 15 seconds that matches audio in another episode is marked as a repeated segment. Matches across different podcasts are labeled "likely ad"; matches only within the same feed may be a recurring intro and default to "ask." A user tap on "This is an ad" saves that fingerprint so the same ad is skipped in any future episode.
4. **Transcript classification:** when a transcript exists, score sentences for ad-read markers ("brought to you by," "use code," "dot com slash," "sponsored by," promo codes, URL patterns) and merge neighboring high-scoring sentences into segments. Segments above the confidence threshold are skipped; others show as marked regions on the scrubber.

Shared rules for all layers: a "Skipped ad · Undo" snackbar on every auto-skip, per-podcast off switch (some users want to hear ads for shows they support), global sensitivity setting, and stats for time skipped. Skipped regions appear as shaded bands on the scrubber.

### Sharing and clips

- Share podcast (website or feed URL), episode (episode link or enclosure URL), or position (link + `t=` timestamp in seconds).
- Clip editor: select start/end on a waveform, 1-second nudge buttons, up to 3 minutes. Export as M4A audio, or MP4 video with cover art and a waveform, in square or 9:16.

### Android Auto

- Android Auto browse tree: Up Next, Playlists, Folders/Podcasts, Downloads, Bookmarks. Custom actions on the Now Playing screen: skip back, skip forward, speed, bookmark.

### Appearance

Three themes, all free, mocked up in `docs/mockups/`:

- **Paper** (light): warm cream pages, serif headings, terracotta accent.
- **Dusk** (dark): night-blue-to-teal gradient, frosted glass cards, apricot accent.
- **Midnight** (true black for OLED): black background, mint accent.

Theme setting: Automatic (default: Paper in light mode, Dusk in dark mode, following the phone), or any one theme always. Automatic's dark pick can be switched to Midnight.

Separate from the theme, so any combination works:

- **Library view:** list (with each show's newest episode), grid of covers, or large grid.
- **Tint from cover art:** the player and podcast pages take their colour from the artwork. On by default in Midnight, optional in the others.
- **Alternate app icons** via Android activity aliases.

Theme changes cross-fade; nothing pops.

### Backup and restore

- Export: JSON (subscriptions, folders, playlists, settings, play positions, bookmarks, ad-skip fingerprints marked by the user, history) plus OPML for portability. Optional scheduled auto-backup to a user-chosen folder through the Storage Access Framework, which the user can point at a synced folder such as Nextcloud or Syncthing.
- Restore merges by episode guid and keeps the furthest play position.

### Stats

- Total listening time, time saved by speed, trim silence, intro/outro skips and ad skips, top podcasts by time. All computed from the local history table.

## Data model

One SQLite database, managed by Drizzle migrations. Large blobs (audio, transcripts, fingerprints, Whisper models) live as files under app storage, with paths stored in the tables.

| Table | Key columns | Notes |
| --- | --- | --- |
| `podcast` | id, feed_url, title, author, artwork_url, website, folder_id, subscribed, etag, last_modified, last_refreshed | `subscribed = false` for podcasts reached only through manual playlists |
| `podcast_settings` | podcast_id, speed, trim_silence, volume_boost, skip_start_s, skip_end_s, auto_download_n, auto_archive_rule, notify, ad_skip_enabled | Null fields fall back to global settings |
| `episode` | id, podcast_id, guid, title, pub_date, duration_s, enclosure_url, mime, media_type, transcript_url, chapters_url, season, number | Unique on (podcast_id, guid) |
| `episode_state` | episode_id, position_s, played, starred, archived, download_status, local_path, updated_at | Separate from `episode` so feed refresh never overwrites listening state |
| `folder` | id, name, color, sort_order | |
| `queue_item` | episode_id, position | Up Next |
| `playlist` | id, name, type (manual/smart), rules_json, sort | |
| `playlist_item` | playlist_id, episode_id, position | Manual playlists only |
| `chapter` | episode_id, start_s, end_s, title, image_url, url, selected | `selected` drives Preselect Chapters |
| `bookmark` | id, episode_id, position_s, title, transcript_passage, created_at | |
| `transcript` | episode_id, source (publisher/generated), format, file_path, model | |
| `ad_segment` | id, episode_id, start_s, end_s, layer (1–4), confidence, user_verdict (ad/not_ad/null) | User verdicts feed the fingerprint library |
| `ad_fingerprint` | id, file_path, duration_s, label, created_from_episode_id | User-confirmed ads matched in future episodes |
| `listen_event` | episode_id, started_at, listened_s, saved_speed_s, saved_silence_s, saved_skip_s | Feeds stats |
| `setting` | key, value_json | Global settings |

## Out of scope

- iOS, CarPlay, Apple Watch, web player, desktop apps.
- Accounts, cloud sync, cloud file storage, server-side refresh.
- Crowdsourced ad-skip segments (would need a shared server).
- Hand-curated discovery lists and Pocket Casts' own recommendation engine.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Native Kotlin module is the largest single piece of work | Slows first release | Build `player-core` first and keep its API small: load, play, pause, seek, speed, effects, events |
| Transcript ad detection false positives | Skips real content | High default threshold, Undo snackbar, scrubber bands, per-podcast off switch |
| Whisper drains battery or storage | Bad reviews | Opt-in, charging + idle constraint, model size shown up front, delete-model button |
| Fingerprint index grows without bound | Storage | Keep fingerprints only for downloaded or recent episodes plus user-confirmed ads; prune on a schedule |
| Background refresh killed by OEM battery savers | Missed episodes | Battery-optimization exemption prompt with an explanation; refresh on app open as a fallback |
| Apple Search API terms or availability change | Search breaks | Podcast Index as a second provider; RSS URL entry always works |
| Android Auto hides sideloaded apps | Caster missing in the car | Document the Android Auto "Unknown sources" developer setting in the README |

## Distribution

- **Name:** Caster. Keep "Pocket" and "Casts" out of the app name; say "open-source alternative to Pocket Casts" in the README only, same rule used for LibreBaby.
- **APK:** release builds signed with Caster's own key, installed directly. No Play Store listing and no Google Play services libraries. The player service declares the foreground service type `mediaPlayback`.
- **F-Droid (later, optional):** possible because nothing proprietary is included. Reviewers may flag the Apple search API as a non-free network service; the RSS-only and Podcast Index paths keep the app usable either way.
- **License:** GPL-3.0-or-later. Chromaprint (LGPL-2.1), whisper.cpp (MIT) and Media3 (Apache-2.0) are compatible.

## Build order

1. `player-core` module: Media3 playback, media session, notification controls, speed, skip silence, volume boost.
2. Subscriptions: search, RSS add, OPML import, feed parsing, episode list, refresh worker, downloads.
3. Up Next, per-podcast settings, skip intro/outro, sleep timer, chapters, Preselect Chapters.
4. Folders, manual and smart playlists, bookmarks, headphone actions.
5. Android Auto browse tree.
6. Publisher transcripts, sharing, backup/restore, stats. First public release here.
7. Ad skipping layers 2 and 3 (chapter rules, Chromaprint repeated-audio detection).
8. On-device Whisper transcripts, Smart Bookmarks, ad skipping layer 4.
9. Clip editor and export.

## Sources

- [Pocket Casts mobile apps are now open source (Pocket Casts blog, Oct 2022)](https://blog.pocketcasts.com/2022/10/19/pocket-casts-mobile-apps-are-now-open-source/)
- [Pocket Casts App Store listing and prices](https://apps.apple.com/us/app/pocket-casts-podcast-player/id414834813)
- [Pocket Casts Plus and Patron](https://pocketcasts.com/plus)
- [Pocket Casts web and desktop apps go free; Plus feature list (FoneArena)](https://www.fonearena.com/blog/448603/pocket-casts-web-desktop-free-download.html/amp)
- [Free web player and account tiers (DocumentaryTube)](https://www.documentarytube.com/blog/pocket-casts-free-web-player-explained-what-open-podcasting-means/)
- [Bookmarks and Smart Bookmarks (Pocket Casts support)](https://support.pocketcasts.com/knowledge-base/bookmarks)
- [Preselect Chapters (Pocket Casts support)](https://support.pocketcasts.com/knowledge-base/preselect-chapters/)
- [Files settings (Pocket Casts support)](https://support.pocketcasts.com/knowledge-base/files-settings/)
- [Generated transcripts are here (Pocket Casts blog, Apr 2025)](https://blog.pocketcasts.com/2025/04/29/generated-transcripts-are-here/)
- [Playlists (Pocket Casts blog, Nov 2025)](https://blog.pocketcasts.com/2025/11/24/playlists-a-new-way-to-organize-your-listening/)
- [Sharing podcasts, episodes and clips (Pocket Casts support)](https://support.pocketcasts.com/article/sharing-podcasts-and-episodes/)
- [Clip sharing and transcripts (9to5Google, Sep 2024)](https://9to5google.com/2024/09/20/pocket-casts-clip-sharing-transcripts/)
- [Pocket Casts Android release notes (Releasebot)](https://releasebot.io/updates/automattic/pocket-casts-android)
- [Automatic ad skipping thread (Pocket Casts forums)](https://forums.pocketcasts.com/forums/topic/automatic-ad-skipping/)
- [Podcast ad-skipping discussion and dynamic ad insertion (PieFed)](https://piefed.jeena.net/post/31286)
- [react-native-track-player v5 Android Auto and licensing](https://www.rntp.dev/docs/android-auto)
