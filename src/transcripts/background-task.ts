import { openDatabaseAsync } from 'expo-sqlite';
import { DeviceEventEmitter } from 'react-native';

import { migrateDbIfNeeded } from '@/db/migrations';

import { cancelRepeatedAds, detectRepeatedAds } from '@/ads/repeats';
import { getSettings } from '@/db/settings';

import { runAutoTranscribe } from './auto';
import { cancelTranscription } from './whisper';

/**
 * Runs from the charging worker (modules/player-core TranscribeWorker), usually with Caster
 * closed: fingerprints downloads for repeated-ad detection, then transcribes (if set to "any
 * time"). Returns when done; the worker asks it to stop (CasterStopTranscribe) on unplugging.
 */
export async function backgroundTranscribeTask(): Promise<void> {
  const db = await openDatabaseAsync('caster.db');
  await migrateDbIfNeeded(db);
  const stop = DeviceEventEmitter.addListener('CasterStopTranscribe', () => {
    cancelTranscription();
    cancelRepeatedAds();
  });
  try {
    // Fingerprints first: quick, and they make ad skipping better for every episode.
    await detectRepeatedAds(db);
    if ((await getSettings(db)).autoTranscribe === 'always') await runAutoTranscribe(db);
  } finally {
    stop.remove();
  }
}
