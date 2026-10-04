/* ==========================================================================
   art.js — ilustracje potraw rysowane w kodzie (SVG). Zastępują zdjęcia,
   gdy receptura nie ma własnego: każda kategoria i potrawa ma swój rysunek,
   a kolor tła zależy od nazwy receptury. Zero plików, zero internetu.
   ========================================================================== */

const PALETTES = [
  ['#fff0c9', '#ffc971'], ['#ffe0d8', '#ff9e86'], ['#dcf4e1', '#8fd4a6'], ['#e0ecff', '#9cb9f6'],
  ['#efe3ff', '#b9a2f2'], ['#ffe4f0', '#f6a9c8'], ['#e6f1e1', '#a8caa0'], ['#ffeadb', '#f4b07c'],
];

const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h); };

const shadow = (cx = 100, cy = 150, rx = 70, ry = 9) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#2a1a08" opacity=".14"/>`;
const plate = (r = 72) => `<ellipse cx="100" cy="${100 + r * 0.12}" rx="${r}" ry="${r * 0.96}" fill="#2a1a08" opacity=".13"/>
  <circle cx="100" cy="100" r="${r}" fill="#fff"/><circle cx="100" cy="100" r="${r * 0.83}" fill="#f6f1e9" stroke="#e8dfd0" stroke-width="2"/>`;
const leaf = (x, y, a = 0, s = 1, c = '#3f9d4e') => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})"><path d="M0 0 C6 -10 18 -10 24 0 C18 10 6 10 0 0Z" fill="${c}"/><path d="M2 0 H22" stroke="#fff" stroke-opacity=".45" stroke-width="1.4"/></g>`;
const dots = (pts, r, c, o = 1) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${o}"/>`).join('');

