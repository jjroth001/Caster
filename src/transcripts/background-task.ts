import { openDatabaseAsync } from 'expo-sqlite';
import { DeviceEventEmitter } from 'react-native';

import { migrateDbIfNeeded } from '@/db/migrations';

import { runAutoTranscribe } from './auto';
import { cancelTranscription } from './whisper';

/**
 * Runs from the transcription worker (modules/player-core TranscribeWorker) while the phone
 * charges, usually with Caster closed. Works through the waiting episodes and returns; the
 * worker asks it to stop (CasterStopTranscribe) when the phone is unplugged.
 */
export async function backgroundTranscribeTask(): Promise<void> {
  const db = await openDatabaseAsync('caster.db');
  await migrateDbIfNeeded(db);
  const stop = DeviceEventEmitter.addListener('CasterStopTranscribe', () => cancelTranscription());
  try {
    await runAutoTranscribe(db);
  } finally {
    stop.remove();
  }
}
