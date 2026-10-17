import { shareAtLink } from './share';

describe('shareAtLink', () => {
  it('adds a t= timestamp', () => {
    expect(shareAtLink({ link: 'https://x.example/ep/42', enclosure_url: 'a' }, 125.9)).toBe(
      'https://x.example/ep/42?t=125',
    );
    expect(shareAtLink({ link: 'https://x.example/?p=42#top', enclosure_url: 'a' }, 60)).toBe(
      'https://x.example/?p=42&t=60#top',
    );
    expect(shareAtLink({ link: null, enclosure_url: 'https://cdn.example/ep.mp3' }, 5)).toBe(
      'https://cdn.example/ep.mp3?t=5',
    );
  });
});
