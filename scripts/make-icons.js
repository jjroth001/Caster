/**
 * Generates Caster's app icon, adaptive-icon layers, monochrome (themed) icon, splash image
 * and favicon from one SVG drawing: a "C" sending out sound waves.
 *
 *   npm install --no-save @resvg/resvg-js@2.6.2
 *   node scripts/make-icons.js assets/images [--preview]
 *
 * --preview also writes preview.png showing launcher masks and small sizes (don't commit it).
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const NIGHT = '#1F2B52';
const APRICOT = '#F2B880';
const CREAM = '#F4F1EC';

const CX = 434; // centres the drawing's bounding box
const CY = 512;
const point = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return `${(CX + r * Math.cos(a)).toFixed(1)} ${(CY + r * Math.sin(a)).toFixed(1)}`;
};
/** An arc around the centre from `from`° to `to`° (clockwise, 0° = right). */
const arc = (r, from, to) =>
  `M ${point(r, from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(r, to)}`;

/** Centred in a 1024 box, scaled to fit Android's adaptive-icon safe circle (66 of 108 dp). */
function art(c, wave) {
  return `<g transform="translate(512 512) scale(0.94) translate(-512 -512)"><g fill="none" stroke-linecap="round">
    <path d="${arc(200, 42, 318)}" stroke="${c}" stroke-width="96"/>
    <path d="${arc(296, -26, 26)}" stroke="${wave}" stroke-width="54"/>
    <path d="${arc(378, -22, 22)}" stroke="${wave}" stroke-width="54" opacity="0.7"/>
  </g>
  <circle cx="${CX}" cy="${CY}" r="50" fill="${wave}"/></g>`;
}

const svg = (body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${
    bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''
  }${body}</svg>`;

const files = {
  'icon.png': svg(art(APRICOT, CREAM), NIGHT),
  'android-icon-foreground.png': svg(art(APRICOT, CREAM)),
  'android-icon-background.png': svg('', NIGHT),
  'android-icon-monochrome.png': svg(art('#FFFFFF', '#FFFFFF')),
  'splash-icon.png': svg(art(APRICOT, CREAM)),
};

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const render = (s, width) => new Resvg(s, { fitTo: { mode: 'width', value: width } }).render().asPng();
for (const [name, s] of Object.entries(files)) fs.writeFileSync(path.join(out, name), render(s, 1024));
fs.writeFileSync(path.join(out, 'favicon.png'), render(files['icon.png'], 48));

if (process.argv.includes('--preview')) {
  const fg = art(APRICOT, CREAM);
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
    <rect width="1200" height="420" fill="#ECECEC"/><rect x="600" width="600" height="420" fill="#111"/>
    <defs><clipPath id="c"><circle cx="512" cy="512" r="512"/></clipPath>
      <clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath></defs>
    <g transform="translate(40,60) scale(0.29)"><g clip-path="url(#c)"><rect width="1024" height="1024" fill="${NIGHT}"/>${fg}</g></g>
    <g transform="translate(360,60) scale(0.29)"><g clip-path="url(#r)"><rect width="1024" height="1024" fill="${NIGHT}"/>${fg}</g></g>
    <g transform="translate(80,360) scale(0.047)"><g clip-path="url(#c)"><rect width="1024" height="1024" fill="${NIGHT}"/>${fg}</g></g>
    <g transform="translate(680,60) scale(0.29)"><g clip-path="url(#c)"><rect width="1024" height="1024" fill="${NIGHT}"/>${fg}</g></g>
    <g transform="translate(960,90) scale(0.2)"><rect width="1024" height="1024" fill="#333"/>${art('#FFFFFF', '#FFFFFF')}</g>
  </svg>`;
  fs.writeFileSync(path.join(out, 'preview.png'), new Resvg(preview).render().asPng());
}
console.log('wrote', fs.readdirSync(out).join(', '));
