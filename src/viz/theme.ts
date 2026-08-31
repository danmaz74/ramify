/**
 * Color for the diagram, as CSS custom properties.
 *
 * The light values of §3.7 are the *base* definitions, so a standalone
 * `model-core.svg` opened on its own renders correctly with no host stylesheet.
 * Dark values are layered on twice — once under `prefers-color-scheme: dark`
 * (skipped when the host pinned light) and once under an explicit
 * `data-theme="dark"` — so a host page can either follow the system or force a
 * theme, and the same emitted markup serves both.
 *
 * Colors reach elements through classes rather than presentation attributes,
 * because `fill="var(--x)"` is not honored by browsers while `.cls { fill:
 * var(--x) }` is.
 *
 * Pure: this module produces strings. It touches no DOM.
 */

import type { ColorKey } from './diagram-definition.js';

export type Theme = 'light' | 'dark';

export type Palette = Readonly<Record<ColorKey, string>>;

/**
 * §3.7's light column, plus the surface colors the ASCII mock leaves implicit.
 *
 * The three traced hues are numbered slots rather than symbol names: the
 * palette belongs to the renderer, and which symbol wears which hue belongs to
 * the diagram (`TracedSymbol.color`).
 */
export const lightPalette: Palette = {
  bg: '#FFFFFF',
  panel: '#FFFFFF',
  boxStroke: '#94A3B8',
  separator: '#E2E8F0',
  text: '#0F172A',
  muted: '#94A3B8',
  edge: '#CBD5E1',
  neutral: '#475569',
  /** indigo */
  traced1: '#4C6EF5',
  /** magenta */
  traced2: '#C2255C',
  /** amber */
  traced3: '#B45309',
  denial: '#DC2626',
};

/** §3.7's dark column. */
export const darkPalette: Palette = {
  bg: '#0B1220',
  panel: '#131C2E',
  boxStroke: '#55617A',
  separator: '#2B3648',
  text: '#E2E8F0',
  muted: '#64748B',
  edge: '#3F4A5A',
  neutral: '#94A3B8',
  traced1: '#8DA2FB',
  traced2: '#F783AC',
  traced3: '#FBBF24',
  denial: '#F87171',
};

export const ROOT_CLASS = 'rmf';

const colorKeys = Object.keys(lightPalette) as ColorKey[];

/** The custom-property name carrying a color role. */
export function cssVar(key: ColorKey): string {
  return `--rmf-${key.toLowerCase()}`;
}

/** Class that strokes an element with a color role. */
export function strokeClass(key: ColorKey): string {
  return `rmf-s-${key.toLowerCase()}`;
}

/** Class that fills an element with a color role. */
export function fillClass(key: ColorKey): string {
  return `rmf-f-${key.toLowerCase()}`;
}

function declarations(palette: Palette): string {
  return colorKeys.map((key) => `${cssVar(key)}:${palette[key]}`).join(';');
}

/**
 * The stylesheet embedded in the `<svg>`.
 *
 * `theme` pins the palette by writing `data-theme` on the root; leaving it
 * undefined follows the reader's system setting with light as the base.
 */
export function diagramStylesheet(): string {
  const strokeRules = colorKeys
    .map((key) => `.${strokeClass(key)}{stroke:var(${cssVar(key)})}`)
    .join('');
  const fillRules = colorKeys.map((key) => `.${fillClass(key)}{fill:var(${cssVar(key)})}`).join('');

  return [
    `.${ROOT_CLASS}{${declarations(lightPalette)};font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}`,
    `@media (prefers-color-scheme:dark){.${ROOT_CLASS}:not([data-theme="light"]){${declarations(darkPalette)}}}`,
    `.${ROOT_CLASS}[data-theme="dark"]{${declarations(darkPalette)}}`,
    strokeRules,
    fillRules,
    // Layer dimming is a class, not an inline opacity, so a host page can
    // restyle the focus view without re-rendering.
    `.${ROOT_CLASS} .rmf-layer{transition:opacity 120ms ease-out}`,
    `.${ROOT_CLASS} .rmf-dim{opacity:0.12}`,
    `.${ROOT_CLASS} .rmf-dim-soft{opacity:0.4}`,
    `.${ROOT_CLASS} .rmf-clickable{cursor:pointer}`,
    `.${ROOT_CLASS} text{dominant-baseline:middle}`,
    // Selection animations. Both classes are applied only while a symbol is
    // selected, so these rules match nothing in the static export.
    //
    // Marching dashes: the pattern's start is placed at `-dashoffset` along the
    // path, so driving the offset *negative* walks the dashes toward the path's
    // end. Every lane is drawn from its origin to its head — the arrowhead is
    // `marker-end` — so "toward the end" is always "the way the exposure
    // travels", and the offset step is one full dash cycle, which loops
    // seamlessly.
    `@keyframes rmf-march{from{stroke-dashoffset:0}to{stroke-dashoffset:-12}}`,
    `.${ROOT_CLASS} .rmf-flow{stroke-dasharray:6 6;animation:rmf-march 0.9s linear infinite}`,
    // A pulse on the rows that say "this symbol is available here", so the
    // arrivals a selection is about are findable without tracing the lane.
    `@keyframes rmf-pulse{0%,100%{opacity:1}50%{opacity:0.35}}`,
    `.${ROOT_CLASS} .rmf-blink{animation:rmf-pulse 1s ease-in-out infinite}`,
    // Reduced motion keeps both signals and drops the movement: the lanes stay
    // dashed, and the rows stay at full opacity while everything else is dimmed.
    `@media (prefers-reduced-motion:reduce){` +
      `.${ROOT_CLASS} .rmf-flow{animation:none}` +
      `.${ROOT_CLASS} .rmf-blink{animation:none;opacity:1}}`,
    // Labels that sit on top of the line they describe knock a hole in it,
    // rather than being struck through by it.
    `.${ROOT_CLASS} .rmf-knockout{paint-order:stroke fill;stroke:var(${cssVar('bg')});stroke-width:4.2;stroke-linejoin:round}`,
  ].join('\n');
}
