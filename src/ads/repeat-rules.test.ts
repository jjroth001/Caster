import { mergeSpans, repeatConfidence } from './repeat-rules';

describe('repeated-audio ads', () => {
  it('is surest when another show plays the same audio', () => {
    expect(repeatConfidence({ start: 600, end: 630 }, 3600, true)).toBe(0.9);
    // In another show even at the very start: still an ad, not this show's theme.
    expect(repeatConfidence({ start: 2, end: 32 }, 3600, true)).toBe(0.9);
  });

  it('treats the same show’s mid-episode repeats as ads, its start and end as its theme', () => {
    expect(repeatConfidence({ start: 600, end: 630 }, 3600, false)).toBe(0.85);
    expect(repeatConfidence({ start: 3, end: 40 }, 3600, false)).toBe(0.5);
    expect(repeatConfidence({ start: 3560, end: 3595 }, 3600, false)).toBe(0.5);
    expect(repeatConfidence({ start: 3560, end: 3595 }, null, false)).toBe(0.85);
  });

  it('joins overlapping and touching findings', () => {
    expect(
      mergeSpans([
        { start: 100, end: 130, confidence: 0.5 },
        { start: 300, end: 330, confidence: 0.85 },
        { start: 129, end: 160, confidence: 0.9 },
        { start: 161, end: 175, confidence: 0.85 },
      ]),
    ).toEqual([
      { start: 100, end: 175, confidence: 0.9 },
      { start: 300, end: 330, confidence: 0.85 },
    ]);
  });
});
