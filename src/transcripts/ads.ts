import type { Cue } from './passages';

/**
 * Ad reads in a transcript (ad-skipping layer 4). Sentences are scored for the phrases ad reads
 * use ("use code", "dot com slash"); those anchors usually come at the end of a read. The
 * brand they name (from the web address or "sponsored by X") is then followed back and forward
 * through the sentences that keep mentioning it, so the whole read is skipped, not just its
 * last few seconds. Only timed transcripts can be skipped.
 */

/** Bump when detection changes, so transcripts already on the phone are checked again. */
export const AD_DETECTION_VERSION = 2;

const STRONG = [
  /\bbrought to you by\b/,
  /\bsponsored by\b/,
  /\bthis (episode|show|podcast|video) is (also )?(sponsored|supported|presented)\b/,
  /\b(use|enter) (the )?(promo |offer )?code\b/,
  /\bpromo code\b/,
  /\bdot com slash\b/,
  /\b\w+\.(com|co|io|net|org|edu)\/[a-z0-9]+\b/,
  /\bfree trial\b/,
  /\b(first|1st) (month|order|box)\b.*\b(off|free)\b/,
  /\b\d{1,2} ?(%|percent) off\b/,
  /\bvisit \w+\.(com|co|io|net|org|edu)\b/,
  /\bthanks to our sponsors?\b/,
  /\bsupport (for )?(this|the) (show|podcast) comes from\b/,
  /\b(say|tell them) (that )?(we|i) sent you\b/,
];

const WEAK = [
  /\bsponsor(s|ed)?\b/,
  /\bdiscount\b/,
  /\boffer\b/,
  /\bsign up\b/,
  /\bcheck(out| out)\b/,
  /\bworth checking out\b/,
  /\blink in (the )?(show notes|description)\b/,
  /\bfree shipping\b/,
  /\bterms apply\b/,
  /\b(go|head) (to|over to)\b/,
  /\bdownload (the|their) app\b/,
  /\b\w+\.(com|co|io|net|org|edu)\b/,
  /\bat checkout\b/,
  /\bstarter kit\b/,
];

/**
 * A phrase you added ("our friends at", a sponsor's name) as a pattern: whole words only, any
 * spacing, any case.
 */
export function phrasePattern(phrase: string): RegExp {
  const words = phrase
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const body = words.join('\\s+');
  const start = /^\w/.test(phrase.trim()) ? '\\b' : '';
  const end = /\w$/.test(phrase.trim()) ? '\\b' : '';
  return new RegExp(`${start}${body}${end}`, 'i');
}

export function scoreSentence(text: string, custom: RegExp[] = []): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const p of STRONG) if (p.test(t)) score += 0.6;
  // Your own phrases count as strongly as "use code".
  for (const p of custom) if (p.test(text)) score += 0.6;
  for (const p of WEAK) if (p.test(t)) score += 0.2;
  return Math.min(1, score);
}

/** Words that look like a brand but aren't one. */
const NOT_BRANDS = new Set(
  'the this that our my your their friends folks people over www http https show podcast episode video app'.split(
    ' ',
  ),
);

/** Brand names an ad-read sentence gives: the site in a web address, or who sponsors it. */
export function brandsIn(text: string): string[] {
  const t = text.toLowerCase();
  const found = new Set<string>();
  for (const m of t.matchAll(/\b([a-z][a-z0-9-]{2,})\.(com|co|io|net|org|edu)\b/g)) found.add(m[1]);
  // "Toups (T U P S) and Co.com": the brand is the word before "and Co", past any spelling-out.
  for (const m of t.matchAll(/\b([a-z][a-z0-9-]{2,})(?: [a-z]\b)*(?: and| ?&) co\.com\b/g)) {
    found.add(m[1]);
  }
  for (const m of t.matchAll(/\b([a-z][a-z0-9-]{3,}) dot com\b/g)) found.add(m[1]);
  for (const m of t.matchAll(
    /\b(?:sponsored by|brought to you by|supported by)(?: my| our)?(?: friends| folks)?(?: over)?(?: at)? ([a-z][a-z0-9-]{3,})/g,
  )) {
    found.add(m[1]);
  }
  return [...found].filter((b) => !NOT_BRANDS.has(b));
}

/** "brewless" also matches "Brewless", "brew less" and "Brew-Less". */
function brandPattern(brand: string): RegExp {
  const letters = brand.replace(/[^a-z0-9]/g, '').split('');
  // Short brands ("GCU") must match the whole word exactly.
  if (letters.length <= 3) return new RegExp(`\\b${letters.join('')}(?:'?s)?\\b`, 'i');
  // A possessive or plural still counts ("Brewless's"), a longer word doesn't ("Lume" ≠ "lumen").
  return new RegExp(`\\b${letters.join('[\\s-]?')}(?:'?s)?\\b`, 'i');
}

/**
 * Brands that often sponsor podcasts, as a starting point; Caster adds every brand it finds in
 * an ad read on this phone. Only distinctive names: everyday words ("Factor", "Indeed") would
 * catch ordinary talk. A brand alone never makes an ad; it needs a second sign.
 */
export const COMMON_SPONSORS = [
  'athletic greens',
  'audible',
  'babbel',
  'betterhelp',
  'blue apron',
  'bluechew',
  'bombas',
  'brooklinen',
  'cerebral',
  'cozy earth',
  'dipsea',
  'expressvpn',
  'grammarly',
  'headspace',
  'hellofresh',
  'helix sleep',
  'huel',
  'kachava',
  'liquid iv',
  'lume',
  'magic spoon',
  'manscaped',
  'masterclass',
  'meundies',
  'mint mobile',
  'monday.com',
  'noom',
  'nordvpn',
  'nutrafol',
  'policygenius',
  'quince',
  'raycon',
  'rocket money',
  'simplisafe',
  'squarespace',
  'stamps.com',
  'surfshark',
  'thrive market',
  'upstart',
  'wix',
  'ziprecruiter',
];

