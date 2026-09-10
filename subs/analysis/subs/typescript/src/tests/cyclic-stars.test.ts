import { describe, expect, it } from 'vitest';
import { code, exported, file, withCatalog } from './fixtures.js';

const variants = [false, true].flatMap(reversePaths => [false, true].flatMap(reverseStatements =>
  [false, true].map(consumerFirst => ({
    label: `${reversePaths ? 'B' : 'A'} path first, ${reverseStatements ? 'leaf' : 'cycle'} statement first, consumer ${consumerFirst ? 'first' : 'last'}`,
    a: reversePaths ? 'b-barrel' : 'a-barrel', b: reversePaths ? 'a-barrel' : 'b-barrel',
    consumer: consumerFirst ? '00-consumer' : 'zz-consumer', reverseStatements,
  }))));

function stars(cycle: string, leaf: string, reverse = false): string {
  const statements = [`export * from "./${cycle}.js";`, `export * from "./${leaf}.js";`];
  return (reverse ? statements.reverse() : statements).join('\n');
}

describe('cyclic source-star catalogs', () => {
  it.each([
    { namespace: 'a-namespace', star: 'z-star' },
    { namespace: 'z-namespace', star: 'a-star' },
  ])('keeps recursive namespace facts finite when $namespace refers to $star', async ({ namespace, star }) => {
    await withCatalog({
      [`src/${namespace}.ts`]: `export * as ns from "./${star}.js";`,
      [`src/${star}.ts`]: `export * from "./${namespace}.js"; export const own = 1;`,
    }, ({ catalog }) => {
      expect(file(catalog, `src/${namespace}.ts`).state).not.toBe('complete');
      expect(file(catalog, `src/${star}.ts`).state).not.toBe('complete');
      expect(exported(catalog, `src/${star}.ts`, 'own').original).toEqual(code(`${star}.ts`, 'own'));
      expect(catalog.coverage.some(limit => limit.code === 'incomplete-exports')).toBe(true);
      expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
    });
  }, 30_000);

  it.each(variants)('preserves ambiguity and known exports with $label', async ({ a, b, consumer, reverseStatements }) => {
    await withCatalog({
      'src/left.ts': 'export const clash = "left"; export const leftOnly = 1;',
      'src/right.ts': 'export const clash = "right"; export const rightOnly = 2;',
      [`src/${a}.ts`]: stars(b, 'left', reverseStatements),
      [`src/${b}.ts`]: stars(a, 'right', reverseStatements),
      [`src/${consumer}.ts`]: [
        `export { clash as fromA, leftOnly } from "./${a}.js";`,
        `export { clash as fromB, rightOnly } from "./${b}.js";`,
      ].join('\n'),
    }, ({ catalog }) => {
      for (const barrel of [a, b]) {
        const path = `src/${barrel}.ts`;
        expect.soft(file(catalog, path).state, path).toBe('ambiguous');
        expect.soft(exported(catalog, path, 'clash').original, path).toBeNull();
        expect.soft(exported(catalog, path, 'leftOnly').original, path).toEqual(code('left.ts', 'leftOnly'));
        expect.soft(exported(catalog, path, 'rightOnly').original, path).toEqual(code('right.ts', 'rightOnly'));
        expect.soft(catalog.coverage.some(limit => file(catalog, path).issueIds.includes(limit.id)
          && limit.code === 'ambiguous-original'), path).toBe(true);
      }
      const downstream = `src/${consumer}.ts`;
      expect.soft(file(catalog, downstream).state).not.toBe('complete');
      expect.soft(exported(catalog, downstream, 'fromA').original).toBeNull();
      expect.soft(exported(catalog, downstream, 'fromB').original).toBeNull();
      expect.soft(exported(catalog, downstream, 'leftOnly').original).toEqual(code('left.ts', 'leftOnly'));
      expect.soft(exported(catalog, downstream, 'rightOnly').original).toEqual(code('right.ts', 'rightOnly'));
    });
  }, 30_000);

  it('keeps legal cycles complete when both leaf paths reach the same original', async () => {
    await withCatalog({
      'src/original.ts': 'export const shared = 1;',
      'src/left.ts': 'export { shared } from "./original.js"; export const leftOnly = 1;',
      'src/right.ts': 'export { shared } from "./original.js"; export const rightOnly = 2;',
      'src/a-barrel.ts': stars('b-barrel', 'left'),
      'src/b-barrel.ts': stars('a-barrel', 'right'),
      'src/00-consumer.ts': 'export { shared as fromA } from "./a-barrel.js"; export { shared as fromB } from "./b-barrel.js";',
    }, ({ catalog }) => {
      for (const path of ['src/a-barrel.ts', 'src/b-barrel.ts']) {
        expect(file(catalog, path)).toMatchObject({ state: 'complete', issueIds: [] });
        expect(exported(catalog, path, 'shared').original).toEqual(code('original.ts', 'shared'));
        expect(exported(catalog, path, 'leftOnly').original).toEqual(code('left.ts', 'leftOnly'));
        expect(exported(catalog, path, 'rightOnly').original).toEqual(code('right.ts', 'rightOnly'));
      }
      expect(file(catalog, 'src/00-consumer.ts').state).toBe('complete');
      expect(exported(catalog, 'src/00-consumer.ts', 'fromA').original).toEqual(code('original.ts', 'shared'));
      expect(exported(catalog, 'src/00-consumer.ts', 'fromB').original).toEqual(code('original.ts', 'shared'));
      expect(catalog.coverage).toEqual([]);
    });
  }, 30_000);

  it('honors explicit named overrides in cyclic barrels with distinct leaf originals', async () => {
    await withCatalog({
      'src/left.ts': 'export const clash = "left"; export const leftOnly = 1;',
      'src/right.ts': 'export const clash = "right"; export const rightOnly = 2;',
      'src/a-barrel.ts': `${stars('b-barrel', 'left')}\nexport { clash } from "./left.js";`,
      'src/b-barrel.ts': `export { clash } from "./right.js";\n${stars('a-barrel', 'right', true)}`,
      'src/zz-consumer.ts': 'export { clash as fromA } from "./a-barrel.js"; export { clash as fromB } from "./b-barrel.js";',
    }, ({ catalog }) => {
      for (const [path, definingFile] of [['src/a-barrel.ts', 'left.ts'], ['src/b-barrel.ts', 'right.ts']]) {
        expect(file(catalog, path)).toMatchObject({ state: 'complete', issueIds: [] });
        expect(exported(catalog, path, 'clash').original).toEqual(code(definingFile, 'clash'));
        expect(exported(catalog, path, 'leftOnly').original).toEqual(code('left.ts', 'leftOnly'));
        expect(exported(catalog, path, 'rightOnly').original).toEqual(code('right.ts', 'rightOnly'));
      }
      expect(file(catalog, 'src/zz-consumer.ts').state).toBe('complete');
      expect(exported(catalog, 'src/zz-consumer.ts', 'fromA').original).toEqual(code('left.ts', 'clash'));
      expect(exported(catalog, 'src/zz-consumer.ts', 'fromB').original).toEqual(code('right.ts', 'clash'));
      expect(catalog.coverage).toEqual([]);
    });
  }, 30_000);
});
