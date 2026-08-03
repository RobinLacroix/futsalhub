#!/usr/bin/env node
/**
 * Vérifie que tous les couples couleur/fond des tokens tiennent WCAG 2.1 AA.
 * Seuil retenu pour FutsalHub : 4.5:1 pour tout texte, sans exception de taille.
 *
 *   node scripts/check-contrast.mjs
 *
 * Sortie non nulle si un couple échoue. À rejouer après toute retouche de
 * `lib/design/tokens.ts`.
 */

const DARK = {
  canvas: '#0E1116',
  surface: '#161A22',
  pairs: {
    'text.primary': '#F2F4F8',
    'text.secondary': '#A8B2C4',
    'text.tertiary': '#78859C',
    'accent.default': '#8B7CFF',
    'positive.default': '#2DD4BF',
    'negative.default': '#FF5D5D',
    'warning.default': '#FFB020',
    neutralData: '#78859C',
  },
  fills: { 'accent.fill': '#6C5CE0', 'positive.fill': '#0F766E', 'negative.fill': '#D93636' },
};

const LIGHT = {
  canvas: '#F5F7FA',
  surface: '#FFFFFF',
  pairs: {
    'text.primary': '#0E1116',
    'text.secondary': '#4A5568',
    'text.tertiary': '#636D7B',
    'accent.default': '#5B4BD6',
    'positive.default': '#0F766E',
    'negative.default': '#C81E1E',
    'warning.default': '#B45309',
    neutralData: '#636D7B',
  },
  fills: { 'accent.fill': '#6C5CE0', 'positive.fill': '#0F766E', 'negative.fill': '#D93636' },
};

const THRESHOLD = 4.5;

function channel(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;

function report(themeName, theme) {
  console.log(`\n${themeName}`);
  for (const bgName of ['canvas', 'surface']) {
    const bg = theme[bgName];
    for (const [name, fg] of Object.entries(theme.pairs)) {
      const ratio = contrast(fg, bg);
      const ok = ratio >= THRESHOLD;
      if (!ok) failures++;
      console.log(
        `  ${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(18)} sur bg.${bgName.padEnd(8)} ${ratio.toFixed(2)}:1`,
      );
    }
  }
  // Un aplat porte du texte blanc : c'est ce couple qu'il faut valider.
  for (const [name, fill] of Object.entries(theme.fills)) {
    const ratio = contrast('#FFFFFF', fill);
    const ok = ratio >= THRESHOLD;
    if (!ok) failures++;
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} texte blanc sur ${name.padEnd(16)} ${ratio.toFixed(2)}:1`,
    );
  }
}

report('THÈME SOMBRE', DARK);
report('THÈME CLAIR', LIGHT);

console.log(
  failures === 0
    ? `\nTous les couples tiennent ${THRESHOLD}:1.`
    : `\n${failures} couple(s) sous ${THRESHOLD}:1.`,
);
process.exit(failures === 0 ? 0 : 1);
