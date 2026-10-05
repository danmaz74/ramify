import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';

/**
 * Portability discipline (plan Design decision 3): this directory is a thin
 * shell. Diagrams and model data come from the toolkit's `ramify.ts/presentation`
 * package export, resolved from the packed candidate that `npm run site:prepare`
 * (run by `npm run site:build`) installs into this package's `node_modules`
 * without saving it; the site never reads toolkit source. Nothing here is
 * swizzled, and page bodies avoid framework-specific syntax wherever plain
 * MDX works.
 *
 * There is deliberately no docs plugin. The authoritative rules and vocabulary
 * live in `ramify/docs/model/cross-module-importability.principles.md` and
 * `ramify/docs/model/glossary.md`. The site teaches that model and references
 * the internal documents; its glossary reproduces the canonical definitions.
 */

const config: Config = {
  title: 'ramify.ts',
  tagline: 'Multi-file hierarchical modules for TypeScript',
  // No favicon: the scaffold's placeholder images were stripped, and this site
  // owns no image assets of its own. `static/diagrams/model-core.svg` is the
  // emitter's checked-in export, not site artwork.

  // GitHub Pages serves the site at https://danmaz74.github.io/ramify/; local
  // builds and serves stay at the root. CI sets BASE_URL=/ramify/.
  url: 'https://danmaz74.github.io',
  baseUrl: process.env.BASE_URL ?? '/',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  markdown: {
    // `.md` stays CommonMark, `.mdx` keeps full MDX. Pages then mean exactly
    // what their extension says, which is one less thing a later framework
    // switch has to reproduce.
    format: 'detect',
  },

  // Keeps the CSS anchor-target highlight working across the SPA router's
  // client-side navigations - see the comment in the module itself.
  clientModules: ['./src/client/anchor-target.ts'],

  presets: [
    [
      'classic',
      {
        docs: false,
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'ramify.ts',
      items: [
        { to: '/modularity', label: 'Why', position: 'left' },
        { to: '/model', label: 'The core model', position: 'left' },
        { to: '/tags', label: 'Tags', position: 'left' },
        { to: '/explorer', label: 'Module dependency explorer', position: 'left' },
        { to: '/glossary', label: 'Glossary', position: 'left' },
      ],
    },
    footer: {
      style: 'light',
      copyright: 'ramify.ts - multi-file hierarchical modules for TypeScript.',
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
