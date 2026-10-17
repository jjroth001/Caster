import { htmlToText } from '@/feeds/text';

import type { Cue } from './passages';

/**
 * Publisher transcripts (Podcasting 2.0 <podcast:transcript>): WebVTT, SRT, JSON and HTML.
 * HTML has no timings, so its paragraphs come back with start = end = -1 (shown, not synced).
 */

function seconds(stamp: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(stamp.trim());
  if (!m) return null;
  const [, h, min, s, ms] = m;
  return (
    Number(h ?? 0) * 3600 +
    Number(min) * 60 +
    Number(s) +
    (ms ? Number(ms.padEnd(3, '0')) / 1000 : 0)
  );
}

const TIMING = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/;

/** WebVTT and SRT: blocks of an optional id, a timing line and text lines. */
export function parseTimedText(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timingIndex = lines.findIndex((l) => TIMING.test(l));
    if (timingIndex === -1) continue;
    const [, a, b] = TIMING.exec(lines[timingIndex])!;
    const start = seconds(a);
    const end = seconds(b);
    if (start == null || end == null) continue;
    let body = lines.slice(timingIndex + 1).join(' ');
    // WebVTT voice tags: <v Speaker Name>text
    let speaker: string | null = null;
    const voice = /<v(?:\.[\w.-]+)?\s+([^>]+)>/.exec(body);
    if (voice) speaker = voice[1].trim();
    body = htmlToText(body.replace(/<[^>]+>/g, ''));
    // "SPEAKER: text" style used by many SRT files
    const named = !speaker && /^([A-Z][\w .'-]{1,30}):\s+(.+)$/.exec(body);
    if (named) {
      speaker = named[1];
      body = named[2];
    }
    if (body) cues.push({ start, end, text: body, speaker });
  }
  return mergeSameSpeaker(cues);
}

/** Podcasting 2.0 JSON transcripts: { segments: [{ startTime, endTime, body, speaker }] }. */
export function parseJsonTranscript(text: string): Cue[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const segments = (data as { segments?: unknown })?.segments;
  if (!Array.isArray(segments)) return [];
  const cues = segments
    .filter((s) => s && Number.isFinite(Number(s.startTime)) && typeof s.body === 'string')
    .map((s) => ({
      start: Number(s.startTime),
      end: Number.isFinite(Number(s.endTime)) ? Number(s.endTime) : Number(s.startTime),
      text: String(s.body).trim(),
      speaker: typeof s.speaker === 'string' ? s.speaker : null,
    }))
    .filter((c) => c.text);
  return mergeSameSpeaker(cues);
}

export function parseHtmlTranscript(text: string): Cue[] {
  return htmlToText(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ start: -1, end: -1, text: p, speaker: null }));
}

/**
 * Word-level JSON and short VTT cues make for choppy reading; join consecutive cues from the
 * same speaker into sentences of up to ~25 seconds.
 */
export function mergeSameSpeaker(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    const last = out[out.length - 1];
    const sameSpeaker = last && (last.speaker ?? null) === (c.speaker ?? null);
    const shortEnough = last && c.end - last.start < 25;
    const sentenceOpen = last && !/[.!?…"”]$/.test(last.text);
    if (last && sameSpeaker && shortEnough && (sentenceOpen || last.text.length < 40)) {
      last.text = `${last.text} ${c.text}`.replace(/\s+/g, ' ');
      last.end = Math.max(last.end, c.end);
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

export function parseTranscript(text: string, type: string | null): Cue[] {
  const t = (type ?? '').toLowerCase();
  if (t.includes('json')) return parseJsonTranscript(text);
  if (t.includes('html')) return parseHtmlTranscript(text);
  if (t.includes('vtt') || t.includes('srt') || t.includes('subrip')) return parseTimedText(text);
  // Unknown or missing type: sniff.
  const head = text.trimStart().slice(0, 200);
  if (head.startsWith('{')) return parseJsonTranscript(text);
  if (
    head.startsWith('WEBVTT') ||
    TIMING.test(text.split('\n').find((l) => l.includes('-->')) ?? '')
  ) {
    return parseTimedText(text);
  }
  return parseHtmlTranscript(text);
}
