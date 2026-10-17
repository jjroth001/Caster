import { resolveTheme } from '@/theme/resolve';

import { clock, duration, releaseDate, speedLabel, timeLeft } from './format';

describe('format', () => {
  it('clock', () => {
    expect(clock(65_000)).toBe('1:05');
    expect(clock(3_725_000)).toBe('1:02:05');
    expect(clock(null)).toBe('--:--');
  });

  it('duration', () => {
    expect(duration(2520)).toBe('42 min');
    expect(duration(3900)).toBe('1 h 5 min');
    expect(duration(7200)).toBe('2 h');
    expect(duration(20)).toBe('under 1 min');
    expect(duration(null)).toBe('');
  });

  it('timeLeft', () => {
    expect(timeLeft(600, 2040)).toBe('24 min left');
    expect(timeLeft(10, null)).toBe('');
  });

  it('releaseDate', () => {
    const now = new Date(2026, 9, 16, 15, 0).getTime();
    expect(releaseDate(new Date(2026, 9, 16, 1, 0).getTime(), now)).toBe('Today');
    expect(releaseDate(new Date(2026, 9, 15, 23, 0).getTime(), now)).toBe('Yesterday');
    expect(releaseDate(new Date(2026, 9, 12).getTime(), now)).toBe('Mon');
    expect(releaseDate(new Date(2026, 8, 3).getTime(), now)).toBe('Sep 3');
    expect(releaseDate(new Date(2025, 0, 9).getTime(), now)).toBe('Jan 9, 2025');
  });

  it('speedLabel', () => {
    expect(speedLabel(1)).toBe('1×');
    expect(speedLabel(1.25)).toBe('1.25×');
  });
});

describe('resolveTheme', () => {
  it('follows the phone in Automatic', () => {
    expect(resolveTheme('auto', 'dusk', 'light').name).toBe('paper');
    expect(resolveTheme('auto', 'dusk', 'dark').name).toBe('dusk');
    expect(resolveTheme('auto', 'midnight', 'dark').name).toBe('midnight');
  });

  it('keeps a chosen theme', () => {
    expect(resolveTheme('midnight', 'dusk', 'light').name).toBe('midnight');
  });
});
