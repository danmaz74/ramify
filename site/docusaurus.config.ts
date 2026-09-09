import type * as Preset from '@docusaurus/preset-classic';
import type { Config, Plugin } from '@docusaurus/types';
import path from 'node:path';

/**
 * Portability discipline (plan Design decision 3): this directory is a thin
 * shell. Diagrams and model data come from the declared presentation, model
 * and layout entries. Nothing here is
 * swizzled, and page bodies avoid framework-specific syntax wherever plain
 * MDX works.
 *
 * There is deliberately no docs plugin. The authoritative rules and vocabulary
 * live in `ramify/docs/model/cross-module-importability.principles.md` and
 * `ramify/docs/model/glossary.md`. The site teaches that model and references
 * the internal documents; its glossary reproduces the canonical definitions.
 */

const RAMIFY_ROOT = path.resolve(__dirname, '..');

/**
 * Teach webpack to read ramify's source directly.
 *
 * Two adjustments, both purely about resolution - no transform is added, and
 * no code lives here:
 *
 * - Exact `@ramify/presentation`, `@ramify/model` and `@ramify/layout` aliases
 *   select the portable package surfaces used by the teaching pages.
 * - `extensionAlias` maps the ESM-mandated `.js` specifiers used throughout
 *   those owners onto the `.ts`/`.tsx` files that actually implement them.
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
        alias: {
          '@ramify/presentation$': path.join(RAMIFY_ROOT, 'subs/presentation/src/index.ts'),
          '@ramify/model$': path.join(RAMIFY_ROOT, 'subs/analysis/subs/model/src/index.ts'),
          '@ramify/layout$': path.join(RAMIFY_ROOT, 'subs/presentation/subs/layout/src/index.ts'),
        },
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
