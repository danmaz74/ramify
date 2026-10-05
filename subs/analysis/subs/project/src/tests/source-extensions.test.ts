import { describe, expect, it } from 'vitest';
import { auxiliarySource, inventoryFileKind } from '../inventory.js';
import type { ConfigurationData } from '../configuration-data.js';

const typeScript = ['main.ts', 'view.tsx', 'module.mts', 'module.cts', 'types.d.ts', 'types.d.mts', 'types.d.cts'];
const javaScript = ['main.js', 'view.jsx', 'module.mjs', 'module.cjs'];
/** Extension-like names that are no compiler source extension. */
const nonExtensions = ['view.mtsx', 'view.ctsx', 'view.mjsx', 'view.cjsx'];
const configuration = (options: Record<string, unknown>): ConfigurationData => ({ options, files: [], references: [] });

describe('compiler source extensions', () => {
  it('inventories exactly the eight extensions, declaration files included, as source inside src/', () => {
    for (const name of [...typeScript, ...javaScript]) expect([name, inventoryFileKind(`src/${name}`)]).toEqual([name, 'source']);
    for (const name of nonExtensions) expect([name, inventoryFileKind(`src/${name}`)]).toEqual([name, 'resource']);
  });
  it('admits JavaScript auxiliary source only when the configuration admits JavaScript, and never a non-extension', () => {
    const plain = configuration({}), allowJs = configuration({ allowJs: true }), checkJs = configuration({ checkJs: true });
    const explicitlyOff = configuration({ allowJs: false, checkJs: true });
    for (const name of typeScript) {
      for (const config of [plain, allowJs, checkJs, explicitlyOff]) expect([name, auxiliarySource(`scripts/${name}`, config)]).toEqual([name, true]);
    }
    for (const name of javaScript) {
      expect([name, auxiliarySource(`scripts/${name}`, plain)]).toEqual([name, false]);
      expect([name, auxiliarySource(`scripts/${name}`, allowJs)]).toEqual([name, true]);
      expect([name, auxiliarySource(`scripts/${name}`, checkJs)]).toEqual([name, true]);
      expect([name, auxiliarySource(`scripts/${name}`, explicitlyOff)]).toEqual([name, false]);
    }
    for (const name of nonExtensions) {
      for (const config of [plain, allowJs, checkJs, explicitlyOff]) expect([name, auxiliarySource(`scripts/${name}`, config)]).toEqual([name, false]);
    }
  });
});
