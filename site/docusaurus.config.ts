import type * as Preset from '@docusaurus/preset-classic';
import type { Config, Plugin } from '@docusaurus/types';
import path from 'node:path';

/**
 * Portability discipline (plan Design decision 3): this directory is a thin
 * shell. It holds configuration and pages only - every component, every piece
 * of logic and every piece of data is imported from `../src`. Nothing here is
 * swizzled, and page bodies avoid framework-specific syntax wherever plain
 * MDX works.
 *
 * There is deliberately no docs plugin. The normative specification lives at
 * `ramify/docs/model/cross-module-importability-rules.md` and ships with the
 * repository; the site references that path rather than rendering - and
 * thereby risking a divergent second copy of - the document itself.
 */

const RAMIFY_SRC = path.resolve(__dirname, '..', 'src');

/**
 * Teach webpack to read ramify's source directly.
 *
 * Two adjustments, both purely about resolution - no transform is added, and
 * no code lives here:
 *
 * - `@ramify/*` points at `../src`, so pages never spell a `../../..` path.
 * - `extensionAlias` maps the ESM-mandated `.js` specifiers used throughout
 *   `../src` onto the `.ts`/`.tsx` files that actually implement them.
 *
 * Docusaurus already transpiles any non-`node_modules` file it is asked to
 * bundle, and already aliases `react`/`react-dom` to this package's copies, so
 * the source compiles and shares one React instance without further help.
 */
function ramifySourcePlugin(): Plugin {
  return {
    name: 'ramify-source',
    configureWebpack: () => ({
      resolve: {
        alias: { '@ramify': RAMIFY_SRC },
        extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
      },
    }),
  };
}

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

  plugins: [ramifySourcePlugin],

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
