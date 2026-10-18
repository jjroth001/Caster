import { applyExpected } from './use-player';
import type { PlayerState } from './engine';

jest.mock('./engine', () => ({ IDLE_STATE: {}, engine: { subscribe: () => () => {} } }));

const report = (patch: Partial<PlayerState>): PlayerState =>
  ({
    id: '7',
    state: 'ready',
    playing: false,
    playWhenReady: false,
    positionMs: 60_000,
    durationMs: 3_600_000,
    bufferedMs: 0,
    speed: 1,
    trimSilence: 'off',
    volumeBoost: false,
    sleepRemainingMs: null,
    ...patch,
  }) as PlayerState;

describe('instant play/pause and seeking', () => {
  const tapped = { at: 1000, patch: { playWhenReady: true, positionMs: 90_000 } };

  it('keeps what you tapped over a report sent before the player heard it', () => {
    const shown = applyExpected(report({}), '7', tapped, 1300);
    expect(shown.playWhenReady).toBe(true);
    expect(shown.positionMs).toBe(90_000);
  });

  it('takes the player’s word once it agrees, or after a moment', () => {
    expect(
      applyExpected(report({ playWhenReady: true, positionMs: 90_400 }), '7', tapped, 1300),
    ).toMatchObject({ positionMs: 90_400 });
    expect(applyExpected(report({}), '7', tapped, 2000).playWhenReady).toBe(false);
  });

  it('ignores the tap for a different episode', () => {
    expect(applyExpected(report({ id: '8' }), '7', tapped, 1300).playWhenReady).toBe(false);
  });

  it('keeps showing a newly started episode over late updates about the old one', () => {
    const started = {
      at: 1000,
      patch: { id: '9', state: 'buffering' as const, playWhenReady: true },
    };
    expect(applyExpected(report({ id: '7' }), '9', started, 1500)).toMatchObject({
      id: '9',
      playWhenReady: true,
    });
    // Once the player reports the new episode, its report wins.
    expect(
      applyExpected(
        report({ id: '9', state: 'ready', playing: true, playWhenReady: true }),
        '9',
        started,
        1600,
      ).state,
    ).toBe('ready');
  });
});
