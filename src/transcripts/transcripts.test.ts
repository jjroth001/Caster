import { brandsIn, findAdSegments, phrasePattern, scoreSentence } from './ads';
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

  // A made-up show with a made-up sponsor, shaped like real reads: the product talk comes first
  // and the web address and code only at the end.
  const talk = (start: number, end: number) => ({
    start,
    end,
    text: 'And that is why the old harbour lights still matter to the town.',
  });
  const brewlessRead = [
    { start: 600, end: 605, text: 'But I won’t keep you waiting, let me tell you about Brewless.' },
    {
      start: 605,
      end: 612,
      text: 'Brewless is a calm morning drink with a fraction of the caffeine.',
    },
    { start: 612, end: 620, text: 'It tastes like a spiced cocoa and it is easy to make.' },
    { start: 620, end: 630, text: 'We keep a tin of brew less in the cupboard all the time.' },
    { start: 630, end: 640, text: 'The starter kit comes with a frother and a few extras.' },
    { start: 640, end: 646, text: 'Go to brewless.com/harbour and use code HARBOUR for 30% off.' },
  ];

  it('skips the whole read, not just the part with the web address', () => {
    const ads = findAdSegments([talk(0, 590), ...brewlessRead, talk(650, 900)]);
    expect(ads).toHaveLength(1);
    expect(ads[0]).toMatchObject({ start: 600, end: 646 });
  });

  it('joins two sponsors back to back, including a short stretch between them', () => {
    const second = [
      {
        start: 670,
        end: 680,
        text: 'Now, a word about Lanternly, the reading lamp I use every night.',
      },
      {
        start: 680,
        end: 690,
        text: 'Visit lanternly.com/harbour to get yours with free shipping.',
      },
    ];
    const ads = findAdSegments([talk(0, 590), ...brewlessRead, talk(646, 670), ...second]);
    expect(ads).toHaveLength(1);
    expect(ads[0]).toMatchObject({ start: 600, end: 690 });
  });

  it('recognises a known sponsor named again and again, even with no web address', () => {
    const read = [
      { start: 300, end: 310, text: 'This part of the show is thanks to Kettlewise.' },
      { start: 310, end: 320, text: 'Kettlewise has made my evenings so much calmer.' },
      { start: 320, end: 330, text: 'Give Kettlewise a try, you won’t regret it.' },
    ];
    expect(findAdSegments([talk(0, 290), ...read, talk(340, 600)], ['kettlewise'])).toEqual([
      expect.objectContaining({ start: 300, end: 330 }),
    ]);
    // Named once in ordinary talk, it's not an ad.
    expect(
      findAdSegments(
        [talk(0, 290), { start: 300, end: 310, text: 'I saw a Kettlewise van today.' }],
        ['kettlewise'],
      ),
    ).toEqual([]);
  });

  it('finds the brand an ad names', () => {
    expect(brandsIn('Again, that is brewless.com/harbour for 30% off.')).toEqual(['brewless']);
    expect(brandsIn('This video is sponsored by my friends over at Lanternly.')).toEqual([
      'lanternly',
    ]);
    expect(brandsIn('That is Moss T M O S S and Co.com/harbour.')).toEqual(['moss']);
    expect(brandsIn('Just visit HCU.edu to learn more.')).toEqual(['hcu']);
  });

  it('treats your own phrases as signs of an ad read', () => {
    const read = [
      { start: 0, end: 120, text: 'And that is how the lighthouse got its second lamp.' },
      { start: 300, end: 310, text: 'A quick word about our friends at Driftwood Tea.' },
      { start: 310, end: 320, text: 'Driftwood Tea blends are smooth and calming.' },
      { start: 320, end: 330, text: 'I drink Driftwood Tea every evening.' },
      { start: 340, end: 600, text: 'Anyway, back to the storm of 1903.' },
    ];
    expect(findAdSegments(read, [])).toEqual([]);
    expect(findAdSegments(read, [], ['our friends at', 'driftwood'])).toEqual([
      expect.objectContaining({ start: 300, end: 330 }),
    ]);
  });

  it('matches phrases as whole words, any case and spacing', () => {
    expect(phrasePattern('our friends at').test('Our  friends AT Driftwood')).toBe(true);
    expect(phrasePattern('ad').test('I added a lamp')).toBe(false);
    expect(phrasePattern('c++ deals').test('big c++ deals today')).toBe(true);
  });
});
