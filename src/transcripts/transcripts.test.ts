import { findAdSegments, scoreSentence } from './ads';
import { parseJsonTranscript, parseTimedText, parseTranscript } from './parse';

const VTT = `WEBVTT

1
00:00:00.000 --> 00:00:03.500
<v Rae Lin>Welcome back to Low Tide Radio.

2
00:00:03.500 --> 00:00:06.000
<v Rae Lin>Today: lighthouses.

00:01:02.250 --> 00:01:05.000
<v Guest>Thanks for having me!
`;

const SRT = `1
00:00:01,000 --> 00:00:04,000
HOST: It was a dark and stormy night.

2
00:00:04,000 --> 00:00:07,500
HOST: The keeper climbed the stairs.
`;

describe('transcripts', () => {
  it('reads WebVTT with voices', () => {
    const cues = parseTimedText(VTT);
    expect(cues[0]).toMatchObject({ start: 0, speaker: 'Rae Lin' });
    expect(cues[0].text).toBe('Welcome back to Low Tide Radio. Today: lighthouses.');
    expect(cues[1]).toMatchObject({
      start: 62.25,
      end: 65,
      speaker: 'Guest',
      text: 'Thanks for having me!',
    });
  });

  it('reads SRT with "NAME:" speakers, joining short lines from the same speaker', () => {
    expect(parseTimedText(SRT)).toEqual([
      {
        start: 1,
        end: 7.5,
        speaker: 'HOST',
        text: 'It was a dark and stormy night. The keeper climbed the stairs.',
      },
    ]);
  });

  it('reads Podcasting 2.0 JSON, joining word-level segments', () => {
    const json = JSON.stringify({
      version: '1.0.0',
      segments: [
        { speaker: 'A', startTime: 0, endTime: 0.4, body: 'Hello' },
        { speaker: 'A', startTime: 0.4, endTime: 0.9, body: 'there.' },
        { speaker: 'B', startTime: 1, endTime: 2, body: 'Hi!' },
      ],
    });
    expect(parseJsonTranscript(json)).toEqual([
      { start: 0, end: 0.9, text: 'Hello there.', speaker: 'A' },
      { start: 1, end: 2, text: 'Hi!', speaker: 'B' },
    ]);
  });

  it('sniffs the format when the type is missing', () => {
    expect(parseTranscript(VTT, null)[0].speaker).toBe('Rae Lin');
    expect(parseTranscript('<p>One.</p><p>Two.</p>', 'text/html')).toEqual([
      { start: -1, end: -1, text: 'One.', speaker: null },
      { start: -1, end: -1, text: 'Two.', speaker: null },
    ]);
  });
});

describe('transcript ad detection', () => {
  it('scores ad-read phrases', () => {
    expect(
      scoreSentence('This episode is brought to you by Example Mattresses.'),
    ).toBeGreaterThanOrEqual(0.6);
    expect(scoreSentence('Go to example.com/lowtide and use code TIDE for 20% off.')).toBe(1);
    expect(scoreSentence('The lighthouse was built in 1902.')).toBe(0);
  });

  it('finds an ad break and ignores ordinary talk', () => {
    const cues = [
      { start: 0, end: 30, text: 'Today we talk about the history of lighthouses.' },
      { start: 300, end: 310, text: 'This episode is brought to you by Example Mattresses.' },
      { start: 310, end: 325, text: 'I sleep so much better now, honestly.' },
      {
        start: 325,
        end: 340,
        text: 'Go to example.com/tide and use promo code TIDE for 20% off your first order.',
      },
      { start: 340, end: 400, text: 'Anyway, back to the keeper and his logbook.' },
    ];
    const ads = findAdSegments(cues);
    expect(ads).toHaveLength(1);
    expect(ads[0]).toMatchObject({ start: 300, end: 340 });
    expect(ads[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('skips untimed (HTML) transcripts', () => {
    expect(
      findAdSegments([{ start: -1, end: -1, text: 'Sponsored by Example, use code X.' }]),
    ).toEqual([]);
  });
});
