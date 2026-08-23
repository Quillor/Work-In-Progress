/* ─────────────────────────────────────────────────────────────────────────────
   Canvas design-system adapter — Flavor DS edition.

   Everything project-specific about the Canvas board lives here (see the
   canvas-maker skill's design-system-adapter.md). The board itself
   (pages/canvas.tsx) is stack-neutral and consumes only these exports.

   This project's system is Flavor DS (https://flavor-ds.vercel.app):
   - Tokens are CSS custom properties from src/styles/flavor.css, themed via
     nine data-attributes on <html> (data-hue/sat/mode/contrast/bg/radius/
     density/font + dir).
   - Semantic tier: --surface-*, --text-*, --border-*, --accent-*,
     --{success,warning,danger,info}-*, --space-N, --font-size-N.
   - Stored color format: HEX (primitives are hex; semantic tokens alias
     primitives through var() chains) or an alias to a primitive ramp token
     (e.g. "var(--flavor-blue-regular-9)"). An override written by the picker
     is a hex string, so a copied value pastes straight into a token file.
   - Live theming bridge: set the custom property on each frame document's
     documentElement.style — instant, applies to all loaded frames; new frames
     pick overrides up on load. Overrides persist in localStorage.
   - Mode: light/dark is `data-mode` on <html> (an attribute, never a class).
   ──────────────────────────────────────────────────────────────────────────── */

/* ── §1 route registry ────────────────────────────────────────────────────── */

export interface CanvasPage {
  path: string;
  label: string;
}
export interface CanvasGroup {
  label: string;
  pages: CanvasPage[];
}

// Mirrors the app's real routes (src/main.tsx). /canvas itself is excluded —
// the board doesn't render itself.
export const GROUPS: CanvasGroup[] = [
  {
    label: 'Marketing',
    pages: [{ path: '/', label: 'Home' }],
  },
  {
    label: 'Design system',
    pages: [{ path: '/design-system', label: 'Design system' }],
  },
];

export const ALL_PATHS = GROUPS.flatMap((g) => g.pages.map((p) => p.path));

/* ── §2 typography tokens ─────────────────────────────────────────────────────
   Flavor's curated text styles (flavor_get_text_styles): name → scale step on
   --font-size-N/--line-height-N, family role, weight. The indirection through
   var() is kept so presets re-resolve with data-font and data-density. */

export interface TypographyPreset {
  label: string;
  css: Record<string, string>;
  spec: string;
}

function textStyle(step: number, family: 'display' | 'text' | 'mono', weight: number, label: string, name: string): TypographyPreset {
  return {
    label,
    css: {
      'font-family': `var(--font-${family})`,
      'font-size': `var(--font-size-${step})`,
      'line-height': `var(--line-height-${step})`,
      'font-weight': String(weight),
    },
    spec: `${name} — font-${family} ${weight}, font-size-${step}/line-height-${step}`,
  };
}

export const TYPOGRAPHY_TOKENS: Record<string, TypographyPreset> = {
  displayL: textStyle(10, 'display', 700, 'Display L', 'Display/L'),
  displayM: textStyle(9, 'display', 700, 'Display M', 'Display/M'),
  displayS: textStyle(8, 'display', 700, 'Display S', 'Display/S'),
  headingL: textStyle(7, 'display', 700, 'Heading L', 'Heading/L'),
  headingM: textStyle(6, 'text', 600, 'Heading M', 'Heading/M'),
  headingS: textStyle(5, 'text', 600, 'Heading S', 'Heading/S'),
  bodyL: textStyle(5, 'text', 400, 'Body L', 'Body/L'),
  bodyM: textStyle(4, 'text', 400, 'Body M', 'Body/M'),
  bodyMStrong: textStyle(4, 'text', 600, 'Body M strong', 'Body/M Strong'),
  bodyS: textStyle(3, 'text', 400, 'Body S', 'Body/S'),
  bodySStrong: textStyle(3, 'text', 600, 'Body S strong', 'Body/S Strong'),
  labelM: textStyle(2, 'text', 500, 'Label M', 'Label/M'),
  labelS: textStyle(1, 'text', 600, 'Label S', 'Label/S'),
  monoM: textStyle(3, 'mono', 400, 'Mono M', 'Mono/M'),
  monoS: textStyle(2, 'mono', 400, 'Mono S', 'Mono/S'),
};

// Union of every property any preset can set — used to clear a preset.
export const TYPOGRAPHY_CSS_PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'color'];

