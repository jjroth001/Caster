import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

import { showSheet } from '@/components/sheet';
import { fileName, toSrt, toText, type TranscriptMeta } from '@/transcripts/export';
import type { Cue } from '@/transcripts/passages';

type Row = {
  episode_id: number;
  source: string;
  format: string;
  cues_json: string;
  title: string;
  podcast: string;
};

const SELECT = `
  SELECT t.episode_id, t.source, t.format, t.cues_json, e.title, p.title AS podcast
  FROM transcript t JOIN episode e ON e.id = t.episode_id JOIN podcast p ON p.id = e.podcast_id`;

const sourceLabel = (r: Row) =>
  r.source === 'generated'
    ? 'Transcript made on this phone with Whisper'
    : 'Transcript from the publisher';

async function shareText(name: string, contents: string, mimeType: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

/** Asks text or subtitles, then shares one episode's transcript as a file. */
export async function shareTranscript(db: SQLiteDatabase, episodeId: number) {
  const row = await db.getFirstAsync<Row>(`${SELECT} WHERE t.episode_id = ?`, episodeId);
  if (!row) return;
  const cues = JSON.parse(row.cues_json) as Cue[];
  const meta: TranscriptMeta = { title: row.title, podcast: row.podcast, source: sourceLabel(row) };
  const srt = toSrt(cues);
  showSheet({
    title: 'Export transcript',
    options: [
      {
        label: 'Text file',
        hint: 'Readable, with timestamps (.txt)',
        icon: 'file-text',
        onPress: () => void shareText(fileName(row.title, 'txt'), toText(cues, meta), 'text/plain'),
      },
      ...(srt
        ? [
            {
              label: 'Subtitles',
              hint: 'For video editors and players (.srt)',
              icon: 'chat-text' as const,
              onPress: () =>
                void shareText(fileName(row.title, 'srt'), srt, 'application/x-subrip'),
            },
          ]
        : []),
    ],
  });
}

/** Every transcript in one text file, newest episodes first. */
export async function shareAllTranscripts(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<Row>(`${SELECT} ORDER BY e.pub_date DESC`);
  if (rows.length === 0) {
    Alert.alert('No transcripts yet');
    return;
  }
  const divider = '\n\n' + '─'.repeat(40) + '\n\n';
  const text = rows
    .map((r) =>
      toText(JSON.parse(r.cues_json) as Cue[], {
        title: r.title,
        podcast: r.podcast,
        source: sourceLabel(r),
      }),
    )
    .join(divider);
  const date = new Date().toISOString().slice(0, 10);
  await shareText(`podwizard-transcripts-${date}.txt`, text, 'text/plain');
}
