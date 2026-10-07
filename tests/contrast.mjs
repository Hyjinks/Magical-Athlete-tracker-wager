// WCAG 2.1 AA colour check for the Color-safe theme.
//   node tests/contrast.mjs   (part of npm test)
//
// Reads the THEMES table straight out of magical-athlete-tracker.jsx and checks
// every text/background pairing the app draws with the theme's variables:
// 4.5:1 for text. It also checks that the "good" and "bad" colours differ a lot
// in lightness (so they stay apart without relying on hue), and that the racer
// colour set holds no red/green pair that is close in lightness.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "magical-athlete-tracker.jsx"), "utf8");
const themesBlock = src.slice(src.indexOf("const THEMES = {"), src.indexOf("const RACER_SHAPES"));
const themeBody = (id) => {
  const start = themesBlock.indexOf(`\n  ${id}: {`);
  if (start < 0) throw new Error(`theme ${id} not found`);
  const end = themesBlock.indexOf("\n  },", start);
  return themesBlock.slice(start, end);
};
const parseTheme = (id) => {
  const body = themeBody(id);
  const t = {};
  for (const m of body.matchAll(/^\s{4}(\w+): "(#[0-9A-Fa-f]{6})",/gm)) t[m[1]] = m[2];
  t.racerColors = [...body.slice(body.indexOf("racerColors")).matchAll(/"(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
  return t;
};

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failed = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✖"} ${msg}`);
  if (!ok) failed++;
};

const t = parseTheme("cb");
const HARD_WHITE = "#FFFCF5"; // used on the effect-prompt headers
// [text colour, background colour, where it is used]
const pairs = [
  [t.ink, t.paper, "body text on cards"],
  [t.ink, t.paper2, "text on raised cards"],
  [t.ink, t.highlight, "text on highlighted rows"],
  [t.ink, t.yellow, "1st/2nd badges, star prompt"],
  [t.paper2, t.red, "red buttons and badges"],
  [t.paper2, t.green, "selected chips, positive buttons"],
  [t.paper2, t.purple, "arrow prompt"],
  [t.paper2, t.ink, "tripped badge"],
  [HARD_WHITE, t.red, "trip prompt header"],
  [HARD_WHITE, t.purple, "arrow prompt header"],
  [t.muted, t.paper, "secondary text"],
  [t.muted, t.paper2, "secondary text on raised cards"],
  [t.muted, t.highlight, "secondary text on highlighted rows"],
  [t.red, t.paper, "errors, negative amounts"],
  [t.red, t.paper2, "errors on raised cards"],
  [t.red, t.highlight, "red text on highlighted rows"],
  [t.green, t.paper, "positive amounts"],
  [t.green, t.paper2, "positive amounts on raised cards"],
  [t.mutedGreen, t.paper, "'ahead' labels"],
  [t.purple, t.paper, "purple text"],
  [t.bronze, t.paper, "bronze tally label"],
  [t.onBg, t.bg, "text on the page background"],
  [t.onBgMuted, t.bg, "secondary text on the page background"],
];
for (const [fg, bg, where] of pairs) {
  const r = ratio(fg, bg);
  check(r >= 4.5, `${fg} on ${bg}: ${r.toFixed(2)}:1 — ${where}`);
}

const goodBad = lum(t.red) / lum(t.green);
check(goodBad >= 1.5 || 1 / goodBad >= 1.5, `good (${t.green}) and bad (${t.red}) differ clearly in lightness (${Math.max(goodBad, 1 / goodBad).toFixed(1)}x)`);

// Racer shades: the set is Okabe-Ito, so also make sure no two are near-identical
// in lightness AND hue-adjacent red/green; shapes cover the rest.
check(t.racerColors.length === 10, "ten safe racer colours");
let closeRedGreen = 0;
const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return -1;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
for (const a of t.racerColors) for (const b of t.racerColors) {
  const ha = hue(a), hb = hue(b);
  const aRed = ha >= 0 && (ha < 30 || ha > 340), bGreen = hb >= 80 && hb <= 170;
  if (aRed && bGreen && ratio(a, b) < 3) closeRedGreen++;
}
check(closeRedGreen === 0, "no red and green racer shades sit close in lightness");

if (failed) {
  console.log(`\n✖ ${failed} colour check(s) failed.`);
  process.exit(1);
}
console.log("\n✓ Colour contrast checks passed.");
