import { chapterAt, fillEnds, fromEmbedded, isAdTitle, parseChaptersJson } from './chapters';

describe('chapters', () => {
  it('reads Podcasting 2.0 JSON, hiding toc:false markers', () => {
    const json = JSON.stringify({
      version: '1.2.0',
      chapters: [
        { startTime: 300, title: 'Interview', img: 'https://x.example/a.jpg' },
        { startTime: 0, title: 'Intro' },
        { startTime: 120, title: 'Sponsor: Acme', toc: false },
        { startTime: 900, title: 'Wrap-up', endTime: 960, url: 'https://x.example' },
      ],
    });
    expect(parseChaptersJson(json)).toEqual([
      { start: 0, end: 300, title: 'Intro', imageUrl: null, url: null },
      { start: 300, end: 900, title: 'Interview', imageUrl: 'https://x.example/a.jpg', url: null },
      { start: 900, end: 960, title: 'Wrap-up', imageUrl: null, url: 'https://x.example' },
    ]);
  });

  it('ignores bad JSON', () => {
    expect(parseChaptersJson('nope')).toEqual([]);
    expect(parseChaptersJson('{"chapters": 3}')).toEqual([]);
  });

  it('converts chapters found in the file', () => {
    expect(
      fromEmbedded([
        { startMs: 0, endMs: 0, title: 'A' },
        { startMs: 61_500, endMs: 90_000, title: null },
      ]),
    ).toEqual([
      { start: 0, end: 61.5, title: 'A', imageUrl: null, url: null },
      { start: 61.5, end: 90, title: null, imageUrl: null, url: null },
    ]);
  });

  it('fills missing ends from the next start', () => {
    expect(
      fillEnds([{ start: 0, end: null, title: null, imageUrl: null, url: null }])[0].end,
    ).toBeNull();
  });

  it.each([
    ['Sponsor break', true],
    ['A word from our sponsors', true],
    ['AD BREAK', true],
    ['Promo: other show', true],
    ['Adam joins us', false],
    [null, false],
  ])('ad title %s → %s', (title, expected) => {
    expect(isAdTitle(title, ['sponsor', 'advertisement', 'ad break', 'promo'])).toBe(expected);
  });

  it('finds the chapter at a position', () => {
    const chapters = [
      { start_s: 0, end_s: 60 },
      { start_s: 60, end_s: null },
    ];
    expect(chapterAt(chapters, 30)?.index).toBe(0);
    expect(chapterAt(chapters, 61)?.index).toBe(1);
    expect(chapterAt([], 5)).toBeNull();
  });
});
