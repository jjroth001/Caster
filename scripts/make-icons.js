/**
 * Generates Caster's app icon, adaptive-icon layers, monochrome (themed) icon, splash image
 * and favicon from one SVG drawing: a white wizard hat with a star cut out of it, on a
 * blue-to-purple gradient.
 *
 *   npm install --no-save @resvg/resvg-js@2.6.2
 *   node scripts/make-icons.js assets/images [--preview]
 *
 * --preview also writes preview.png showing launcher masks and small sizes (don't commit it).
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const BLUE = '#3B82F6';
const PURPLE = '#7C3AED';

const star = (x, y, r, rot = -18) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36 - 90) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.45 : r;
    p.push(`${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${p.join(' ')}" stroke-linejoin="round"/>`;
};
const sparkle = (x, y, s) =>
  `M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z`;

const HAT = 'M 296 700 C 380 520 440 360 474 256 C 492 204 560 186 650 232 C 596 232 572 262 576 304 C 590 430 654 570 728 700 Z';

/** The hat, brim and sparkles in one colour; scaled to fit the adaptive-icon safe circle. */
function art(color) {
  return `<defs><mask id="cut"><rect width="1024" height="1024" fill="white"/><g fill="black">${star(520, 520, 64)}</g></mask></defs>
  <g transform="translate(512 512) scale(0.78) translate(-525 -462)" fill="${color}">
    <path d="${HAT}" mask="url(#cut)"/>
    <rect x="236" y="676" width="552" height="62" rx="31"/>
    <path d="${sparkle(724, 230, 34)}"/>
    <path d="${sparkle(780, 316, 16)}" opacity="0.7"/>
  </g>`;
}

const gradient = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${PURPLE}"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>`;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

const files = {
  'icon.png': svg(gradient + art('#FFFFFF')),
  'android-icon-foreground.png': svg(art('#FFFFFF')),
  'android-icon-background.png': svg(gradient),
  'android-icon-monochrome.png': svg(art('#FFFFFF')),
  'splash-icon.png': svg(art('#FFFFFF')),
};

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const render = (s, width) => new Resvg(s, { fitTo: { mode: 'width', value: width } }).render().asPng();
for (const [name, s] of Object.entries(files)) fs.writeFileSync(path.join(out, name), render(s, 1024));
fs.writeFileSync(path.join(out, 'favicon.png'), render(files['icon.png'], 48));

if (process.argv.includes('--preview')) {
  // Launchers show the middle 72 of the 108 dp canvas: circle and rounded-square masks.
  const inner = (gradient + art('#FFFFFF')).replace(/id="(\w+)"/g, 'id="$1X"').replace(/url\(#(\w+)\)/g, 'url(#$1X)');
  const crop = (x, y, scale, clip) =>
    `<g transform="translate(${x} ${y}) scale(${scale}) translate(-171 -171)"><g clip-path="url(#${clip})">${inner}</g></g>`;
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="360">
    <rect width="1000" height="360" fill="#ECECEC"/><rect x="500" width="500" height="360" fill="#111"/>
    <defs><clipPath id="c"><circle cx="512" cy="512" r="341"/></clipPath>
      <clipPath id="r"><rect x="171" y="171" width="682" height="682" rx="150"/></clipPath></defs>
    ${crop(40, 40, 0.4, 'c')}${crop(300, 40, 0.4, 'r')}${crop(560, 40, 0.4, 'c')}${crop(820, 120, 0.15, 'r')}
  </svg>`;
  fs.writeFileSync(path.join(out, 'preview.png'), new Resvg(preview).render().asPng());
}
console.log('wrote', fs.readdirSync(out).join(', '));
