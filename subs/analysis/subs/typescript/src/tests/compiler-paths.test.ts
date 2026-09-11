import { expect, it } from 'vitest';
import { code, exported, file, resource, withCatalog } from './fixtures.js';

it('uses source filename spelling for code originals, forwarding, resource descriptions and access targets', async () => {
  await withCatalog({
    'src/MixedCase/Original.ts': 'export const value = 1; export const second = 2;',
    'src/MixedCase/Other.ts': 'export const value = 3;',
    'src/MixedCase/Barrel.ts': "export * from './Original.js'; export * from './Other.js'; export { value } from './Original.js';",
    'src/MixedCase/Theme.css': '.theme { color: red; }',
    'src/MixedCase/Theme.d.css.ts': 'declare const classes: { theme: string }; export default classes;',
    'src/MixedCase/Resource.ts': "export { default as theme } from './Theme.css';",
    'src/Consumer.ts': "import { value } from './MixedCase/Barrel.js'; import theme from './MixedCase/Theme.css';",
  }, async ({ catalog, source }) => {
    expect(catalog.coverage).toEqual([]);
    expect(exported(catalog, 'src/MixedCase/Barrel.ts', 'value').original).toEqual(code('MixedCase/Original.ts', 'value'));
    expect(exported(catalog, 'src/MixedCase/Barrel.ts', 'second').original).toEqual(code('MixedCase/Original.ts', 'second'));
    expect(exported(catalog, 'src/MixedCase/Resource.ts', 'theme').original).toEqual(resource('MixedCase/Theme.css'));
    expect(file(catalog, 'src/MixedCase/Theme.css').descriptionFiles).toEqual(['src/MixedCase/Theme.d.css.ts']);
    const accesses = await source.accesses();
    expect(accesses.coverage).toEqual([]);
    const consumer = accesses.accesses.filter(access => access.importer.file === 'src/Consumer.ts');
    expect(consumer.map(access => access.target.kind === 'application' && access.target.origin.file))
      .toEqual(['src/MixedCase/Barrel.ts', 'src/MixedCase/Theme.css']);
    expect(consumer[0]!.selections[0]!.original).toEqual(code('MixedCase/Original.ts', 'value'));
    expect(consumer[0]!.selections[0]!.forwarding.map(origin => origin.file)).toContain('src/MixedCase/Barrel.ts');
  });
}, 30_000);
