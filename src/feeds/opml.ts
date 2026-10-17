import { XMLParser } from 'fast-xml-parser';

export type OpmlFeed = { title: string | null; feedUrl: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => name === 'outline',
});

type Outline = {
  text?: string;
  title?: string;
  xmlUrl?: string;
  type?: string;
  outline?: Outline[];
};

/** Every feed in an OPML file, including ones nested in folders, without duplicates. */
export function parseOpml(xml: string): OpmlFeed[] {
  let doc: { opml?: { body?: { outline?: Outline[] } } };
  try {
    doc = parser.parse(xml);
  } catch {
    throw new Error('This file isn’t a valid OPML file.');
  }
  const body = doc.opml?.body;
  if (!body) throw new Error('This file isn’t an OPML subscription list.');
  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();
  const walk = (outlines: Outline[] | undefined) => {
    for (const o of outlines ?? []) {
      const url = o.xmlUrl?.trim();
      if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
        seen.add(url);
        feeds.push({ title: o.title?.trim() || o.text?.trim() || null, feedUrl: url });
      }
      walk(o.outline);
    }
  };
  walk(body.outline);
  return feeds;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toOpml(feeds: { title: string; feedUrl: string }[], now = new Date()): string {
  const lines = feeds.map(
    (f) =>
      `    <outline type="rss" text="${escapeXml(f.title)}" title="${escapeXml(f.title)}" xmlUrl="${escapeXml(f.feedUrl)}" />`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Caster subscriptions</title>
    <dateCreated>${now.toUTCString()}</dateCreated>
  </head>
  <body>
${lines.join('\n')}
  </body>
</opml>
`;
}
