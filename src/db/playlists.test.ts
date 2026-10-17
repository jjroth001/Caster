import { compileRules, DEFAULT_RULES, parseRules } from './playlists';

describe('smart playlist rules', () => {
  const now = Date.UTC(2026, 9, 17);

  it('compiles the defaults: followed, unplayed or in progress, newest first', () => {
    const q = compileRules(DEFAULT_RULES, now);
    expect(q.where).toContain('p.subscribed = 1');
    expect(q.where).toContain('s.position_s > 5');
    expect(q.where).not.toContain('s.played, 0) = 1');
    expect(q.order).toBe('e.pub_date DESC');
    expect(q.params).toEqual([]);
  });

  it('compiles every rule with parameters, never inlined values', () => {
    const q = compileRules(
      {
        ...DEFAULT_RULES,
        podcasts: [3, 7],
        played: true,
        downloaded: 'yes',
        starredOnly: true,
        releasedWithinDays: 7,
        minMinutes: 10,
        maxMinutes: 25,
        mediaType: 'video',
        sort: 'shortest',
        limit: 9999,
      },
      now,
    );
    expect(q.where).toContain('e.podcast_id IN (?, ?)');
    expect(q.where).toContain('s.local_path IS NOT NULL');
    expect(q.where).toContain('s.starred = 1');
    expect(q.params).toEqual([3, 7, now - 7 * 86_400_000, 600, 1500, 'video']);
    expect(q.order).toBe('e.duration_s ASC');
    expect(q.limit).toBe(500);
  });

  it('matches nothing when no status or podcast is chosen', () => {
    expect(compileRules({ ...DEFAULT_RULES, unplayed: false, inProgress: false }).where).toContain(
      'AND 0',
    );
    expect(compileRules({ ...DEFAULT_RULES, podcasts: [] }).where).toContain('AND 0');
  });

  it('reads stored rules, filling in new fields', () => {
    expect(parseRules('{"maxMinutes": 25}')).toEqual({ ...DEFAULT_RULES, maxMinutes: 25 });
    expect(parseRules('garbage')).toEqual(DEFAULT_RULES);
  });
});
