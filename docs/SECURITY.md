# Security

Pod Wizard has no account, server or analytics; everything it knows lives on the phone. This
page records how it handles untrusted input and secrets, and the findings of the October 2026
audit (version 1.0.1).

## How it's built to be safe

- **Feeds are untrusted.** Podcast feeds, transcripts and chapters come from anyone. They're
  parsed as data (no web views, no HTML rendering, no code evaluation); show notes are turned
  into plain text. Downloads are saved under hashed names with an allowed audio/video ending,
  so a feed can't choose where a file goes.
- **Secrets stay encrypted.** Private-feed sign-ins and the Podcast Index key are kept in
  Android's encrypted storage (expo-secure-store). Copies the background check and downloads
  need are sealed with an AES-GCM key held in the Android keystore. None are logged, backed up
  or exported.
- **Sign-ins stay on their site.** A private feed's sign-in is sent only to the feed's own site
  (its host or a subdomain of the same domain), for feed checks, playback and downloads.
- **Backups and OPML files are untrusted.** Restoring accepts only known settings with the
  right kind of value; phone-only settings (backup folder, private-feed list) are never
  restored from a file.
- **Other apps get little.** Only Pod Wizard itself, the system's media controls, Android Auto
  and system apps can browse the library through the media service; other apps can play,
  pause and skip, like headphone buttons. The `podwizard://` link scheme only opens screens.
- **No cloud copy.** Android's automatic cloud backup is off; the app's own backups go where
  you choose.
- **Network.** Requests have time limits. Only HTTPS is allowed by Android's default policy
  for the app (plain-HTTP feeds and files won't load).

## Audit, October 2026

Fixed in this round:

| Finding | Risk | Fix |
| --- | --- | --- |
| Any installed app could browse the whole library (podcasts, episodes, Up Next, progress) through the media service | Medium (privacy) | Browsing and custom buttons limited to trusted callers |
| A crafted backup file could inject SQL through per-podcast setting names | Medium | Setting names allow-listed; values type-checked |
| A private feed's sign-in was shared with every host its episodes came from, including shared podcast hosting | Medium | Sign-ins only go to the feed's own site |
| Android cloud backup copied the database (listening history) to the Google account | Low (privacy) | `allowBackup` off |
| "Open the episode's web page" opened any link a feed supplied (phone, SMS, other apps' links) | Low | Only `http`/`https` links |
| Download job data held a private feed's sign-in unencrypted (app-private storage) | Low | Sealed with the keystore key |
| A feed could name a download `.json`, overwriting its sidecar | Low | Only audio/video endings |

Known and accepted, or waiting on others:

- **decode-uri-component** (in Expo Router's link handling) has a slowdown bug with crafted
  links (GHSA-vcc3-ghjq-m6fr). The fixed version is an ES module Expo Router's dependency
  can't load yet; impact is a brief freeze from a link another app sends. Revisit when Expo
  updates `query-string`.
- **Redirects while streaming a private episode** carry its sign-in to the redirect target
  (Media3's HTTP stack keeps request headers across redirects). The private feed's operator
  chooses that target; downloads don't have this problem.
- **Feeds can make the phone fetch any address**, including ones on your home network, for
  episode files, artwork, chapters and transcripts. Every podcast app shares this; requests
  are plain GETs with no credentials.
- **Private feeds with a token in the address** (rather than a username and password) keep
  that token in the feed address, which appears in backups and OPML exports. Treat those files
  as private.
- **Speech models** download over HTTPS from Hugging Face without a separate checksum check.
- **Build tools** (on the developer's computer, not in the app) have advisories in
  `node-forge`, `braces`, `sprintf-js` and `uuid`; none of them ship in the app bundle.

## Reporting a problem

Open an issue on GitHub, or for anything sensitive, contact the maintainer through the GitHub
profile before posting details.
