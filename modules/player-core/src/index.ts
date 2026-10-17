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
  progress: number;
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
};

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