/* ── §3 color tokens ──────────────────────────────────────────────────────── */

export const COLOR_TOKENS: Record<string, { label: string; cssVar: string }> = {
  textPrimary: { label: 'Text primary', cssVar: '--text-primary' },
  textSecondary: { label: 'Text secondary', cssVar: '--text-secondary' },
  textTertiary: { label: 'Text tertiary', cssVar: '--text-tertiary' },
  textAccent: { label: 'Text accent', cssVar: '--text-accent' },
  accentFg: { label: 'Accent foreground', cssVar: '--accent-fg' },
  successText: { label: 'Success text', cssVar: '--success-text' },
  warningText: { label: 'Warning text', cssVar: '--warning-text' },
  dangerText: { label: 'Danger text', cssVar: '--danger-text' },
  infoText: { label: 'Info text', cssVar: '--info-text' },
  surfacePage: { label: 'Surface page', cssVar: '--surface-page' },
  surface1: { label: 'Surface 1', cssVar: '--surface-1' },
  surface2: { label: 'Surface 2', cssVar: '--surface-2' },
  surface3: { label: 'Surface 3', cssVar: '--surface-3' },
  surfaceTint: { label: 'Surface tint', cssVar: '--surface-tint' },
  accentSubtle: { label: 'Accent subtle', cssVar: '--accent-subtle' },
  accentBg: { label: 'Accent bg', cssVar: '--accent-bg' },
  successBg: { label: 'Success bg', cssVar: '--success-bg' },
  warningBg: { label: 'Warning bg', cssVar: '--warning-bg' },
  dangerBg: { label: 'Danger bg', cssVar: '--danger-bg' },
  infoBg: { label: 'Info bg', cssVar: '--info-bg' },
};

// Role scoping — a selection only ever sees tokens valid for its layer.
export const TEXT_COLOR_KEYS = [
  'textPrimary',
  'textSecondary',
  'textTertiary',
  'textAccent',
  'accentFg',
  'successText',
  'warningText',
  'dangerText',
  'infoText',
];
export const BACKGROUND_COLOR_KEYS = [
  'surfacePage',
  'surface1',
  'surface2',
  'surface3',
  'surfaceTint',
  'accentSubtle',
  'accentBg',
  'successBg',
  'warningBg',
  'dangerBg',
  'infoBg',
];

/* ── §3c raw palette for the color picker ─────────────────────────────────────
   Flavor primitive ramps (--flavor-{hue}-{sat}-{1..12}, hex). Regular
   saturation only — the sat axis picks the variant at theme level; the picker
   aliases to a concrete ramp step. */

const RAMP_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ramp = (hue: string) => RAMP_STEPS.map((n) => `--flavor-${hue}-regular-${n}`);

export const PALETTE_GROUPS: Array<{ label: string; tokens: string[] }> = [
  { label: 'Neutral', tokens: ramp('neutral') },
  { label: 'Blue', tokens: ramp('blue') },
  { label: 'Teal', tokens: ramp('teal') },
  { label: 'Green', tokens: ramp('green') },
  { label: 'Yellow', tokens: ramp('yellow') },
  { label: 'Orange', tokens: ramp('orange') },
  { label: 'Red', tokens: ramp('red') },
  { label: 'Violet', tokens: ramp('violet') },
  { label: 'Magenta', tokens: ramp('magenta') },
];

/* ── color math for the token color picker ────────────────────────────────────
   Stored values are hex ("#0a6") or a palette alias ("var(--flavor-…-9)").
   The picker converts hex ↔ HSL ↔ HSV; resolveTripletForVar follows aliases
   through the live CSS so it opens on the right color. Writes go back as HEX —
   Flavor's own stored format. */

export type Hsl = { h: number; s: number; l: number };
export type Hsv = { h: number; s: number; v: number };

