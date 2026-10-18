import { basicAuth, hostOf, sameSite, splitLogin } from './credentials';

jest.mock('expo-secure-store', () => ({}));

describe('private feed sign-ins', () => {
  it('takes a sign-in out of the address', () => {
    expect(splitLogin('https://reader:s%3Acret@feeds.example.org/private.xml')).toEqual({
      url: 'https://feeds.example.org/private.xml',
      login: { username: 'reader', password: 's:cret' },
    });
    expect(splitLogin('https://feeds.example.org/open.xml')).toEqual({
      url: 'https://feeds.example.org/open.xml',
      login: null,
    });
  });

  it('builds the Basic header, for any characters', () => {
    expect(basicAuth({ username: 'reader', password: 'secret' })).toBe(
      'Basic cmVhZGVyOnNlY3JldA==',
    );
    expect(basicAuth({ username: 'zoë', password: 'pw' })).toBe('Basic em/Dqzpwdw==');
  });

  it('finds the host an address belongs to', () => {
    expect(hostOf('https://Media.Example.org:8443/ep1.mp3?t=1')).toBe('media.example.org');
    expect(hostOf('https://a:b@feeds.example.org/x')).toBe('feeds.example.org');
    expect(hostOf('not a url')).toBeNull();
  });

  it('keeps a sign-in on the feed’s own site', () => {
    expect(sameSite('https://feeds.example.org/p.xml', 'https://media.example.org/ep1.mp3')).toBe(
      true,
    );
    expect(sameSite('https://feeds.example.org/p.xml', 'https://cdn.sharedhost.net/ep1.mp3')).toBe(
      false,
    );
    expect(sameSite('https://a.example.co.uk/p.xml', 'https://b.example.co.uk/1.mp3')).toBe(true);
    expect(sameSite('https://a.example.co.uk/p.xml', 'https://other.co.uk/1.mp3')).toBe(false);
  });
});
