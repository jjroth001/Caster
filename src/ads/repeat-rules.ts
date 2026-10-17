/** How repeated-audio findings become ads (kept apart from the player, so it's easy to test). */

/** Within this many seconds of an episode's start or end, a same-show repeat is likely its theme. */
const EDGE_S = 12;

export type AdSpan = { start: number; end: number; confidence: number };

/** How sure a repeat is an ad, from where it plays and whether another show has it too. */
export function repeatConfidence(
  span: { start: number; end: number },
  durationS: number | null,
  otherShow: boolean,
): number {
  if (otherShow) return 0.9;
  const atStart = span.start < EDGE_S;
  const atEnd = durationS != null && span.end > durationS - EDGE_S;
  return atStart || atEnd ? 0.5 : 0.85;
}

/** Joins overlapping or touching spans (2 s apart or less), keeping the higher confidence. */
export function mergeSpans(spans: AdSpan[]): AdSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: AdSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + 2) {
      last.end = Math.max(last.end, s.end);
      last.confidence = Math.max(last.confidence, s.confidence);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}
