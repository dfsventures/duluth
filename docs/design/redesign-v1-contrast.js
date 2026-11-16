// Contrast check for the redesign-v1 token table (docs/design/redesign-v1.md).
// Run: node docs/design/redesign-v1-contrast.js
// Prints WCAG 2.x ratios for every text/surface and glyph/surface pair in light and dark.
const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => { const la = L(a), lb = L(b); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); };
const over = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
const hue = (rgb) => { const [r, g, b] = rgb.map((x) => x / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return (h + 360) % 360; };
const sat = (rgb) => { const [r, g, b] = rgb.map((x) => x / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; return d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); };

const T = {
  light: {
    bg: '#FFFFFF', side: '#F4F5F7', pane: '#FAFBFC', raise: '#F0F2F4', raise2: '#E6E9ED',
    hover: [[18, 24, 38], 0.035], sel: [[18, 24, 38], 0.06], open: [[18, 24, 38], 0.085],
    t1: '#15181D', t2: '#474D57', t3: '#5A616C', ctl: '#858C97',
    accent: '#44688E', onAccent: '#FFFFFF', accentHover: '#3A5876',
    accentSoft: [[68, 104, 142], 0.10],
    done: '#1B7448', stuck: '#B3362A', warn: '#8A5A0B',
    doneSoft: [[27, 116, 72], 0.10], stuckSoft: [[179, 54, 42], 0.08], warnSoft: [[138, 90, 11], 0.10],
    tones: { stone: ['#E7E4DA', '#46443C'], sky: ['#DCE7F3', '#2C4459'], sage: ['#E3E8D0', '#4A5524'], clay: ['#F4E0D6', '#8F4A30'], sand: ['#F1E4C8', '#6B4A0E'], amber: ['#F8EBC9', '#6B4A0E'] },
  },
  dark: {
    bg: '#14171B', side: '#0E1013', pane: '#191C21', raise: '#20242A', raise2: '#292E36',
    hover: [[255, 255, 255], 0.04], sel: [[255, 255, 255], 0.07], open: [[255, 255, 255], 0.10],
    t1: '#E9ECF0', t2: '#A7AEB9', t3: '#9AA1AC', ctl: '#6E7681',
    accent: '#7BA9DD', onAccent: '#0C1522', accentHover: '#93BAE6',
    accentSoft: [[123, 169, 221], 0.16],
    done: '#5BC48E', stuck: '#F2877C', warn: '#E0A640',
    doneSoft: [[91, 196, 142], 0.16], stuckSoft: [[242, 135, 124], 0.14], warnSoft: [[224, 166, 64], 0.14],
    tones: { stone: ['#2A2D33', '#C9CDD4'], sky: ['#1F3249', '#B9D3F0'], sage: ['#27301D', '#C5D69A'], clay: ['#3D2620', '#F0B5A0'], sand: ['#38301A', '#E8CF93'], amber: ['#3A2F14', '#EDCB7E'] },
  },
};
const ID = { lime: '#B7D86A', teal: '#6CCBC6', indigo: '#9A96F0', violet: '#B493F0', orchid: '#D08CE6', magenta: '#EA8DC3', stone: '#C9C2B6', slate: '#A9B6C6' };
const INK = '#14161A';
const f = (n) => n.toFixed(2);
// Optional argument: "light" or "dark" prints just that theme (and skips the identity table).
const only = process.argv[2];
for (const th of ['light', 'dark']) {
  if (only && only !== th) continue;
  const t = T[th];
  const ov = (k, base) => (Array.isArray(t[k]) ? over(t[k][0], t[k][1], base) : hex(t[k]));
  console.log(`\n== ${th} ==`);
  const surfaces = { bg: hex(t.bg), side: hex(t.side), pane: hex(t.pane), raise: hex(t.raise), raise2: hex(t.raise2) };
  surfaces['hover@bg'] = ov('hover', hex(t.bg)); surfaces['sel@bg'] = ov('sel', hex(t.bg)); surfaces['open@bg'] = ov('open', hex(t.bg));
  surfaces['sel@pane'] = ov('sel', hex(t.pane));
  for (const k of ['t1', 't2', 't3', 'accent', 'done', 'stuck', 'warn']) {
    console.log(k.padEnd(7), Object.entries(surfaces).map(([s, v]) => `${s}:${f(ratio(hex(t[k]), v))}`).join('  '));
  }
  console.log('on-accent on accent', f(ratio(hex(t.onAccent), hex(t.accent))), ' on accentHover', f(ratio(hex(t.onAccent), hex(t.accentHover))));
  console.log('ctl border on bg', f(ratio(hex(t.ctl), hex(t.bg))), 'on pane', f(ratio(hex(t.ctl), hex(t.pane))));
  console.log('accent on accent-soft@bg', f(ratio(hex(t.accent), over(t.accentSoft[0], t.accentSoft[1], hex(t.bg)))));
  for (const [k, ks] of [['done', 'doneSoft'], ['stuck', 'stuckSoft'], ['warn', 'warnSoft']]) {
    const sf = over(t[ks][0], t[ks][1], hex(t.bg)); const sf2 = over(t[ks][0], t[ks][1], hex(t.pane));
    console.log(`${k} on ${ks}@bg`, f(ratio(hex(t[k]), sf)), `@pane`, f(ratio(hex(t[k]), sf2)));
  }
  for (const [n, [fl, ink]] of Object.entries(t.tones)) console.log(`tone ${n}`, f(ratio(hex(ink), hex(fl))));
}
if (!only) console.log('\n== identity ==');
if (!only) for (const [n, c] of Object.entries(ID)) console.log(n.padEnd(8), c, 'hue', Math.round(hue(hex(c))), 'sat', f(sat(hex(c))), 'ink:fill', f(ratio(hex(INK), hex(c))),
  'fill on white', f(ratio(hex(c), hex('#FFFFFF'))), 'fill on dark bg', f(ratio(hex(c), hex('#14171B'))));
