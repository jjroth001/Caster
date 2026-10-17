/** Parsing helpers for the loose formats feeds use in practice. */

/** iTunes durations: "3723", "3723.5", "62:03", "1:02:03". Returns whole seconds or null. */
export function parseDuration(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  return seconds > 0 ? Math.round(seconds) : null;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
const ZONES: Record<string, number> = {
  ut: 0,
  utc: 0,
  gmt: 0,
  z: 0,
  est: -300,
  edt: -240,
  cst: -360,
  cdt: -300,
  mst: -420,
  mdt: -360,
  pst: -480,
  pdt: -420,
};

/**
 * RSS dates (RFC 822, often sloppy: "Wed, 15 Oct 2026 10:00:00 +0000", "15 Oct 2026 10:00 EST",
 * missing weekday or seconds) and ISO 8601. Returns unix ms or null.
 */
export function parseDate(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const rfc =
    /^(?:[A-Za-z]{3,},?\s+)?(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[A-Za-z]{1,4})?/.exec(
      text,
    );
  if (rfc) {
    const [, day, mon, yearText, hh, mm, ss, zone] = rfc;
    const month = MONTHS[mon.toLowerCase()];
    if (month === undefined) return null;
    let year = Number(yearText);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    let offset = 0;
    if (zone && /^[+-]\d{4}$/.test(zone)) {
      const sign = zone[0] === '-' ? -1 : 1;
      offset = sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3)));
    } else if (zone) {
      offset = ZONES[zone.toLowerCase()] ?? 0;
    }
    const utc = Date.UTC(year, month, Number(day), Number(hh), Number(mm), Number(ss ?? 0));
    return utc - offset * 60_000;
  }
  const iso = Date.parse(text);
  return Number.isFinite(iso) ? iso : null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Show notes as plain text: paragraphs and line breaks kept, tags and scripts dropped. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
