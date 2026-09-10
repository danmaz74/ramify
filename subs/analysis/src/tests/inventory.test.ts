import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acquireInventory } from '../inventory-entry.js';
import type { InventoryInputs } from '../inventory-entry.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

async function fixture(run: (root: string, inputs: InventoryInputs) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-inventory-'));
  try {
    const files: Record<string, string> = {
      'module.ramify': 'ramify 1\nmodule fixture tagged [browser]\n',
      'package.json': '{"type":"module"}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', types: [] }, include: ['src', 'outside.ts'] }),
      'src/interfaces/api.ts': 'export interface Api { readonly name: string }',
      'src/helpers/tests/ordinary.ts': 'export const ordinary = 1;',
      'src/tests/nested.ts': 'export const test = 1;',
      'src/resource.css': '.root {}',
      'outside.ts': 'export const outside = 1;',
      'subs/specs/module.ramify': 'ramify 1\nmodule specs tagged [testing, browser, dispatch]\n',
      'subs/specs/src/interfaces/spec.ts': 'export const spec = 1;',
      'subs/specs/src/tests/nested.ts': 'export const nested = 1;',
      'subs/empty/module.ramify': 'ramify 1\nmodule empty\n',
    };
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text);
    }
    await run(root, { project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), limits: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
        maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
        maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 } });
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('inventory analysis entry', () => {
  it('retains whole-project sources, resources and empty owners with model-derived profiles', async () => fixture(async (root, inputs) => {
    const result = await acquireInventory(inputs);
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error(JSON.stringify(result));
    expect(result.snapshot.inventory.modules.map(module => module.id)).toEqual(['fixture', 'fixture/empty', 'fixture/specs']);
    expect(result.snapshot.areas).toEqual(expect.arrayContaining([
      { owner: 'fixture', kind: 'ordinary', root: 'src', profile: ['browser'] },
      { owner: 'fixture', kind: 'tests', root: 'src/tests', profile: ['testing'] },
      { owner: 'fixture/specs', kind: 'ordinary', root: 'subs/specs/src', profile: ['browser', 'dispatch', 'testing'] },
      { owner: 'fixture/specs', kind: 'tests', root: 'subs/specs/src/tests', profile: ['dispatch', 'testing'] },
    ]));
    expect(result.snapshot.inventory.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'src/helpers/tests/ordinary.ts', area: 'ordinary' }),
      expect.objectContaining({ path: 'src/resource.css', kind: 'resource' }),
      expect.objectContaining({ path: 'subs/specs/src/interfaces/spec.ts', area: 'ordinary' }),
    ]));
    expect(result.snapshot.inventory.outsideModuleFiles).toEqual(['outside.ts']);
    expect(result.snapshot.inventory.files.some(file => file.path === 'outside.ts')).toBe(false);
    await expect(stat(join(root, 'subs/empty/src'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(Object.isFrozen(result.snapshot.inventory.modules[0])).toBe(true);
    expect(Object.isFrozen(result.snapshot.areas[0]!.profile)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  }));

  it('uses stable captured identities and never asks a source program to accept source syntax', async () => fixture(async (root, inputs) => {
    await writeFile(join(root, 'src/interfaces/api.ts'), 'import { incomplete source;');
    const first = await acquireInventory(inputs), same = await acquireInventory(inputs);
    expect(first.status).toBe('completed'); expect(same.status).toBe('completed');
    if (first.status !== 'completed' || same.status !== 'completed') throw new Error('Acquisition failed');
    expect(first.snapshot.inputId).toBe(same.snapshot.inputId);
    expect(first).not.toHaveProperty('catalog');
    await writeFile(join(root, 'src/interfaces/api.ts'), 'export const changed = 1;');
    const changed = await acquireInventory(inputs);
    expect(changed.status === 'completed' && changed.snapshot.inputId).not.toBe(first.snapshot.inputId);
    expect(first.snapshot.inventory.files.find(file => file.path === 'src/interfaces/api.ts')!.bytes)
      .toBe(Buffer.byteLength('import { incomplete source;'));
  }));

  it('rejects forged registries before acquisition, and invalid headers without partial snapshots', async () => fixture(async (root, inputs) => {
    expect(await acquireInventory({ ...inputs, project: { ...inputs.project, root: join(root, 'absent') },
      registry: { ...inputs.registry, id: 'forged' } })).toMatchObject({ status: 'invalid', diagnostics: [{ code: 'invalid-registry' }] });
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture tagged [unknown]\n');
    const result = await acquireInventory(inputs);
    expect(result).toMatchObject({ status: 'invalid', diagnostics: [{ code: 'unknown-tag', location: { file: 'module.ramify', line: 2 } }] });
    expect(result).not.toHaveProperty('snapshot');
  }));

  it('preserves parser locations and distinguishes invalid, unavailable and exhausted acquisition', async () => fixture(async (root, inputs) => {
    const marker = join(root, 'module.ramify');
    const original = await readFile(marker, 'utf8');
    await writeFile(marker, `${original}expose-test * from "api.ts" to parent\n`);
    expect(await acquireInventory(inputs)).toMatchObject({ status: 'invalid', diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-selection', location: expect.objectContaining({ line: 3 }) }),
    ]) });
    await writeFile(marker, original);
    expect(await acquireInventory({ ...inputs, limits: { ...inputs.limits, maxOwners: 1 } }))
      .toMatchObject({ status: 'incomplete', diagnostics: [{ code: 'resource-limit' }] });
    expect(await acquireInventory({ ...inputs, limits: { ...inputs.limits, attempts: 4 } })).toMatchObject({ status: 'unavailable' });
    expect(await acquireInventory({ ...inputs, limits: { ...inputs.limits, deadlineMs: 1 } })).toMatchObject({ status: 'incomplete' });
  }));

  it('finishes cancellation and releases acquisition before a subsequent fresh run', async () => fixture(async (_root, inputs) => {
    const before = new AbortController(); before.abort();
    expect(await acquireInventory(inputs, { signal: before.signal })).toEqual({ status: 'cancelled' });
    const during = new AbortController();
    const pending = acquireInventory(inputs, { signal: during.signal });
    const timer = setTimeout(() => during.abort(), 20);
    try { expect(await pending).toEqual({ status: 'cancelled' }); }
    finally { clearTimeout(timer); }
    expect((await acquireInventory(inputs)).status).toBe('completed');
  }));
});
