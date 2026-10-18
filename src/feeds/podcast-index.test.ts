import { mergeResults, sha1Hex, signedHeaders } from './podcast-index';

jest.mock('expo-secure-store', () => ({}));

describe('Podcast Index', () => {
  it('computes SHA-1 like the standard test vectors', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    );
    expect(sha1Hex('a'.repeat(1000))).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba');
  });

  it('signs requests with the key, secret and time', () => {
    const h = signedHeaders({ key: 'KEY', secret: 'SECRET' }, 1700000000);
    expect(h['X-Auth-Date']).toBe('1700000000');
    expect(h.Authorization).toBe(sha1Hex('KEYSECRET1700000000'));
  });

  it('adds only the shows Apple didn’t have', () => {
    const apple = [
      {
        appleId: '1',
        title: 'Low Tide',
        author: 'Harbour',
        artworkUrl: null,
        feedUrl: 'https://a.example/low.xml',
      },
    ];
    const index = [
      {
        appleId: 'pi1',
        title: 'Low Tide',
        author: 'Harbour',
        artworkUrl: null,
        feedUrl: 'http://a.example/low.xml/',
      },
      {
        appleId: 'pi2',
        title: 'Keeper’s Log',
        author: 'Lamp',
        artworkUrl: null,
        feedUrl: 'https://b.example/log',
      },
    ];
    expect(mergeResults(apple, index).map((p) => p.appleId)).toEqual(['1', 'pi2']);
  });
});
