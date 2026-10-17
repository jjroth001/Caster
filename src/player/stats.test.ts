import { measure } from './stats';

describe('listening stats', () => {
  it('counts listening and time saved by speed', () => {
    const m = measure({ wall: 0, pos: 10 }, { wall: 2000, pos: 13 }, 1.5, false);
    expect(m.listened).toBe(2);
    expect(m.speed).toBeCloseTo(1);
    expect(m.silence).toBe(0);
  });

  it('counts trimmed silence as media running ahead of the clock', () => {
    const m = measure({ wall: 0, pos: 0 }, { wall: 1000, pos: 1.4 }, 1, true);
    expect(m.silence).toBeCloseTo(0.4);
  });

  it('ignores pauses and seeks', () => {
    expect(measure({ wall: 0, pos: 0 }, { wall: 60_000, pos: 60 }, 1, true).listened).toBe(0);
    expect(measure({ wall: 0, pos: 0 }, { wall: 1000, pos: 31 }, 1, true).silence).toBe(0);
  });
});
