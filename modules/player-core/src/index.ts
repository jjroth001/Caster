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

type PlayerCoreEvents = {
  onState(state: PlayerState): void;
  onProgress(state: PlayerState): void;
  onEnded(event: { id: string }): void;
  onError(event: { id: string | null; code: string; message: string }): void;
};

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
  stop(): Promise<void>;
  getState(): Promise<PlayerState>;
}

/**
 * The Media3 player running in a background service (notification, lock screen, headset
 * buttons). null in Expo Go, which can't load custom native code.
 */
export const PlayerCore = requireOptionalNativeModule<PlayerCoreModule>('PlayerCore');