/** The brands in an ad and the episode's other mentions of them are matched loosely. */
function normalise(brand: string): string {
  return brand.toLowerCase().replace(/\.(com|co|io|net|org|edu)$/, '');
}

export type AdSegment = { start: number; end: number; confidence: number };

type Span = { first: number; last: number; best: number; hits: number };

/** Longest stretch without a brand mention that still counts as the same read. */
const BRAND_GAP_S = 35;
/** How far back a read can start before its first anchor. */
const MAX_LEAD_S = 120;
/** Reads closer together than this are one ad break, gap included. */
const BETWEEN_ADS_S = 40;
/** A single read longer than this is more likely talk about the brand than an ad. */
const MAX_READ_S = 180;

/**
 * Groups high-scoring cues (and the weaker ones between them) into anchors, widens each to the
 * neighbouring sentences that mention its brand, then joins back-to-back reads into one break.
 * A break lasts 15 seconds to 5 minutes; confidence is the best cue's score nudged up by how
 * many cues agree.
 */
export function findAdSegments(
  cues: Cue[],
  knownBrands: string[] = COMMON_SPONSORS,
  customPhrases: string[] = [],
  gapS = 25,
): AdSegment[] {
  const timed = cues.filter((c) => c.start >= 0 && c.end > c.start);
  const custom = customPhrases.filter((p) => p.trim()).map(phrasePattern);
  // A one-word phrase is probably a sponsor's name: follow it through the read like one.
  const names = customPhrases
    .map((p) => p.trim().toLowerCase())
    .filter((p) => /^[\w-]{3,}$/.test(p));
  const known = [...new Set([...knownBrands, ...names].map(normalise))].map((b) => ({
    brand: b,
    pattern: brandPattern(b),
  }));
  const knownIn = (text: string) => known.filter((k) => k.pattern.test(text)).map((k) => k.brand);
  // A known sponsor counts as one more sign; with an ad phrase it makes an anchor.
  const scores = timed.map(
    (c) => scoreSentence(c.text, custom) + (knownIn(c.text).length > 0 ? 0.3 : 0),
  );
  // A known sponsor named three times within a minute is an anchor by itself.
  timed.forEach((c, i) => {
    for (const brand of knownIn(c.text)) {
      const pattern = brandPattern(brand);
      const nearby = timed.filter(
        (o) => Math.abs(o.start - c.start) <= 60 && pattern.test(o.text),
      ).length;
      if (nearby >= 3) scores[i] = Math.max(scores[i], 0.6);
    }
  });

  // 1. Anchors: runs of ad-like cues (indices into `timed`).
  const anchors: Span[] = [];
  let current: Span | null = null;
  timed.forEach((c, i) => {
    const s = scores[i];
    if (s >= 0.4) {
      if (current && c.start - timed[current.last].end <= gapS) {
        current.last = i;
        current.best = Math.max(current.best, s);
        current.hits++;
      } else {
        if (current) anchors.push(current);
        current = { first: i, last: i, best: s, hits: 1 };
      }
    } else if (current && s >= 0.2 && c.start - timed[current.last].end <= gapS) {
      current.last = i;
    }
  });
  if (current) anchors.push(current);

  // 2. Widen each anchor over the sentences that keep naming its brand.
  const reads = anchors.map((a) => {
    const brands = timed
      .slice(a.first, a.last + 1)
      .flatMap((c) => [...brandsIn(c.text), ...knownIn(c.text)])
      .map(brandPattern);
    if (brands.length === 0) return a;
    const mentions = (i: number) => brands.some((b) => b.test(timed[i].text));
    let first = a.first;
    let lastMention = first;
    for (let i = a.first - 1; i >= 0; i--) {
      if (timed[a.first].start - timed[i].start > MAX_LEAD_S) break;
      if (timed[lastMention].start - timed[i].end > BRAND_GAP_S) break;
      if (mentions(i)) first = lastMention = i;
    }
    let last = a.last;
    lastMention = last;
    for (let i = a.last + 1; i < timed.length; i++) {
      if (timed[i].start - timed[lastMention].end > BRAND_GAP_S) break;
      if (mentions(i)) last = lastMention = i;
    }
    const widened = { ...a, first, last };
    return timed[last].end - timed[first].start <= MAX_READ_S ? widened : a;
  });

  // 3. Join reads that are close: a short stretch between two ads is almost always another ad
  //    (two sponsors back to back), even when its brand was transcribed differently.
  const breaks: Span[] = [];
  for (const r of reads.sort((x, y) => x.first - y.first)) {
    const prev = breaks[breaks.length - 1];
    if (prev && timed[r.first].start - timed[prev.last].end <= BETWEEN_ADS_S) {
      prev.last = Math.max(prev.last, r.last);
      prev.best = Math.max(prev.best, r.best);
      prev.hits += r.hits;
    } else {
      breaks.push({ ...r });
    }
  }

  return breaks
    .map((b) => ({
      start: timed[b.first].start,
      end: timed[b.last].end,
      confidence: Math.min(1, b.best + 0.1 * (b.hits - 1)),
    }))
    .filter((s) => s.end - s.start >= 15 && s.end - s.start <= 300);
}

/** The brands named in the ad reads found, to remember for next time. */
export function brandsInSegments(cues: Cue[], segments: AdSegment[]): string[] {
  const found = new Set<string>();
  for (const c of cues) {
    if (segments.some((s) => c.start >= s.start && c.end <= s.end)) {
      brandsIn(c.text).forEach((b) => found.add(b));
    }
  }
  return [...found];
}
