import { BACKUP_FORMAT, mergeState, parseBackup } from './backup';

const valid = {
  app: 'Caster',
  format: BACKUP_FORMAT,
  exportedAt: 1,
  podcasts: [
    {
      feedUrl: 'https://lt.example/feed',
      title: 'Low Tide Radio',
      subscribed: 1,
      folder: null,
      settings: {},
    },
  ],
  folders: [],
  playlists: [],
  episodes: [],
  bookmarks: [],
  queue: [],
  adVerdicts: [],
  settings: { speed: 1.5 },
};

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    expect(parseBackup(JSON.stringify(valid)).podcasts).toHaveLength(1);
  });

  it.each([
    ['not json', /valid JSON/],
    [JSON.stringify({ hello: 'world' }), /isn’t a Caster backup/],
    [JSON.stringify({ ...valid, format: 99 }), /newer version/],
    [JSON.stringify({ ...valid, episodes: undefined }), /damaged/],
    [JSON.stringify({ ...valid, podcasts: [{ title: 'x' }] }), /damaged/],
  ])('rejects %s', (text, message) => {
    expect(() => parseBackup(text)).toThrow(message);
  });
});

describe('mergeState', () => {
  const base = {
    position_s: 100,
    played: 0,
    played_at: null,
    starred: 0,
    archived: 0,
    updated_at: 10,
  };

  it('keeps the furthest position', () => {
    expect(mergeState(base, { ...base, position_s: 300, updated_at: 5 })).toMatchObject({
      position_s: 300,
    });
    expect(mergeState({ ...base, position_s: 500 }, { ...base, position_s: 300 })).toBeNull();
  });

  it('keeps played and starred from either side', () => {
    expect(mergeState(base, { ...base, played: 1, played_at: 20 })).toMatchObject({
      played: 1,
      played_at: 20,
    });
    expect(mergeState({ ...base, starred: 1 }, base)).toBeNull();
  });

  it('takes the incoming state when there is none here', () => {
    expect(mergeState(null, base)).toEqual(base);
  });
});
