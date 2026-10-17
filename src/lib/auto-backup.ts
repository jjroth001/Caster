import { Directory, File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createBackup } from '@/db/backup';
import { getSettings, setSetting } from '@/db/settings';

/**
 * Automatic backups into a folder the user picks (Android's folder picker, so it can be a
 * synced folder such as Nextcloud or Syncthing). Runs when Caster opens or goes to the
 * background, once a day or week; keeps the newest few and removes older ones.
 */

/** How many automatic backups are kept in the folder. */
export const BACKUPS_KEPT = 7;
const PREFIX = 'caster-backup-';

const DAY_MS = 24 * 60 * 60 * 1000;

export function isBackupDue(
  every: 'off' | 'daily' | 'weekly',
  lastAt: number | null,
  now = Date.now(),
): boolean {
  if (every === 'off') return false;
  if (!lastAt) return true;
  // A little early is fine: "daily" shouldn't slip by an hour each day.
  return now - lastAt >= (every === 'daily' ? DAY_MS : 7 * DAY_MS) - 2 * 60 * 60 * 1000;
}

/** Of the files in the backup folder, the automatic backups to remove (oldest beyond the limit). */
export function backupsToRemove(names: string[], keep = BACKUPS_KEPT): string[] {
  return names
    .filter((n) => n.startsWith(PREFIX) && n.endsWith('.json'))
    .sort()
    .reverse()
    .slice(keep);
}

/** Opens Android's folder picker; saves the choice. Returns false if the user cancels. */
export async function chooseBackupFolder(db: SQLiteDatabase): Promise<boolean> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  await setSetting(db, 'autoBackupFolder', folder.uri);
  await setSetting(db, 'autoBackupFolderName', folderName(folder.uri));
  await setSetting(db, 'autoBackupError', null);
  return true;
}

/** A readable name for a picked folder ("Nextcloud/Caster" rather than a content:// address). */
export function folderName(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const tree = decoded.split('/tree/')[1] ?? decoded;
  const path = tree.split(':').slice(1).join(':') || tree;
  return path.replace(/\/document\/.*$/, '') || 'Chosen folder';
}

let running = false;

/** Writes a backup into the chosen folder now. Errors are saved for Settings to show. */
export async function writeAutoBackup(db: SQLiteDatabase): Promise<boolean> {
  const settings = await getSettings(db);
  if (!settings.autoBackupFolder || running) return false;
  running = true;
  try {
    const folder = new Directory(settings.autoBackupFolder);
    const name = `${PREFIX}${new Date().toISOString().slice(0, 10)}.json`;
    const backup = JSON.stringify(await createBackup(db));
    const existing = folder.list();
    // Today's backup is replaced rather than saved again as "(1)".
    existing.filter((f) => f instanceof File && f.name === name).forEach((f) => f.delete());
    folder.createFile(name, 'application/json').write(backup);
    const old = backupsToRemove(existing.map((f) => f.name).filter((n) => n !== name));
    existing.filter((f) => f instanceof File && old.includes(f.name)).forEach((f) => f.delete());
    await setSetting(db, 'lastAutoBackupAt', Date.now());
    await setSetting(db, 'autoBackupError', null);
    return true;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await setSetting(db, 'autoBackupError', `Couldn’t write to the backup folder (${reason}).`);
    return false;
  } finally {
    running = false;
  }
}

/** Backs up if one is due. */
export async function runAutoBackupIfDue(db: SQLiteDatabase) {
  const s = await getSettings(db);
  if (s.autoBackupFolder && isBackupDue(s.autoBackup, s.lastAutoBackupAt)) {
    await writeAutoBackup(db);
  }
}
