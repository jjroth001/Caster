import { type NativeModule, requireOptionalNativeModule } from 'expo';

export type TrimSilence = 'off' | 'mild' | 'aggressive';

export type PlayerState = {
  /** The loaded episode's id, or null when nothing is loaded. */
  id: string | null;
  state: 'idle' | 'buffering' | 'ready' | 'ended';
  playing: boolean;
  playWhenReady: boolean;
  positionMs: number;
  durationMs: number | null;
  bufferedMs: number;
  speed: number;
  trimSilence: TrimSilence;
  volumeBoost: boolean;
  /** Time until the sleep timer pauses playback, or null when it's off. */
  sleepRemainingMs: number | null;
};

export type LoadItem = {
  id: string;
  url: string;
  title?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  startPositionMs?: number;
  playWhenReady?: boolean;
};

export type DownloadState = 'queued' | 'downloading' | 'done' | 'failed' | 'cancelled';

export type DownloadEvent = {
  /** "<podcastId>:<guid>" */
  key: string;
  state: DownloadState;
  /** 0–1, or -1 while downloading a file whose size the server didn't give. */
  progress: number;
  /** Bytes saved so far while downloading. */
  written: number;
  uri: string | null;
  bytes: number;
  error: string | null;
};

export type DownloadRequest = {
  key: string;
  url: string;
  mime?: string | null;
  title: string;
  wifiOnly: boolean;
  chargingOnly: boolean;
  /** Wait while the phone is low on storage. */
  storageNotLow?: boolean;
  /** A private feed's sign-in, sent only to the episode's own host. */
  authorization?: string | null;
};

export type InboxFeed = {
  podcastId: number;
  xml: string;
  etag: string | null;
  lastModified: string | null;
};

export type PendingState = {
  positions: { id: string; positionMs: number; at: number; ended: boolean }[];
  bookmarks: { id: string; positionMs: number; at: number }[];
  nowPlaying: string | null;
};

type PlayerCoreEvents = {
  onState(state: PlayerState): void;
  onProgress(state: PlayerState): void;
  onEnded(event: { id: string }): void;
  onError(event: { id: string | null; code: string; message: string }): void;
  onDownload(event: DownloadEvent): void;
  onChapters(event: { id: string; chapters: EmbeddedChapter[] }): void;
  onHeadsetAction(event: { action: HeadsetAction }): void;
  onSpeechProgress(event: { progress: number }): void;
  onPower(event: { charging: boolean }): void;
};

/** A stretch of one episode that also plays in another (seconds). */
export type AudioRepeat = { start: number; end: number; otherKey: string; otherStart: number };

export type HeadsetAction = 'skipForward' | 'skipBack' | 'nextChapter' | 'bookmark' | 'none';

export type EmbeddedChapter = { startMs: number; endMs: number; title: string | null };

declare class PlayerCoreModule extends NativeModule<PlayerCoreEvents> {
  load(item: LoadItem): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  skipBack(): Promise<void>;
  skipForward(): Promise<void>;
  /** 0.5–3. */
  setSpeed(speed: number): Promise<void>;
  setTrimSilence(level: TrimSilence): Promise<void>;
  setVolumeBoost(enabled: boolean): Promise<void>;
  setSkipIntervals(backSeconds: number, forwardSeconds: number): Promise<void>;
  /** Pauses after `ms` (fading out over the last 10 s); 0 turns the timer off. */
  setSleepTimer(ms: number): Promise<void>;
  /** What double and triple presses of a headset's play button do. */
  setHeadsetActions(double: HeadsetAction, triple: HeadsetAction): void;
  stop(): Promise<void>;
  getState(): Promise<PlayerState>;

  download(request: DownloadRequest): void;
  cancelDownload(key: string): void;
  /** The full-screen video screen opened or closed: rotation and picture-in-picture. */
  setVideoScreenOpen(open: boolean): Promise<void>;
  /** Hides or shows the system bars. */
  setImmersive(on: boolean): Promise<void>;
  /** Shrinks Caster to a floating video window; false where that isn't possible. */
  enterPictureInPicture(): Promise<boolean>;
  /** Signs in to a private feed's host for playback and downloads (kept in memory only). */
  setHostAuthorization(host: string, authorization: string): void;
  deleteDownload(key: string): void;
  listDownloads(): { key: string; uri: string; bytes: number }[];
  activeDownloads(): Promise<DownloadEvent[]>;

  /** Cuts part of an episode to a file; resolves with its file:// URI. */
  makeClip(request: {
    source: string;
    startMs: number;
    endMs: number;
    artworkUrl?: string | null;
    format: 'audio' | 'square' | 'story';
  }): Promise<string>;

  /** Transcribe while Caster is closed and the phone charges (or stop doing so). */
  configureBackgroundTranscribe(enabled: boolean): void;
  /** How many downloaded episodes are waiting for a transcript. */
  setTranscribePending(count: number): void;
  /** Fingerprints a downloaded episode's audio (for finding repeated ads); resolves with its size. */
  fingerprintEpisode(key: string, source: string): Promise<number>;
  /** Stretches of an episode that also play in the other episodes given (seconds). */
  findRepeats(key: string, others: string[]): Promise<AudioRepeat[]>;
  /** Keys of the episodes that have a fingerprint. */
  listFingerprints(): string[];
  deleteFingerprint(key: string): void;
  /** Whether the phone is charging. */
  isCharging(): boolean;
  /** Whether Android's battery saving leaves Caster's background work alone. */
  isIgnoringBatteryOptimizations(): boolean;
  /** Opens Android's "let this app run in the background?" dialog. */
  requestIgnoreBatteryOptimizations(): void;
  /** Converts a downloaded episode to 16 kHz mono WAV for speech recognition; resolves with its path. */
  decodeForSpeech(source: string): Promise<string>;

  /** "#RRGGBB" picked from a cover image, or null. */
  artworkColor(url: string): Promise<string | null>;

  /** The lists Android Auto can browse (JSON from src/auto/snapshot.ts). */
  setAutoLibrary(json: string): void;
  /** Positions, finishes and bookmarks from playback while the app wasn't running; clears them. */
  takePendingState(): PendingState;

  /** Snapshot of followed podcasts and settings for the background check (JSON). */
  configureBackground(json: string): void;
  readInbox(): InboxFeed[];
  clearInbox(podcastId: number): void;
}

/**
 * The Media3 player running in a background service (notification, lock screen, headset
 * buttons). null in Expo Go, which can't load custom native code.
 */
export const PlayerCore = requireOptionalNativeModule<PlayerCoreModule>('PlayerCore');
