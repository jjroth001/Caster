import { cuesFromSegments } from './whisper';

describe('generated transcripts', () => {
  it('turns whisper.cpp segments (hundredths of a second) into cues, dropping noise tags', () => {
    expect(
      cuesFromSegments([
        { text: ' [Music]', t0: 0, t1: 300 },
        { text: ' Welcome back to the show.', t0: 300, t1: 650 },
        { text: ' Today, lighthouses.', t0: 650, t1: 900 },
      ]),
    ).toEqual([
      { start: 3, end: 9, text: 'Welcome back to the show. Today, lighthouses.', speaker: null },
    ]);
  });
});
