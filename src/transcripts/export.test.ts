import { fileName, toSrt, toText } from './export';

const cues = [
  { start: 0, end: 4.25, text: 'Welcome back.', speaker: 'Rae' },
  { start: 3725.5, end: 3727, text: 'Thanks for listening.', speaker: null },
];

describe('transcript export', () => {
  it('writes plain text with timestamps and speakers', () => {
    expect(
      toText(cues, { title: 'Ep 1', podcast: 'Low Tide Radio', source: 'Publisher transcript' }),
    ).toBe(
      'Ep 1\nLow Tide Radio\n(Publisher transcript)\n\n[0:00] Rae: Welcome back.\n\n[1:02:05] Thanks for listening.\n',
    );
  });

  it('writes SRT subtitles, or nothing for untimed transcripts', () => {
    expect(toSrt(cues)).toBe(
      '1\n00:00:00,000 --> 00:00:04,250\nRae: Welcome back.\n\n2\n01:02:05,500 --> 01:02:07,000\nThanks for listening.\n',
    );
    expect(toSrt([{ start: -1, end: -1, text: 'Untimed.' }])).toBeNull();
  });

  it('makes safe file names', () => {
    expect(fileName('The lighthouse keeper’s log: part 2!', 'txt')).toBe(
      'The-lighthouse-keepers-log-part-2.txt',
    );
    expect(fileName('???', 'srt')).toBe('transcript.srt');
  });
});
