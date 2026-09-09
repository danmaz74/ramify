import { describe, expect, it } from 'vitest';
import { code, configuration, exported, file, resource, withCatalog } from './fixtures.js';

const suffixed = (moduleSuffixes: readonly string[]) => JSON.stringify({ ...configuration,
  compilerOptions: { ...configuration.compilerOptions, moduleSuffixes },
});
const customDescription = 'declare const classes: { custom: string }; export default classes; export declare const customName: string;';

describe('compiler-selected resource declarations with moduleSuffixes', () => {
  for (const suffix of ['.custom', '.platform.mobile']) {
    it(`keeps the physical CSS original when the selected declaration uses ${suffix}`, async () => {
      await withCatalog({
        'tsconfig.json': suffixed([suffix, '']),
        'src/theme.css': '.custom {}',
        [`src/theme.d.css${suffix}.ts`]: customDescription,
        'src/forward.ts': 'export { default as theme, customName } from "./theme.css";',
      }, ({ catalog }) => {
        expect(exported(catalog, 'src/forward.ts', 'theme').original).toEqual(resource('theme.css'));
        expect(exported(catalog, 'src/forward.ts', 'customName').original).toEqual(resource('theme.css', 'customName'));
        expect(file(catalog, 'src/theme.css')).toMatchObject({ state: 'complete',
          descriptionFiles: [`src/theme.d.css${suffix}.ts`] });
        expect(file(catalog, 'src/theme.css').exports.map(entry => entry.name).sort()).toEqual(['customName', 'default']);
      });
    }, 15_000);
  }

  it('uses inherited suffixes and the selected description through a configured resource alias', async () => {
    await withCatalog({
      'tsconfig.json': '{"extends":"./config/base.json","include":["src"]}',
      'config/base.json': JSON.stringify({ compilerOptions: { ...configuration.compilerOptions,
        moduleSuffixes: ['.custom', ''], paths: { '@theme': ['../src/theme.css'] },
      } }),
      'src/theme.css': '.custom {}',
      'src/theme.d.css.custom.ts': customDescription,
      'src/theme.d.css.ts': 'declare const classes: { fallback: string }; export default classes; export declare const fallbackName: string;',
      'src/forward.ts': 'export { default as theme, customName } from "@theme";',
    }, ({ catalog }) => {
      expect(exported(catalog, 'src/forward.ts', 'theme').original).toEqual(resource('theme.css'));
      expect(file(catalog, 'src/theme.css')).toMatchObject({ state: 'complete', descriptionFiles: ['src/theme.d.css.custom.ts'] });
      expect(file(catalog, 'src/theme.css').exports.map(entry => entry.name).sort()).toEqual(['customName', 'default']);
    });
  }, 15_000);

  for (const present of [true, false]) {
    it(`preserves resource interpretation after rootDirs redirects a suffixed declaration (${present ? 'present' : 'missing'} resource)`, async () => {
      await withCatalog({
        'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions,
          moduleSuffixes: ['.custom', ''], rootDirs: ['./src/first', './src/second'],
        } }),
        ...(present ? { 'src/second/theme.css': '.custom {}' } : {}),
        'src/second/theme.d.css.custom.ts': customDescription,
        'src/first/forward.ts': 'export { default as theme } from "./theme.css";',
      }, ({ catalog }) => {
        const selected = exported(catalog, 'src/first/forward.ts', 'theme');
        if (present) {
          expect(selected.original).toEqual(resource('second/theme.css'));
          expect(file(catalog, 'src/first/forward.ts').state).toBe('complete');
        } else {
          expect(selected.original).toBeNull();
          expect(file(catalog, 'src/first/forward.ts').state).toBe('incomplete');
          expect(catalog.coverage).toContainEqual(expect.objectContaining({ code: 'resource-target',
            location: expect.objectContaining({ file: 'src/first/forward.ts' }) }));
        }
      });
    }, 15_000);
  }

  it('retains the configured empty-suffix fallback when the specialized declaration is absent', async () => {
    await withCatalog({
      'tsconfig.json': suffixed(['.custom', '']),
      'src/theme.css': '.fallback {}',
      'src/theme.d.css.ts': customDescription,
      'src/forward.ts': 'export { default as theme } from "./theme.css";',
    }, ({ catalog }) => {
      expect(exported(catalog, 'src/forward.ts', 'theme').original).toEqual(resource('theme.css'));
      expect(file(catalog, 'src/theme.css')).toMatchObject({ state: 'complete', descriptionFiles: ['src/theme.d.css.ts'] });
    });
  }, 15_000);

  it('does not confuse an extension ending in a configured suffix with a different resource', async () => {
    await withCatalog({
      'tsconfig.json': suffixed(['', 'custom']),
      'src/theme.css': '.css {}',
      'src/theme.csscustom': '.csscustom {}',
      'src/theme.d.csscustom.ts': customDescription,
      'src/forward.ts': 'export { default as css } from "./theme.css"; export { default as csscustom } from "./theme.csscustom";',
    }, ({ catalog }) => {
      expect(exported(catalog, 'src/forward.ts', 'css').original).toEqual(resource('theme.css'));
      expect(exported(catalog, 'src/forward.ts', 'csscustom').original).toEqual(resource('theme.csscustom'));
      expect(file(catalog, 'src/theme.css').descriptionFiles).toEqual(['src/theme.d.csscustom.ts']);
      expect(file(catalog, 'src/theme.csscustom').descriptionFiles).toEqual(['src/theme.d.csscustom.ts']);
    });
  }, 15_000);

  it('recognizes the compiler-selected suffixed legacy CSS declaration', async () => {
    await withCatalog({
      'tsconfig.json': suffixed(['.custom', '']),
      'src/theme.css': '.custom {}',
      'src/theme.css.custom.d.ts': customDescription,
      'src/forward.ts': 'export { default as theme } from "./theme.css";',
    }, ({ catalog }) => {
      expect(exported(catalog, 'src/forward.ts', 'theme').original).toEqual(resource('theme.css'));
      expect(file(catalog, 'src/theme.css')).toMatchObject({ state: 'complete', descriptionFiles: ['src/theme.css.custom.d.ts'] });
    });
  }, 15_000);

  it('does not let a suffixed declaration establish a missing physical CSS resource', async () => {
    await withCatalog({
      'tsconfig.json': suffixed(['.custom', '']),
      'src/theme.d.css.custom.ts': customDescription,
      'src/forward.ts': 'export { default as theme } from "./theme.css";',
    }, ({ catalog }) => {
      expect(file(catalog, 'src/forward.ts').state).toBe('incomplete');
      expect(exported(catalog, 'src/forward.ts', 'theme').original).toBeNull();
      expect(catalog.originals.some(entry => entry.id.kind === 'resource')).toBe(false);
      expect(catalog.coverage).toContainEqual(expect.objectContaining({ code: 'resource-target',
        location: expect.objectContaining({ file: 'src/forward.ts' }) }));
    });
  }, 15_000);

  it('preserves the compiler-selected suffixed code binding as a code original', async () => {
    await withCatalog({
      'tsconfig.json': suffixed(['.custom', '']),
      'src/value.custom.ts': 'export const value = "custom code";',
      'src/value.ts': 'export const value = "fallback code";',
      'src/forward.ts': 'export { value } from "./value.js";',
    }, ({ catalog }) => {
      expect(exported(catalog, 'src/forward.ts', 'value').original).toEqual(code('value.custom.ts', 'value'));
      expect(file(catalog, 'src/forward.ts').state).toBe('complete');
    });
  }, 15_000);

  it('keeps an alias explicitly naming a suffixed declaration as code', async () => {
    await withCatalog({
      'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions,
        moduleSuffixes: ['.custom', ''], paths: { '@description': ['./src/theme.d.css.ts'] },
      } }),
      'src/theme.css': '.custom {}',
      'src/theme.d.css.custom.ts': customDescription,
      'src/forward.ts': 'export { default as description } from "@description";',
    }, ({ catalog }) => {
      expect(exported(catalog, 'src/forward.ts', 'description').original).toEqual(code('theme.d.css.custom.ts', 'classes'));
      expect(file(catalog, 'src/forward.ts').state).toBe('complete');
    });
  }, 15_000);

  it('keeps an earlier compiler-selected package declaration ahead of a resource paths fallback', async () => {
    await withCatalog({
      'tsconfig.json': JSON.stringify({ ...configuration, compilerOptions: { ...configuration.compilerOptions,
        moduleSuffixes: ['.custom', ''], paths: { '@selected': ['./node_modules/pkg/index.d.ts', './src/theme.css'] },
      } }),
      'node_modules/pkg/package.json': '{"name":"pkg","type":"module","types":"./index.d.ts"}',
      'node_modules/pkg/index.d.ts': 'declare const library: number; export default library;',
      'src/theme.css': '.custom {}',
      'src/theme.d.css.custom.ts': customDescription,
      'src/forward.ts': 'export { default as selected } from "@selected";',
    }, ({ catalog }) => {
      expect(exported(catalog, 'src/forward.ts', 'selected').original).toBeNull();
      expect(catalog.coverage).toContainEqual(expect.objectContaining({ location: expect.objectContaining({ file: 'src/forward.ts' }),
        message: expect.stringContaining('compiler-resolved external') }));
    });
  }, 15_000);
});