const MOTIFS = {
  pizza: () => `${plate(74)}<circle cx="100" cy="100" r="64" fill="#e3a352"/><circle cx="100" cy="100" r="58" fill="#cf8a3a"/><circle cx="100" cy="100" r="53" fill="#d9412b"/>
    ${[[78, 80, 14], [120, 76, 13], [100, 108, 16], [70, 116, 12], [130, 114, 13], [98, 66, 8], [146, 98, 8], [56, 94, 8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff3bd"/><circle cx="${x - r * 0.25}" cy="${y - r * 0.25}" r="${r * 0.55}" fill="#fffbe3"/>`).join('')}
    ${leaf(86, 96, -30, 0.9)}${leaf(112, 90, 40, 0.9)}${leaf(92, 120, 100, 0.85)}${leaf(126, 120, -20, 0.8)}
    <circle cx="100" cy="100" r="64" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>`,

  pasta: () => `${plate(74)}
    ${[40, 33, 26, 19].map((r, i) => `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${i % 2 ? '#f0bd45' : '#f7cf63'}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${70 - i * 8} 9" transform="rotate(${i * 37} 100 100)"/>`).join('')}
    <circle cx="100" cy="98" r="15" fill="#c9372c"/><circle cx="95" cy="93" r="6" fill="#e5594a"/>${leaf(94, 84, -50, 0.9)}
    ${dots([[70, 70], [130, 74], [72, 128], [128, 126], [100, 144], [60, 100], [142, 102]], 2.4, '#fff4cf', 0.95)}`,

  soup: () => `${plate(74)}<circle cx="100" cy="100" r="60" fill="#e4d4bd"/><circle cx="100" cy="100" r="54" fill="#eaa63e"/>
    <path d="M62 96 C80 80 120 118 140 100" stroke="#fff" stroke-opacity=".55" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${dots([[78, 112], [118, 120], [122, 82], [84, 78], [104, 98]], 6, '#f08a24')}${dots([[92, 120], [134, 100], [70, 98], [110, 76]], 3.2, '#5fb84c')}
    ${dots([[100, 128], [86, 98], [126, 112]], 2.4, '#fff8e0')}`,

  salad: () => `${plate(74)}
    ${[[76, 84, -30, '#7cc35a'], [118, 80, 30, '#5aa845'], [98, 112, 80, '#9bd36f'], [70, 116, -60, '#5aa845'], [128, 116, 20, '#7cc35a'], [100, 76, 0, '#9bd36f']]
      .map(([x, y, a, c]) => `<ellipse cx="${x}" cy="${y}" rx="26" ry="15" fill="${c}" transform="rotate(${a} ${x} ${y})"/>`).join('')}
    ${[[88, 92], [122, 100], [78, 118], [108, 126]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#e5483a"/><circle cx="${x - 3}" cy="${y - 3}" r="3.4" fill="#fff" opacity=".5"/>`).join('')}
    ${[[104, 84], [66, 98], [132, 82]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#d7efbd" stroke="#8cc063" stroke-width="2"/>`).join('')}
    ${dots([[96, 108], [140, 112], [70, 80]], 5, '#3a3a2c')}
    ${[[118, 118], [84, 70], [112, 100]].map(([x, y]) => `<rect x="${x}" y="${y}" width="9" height="9" rx="1.5" fill="#fffaf0" transform="rotate(20 ${x} ${y})"/>`).join('')}`,

  steak: () => `${plate(76)}
    <defs><clipPath id="s"><path d="M58 96 C56 66 96 52 124 64 C152 76 150 118 124 134 C96 148 60 128 58 96Z"/></clipPath></defs>
    <path d="M58 96 C56 66 96 52 124 64 C152 76 150 118 124 134 C96 148 60 128 58 96Z" fill="#7d3f25"/>
    <g clip-path="url(#s)"><circle cx="102" cy="98" r="44" fill="#a35a38"/>
      ${[0, 1, 2, 3].map((i) => `<path d="M${50 + i * 22} 58 L${88 + i * 22} 140" stroke="#43200f" stroke-width="5" stroke-linecap="round" opacity=".85"/>`).join('')}</g>
    <path d="M58 96 C56 66 96 52 124 64 C152 76 150 118 124 134 C96 148 60 128 58 96Z" fill="none" stroke="#ecd2a8" stroke-width="3"/>
    <rect x="104" y="84" width="22" height="16" rx="4" fill="#ffe27a" transform="rotate(-12 115 92)"/>
    <path d="M132 48 L160 90" stroke="#4a8b3a" stroke-width="3" stroke-linecap="round"/>${[[138, 58], [144, 68], [150, 78], [140, 72]].map(([x, y], i) => `<ellipse cx="${x + (i % 2 ? 6 : -6)}" cy="${y}" rx="8" ry="2.6" fill="#4a8b3a" transform="rotate(${i % 2 ? -25 : 25} ${x} ${y})"/>`).join('')}
    ${dots([[84, 112], [92, 76], [118, 118]], 1.8, '#2b1d12')}`,

  fish: () => `${plate(76)}
    <g transform="rotate(-14 100 100)"><rect x="46" y="76" width="108" height="48" rx="24" fill="#f0805f"/>
      ${[0, 1, 2, 3, 4].map((i) => `<path d="M${64 + i * 16} 80 C${72 + i * 16} 96 ${58 + i * 16} 108 ${68 + i * 16} 120" stroke="#fbc0a6" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9"/>`).join('')}
      <rect x="46" y="76" width="108" height="48" rx="24" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/></g>
    <circle cx="146" cy="130" r="22" fill="#ffd543"/><circle cx="146" cy="130" r="17" fill="#fff0a8"/>
    ${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M146 130 L${146 + 16 * Math.cos(a * Math.PI / 180)} ${130 + 16 * Math.sin(a * Math.PI / 180)}" stroke="#ffd543" stroke-width="2"/>`).join('')}
    <path d="M56 140 L84 128 M60 128 L88 140" stroke="#4fa34a" stroke-width="2.4" stroke-linecap="round"/>`,

  shrimp: () => `${plate(76)}
    ${[[78, 88, 0], [122, 84, 90], [78, 124, 270], [122, 122, 180]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})">
      <path d="M-20 -12 A24 24 0 1 1 -8 22" stroke="#f27c48" stroke-width="15" fill="none" stroke-linecap="round"/>
      <path d="M-20 -12 A24 24 0 1 1 -8 22" stroke="#d65d2a" stroke-width="15" fill="none" stroke-dasharray="3 9" opacity=".7"/>
      <path d="M-26 -16 L-38 -26 L-30 -8Z" fill="#e66a36"/></g>`).join('')}
    <path d="M140 138 A22 22 0 0 0 96 138Z" fill="#ffd543" transform="rotate(-20 118 138)"/>${leaf(96, 100, 20, 0.8)}`,

  veg: () => `${plate(74)}
    ${[[72, 84], [98, 70], [128, 88]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="#3f9d4e"/><circle cx="${x - 9}" cy="${y + 4}" r="9" fill="#58b565"/><circle cx="${x + 8}" cy="${y + 5}" r="9" fill="#2f8a41"/>`).join('')}
    ${[[82, 118], [108, 126], [134, 116]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#f08a24"/><circle cx="${x}" cy="${y}" r="6" fill="#ffb15e"/>`).join('')}
    ${[[62, 112], [96, 98], [142, 98]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#e5483a"/><circle cx="${x - 3}" cy="${y - 3}" r="3" fill="#fff" opacity=".5"/>`).join('')}
    ${dots([[110, 100], [72, 100], [124, 134]], 4, '#9a5fc0')}`,

  cake: () => `${shadow(100, 158, 76, 9)}<ellipse cx="100" cy="152" rx="76" ry="10" fill="#fff"/><ellipse cx="100" cy="150" rx="64" ry="7" fill="#f1ebe0"/>
    <defs><clipPath id="c"><path d="M56 150 L144 150 L130 80 L70 80Z"/></clipPath></defs>
    <g clip-path="url(#c)"><rect x="40" y="128" width="120" height="24" fill="#f2d193"/><rect x="40" y="120" width="120" height="8" fill="#fff6e8"/><rect x="40" y="100" width="120" height="20" fill="#e8b974"/><rect x="40" y="94" width="120" height="6" fill="#fff6e8"/><rect x="40" y="76" width="120" height="18" fill="#f2d193"/>
      <path d="M60 80 C70 100 80 82 92 98 C104 82 114 100 126 80 L130 76 L66 76Z" fill="#5e3420"/></g>
    <path d="M56 150 L144 150 L130 80 L70 80Z" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    ${[[84, 76], [102, 70], [120, 76]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#d8344a"/><circle cx="${x - 3}" cy="${y - 3}" r="3" fill="#fff" opacity=".6"/>`).join('')}${leaf(98, 58, -60, 0.7)}`,

  bread: () => `${shadow(100, 150, 76, 10)}<ellipse cx="100" cy="104" rx="72" ry="46" fill="#bf7a28"/><ellipse cx="100" cy="100" rx="66" ry="40" fill="#dc9a43"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${64 + i * 18}" y="${78 + (i % 2) * 2}" width="9" height="42" rx="4.5" fill="#f6dba2" transform="rotate(-28 ${68 + i * 18} 100)"/>`).join('')}
    ${dots([[70, 80], [128, 86], [92, 124], [136, 112], [80, 108], [112, 70]], 1.8, '#fff', 0.7)}
    <path d="M150 52 L162 96" stroke="#c99a3a" stroke-width="2.4"/>${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="${153 + i * 2}" cy="${58 + i * 8}" rx="6" ry="2.8" fill="#d6a844" transform="rotate(${i % 2 ? 40 : -40} ${153 + i * 2} ${58 + i * 8})"/>`).join('')}`,

  cocktail: () => `${shadow(100, 160, 52, 7)}
    <path d="M58 70 L142 70 L132 156 L68 156Z" fill="#fff" fill-opacity=".55" stroke="#fff" stroke-width="3"/>
    <path d="M62 96 L138 96 L131 150 L69 150Z" fill="#f08a3c"/><path d="M62 96 L138 96 L137 104 L63 104Z" fill="#ffb066"/>
    ${[[80, 100, 18, 12], [102, 104, -10, 20], [122, 100, 14, 8]].map(([x, y, a]) => `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" rx="5" fill="#fff" fill-opacity=".72" stroke="#fff" stroke-width="1.5" transform="rotate(${a} ${x} ${y})"/>`).join('')}
    <path d="M118 28 L106 98" stroke="#e5483a" stroke-width="5" stroke-linecap="round"/>
    <circle cx="140" cy="72" r="17" fill="#f6a41b"/><circle cx="140" cy="72" r="13" fill="#ffc94d"/>${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M140 72 L${140 + 12 * Math.cos(a * Math.PI / 180)} ${72 + 12 * Math.sin(a * Math.PI / 180)}" stroke="#f6a41b" stroke-width="1.6"/>`).join('')}
    <path d="M66 74 L72 150" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`,

  sauce: () => `${plate(70)}<circle cx="100" cy="100" r="52" fill="#efe6d8"/><circle cx="100" cy="100" r="46" fill="#c9342b"/>
    <path d="M66 92 C84 74 112 106 134 88" stroke="#e8685a" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>
    ${dots([[116, 116], [84, 118], [102, 72], [128, 104]], 3.4, '#f6c453', 0.9)}${leaf(88, 98, -20, 1.1)}${leaf(106, 108, 60, 0.9)}
    <rect x="132" y="118" width="12" height="46" rx="6" fill="#d9d2c6" transform="rotate(-40 138 140)"/><ellipse cx="156" cy="154" rx="16" ry="10" fill="#d9d2c6" transform="rotate(-40 156 154)"/>`,

  prep: () => `${shadow(100, 156, 74, 9)}<g transform="rotate(-6 100 100)"><rect x="34" y="52" width="132" height="98" rx="14" fill="#c98d52"/><rect x="38" y="56" width="124" height="90" rx="11" fill="#dfa66c"/>
    <circle cx="150" cy="64" r="5" fill="#c98d52"/></g>
    <g transform="rotate(-14 100 100)"><path d="M54 98 L124 84 C132 82 136 88 128 94 L56 112Z" fill="#dfe6ec"/><path d="M54 98 L124 84 L128 88 L54 104Z" fill="#fff" opacity=".6"/><rect x="118" y="82" width="46" height="14" rx="7" fill="#4a3226" transform="rotate(-8 140 90)"/></g>
    <ellipse cx="72" cy="124" rx="16" ry="13" fill="#fffaf2"/><path d="M64 114 C72 124 72 130 66 136 M80 114 C74 124 74 130 80 136" stroke="#e6dcc9" stroke-width="2" fill="none"/>
    ${leaf(104, 120, -20, 1)}${leaf(112, 130, 30, 0.9)}${dots([[134, 124], [142, 132], [130, 136]], 3, '#5fb84c')}`,

  dumpling: () => `${plate(76)}
    ${[[76, 84, -20], [124, 82, 24], [100, 118, 4], [66, 120, -60], [136, 120, 60]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M-22 6 A22 22 0 0 1 22 6Z" fill="#f8ebc8"/><path d="M-22 6 A22 22 0 0 1 22 6" fill="none" stroke="#e3cf9f" stroke-width="3" stroke-dasharray="4 3"/><path d="M-22 6 H22" stroke="#e3cf9f" stroke-width="3"/><path d="M-12 -6 A14 12 0 0 1 4 -14" stroke="#fff" stroke-opacity=".7" stroke-width="3" fill="none" stroke-linecap="round"/></g>`).join('')}
    ${[[96, 96], [108, 100], [88, 108], [112, 88], [100, 134]].map(([x, y]) => `<rect x="${x}" y="${y}" width="8" height="3" rx="1.5" fill="#e0a23c" transform="rotate(${x} ${x} ${y})"/>`).join('')}
    <circle cx="146" cy="100" r="10" fill="#fff"/><circle cx="143" cy="97" r="4" fill="#fffdf7"/>${leaf(130, 96, -10, 0.55)}`,

  burger: () => `${shadow(100, 158, 66, 8)}
    <rect x="46" y="130" width="108" height="22" rx="11" fill="#d9993f"/>
    <rect x="42" y="112" width="116" height="20" rx="10" fill="#6b3a21"/><path d="M46 126 L154 126 L148 140 L52 140Z" fill="none"/>
    <path d="M46 112 L154 112 L100 136Z" fill="#f6c744" opacity=".95" transform="translate(0 -2)"/>
    <rect x="46" y="98" width="108" height="14" rx="7" fill="#d9402d"/>
    <path d="M40 98 C52 86 62 106 74 94 C86 106 96 88 108 98 C120 106 130 88 142 98 C148 102 152 98 160 96 L160 100 L40 100Z" fill="#6fbf4a"/>
    <path d="M44 92 C44 52 156 52 156 92Z" fill="#e3a24a"/><path d="M52 86 C56 62 100 56 120 62" stroke="#f3c47a" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${[[80, 70, 20], [100, 64, -10], [122, 70, -30], [90, 80, 0], [112, 80, 20]].map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.4" fill="#fff3d1" transform="rotate(${a} ${x} ${y})"/>`).join('')}`,

  eggs: () => `<ellipse cx="100" cy="112" rx="76" ry="70" fill="#2a1a08" opacity=".14"/><circle cx="100" cy="100" r="70" fill="#3b3b40"/><circle cx="100" cy="100" r="62" fill="#c93a2c"/>
    <rect x="160" y="94" width="34" height="12" rx="6" fill="#3b3b40"/>
    <path d="M56 100 C74 84 96 116 116 98 C130 88 140 104 148 96" stroke="#8f2a20" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>
    ${[[78, 82], [124, 86], [100, 124]].map(([x, y]) => `<path d="M${x - 20} ${y} C${x - 20} ${y - 18} ${x + 6} ${y - 24} ${x + 18} ${y - 10} C${x + 28} ${y + 6} ${x + 10} ${y + 22} ${x - 8} ${y + 16} C${x - 18} ${y + 12} ${x - 20} ${y + 6} ${x - 20} ${y}Z" fill="#fffdf6"/><circle cx="${x}" cy="${y}" r="9" fill="#ffb81f"/><circle cx="${x - 3}" cy="${y - 3}" r="3" fill="#fff" opacity=".6"/>`).join('')}
    ${dots([[66, 116], [138, 118], [104, 68], [148, 78], [60, 80]], 2.8, '#4fa34a')}`,

  rice: () => `${plate(74)}<circle cx="100" cy="100" r="58" fill="#e9dfd0"/>
    <path d="M52 100 A48 48 0 0 1 148 100Z" fill="#fff"/>${[...Array(18)].map((_, i) => `<ellipse cx="${62 + (i * 37) % 76}" cy="${86 + (i * 53) % 14}" rx="4" ry="1.8" fill="#efe8da" transform="rotate(${i * 40} 100 90)"/>`).join('')}
    <path d="M52 100 A48 48 0 0 0 148 100Z" fill="#f4ebe0"/>
    ${[[76, 114], [100, 118], [124, 114]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="14" ry="9" fill="${['#f0805f', '#78b94f', '#f08a24'][i]}"/>`).join('')}
    ${dots([[90, 82], [110, 80], [100, 88], [120, 90]], 2, '#2b2b2b')}
    <rect x="120" y="40" width="5" height="96" rx="2.5" fill="#6b3f24" transform="rotate(32 120 40)"/><rect x="134" y="42" width="5" height="96" rx="2.5" fill="#8b5632" transform="rotate(28 134 42)"/>`,

  plate: () => `${plate(62)}<circle cx="100" cy="100" r="28" fill="#e9dfd0" opacity=".6"/>
    <rect x="22" y="54" width="7" height="92" rx="3.5" fill="#cfd6dc"/><path d="M172 54 C186 64 184 88 177 102 L177 146 L171 146 L171 54Z" fill="#cfd6dc"/>
    ${leaf(88, 96, -20, 1.1, '#4fa34a')}${leaf(100, 104, 50, 0.95, '#6fbf4a')}`,
};

const CATEGORY_ART = {
  'cat-pizza': 'pizza', 'cat-pasta': 'pasta', 'cat-sosy': 'sauce', 'cat-mieso': 'steak', 'cat-ryby': 'fish', 'cat-owoce-morza': 'shrimp',
  'cat-warzywa': 'veg', 'cat-desery': 'cake', 'cat-pieczywo': 'bread', 'cat-zupy': 'soup', 'cat-salatki': 'salad', 'cat-cocktaile': 'cocktail',
  'cat-prep': 'prep', 'cat-sosy-bazowe': 'sauce', 'cat-inne': 'plate',
};
export const ART_KINDS = Object.keys(MOTIFS);

const cache = new Map();

export function artSvg(kind, seedText = '') {
  const k = MOTIFS[kind] ? kind : 'plate';
  const [c1, c2] = PALETTES[hash(seedText || k) % PALETTES.length];
  const h = hash(seedText + k);
  const b1 = 20 + (h % 120), b2 = 30 + ((h >> 3) % 110);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="200" height="200" fill="url(#g)"/>
<circle cx="${b1}" cy="${(b2 % 60) + 14}" r="${34 + (h % 22)}" fill="#fff" opacity=".22"/><circle cx="${200 - b2 / 2}" cy="${150 + (b1 % 40)}" r="${28 + (h % 30)}" fill="#fff" opacity=".16"/>
${MOTIFS[k]()}
</svg>`;
}

/** Data URL ilustracji (z pamięcią podręczną) — do <img src>. */
export function artUrl(kind, seedText = '') {
  const key = kind + '|' + seedText;
  let u = cache.get(key);
  if (!u) { u = 'data:image/svg+xml;utf8,' + encodeURIComponent(artSvg(kind, seedText)); cache.set(key, u); }
  return u;
}

export const artKindFor = (r) => (r.art && MOTIFS[r.art] ? r.art : CATEGORY_ART[r.category] || 'plate');
export const recipeArtUrl = (r) => artUrl(artKindFor(r), r.name || r.id || '');
export const categoryArtUrl = (catId) => artUrl(CATEGORY_ART[catId] || 'plate', catId);
