import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import {
  type EmbeddedChapter,
  type HeadsetAction,
  type LoadItem,
  PlayerCore,
  type PlayerState,
  type TrimSilence,
} from '@modules/player-core/src';

export type { LoadItem, PlayerState, TrimSilence };

export type PlayerEvent =
  | { type: 'state'; state: PlayerState }
  | { type: 'ended'; id: string }
  | { type: 'error'; id: string | null; message: string }
  | { type: 'chapters'; id: string; chapters: EmbeddedChapter[] }
  | { type: 'headset'; action: HeadsetAction };

/** One player API, backed by the native Media3 service or, in Expo Go, by expo-audio. */
export type PlayerEngine = {
  /** 'native' has everything; 'basic' (Expo Go) has no trim silence, boost or background audio. */
  kind: 'native' | 'basic';
  load(item: LoadItem): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  skipBack(): Promise<void>;
  skipForward(): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  setTrimSilence(level: TrimSilence): Promise<void>;
  setVolumeBoost(enabled: boolean): Promise<void>;
  setSkipIntervals(backSeconds: number, forwardSeconds: number): Promise<void>;
  /** Pauses after `ms`; 0 turns the timer off. */
  setSleepTimer(ms: number): Promise<void>;
  /** What double and triple presses of a headset button do (installed app only). */
  setHeadsetActions(double: HeadsetAction, triple: HeadsetAction): void;
  stop(): Promise<void>;
  getState(): Promise<PlayerState>;
  subscribe(listener: (event: PlayerEvent) => void): () => void;
};

export const IDLE_STATE: PlayerState = {
  id: null,
  state: 'idle',
  playing: false,
  playWhenReady: false,
  positionMs: 0,
  durationMs: null,
  bufferedMs: 0,
  speed: 1,
  trimSilence: 'off',
  volumeBoost: false,
  sleepRemainingMs: null,
};

function nativeEngine(core: NonNullable<typeof PlayerCore>): PlayerEngine {
  return {
    kind: 'native',
    load: (item) => core.load(item),
    play: () => core.play(),
    pause: () => core.pause(),
    seekTo: (ms) => core.seekTo(ms),
    skipBack: () => core.skipBack(),
    skipForward: () => core.skipForward(),
    setSpeed: (speed) => core.setSpeed(speed),
    setTrimSilence: (level) => core.setTrimSilence(level),
    setVolumeBoost: (enabled) => core.setVolumeBoost(enabled),
    setSkipIntervals: (back, forward) => core.setSkipIntervals(back, forward),
    setSleepTimer: (ms) => core.setSleepTimer(ms),
    setHeadsetActions: (double, triple) => core.setHeadsetActions(double, triple),
    stop: () => core.stop(),
    getState: () => core.getState(),
    subscribe(listener) {
      const subs = [
        core.addListener('onState', (state) => listener({ type: 'state', state })),
        core.addListener('onProgress', (state) => listener({ type: 'state', state })),
        core.addListener('onEnded', ({ id }) => listener({ type: 'ended', id })),
        core.addListener('onError', ({ id, message }) => listener({ type: 'error', id, message })),
        core.addListener('onHeadsetAction', ({ action }) => listener({ type: 'headset', action })),
        core.addListener('onChapters', ({ id, chapters }) =>
          listener({ type: 'chapters', id, chapters }),
        ),
      ];
      void core.getState().then((state) => listener({ type: 'state', state }));
      return () => subs.forEach((s) => s.remove());
    },
  };
}

/** Expo Go stand-in: plays, pauses, seeks and changes speed (expo-audio allows up to 2x). */
function basicEngine(): PlayerEngine {
  let player: AudioPlayer | null = null;
  let id: string | null = null;
  let speed = 1;
  let back = 10;
  let forward = 30;
  let endedFor: string | null = null;
  let sleepAt = 0;
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(event: PlayerEvent) => void>();
  const emit = (event: PlayerEvent) => listeners.forEach((l) => l(event));

  const state = (): PlayerState => {
    if (!player || !id) return IDLE_STATE;
    const duration = player.duration > 0 ? player.duration * 1000 : null;
    const ended =
      duration != null && player.currentTime * 1000 >= duration - 250 && !player.playing;
    return {
      ...IDLE_STATE,
      id,
      state: ended
        ? 'ended'
        : player.isBuffering
          ? 'buffering'
          : player.isLoaded
            ? 'ready'
            : 'idle',
      playing: player.playing,
      playWhenReady: player.playing,
      positionMs: player.currentTime * 1000,
      durationMs: duration,
      speed,
      sleepRemainingMs: sleepAt ? Math.max(0, sleepAt - Date.now()) : null,
    };
  };

  const ensure = () => {
    if (player) return player;
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
    player = createAudioPlayer(null, { updateInterval: 500 });
    player.addListener('playbackStatusUpdate', (status) => {
      emit({ type: 'state', state: state() });
      if (status.didJustFinish && id && endedFor !== id) {
        endedFor = id;
        emit({ type: 'ended', id });
      }
      if (status.error) emit({ type: 'error', id, message: status.error });
    });
    return player;
  };

  const seekBy = async (deltaSeconds: number) => {
    if (!player) return;
    const max = player.duration > 0 ? player.duration : Infinity;
    await player.seekTo(Math.min(max, Math.max(0, player.currentTime + deltaSeconds)));
  };

  return {
    kind: 'basic',
    async load(item) {
      const p = ensure();
      id = item.id;
      endedFor = null;
      p.replace({ uri: item.url });
      p.setPlaybackRate(speed);
      if (item.startPositionMs) await p.seekTo(item.startPositionMs / 1000);
      p.setActiveForLockScreen(true, {
        title: item.title,
        artist: item.artist,
        albumTitle: item.album,
        artworkUrl: item.artworkUrl,
      });
      if (item.playWhenReady !== false) p.play();
      emit({ type: 'state', state: state() });
    },
    async play() {
      player?.play();
    },
    async pause() {
      player?.pause();
    },
    async seekTo(ms) {
      await player?.seekTo(ms / 1000);
    },
    skipBack: () => seekBy(-back),
    skipForward: () => seekBy(forward),
    async setSpeed(value) {
      speed = Math.min(2, Math.max(0.5, value));
      player?.setPlaybackRate(speed);
      emit({ type: 'state', state: state() });
    },
    async setTrimSilence() {},
    async setVolumeBoost() {},
    async setSkipIntervals(b, f) {
      back = b;
      forward = f;
    },
    async setSleepTimer(ms) {
      clearTimeout(sleepTimer);
      sleepAt = ms > 0 ? Date.now() + ms : 0;
      if (ms > 0) {
        sleepTimer = setTimeout(() => {
          sleepAt = 0;
          player?.pause();
        }, ms);
      }
      emit({ type: 'state', state: state() });
    },
    async stop() {
      player?.pause();
      player?.clearLockScreenControls();
      id = null;
      emit({ type: 'state', state: state() });
    },
    getState: async () => state(),
    setHeadsetActions() {},
    subscribe(listener) {
      listeners.add(listener);
      listener({ type: 'state', state: state() });
      return () => listeners.delete(listener);
    },
  };
}

export const engine: PlayerEngine = PlayerCore ? nativeEngine(PlayerCore) : basicEngine();
