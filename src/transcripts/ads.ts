import type { Cue } from './passages';

/**
 * Ad reads in a transcript (ad-skipping layer 4): sentences scored for the phrases ad reads
 * use, merged with their neighbours into segments. Only timed transcripts can be skipped.
 */

const STRONG = [
  /\bbrought to you by\b/,
  /\bsponsored by\b/,
  /\bthis (episode|show|podcast) is (sponsored|supported|presented)\b/,
  /\b(use|enter) (the )?(promo |offer )?code\b/,
  /\bpromo code\b/,
  /\bdot com slash\b/,
  /\b\w+\.(com|co|io|net)\/[a-z0-9]+\b/,
  /\bfree trial\b/,
  /\b(first|1st) (month|order|box)\b.*\b(off|free)\b/,
  /\b\d{1,2} ?% off\b/,
  /\bthanks to our sponsors?\b/,
  /\bsupport (for )?(this|the) (show|podcast) comes from\b/,
];

const WEAK = [
  /\bsponsor(s|ed)?\b/,
  /\bdiscount\b/,
  /\boffer\b/,
  /\bsign up\b/,
  /\bcheck(out| out)\b/,
  /\blink in (the )?(show notes|description)\b/,
  /\bfree shipping\b/,
  /\bterms apply\b/,
  /\b(go|head) (to|over to)\b/,
  /\bdownload (the|their) app\b/,
];

export function scoreSentence(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const p of STRONG) if (p.test(t)) score += 0.6;
  for (const p of WEAK) if (p.test(t)) score += 0.2;
  return Math.min(1, score);
}

export type AdSegment = { start: number; end: number; confidence: number };

/**
 * Groups high-scoring cues (and the weaker ones between them) into ad segments. A segment needs
 * at least one strong cue and lasts 15 seconds to 3 minutes; confidence is the best cue's score
 * nudged up by how many cues agree.
 */
export function findAdSegments(cues: Cue[], gapS = 25): AdSegment[] {
  const timed = cues.filter((c) => c.start >= 0 && c.end > c.start);
  const segments: AdSegment[] = [];
  let current: { start: number; end: number; best: number; hits: number } | null = null;
  for (const c of timed) {
    const s = scoreSentence(c.text);
    if (s >= 0.4) {
      if (current && c.start - current.end <= gapS) {
        current.end = c.end;
        current.best = Math.max(current.best, s);
        current.hits++;
      } else {
        if (current) segments.push(finish(current));
        current = { start: c.start, end: c.end, best: s, hits: 1 };
      }
    } else if (current && s >= 0.2 && c.start - current.end <= gapS) {
      current.end = c.end;
    }
  }
  if (current) segments.push(finish(current));
  return segments.filter((s) => s.end - s.start >= 15 && s.end - s.start <= 180);
}

function finish(c: { start: number; end: number; best: number; hits: number }): AdSegment {
  return { start: c.start, end: c.end, confidence: Math.min(1, c.best + 0.1 * (c.hits - 1)) };
}
