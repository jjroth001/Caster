# Phone test checklist for 1.0

Work through this on a real phone with the installed APK (not Expo Go). Tick each line that
behaves as described; note anything that doesn't, with a screenshot if you can. A few items
need a second device or a car; skip those if you can't try them.

## Install and first run

- [ ] Installs over the previous version and keeps your podcasts, positions and settings
- [ ] Opens to the library in under a few seconds, with no blank or flashing screens
- [ ] Theme follows the phone (Paper by day, Dusk or Midnight at night); switching themes in
      Settings cross-fades and the tab bar redraws

## Finding and following podcasts

- [ ] Search finds a podcast by name; opening it shows its episodes
- [ ] Follow adds it to the library; Following → Unfollow removes it
- [ ] Pasting a feed address and an Apple Podcasts link both work
- [ ] Discover shows top charts; changing country or category changes them
- [ ] OPML import from another app brings everything in; failures say why
- [ ] OPML export opens the share sheet with a file

## Library

- [ ] Grid, large grid and list views all look right; only large grid and list show "N new"
- [ ] Sorting (name, date added, latest episode) works
- [ ] Folders: create, colour, move podcasts in and out
- [ ] Pull to refresh finds new episodes

## Playing

- [ ] Play, pause, skip back and forward from the player, mini player, notification, lock
      screen and headphones
- [ ] Headphone double and triple press do what Settings says
- [ ] Speed slider moves in 0.1 steps; − and + buttons; per-podcast speed sticks
- [ ] Trim silence (mild and strong) and volume boost are audible
- [ ] Swipe down closes the player smoothly; the player never scrolls
- [ ] Tab bar and mini player stay on screen everywhere except the full player
- [ ] Sleep timer: minutes, end of episode, end of chapter; fades out at the end
- [ ] Leaving the app, locking the phone and coming back keeps playing and keeps the place
- [ ] After closing Caster completely, it reopens at the same episode and position

## Chapters, transcripts and bookmarks

- [ ] Chapters show, with artwork where the podcast has it; tapping one jumps there
- [ ] Unticking a chapter skips it
- [ ] Publisher transcript follows along, search finds words, tapping a line jumps there
- [ ] Making a transcript on the phone: download a speech model, make one, leave the
      screen and come back (progress is still there), Stop works
- [ ] Automatic transcription while charging, with Caster open; and "any time" with Caster
      closed (a quiet notification while it works; unplugging stops it)
- [ ] Transcripts screen: open, export as text and subtitles, export all, delete
- [ ] Bookmarks from the player and the headphone action; smart titles from transcripts;
      the Bookmarks screen lists them all

## Ad skipping

- [ ] An episode with a publisher transcript and sponsor reads shows "Skipped ad · Undo"
      at the start of the read and jumps past all of it
- [ ] Shaded bands on the progress bar where ads were found
- [ ] Undo goes back and that stretch isn't skipped again
- [ ] Chapters titled like ads are skipped
- [ ] Skip intro and outro seconds (podcast settings) work
- [ ] The per-podcast off switch stops all of it for that show

## Up Next and playlists

- [ ] Play next, play last, drag to reorder, clear, shuffle
- [ ] The next episode starts by itself when one ends (when that setting is on)
- [ ] Manual playlists: add, reorder, remove
- [ ] Smart playlists: the four defaults look right; editing rules changes the list

## Downloads

- [ ] Download from an episode: progress counts up live in the list and on the episode page
- [ ] A download keeps going with the app closed and shows in the notification
- [ ] Remove a download; Downloads screen total updates
- [ ] Auto-download: choose a podcast, new episodes download; the limit removes older
      automatic downloads but never ones you started, starred, half-listened or queued
- [ ] Episodes added to Up Next download (when that's on)
- [ ] Chosen playlists download their first episodes
- [ ] Following a podcast downloads its latest two (when that's on)
- [ ] Wi-Fi only: with Wi-Fi off, automatic downloads wait; your own still go
- [ ] Stop all downloads, Clear download errors
- [ ] Storage limit and Delete after playing

## Background and notifications

- [ ] New-episode check runs with the app closed (leave it a few hours)
- [ ] New-episode notifications, one per podcast
- [ ] After restarting the phone, background checks and downloads still happen

## Android Auto (needs a car or the desktop head unit)

- [ ] Caster shows in the car's app list (after turning on Unknown sources, see README)
- [ ] Browse Up Next, In progress, New episodes, Downloads, Playlists, Podcasts
- [ ] Play, pause, skip; speed and bookmark under "more"
- [ ] Position and bookmarks from the car show up in the app afterwards

## Clips and sharing

- [ ] Share a podcast, an episode, and the current moment (link with the time)
- [ ] Make a clip, nudge its ends, export as audio and as video (square and tall)

## Your data

- [ ] Backup to a file; restore it on a fresh install; positions and bookmarks come back
- [ ] Stats show listening time and time saved

## Expo Go (developer check only)

- [ ] The app still opens in Expo Go; native-only features say they need the installed app
