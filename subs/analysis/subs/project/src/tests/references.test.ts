import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProject } from '../read-project.js';
import type { ProjectInputView, ProjectReadOptions } from '../interfaces/project.js';
import { fixture, limits, put, syntax } from './fixtures.js';

let root: string;
let retained: ProjectInputView | undefined;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ramify-reference-path-')); await fixture(root);
  await put(root, 'src/interfaces/api.ts', 'export const value = 1;');
  await put(root, 'src/tests/fixture.ts', 'export const value = 1;');
});
afterEach(async () => { await retained?.dispose(); retained = undefined; await rm(root, { recursive: true, force: true }); });
async function reference(path: string, kind: 'expose-src' | 'expose-test' = 'expose-src') {
  const parse: ProjectReadOptions['parse'] = (file, text) => {
    const parsed = syntax(file, text);
    if (parsed.status !== 'valid') return parsed;
    const span = { start: 24, end: 70, line: 3, column: 1 };
    return { ...parsed, document: { ...parsed.document, statements: [{ index: 0, kind, span,
      selection: { kind: 'named', names: [{ name: 'value', alias: 'value', span }] },
      from: { value: path, span }, tags: null, destinations: ['parent'],
    }] } };
  };
  const result = await readProject({ request: { cwd: root, root, scope: 'whole-project', configuration: 'discover' }, parse, limits });
  if (result.status === 'acquired') retained = result.view;
  const inventory = result.status === 'acquired' ? result.view.inventory : result.status === 'cancelled' ? null : result.inventory;
  return { result, inventory, reference: inventory?.references[0] };
}

describe('exact owned source paths', () => {
  it('normalizes dot segments without probing and preserves the decoded path', async () => {
    const checked = await reference('./interfaces/../interfaces/api.ts');
    expect(checked.result.status).toBe('acquired');
    expect(checked.reference).toMatchObject({ decoded: './interfaces/../interfaces/api.ts', normalized: 'src/interfaces/api.ts', status: 'file', interfaceEligible: true });
  });
  it('does not strip a src prefix from an authored source reference', async () => {
    expect((await reference('src/interfaces/api.ts')).reference).toMatchObject({ normalized: 'src/src/interfaces/api.ts', status: 'missing' });
  });
  it('keeps testing classification when expose-src selects nested testing source', async () => {
    const checked = await reference('tests/fixture.ts');
    expect(checked.result.status).toBe('acquired');
    expect(checked.reference?.interfaceEligible).toBe(false);
    expect(checked.inventory?.files.find(file => file.path === 'src/tests/fixture.ts')?.area).toBe('tests');
  });
  it('resolves expose-test only from the fixed tests root', async () => {
    expect((await reference('fixture.ts', 'expose-test')).reference).toMatchObject({ normalized: 'src/tests/fixture.ts', status: 'file', interfaceEligible: false });
  });
  it('rejects testing-root escape even when it reaches the same owner', async () => {
    expect((await reference('../interfaces/api.ts', 'expose-test')).reference?.status).toBe('escape');
  });
  it('reports a directory as a non-file reference', async () => {
    const checked = await reference('interfaces');
    expect(checked.result.status).toBe('invalid'); expect(checked.reference?.status).toBe('directory');
  });
  it.each(['interfaces\\api.ts', 'interfaces//api.ts', 'interfaces/api.ts/', '/interfaces/api.ts', 'C:/interfaces/api.ts', 'https://example/api.ts', 'interfaces/*.ts'])('rejects unsupported path spelling %s', async path => {
    const checked = await reference(path);
    expect(checked.result.status).toBe('invalid'); expect(checked.reference?.status).toBe('invalid-path');
  });
  it('compares every directory component exactly, independently of OS lookup', async () => {
    expect((await reference('Interfaces/api.ts')).reference?.status).toBe('case-mismatch');
  });
  it('rejects a symlink component even if it points to the same owned source tree', async () => {
    await symlink(join(root, 'src/interfaces'), join(root, 'src/alias'));
    expect((await reference('alias/api.ts')).reference?.status).toBe('symlink');
  });
  it('does not classify nested helpers/interfaces as the interface root', async () => {
    await put(root, 'src/helpers/interfaces/api.ts', 'export const value = 1;');
    expect((await reference('helpers/interfaces/api.ts')).reference).toMatchObject({ status: 'file', interfaceEligible: false });
  });
});