export const VAR_ALIAS_RE = /^var\(\s*(--[\w-]+)\s*\)$/;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function parseHslTriplet(value: string): Hsl | null {
  const m = value.trim().match(/^(-?\d*\.?\d+)\s+(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%$/);
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

export function formatHslTriplet({ h, s, l }: Hsl): string {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return `${Math.round(h)} ${round1(s)}% ${round1(l)}%`;
}

export function hslToHsv({ h, s, l }: Hsl): Hsv {
  const sN = s / 100;
  const lN = l / 100;
  const v = lN + sN * Math.min(lN, 1 - lN);
  const sv = v === 0 ? 0 : 2 * (1 - lN / v);
  return { h, s: sv * 100, v: v * 100 };
}

export function hsvToHsl({ h, s, v }: Hsv): Hsl {
  const sN = s / 100;
  const vN = v / 100;
  const l = vN * (1 - sN / 2);
  const sl = l === 0 || l === 1 ? 0 : (vN - l) / Math.min(l, 1 - l);
  return { h, s: sl * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const toHex = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function hexToHsl(hex: string): Hsl | null {
  let s = hex.trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let sat = 0;
  if (d !== 0) {
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: sat * 100, l: l * 100 };
}

// Parse whatever a Flavor token resolves to (hex, or a legacy HSL triplet).
function parseStoredColor(raw: string): Hsl | null {
  return hexToHsl(raw) ?? parseHslTriplet(raw);
}

// Resolves a stored token value (override or the CSS default) down to an HSL
// struct for the picker, following one level of `var(--alias)` explicitly and
// deeper chains via getComputedStyle (which substitutes var() fully).
export function resolveTripletForVar(value: string | undefined, cssVar: string): Hsl {
  const root = document.documentElement;
  let raw = (value ?? getComputedStyle(root).getPropertyValue(cssVar)).trim();
  const alias = raw.match(VAR_ALIAS_RE);
  if (alias) raw = getComputedStyle(root).getPropertyValue(alias[1]).trim();
  return parseStoredColor(raw) ?? { h: 0, s: 0, l: 0 };
}

// The board writes overrides in the project's stored format: hex.
export const formatStoredColor = hslToHex;

/* ── §4 spacing tokens ────────────────────────────────────────────────────────
   Flavor's --space-1..10 re-resolve with the density axis, so a tweak is
   applied as the token reference (`css`), never a frozen px/rem value. The
   label shows the regular-density resolution for reviewers. */

export const SPACING_TOKENS: Record<string, { label: string; css: string }> = {
  '0': { label: '0', css: '0' },
  '1': { label: 'space-1 · 4px', css: 'var(--space-1)' },
  '2': { label: 'space-2 · 6px', css: 'var(--space-2)' },
  '3': { label: 'space-3 · 9px', css: 'var(--space-3)' },
  '4': { label: 'space-4 · 12px', css: 'var(--space-4)' },
  '5': { label: 'space-5 · 18px', css: 'var(--space-5)' },
  '6': { label: 'space-6 · 24px', css: 'var(--space-6)' },
  '7': { label: 'space-7 · 30px', css: 'var(--space-7)' },
  '8': { label: 'space-8 · 36px', css: 'var(--space-8)' },
  '9': { label: 'space-9 · 48px', css: 'var(--space-9)' },
  '10': { label: 'space-10 · 60px', css: 'var(--space-10)' },
};
export const SPACING_SIDE_PROPS = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
};
export const SPACING_CSS_PROPS = [...SPACING_SIDE_PROPS.padding, ...SPACING_SIDE_PROPS.margin, 'gap'];

/* ── fixed, non-adapted layout controls ───────────────────────────────────── */

export const LAYOUT_CSS_PROPS = ['display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items'];
export const FLEX_DIRECTION_OPTIONS = [
  { value: 'row', label: 'Row' },
  { value: 'row-reverse', label: 'Row reverse' },
  { value: 'column', label: 'Column' },
  { value: 'column-reverse', label: 'Column reverse' },
];
export const FLEX_WRAP_OPTIONS = [
  { value: 'nowrap', label: 'No wrap' },
  { value: 'wrap', label: 'Wrap' },
  { value: 'wrap-reverse', label: 'Wrap reverse' },
];
export const JUSTIFY_OPTIONS = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'space-between', label: 'Space between' },
  { value: 'space-around', label: 'Space around' },
];
export const ALIGN_OPTIONS = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'baseline', label: 'Baseline' },
];

export const NONE = '__none__';

/* ── §5 theming bridge ────────────────────────────────────────────────────────
   Overrides persist in localStorage (no dev-server file middleware yet — see
   spec §7 for the repo-file upgrade). Mode is data-mode on <html>. */

export const TOKEN_STORAGE_KEY = 'canvas-token-overrides';

export type CanvasMode = 'light' | 'dark';

export function getDocumentMode(root: HTMLElement = document.documentElement): CanvasMode {
  return root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
}

export function setDocumentMode(root: HTMLElement, mode: CanvasMode): void {
  root.setAttribute('data-mode', mode);
}
