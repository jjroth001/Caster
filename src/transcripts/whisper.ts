import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { PlayerCore } from '@modules/player-core/src';
import { getSettings } from '@/db/settings';

import { mergeSameSpeaker } from './parse';
import type { Cue } from './passages';
import { detectTranscriptAds } from './transcripts';

/**
 * Generated transcripts with whisper.cpp (whisper.rn, MIT), entirely on the phone. Models are
 * an opt-in download from the whisper.cpp project on Hugging Face; nothing else leaves the phone.
 */

export type SpeechModel = { id: string; label: string; hint: string; sizeMb: number };

export const SPEECH_MODELS: SpeechModel[] = [
  { id: 'tiny.en', label: 'Tiny', hint: 'English · fastest', sizeMb: 75 },
  { id: 'base.en', label: 'Base', hint: 'English · more accurate', sizeMb: 142 },
  { id: 'small.en', label: 'Small', hint: 'English · most accurate, slow', sizeMb: 466 },
  { id: 'base', label: 'Base (all languages)', hint: 'Any language', sizeMb: 142 },
];

export const speechAvailable = !!PlayerCore;

const modelKey = (id: string) => `model:${id}`;
const modelUrl = (id: string) =>
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`;

/** File URI of a downloaded model, or null. */
export function modelUri(id: string): string | null {
  return PlayerCore?.listDownloads().find((d) => d.key === modelKey(id))?.uri ?? null;
}

export function downloadModel(model: SpeechModel) {
  PlayerCore?.download({
    key: modelKey(model.id),
    url: modelUrl(model.id),
    mime: 'application/octet-stream',
    title: `Speech model (${model.label}, ${model.sizeMb} MB)`,
    wifiOnly: false,
    chargingOnly: false,
  });
}

export function deleteModel(id: string) {
  PlayerCore?.deleteDownload(modelKey(id));
}

type WhisperContext = {
  transcribe: (
    path: string,
    options: { language?: string; onProgress?: (p: number) => void; maxLen?: number },
  ) => {
    stop: () => Promise<void>;
    promise: Promise<{ segments: { text: string; t0: number; t1: number }[] }>;
  };
  release: () => Promise<void>;
};

let loaded: { uri: string; context: WhisperContext } | null = null;

async function contextFor(uri: string): Promise<WhisperContext> {
  if (loaded?.uri === uri) return loaded.context;
  await loaded?.context.release();
  // Loaded on demand: whisper.rn's native code isn't in Expo Go.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initWhisper } = require('whisper.rn') as {
    initWhisper: (o: { filePath: string }) => Promise<WhisperContext>;
  };
  const context = await initWhisper({ filePath: uri.replace(/^file:\/\//, '') });
  loaded = { uri, context };
  return context;
}

/** whisper.cpp segment times are in hundredths of a second. */
export function cuesFromSegments(segments: { text: string; t0: number; t1: number }[]): Cue[] {
  return mergeSameSpeaker(
    segments
      .map((s) => ({ start: s.t0 / 100, end: s.t1 / 100, text: s.text.trim(), speaker: null }))
      .filter((c) => c.text && !/^\[(music|blank_audio|silence)\]$/i.test(c.text)),
  );
}

let running: { episodeId: number; stop: () => Promise<void> } | null = null;

export function cancelTranscription() {
  void running?.stop();
}

/**
 * Transcribes a downloaded episode. Progress runs 0–1 (converting the audio, then recognising
 * speech). Keeps the app awake only while it runs; a publisher transcript is never replaced.
 */
export async function generateTranscript(
  db: SQLiteDatabase,
  episodeId: number,
  onProgress: (p: number, step: string) => void,
): Promise<Cue[]> {
  if (!PlayerCore) throw new Error('Generated transcripts need the installed app.');
  const settings = await getSettings(db);
  const model = SPEECH_MODELS.find((m) => m.id === settings.speechModel) ?? null;
  const uri = model ? modelUri(model.id) : null;
  if (!model || !uri) throw new Error('Download a speech model in Settings first.');
  const row = await db.getFirstAsync<{ local_path: string | null }>(
    'SELECT local_path FROM episode_state WHERE episode_id = ?',
    episodeId,
  );
  if (!row?.local_path)
    throw new Error('Download the episode first; transcripts are made from the file.');

  onProgress(0, 'Preparing the audio…');
  const sub = PlayerCore.addListener('onSpeechProgress', ({ progress }) =>
    onProgress(progress * 0.2, 'Preparing the audio…'),
  );
  let wav: string;
  try {
    wav = await PlayerCore.decodeForSpeech(row.local_path);
  } finally {
    sub.remove();
  }
  try {
    const context = await contextFor(uri);
    onProgress(0.2, 'Listening…');
    const job = context.transcribe(wav, {
      language: model.id.endsWith('.en') ? 'en' : 'auto',
      maxLen: 0,
      onProgress: (p) => onProgress(0.2 + (p / 100) * 0.8, 'Listening…'),
    });
    running = { episodeId, stop: job.stop };
    const { segments } = await job.promise;
    const cues = cuesFromSegments(segments);
    if (cues.length === 0) throw new Error('No speech was found in this episode.');
    await db.runAsync(
      `INSERT INTO transcript (episode_id, source, format, cues_json, fetched_at)
       SELECT ?, 'generated', ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM transcript WHERE episode_id = ? AND source = 'publisher')`,
      episodeId,
      `whisper-${model.id}`,
      JSON.stringify(cues),
      Date.now(),
      episodeId,
    );
    if (settings.adSkip) await detectTranscriptAds(db, episodeId, cues);
    return cues;
  } finally {
    running = null;
    try {
      new File(`file://${wav}`).delete();
    } catch {
      // the cache is cleared by Android eventually
    }
  }
}
