import type { Cue } from './passages';

/** Transcripts as files people can keep: plain text with timestamps, or SRT subtitles. */

function stamp(seconds: number, srt = false): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  if (srt) return `${pad(h)}:${pad(m)}:${pad(s)},${pad(Math.round((total % 1) * 1000), 3)}`;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export type TranscriptMeta = { title: string; podcast: string; source: string };

export function toText(cues: Cue[], meta: TranscriptMeta): string {
  const lines = cues.map((c) => {
    const time = c.start >= 0 ? `[${stamp(c.start)}] ` : '';
    const who = c.speaker ? `${c.speaker}: ` : '';
    return `${time}${who}${c.text}`;
  });
  return `${meta.title}\n${meta.podcast}\n(${meta.source})\n\n${lines.join('\n\n')}\n`;
}

/** SubRip subtitles; untimed (HTML) transcripts have nothing to time, so they return null. */
export function toSrt(cues: Cue[]): string | null {
  const timed = cues.filter((c) => c.start >= 0 && c.end > c.start);
  if (timed.length === 0) return null;
  return (
    timed
      .map(
        (c, i) =>
          `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.speaker ? `${c.speaker}: ` : ''}${c.text}`,
      )
      .join('\n\n') + '\n'
  );
}

/** A file name from an episode title: letters, numbers and dashes only. */
export function fileName(title: string, ext: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${base || 'transcript'}.${ext}`;
}
