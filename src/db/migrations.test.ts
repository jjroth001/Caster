import type { SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS, migrateDbIfNeeded } from './migrations';

// Node's own SQLite stands in for expo-sqlite, which only runs on the phone.
type RawDb = {
  exec(sql: string): void;
  prepare(sql: string): { get(): unknown };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => RawDb };

/** The few expo-sqlite calls the migrations use, over a real in-memory database. */
function testDb() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => raw.exec(sql),
    getFirstAsync: async (sql: string) => raw.prepare(sql).get(),
    withTransactionAsync: async (work: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await work();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as SQLiteDatabase;
  return { raw, db };
}

describe('migration 6 (Discover)', () => {
  it('keeps podcasts made at version 5 and clears their feed caches', async () => {
    const { raw, db } = testDb();
    for (const sql of MIGRATIONS.slice(0, 5)) raw.exec(sql);
    raw.exec('PRAGMA user_version = 5');
    raw.exec(
      `INSERT INTO podcast (feed_url, title, subscribed, added_at, etag, last_modified)
       VALUES ('https://lowtide.example/feed.xml', 'Low Tide Radio', 1, 1, '"abc"', 'Tue')`,
    );

    await migrateDbIfNeeded(db);

    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    expect(
      raw.prepare('SELECT title, etag, last_modified, categories, podroll_json FROM podcast').get(),
    ).toEqual({
      title: 'Low Tide Radio',
      etag: null,
      last_modified: null,
      categories: null,
      podroll_json: null,
    });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM podroll_show').get()).toEqual({ n: 0 });
  });
});
