import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { feedList } from '@/db/library';
import { parseOpml, toOpml } from '@/feeds/opml';
import { createBackup, parseBackup, restoreBackup, type RestoreProgress } from '@/db/backup';
import { openFeed, subscribeToFeed } from '@/feeds/sync';

/** Writes `contents` to a cache file and opens Android's share sheet (Drive, email, Files…). */
async function shareFile(name: string, contents: string, mimeType: string, dialogTitle: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

/** Picked files are read directly, or through fetch() where Expo Go's sandbox blocks that. */
async function readPickedFile(uri: string): Promise<string> {
  try {
    return await new File(uri).text();
  } catch (error) {
    const response = await fetch(uri).catch(() => null);
    if (!response) throw error;
    return response.text();
  }
}

export async function shareOpml(db: SQLiteDatabase) {
  const feeds = await feedList(db);
  const date = new Date().toISOString().slice(0, 10);
  await shareFile(
    `podwizard-subscriptions-${date}.opml`,
    toOpml(feeds),
    'text/x-opml',
    'Save subscriptions',
  );
}

export type ImportProgress = { done: number; total: number; failed: string[] };

/**
 * Lets the user pick an OPML file (every podcast app can export one) and follows each feed in
 * it. Returns null if they cancel.
 */
export async function importOpml(
  db: SQLiteDatabase,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportProgress | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // OPML files come labelled all sorts of ways depending on where they're stored.
    type: ['text/x-opml', 'text/xml', 'application/xml', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const feeds = parseOpml(await readPickedFile(result.assets[0].uri));
  if (feeds.length === 0) throw new Error('No podcasts were found in this file.');
  const progress: ImportProgress = { done: 0, total: feeds.length, failed: [] };
  onProgress({ ...progress });
  let next = 0;
  const worker = async () => {
    while (next < feeds.length) {
      const feed = feeds[next++];
      try {
        await subscribeToFeed(db, feed.feedUrl);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'unknown error';
        progress.failed.push(`${feed.title ?? feed.feedUrl} (${reason})`);
      }
      progress.done++;
      onProgress({ ...progress, failed: [...progress.failed] });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, feeds.length) }, worker));
  return progress;
}

export async function shareBackup(db: SQLiteDatabase) {
  const backup = await createBackup(db);
  const date = new Date().toISOString().slice(0, 10);
  await shareFile(
    `podwizard-backup-${date}.json`,
    JSON.stringify(backup),
    'application/json',
    'Save Pod Wizard backup',
  );
}

/** Lets the user pick a Pod Wizard backup and merges it in. Returns null if they cancel. */
export async function restoreFromFile(
  db: SQLiteDatabase,
  onProgress: (p: RestoreProgress) => void,
) {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const backup = parseBackup(await readPickedFile(result.assets[0].uri));
  return restoreBackup(db, backup, (url) => openFeed(db, url), onProgress);
}
