import type { SQLiteDatabase } from 'expo-sqlite';

import { inTransaction } from './library';

/** Behaves like expo-sqlite: a second BEGIN while one transaction is open fails. */
function fakeDb() {
  let open = false;
  const log: string[] = [];
  const db = {
    async withTransactionAsync(work: () => Promise<void>) {
      if (open) throw new Error('cannot start a transaction within a transaction');
      open = true;
      try {
        await work();
      } finally {
        open = false;
      }
    },
  } as unknown as SQLiteDatabase;
  return { db, log };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('inTransaction', () => {
  it('runs overlapping saves one after another instead of failing', async () => {
    const { db, log } = fakeDb();
    const save = (name: string, ms: number) =>
      inTransaction(db, async () => {
        log.push(`start ${name}`);
        await pause(ms);
        log.push(`end ${name}`);
        return name;
      });
    const results = await Promise.all([save('a', 20), save('b', 5), save('c', 1)]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps going after a failed save', async () => {
    const { db } = fakeDb();
    const failing = inTransaction(db, async () => {
      throw new Error('bad feed');
    });
    const next = inTransaction(db, async () => 'ok');
    await expect(failing).rejects.toThrow('bad feed');
    await expect(next).resolves.toBe('ok');
  });
});
