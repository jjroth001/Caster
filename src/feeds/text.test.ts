import { htmlToText, parseDate, parseDuration } from './text';

describe('parseDuration', () => {
  it.each([
    ['3723', 3723],
    ['3723.6', 3724],
    ['62:03', 3723],
    ['1:02:03', 3723],
    ['00:00:00', null],
    ['', null],
    ['about an hour', null],
    ['1:2:3:4', null],
    [undefined, null],
  ])('%s → %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });
});

describe('parseDate', () => {
  it.each([
    ['Wed, 15 Oct 2026 10:00:00 +0000', Date.UTC(2026, 9, 15, 10)],
    ['Wed, 15 Oct 2026 10:00:00 GMT', Date.UTC(2026, 9, 15, 10)],
    ['15 Oct 2026 10:00 -0500', Date.UTC(2026, 9, 15, 15)],
    ['Thu, 1 October 2026 07:05:09 PDT', Date.UTC(2026, 9, 1, 14, 5, 9)],
    ['Mon, 05 Jan 26 00:00:00 +0000', Date.UTC(2026, 0, 5)],
    ['2026-10-15T10:00:00Z', Date.UTC(2026, 9, 15, 10)],
    ['not a date', null],
    ['', null],
  ])('%s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });
});

describe('htmlToText', () => {
  it('keeps paragraphs and lists, drops tags and scripts', () => {
    const html =
      '<p>Hello&nbsp;there &amp; welcome.</p><script>x()</script><ul><li>One</li><li>Two</li></ul>Line<br/>break';
    expect(htmlToText(html)).toBe('Hello there & welcome.\n\n• One\n\n• Two\n\nLine\nbreak');
  });

  it('decodes numeric entities', () => {
    expect(htmlToText('It&#8217;s &#x2014; fine')).toBe('It’s — fine');
  });
});
