import { passageFrom, titleFrom } from './passages';

const cues = [
  { start: 0, end: 4, text: 'Welcome back to the show.' },
  { start: 4, end: 9, text: 'Today we talk about lighthouses.' },
  { start: 9, end: 15, text: 'The first one was built in Egypt; it stood for centuries.' },
  { start: 30, end: 34, text: 'Much later.' },
];

describe('smart bookmark passages', () => {
  it('takes what was said in the 20 seconds before', () => {
    expect(passageFrom(cues, 14)).toBe(
      'Welcome back to the show. Today we talk about lighthouses. The first one was built in Egypt; it stood for centuries.',
    );
    expect(passageFrom(cues, 32)).toBe(
      'The first one was built in Egypt; it stood for centuries. Much later.',
    );
    expect(passageFrom(cues, 100)).toBeNull();
  });

  it('titles a bookmark with the first clause, up to 60 characters', () => {
    expect(titleFrom('Today we talk about lighthouses. And more.')).toBe(
      'Today we talk about lighthouses.',
    );
    const long =
      'This sentence goes on and on without any punctuation for quite a long time indeed';
    const title = titleFrom(long);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith('…')).toBe(true);
  });
});
