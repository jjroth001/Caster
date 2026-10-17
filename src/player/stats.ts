import type { SQLiteDatabase } from 'expo-sqlite';

import type { PlayerState } from './engine';

/**
 * Listening stats, counted from the player's own updates: real time listened, and time saved
 * by speed, trim silence and skips (intro, outro, unticked chapters, ads). Kept per episode per
 * day in listen_event.
 */

type Pending = { listened: number; speed: number; silence: number; skip: number };

let current: { id: number; wall: number; pos: number } | null = null;
const pending = new Map<number, Pending>();
let lastFlush = 0;

const bucket = (id: number) => {
  let p = pending.get(id);
  if (!p) pending.set(id, (p = { listened: 0, speed: 0, silence: 0, skip: 0 }));
  return p;
};

/** Pure: what one player update adds, given the previous one. Exported for tests. */
export function measure(
  prev: { wall: number; pos: number },
  now: { wall: number; pos: number },
  speed: number,
  trimming: boolean,
): Pending {
  const wall = (now.wall - prev.wall) / 1000;
  const media = now.pos - prev.pos;
  // Updates come about twice a second; a longer gap means a pause or a stall, not listening.
  if (wall <= 0 || wall > 5) return { listened: 0, speed: 0, silence: 0, skip: 0 };
  const expected = wall * speed;
  // Media running well ahead of the clock is a seek or skip (counted elsewhere), not silence.
  const extra = media - expected;
  const silence = trimming && extra > 0 && extra < wall * 2 ? extra : 0;
  return { listened: wall, speed: Math.max(0, expected - wall), silence, skip: 0 };
}

export function trackState(state: PlayerState) {
  const id = state.id ? Number(state.id) : null;
  if (!id || !state.playing) {
    current = null;
    return;
  }
  const now = { wall: Date.now(), pos: state.positionMs / 1000 };
  if (current?.id === id) {
    const m = measure(current, now, state.speed, state.trimSilence !== 'off');
    const b = bucket(id);
    b.listened += m.listened;
    b.speed += m.speed;
    b.silence += m.silence;
  }
  current = { id, ...now };
}

/** Time jumped over by a skip rule (intro, outro, chapter, ad). */
export function trackSkip(episodeId: number, seconds: number) {
  if (seconds > 0) bucket(episodeId).skip += seconds;
  if (current?.id === episodeId) current = null; // the jump isn't listening time
}

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Writes what's been counted (every ~30 s while playing, and on pause). */
export async function flushStats(db: SQLiteDatabase, force = false) {
  if (!force && Date.now() - lastFlush < 30_000) return;
  lastFlush = Date.now();
  const day = startOfDay(Date.now());
  const entries = [...pending.entries()];
  pending.clear();
  for (const [id, p] of entries) {
    if (p.listened + p.skip < 0.5) continue;
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM listen_event WHERE episode_id = ? AND started_at = ?',
      id,
      day,
    );
    if (row) {
      await db.runAsync(
        `UPDATE listen_event SET listened_s = listened_s + ?, saved_speed_s = saved_speed_s + ?,
           saved_silence_s = saved_silence_s + ?, saved_skip_s = saved_skip_s + ? WHERE id = ?`,
        p.listened,
        p.speed,
        p.silence,
        p.skip,
        row.id,
      );
    } else {
      await db.runAsync(
        `INSERT INTO listen_event (episode_id, started_at, listened_s, saved_speed_s, saved_silence_s, saved_skip_s)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        day,
        p.listened,
        p.speed,
        p.silence,
        p.skip,
      );
    }
  }
}

export type StatsSummary = {
  listened: number;
  speed: number;
  silence: number;
  skip: number;
  days: { day: number; listened: number }[];
  top: { title: string; artwork: string | null; listened: number }[];
};

export async function loadStats(
  db: SQLiteDatabase,
  sinceDays: number | null,
): Promise<StatsSummary> {
  const since = sinceDays == null ? 0 : startOfDay(Date.now()) - (sinceDays - 1) * 86_400_000;
  const totals = await db.getFirstAsync<{
    l: number | null;
    sp: number | null;
    si: number | null;
    sk: number | null;
  }>(
    `SELECT SUM(listened_s) AS l, SUM(saved_speed_s) AS sp, SUM(saved_silence_s) AS si, SUM(saved_skip_s) AS sk
     FROM listen_event WHERE started_at >= ?`,
    since,
  );
  const days = await db.getAllAsync<{ day: number; listened: number }>(
    `SELECT started_at AS day, SUM(listened_s) AS listened FROM listen_event
     WHERE started_at >= ? GROUP BY started_at ORDER BY started_at`,
    startOfDay(Date.now()) - 13 * 86_400_000,
  );
  const top = await db.getAllAsync<{ title: string; artwork: string | null; listened: number }>(
    `SELECT p.title, p.artwork_url AS artwork, SUM(l.listened_s) AS listened
     FROM listen_event l JOIN episode e ON e.id = l.episode_id JOIN podcast p ON p.id = e.podcast_id
     WHERE l.started_at >= ? GROUP BY p.id ORDER BY listened DESC LIMIT 5`,
    since,
  );
  return {
    listened: totals?.l ?? 0,
    speed: totals?.sp ?? 0,
    silence: totals?.si ?? 0,
    skip: totals?.sk ?? 0,
    days,
    top,
  };
}
