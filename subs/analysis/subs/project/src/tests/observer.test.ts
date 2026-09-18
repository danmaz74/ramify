import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeProject } from '../observer.js';
import type { InventoryUpdate, ProjectObserver, ProjectReadOptions } from '../interfaces/project.js';
import { declaration, fixture, limits, put } from './fixtures.js';

let work: string, root: string;
const observers: ProjectObserver[] = [];
beforeEach(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-observer-')));
  root = join(work, 'project');
  await fixture(root);
  await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
  await put(root, 'subs/child/README.md', '# Child\n\nChild purpose.\n');
  await put(root, 'subs/child/src/child.ts', 'export const child = 1;\n');
});
afterEach(async () => {
  for (const observer of observers.splice(0)) await observer.dispose();
  await rm(work, { recursive: true, force: true });
});

async function observe(changes: Partial<ProjectReadOptions> = {}): Promise<ProjectObserver> {
  const result = await observeProject({ request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' },
    parse: declaration, limits, registry: 'registry/1:test', ...changes });
  expect(result.status, JSON.stringify(result.status === 'observing' ? {} : result)).toBe('observing');
  if (result.status !== 'observing') throw new Error('Expected an observing project');
  observers.push(result.observer);
  return result.observer;
}
function local(update: InventoryUpdate): Extract<InventoryUpdate, { kind: 'local' }> {
  expect(update.kind, JSON.stringify(update)).toBe('local');
  if (update.kind !== 'local') throw new Error('Expected a local update');
  return update;
}

describe('project observer updates', () => {
  it('re-parses one changed description without re-listing any directory', async () => {
    const observer = await observe();
    expect(observer.inventory.modules.map(module => module.id)).toEqual(['fixture', 'fixture/child']);
    const identities = new Map(observer.inputs.map(input => [input.path, input.sha256]));
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child tagged [ui]\n');
    const update = local(await observer.apply([{ path: 'subs/child/module.ramify', kind: 'changed' }]));
    expect([update.descriptions, update.readmes, update.created, update.deleted, update.changed])
      .toEqual([['subs/child/module.ramify'], [], [], [], []]);
    expect(update.inventory.modules.map(module => [module.id, module.headerTags]))
      .toEqual([['fixture', []], ['fixture/child', ['ui']]]);
    expect(observer.inventory).toBe(update.inventory);
    const after = new Map(observer.inputs.map(input => [input.path, input.sha256]));
    expect([...after].filter(([path, sha]) => identities.get(path) !== sha).map(([path]) => path))
      .toEqual(['subs/child/module.ramify']);
    expect(update.inventory.files).toEqual(observer.inventory.files);
  });

  it('re-reads one README as a purpose without re-parsing its description', async () => {
    const observer = await observe();
    const description = observer.inventory.modules[1]!.description;
    await put(root, 'subs/child/README.md', '# Child\n\nChild purpose, restated.\n');
    const update = local(await observer.apply([{ path: join(root, 'subs/child/README.md'), kind: 'changed' }]));
    expect([update.readmes, update.descriptions]).toEqual([['subs/child/README.md'], []]);
    expect(update.inventory.modules[1]!.purpose)
      .toEqual({ state: 'present', readme: 'subs/child/README.md', paragraph: 'Child purpose, restated.' });
    expect(update.inventory.modules[1]!.description).toBe(description);
  });

  it('keeps both a README purpose and a description of the same module changed in one update', async () => {
    const observer = await observe();
    await put(root, 'subs/child/README.md', '# Child\n\nChild purpose, restated.\n');
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child tagged [ui]\n');
    const update = local(await observer.apply([{ path: 'subs/child/README.md', kind: 'changed' }, { path: 'subs/child/module.ramify', kind: 'changed' }]));
    expect([update.readmes, update.descriptions]).toEqual([['subs/child/README.md'], ['subs/child/module.ramify']]);
    expect([update.inventory.modules[1]!.purpose, update.inventory.modules[1]!.headerTags])
      .toEqual([{ state: 'present', readme: 'subs/child/README.md', paragraph: 'Child purpose, restated.' }, ['ui']]);
  });

  it('adds a created owned file to its area and drops a deleted one', async () => {
    const observer = await observe();
    await put(root, 'subs/child/src/extra.ts', 'export const extra = 2;\n');
    const created = local(await observer.apply([{ path: 'subs/child/src/extra.ts', kind: 'created' }]));
    expect([created.created, created.deleted]).toEqual([['subs/child/src/extra.ts'], []]);
    expect(created.inventory.files.map(file => [file.path, file.owner, file.area, file.kind])).toEqual([
      ['src/value.ts', 'fixture', 'ordinary', 'source'],
      ['subs/child/src/child.ts', 'fixture/child', 'ordinary', 'source'],
      ['subs/child/src/extra.ts', 'fixture/child', 'ordinary', 'source'],
    ]);
    expect(observer.inputs.some(input => input.path === 'subs/child/src/extra.ts' && input.role === 'source')).toBe(true);

    await unlink(join(root, 'subs/child/src/extra.ts'));
    const deleted = local(await observer.apply([{ path: 'subs/child/src/extra.ts', kind: 'deleted' }]));
    expect([deleted.created, deleted.deleted]).toEqual([[], ['subs/child/src/extra.ts']]);
    expect(deleted.inventory.files.map(file => file.path)).toEqual(['src/value.ts', 'subs/child/src/child.ts']);
    expect(observer.inputs.some(input => input.path === 'subs/child/src/extra.ts')).toBe(false);
  });

  it('membership-identity-equals-batch: apply leaves compiler observations to retire; probes retirement keeps reads and re-reported probes, all retirement restores the acquisition', async () => {
    await put(root, 'node_modules/pkg/index.d.ts', 'export declare const pkg: number;\n');
    const dependency = join(root, 'node_modules/pkg/index.d.ts'), directory = join(root, 'node_modules/pkg');
    const kept = join(root, 'node_modules/kept.d.ts'), gone = join(root, 'node_modules/gone.d.ts');
    const digest = createHash('sha256').update('export declare const pkg: number;\n').digest('hex');
    const observer = await observe();
    const acquired = JSON.stringify(observer.inputs);
    observer.sink.file(dependency, digest, 34, 'dependency');
    observer.sink.directory(directory, [dependency]);
    observer.sink.absent(gone);
    observer.sink.probe(kept, 'fileExists');
    expect((await observer.apply([])).kind).toBe('unchanged');
    const reported = observer.inputs;
    const labels = (): string[] => observer.inputs.map(input => input.path);
    expect(labels()).toEqual(expect.arrayContaining(['node_modules/gone.d.ts', 'node_modules/kept.d.ts', 'node_modules/pkg', 'node_modules/pkg/index.d.ts']));

    await put(root, 'subs/child/src/extra.ts', 'export const extra = 2;\n');
    local(await observer.apply([{ path: 'subs/child/src/extra.ts', kind: 'created' }]));
    // The update itself retires nothing: the session chooses the retirement.
    for (const input of reported.filter(input => input.path.startsWith('node_modules/'))) expect(observer.inputs).toContainEqual(input);
    await observer.retire({ kind: 'probes' });
    for (const input of reported.filter(input => input.path.startsWith('node_modules/'))) expect(observer.inputs).toContainEqual(input);
    // The compiler reports the kept probe again and now only probes the listed directory.
    observer.sink.probe(kept, 'fileExists');
    observer.sink.probe(directory, 'directoryExists');
    expect((await observer.apply([])).kind).toBe('unchanged');
    expect(labels()).not.toContain('node_modules/gone.d.ts');
    expect(observer.inputs.find(input => input.path === 'node_modules/pkg/index.d.ts')).toMatchObject({ role: 'dependency', bytes: 34, sha256: digest });

    // The same reports on a fresh acquisition give the same list and identity.
    const fresh = await observe();
    fresh.sink.file(dependency, digest, 34, 'dependency');
    fresh.sink.probe(kept, 'fileExists');
    fresh.sink.probe(directory, 'directoryExists');
    expect((await fresh.apply([])).kind).toBe('unchanged');
    expect(JSON.stringify(observer.inputs)).toBe(JSON.stringify(fresh.inputs));
    expect(observer.inputId).toBe(fresh.inputId);

    // A marked probe the next promotion does not confirm is released; all retirement releases reads too.
    await observer.retire({ kind: 'probes' });
    expect((await observer.apply([])).kind).toBe('unchanged');
    expect(labels()).not.toContain('node_modules/kept.d.ts');
    expect(labels()).toContain('node_modules/pkg/index.d.ts');
    await observer.retire({ kind: 'all' });
    expect(labels().some(path => path.startsWith('node_modules/'))).toBe(false);
    const current = await observe();
    expect(JSON.stringify(observer.inputs)).toBe(JSON.stringify(current.inputs));
    expect(JSON.stringify(observer.inputs)).not.toBe(acquired);
  });

  it('ignores the architect view and its transient siblings at the root and beneath modules, while a near miss stays owned', async () => {
    const suffix = '0123456789abcdef0123456789abcdef';
    const observer = await observe();
    const inputs = JSON.stringify(observer.inputs), inventory = observer.inventory;
    const generated = ['.ramify-architect/_meta.json', '.ramify-architect/child/behavior.jsonl',
      `.ramify-architect.tmp-${suffix}/_meta.json`, `.ramify-architect.tmp-${suffix}.marker.json`,
      `.ramify-architect.old-${suffix}/_meta.json`, `.ramify-architect.old-${suffix}.marker.json`,
      'src/.ramify-architect/owned.ts', 'subs/child/.ramify-architect/structural.ts', 'subs/child/src/.ramify-architect.tmp-abc/staged.ts'];
    for (const path of generated) await put(root, path, 'export const generated = 1;\n');
    const changes = [...generated, '.ramify-architect', `.ramify-architect.tmp-${suffix}`]
      .flatMap(path => (['created', 'changed'] as const).map(kind => ({ path, kind })));
    expect(await observer.apply(changes)).toEqual({ kind: 'unchanged' });
    expect(observer.inventory).toBe(inventory);
    expect(JSON.stringify(observer.inputs)).toBe(inputs);

    await put(root, 'subs/child/src/.ramify-architects/near.ts', 'export const nearMiss = 1;\n');
    const near = local(await observer.apply([{ path: 'subs/child/src/.ramify-architects/near.ts', kind: 'created' }]));
    expect(near.created).toEqual(['subs/child/src/.ramify-architects/near.ts']);
  });

  it('records a created owned test file and its area presence', async () => {
    const observer = await observe();
    expect(observer.inventory.modules[1]!.areas.map(area => area.present)).toEqual([true, false]);
    await put(root, 'subs/child/src/tests/child.test.ts', 'export const spec = 1;\n');
    const update = local(await observer.apply([{ path: 'subs/child/src/tests/child.test.ts', kind: 'created' }]));
    expect(update.inventory.files.map(file => [file.path, file.area]))
      .toContainEqual(['subs/child/src/tests/child.test.ts', 'tests']);
    expect(update.inventory.modules[1]!.areas.map(area => area.present)).toEqual([true, true]);
  });

  it('rebuilds the whole inventory when a module boundary appears', async () => {
    const observer = await observe();
    await put(root, 'subs/child/subs/grandchild/module.ramify', 'ramify 1\nmodule grandchild\n');
    await put(root, 'subs/child/subs/grandchild/README.md', '# Grandchild\n\nGrandchild purpose.\n');
    await put(root, 'subs/child/subs/grandchild/src/deep.ts', 'export const deep = 3;\n');
    const update = await observer.apply([{ path: 'subs/child/subs/grandchild/module.ramify', kind: 'created' }]);
    expect(update.kind).toBe('structural');
    if (update.kind !== 'structural') throw new Error('Expected a structural update');
    expect(update.inventory.modules.map(module => module.id))
      .toEqual(['fixture', 'fixture/child', 'fixture/child/grandchild']);
    expect(update.inventory.files.map(file => file.path)).toContain('subs/child/subs/grandchild/src/deep.ts');
    expect(observer.inventory).toBe(update.inventory);
  });

  it('reports a stray description as invalid and keeps the last valid inventory', async () => {
    const observer = await observe();
    const before = observer.inventory;
    await put(root, 'tools/module.ramify', 'ramify 1\nmodule stray\n');
    const update = await observer.apply([{ path: 'tools/module.ramify', kind: 'created' }]);
    expect(update.kind).toBe('invalid');
    if (update.kind !== 'invalid') throw new Error('Expected an invalid update');
    expect(update.issues.map(issue => [issue.code, issue.path]))
      .toEqual([['stray-description', 'tools/module.ramify']]);
    expect(update.inventory).not.toBe(before);
    expect(observer.inventory).toBe(before);
  });

  it('reports an unparsable description as invalid with the parser issues', async () => {
    const observer = await observe();
    const before = observer.inventory;
    await put(root, 'subs/child/module.ramify', 'ramify 1\nbroken child\n');
    const update = await observer.apply([{ path: 'subs/child/module.ramify', kind: 'changed' }]);
    expect(update.kind).toBe('invalid');
    if (update.kind !== 'invalid') throw new Error('Expected an invalid update');
    expect(update.issues).toEqual([{ code: 'invalid-description', path: 'subs/child/module.ramify',
      message: '2:1: missing-header: Expected a module header [9,15)' }]);
    expect([update.inventory, observer.inventory]).toEqual([null, before]);
  });

  it('reports a description that is not valid UTF-8 with Plan 1\'s encoding issue', async () => {
    const observer = await observe();
    await put(root, 'subs/child/module.ramify', new Uint8Array([0x72, 0x61, 0x6d, 0xff, 0xfe]));
    const update = await observer.apply([{ path: 'subs/child/module.ramify', kind: 'changed' }]);
    expect(update.kind).toBe('invalid');
    if (update.kind !== 'invalid') throw new Error('Expected an invalid update');
    expect(update.issues).toEqual([{ code: 'invalid-description', path: 'subs/child/module.ramify',
      message: '1:1: invalid-encoding: Description is not valid UTF-8' }]);
  });

  it('rebuilds when a description renames its owner', async () => {
    const observer = await observe();
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule renamed\n');
    const update = await observer.apply([{ path: 'subs/child/module.ramify', kind: 'changed' }]);
    expect(update.kind).toBe('structural');
    if (update.kind !== 'structural') throw new Error('Expected a structural update');
    expect(update.inventory.modules.map(module => module.id)).toEqual(['fixture', 'fixture/renamed']);
  });

  it('reports a read limit as an incomplete update and keeps the last valid inventory', async () => {
    const observer = await observe({ limits: { ...limits, maxApplicationFiles: 2 } });
    const before = observer.inventory;
    await put(root, 'subs/child/src/extra.ts', 'export const extra = 2;\n');
    const update = await observer.apply([{ path: 'subs/child/src/extra.ts', kind: 'created' }]);
    expect(update.kind).toBe('incomplete');
    if (update.kind !== 'incomplete') throw new Error('Expected an incomplete update');
    expect(update.issues.map(issue => issue.code)).toEqual(['resource-limit']);
    expect(observer.inventory).toBe(before);
  });

  it('rejects a local update whose exposure target lost its exact file, as the acquisition does', async () => {
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
    const observer = await observe({ parse: (file, text) => {
      const parsed = declaration(file, text);
      if (parsed.status !== 'valid' || file !== 'subs/child/module.ramify') return parsed;
      return { status: 'valid', document: { ...parsed.document, statements: [{ index: 0, kind: 'expose-src',
        span: { start: 0, end: 0, line: 3, column: 1 },
        selection: { kind: 'named', names: [{ name: 'child', alias: 'child', span: { start: 0, end: 0, line: 3, column: 1 } }] },
        from: { value: 'child.ts', span: { start: 0, end: 0, line: 3, column: 1 } },
        tags: null, destinations: ['parent'] }] } };
    } });
    expect(observer.inventory.references.map(reference => [reference.normalized, reference.status]))
      .toEqual([['subs/child/src/child.ts', 'file']]);
    const before = observer.inventory;
    await unlink(join(root, 'subs/child/src/child.ts'));
    const update = await observer.apply([{ path: 'subs/child/src/child.ts', kind: 'deleted' }]);
    expect(update).toEqual({ kind: 'invalid', inventory: null, issues: [{ code: 'missing-file', path: 'subs/child/module.ramify',
      message: '3:1: missing source reference "child.ts" (subs/child/src/child.ts)' }] });
    expect(observer.inventory).toBe(before);
  });

  it('leaves an unobserved path unchanged', async () => {
    const observer = await observe();
    const before = observer.inputId;
    expect(await observer.apply([{ path: 'notes/scratch.txt', kind: 'created' }])).toEqual({ kind: 'unchanged' });
    expect(observer.inputId).toBe(before);
  });

  it('reads descriptions and READMEs through the observation table', async () => {
    const observer = await observe();
    expect(await observer.readDescription('subs/child/module.ramify')).toBe('ramify 1\nmodule child\n');
    expect(await observer.readReadme('subs/child/README.md')).toBe('# Child\n\nChild purpose.\n');
    expect(await observer.readDescription('subs/child/absent.ramify')).toBeUndefined();
  });

  it('refuses further work once disposed', async () => {
    const observer = await observe();
    await observer.dispose();
    await expect(observer.apply([{ path: 'src/value.ts', kind: 'changed' }])).rejects.toThrow('disposed');
    await expect(observer.reobserve()).rejects.toThrow('disposed');
    await observer.dispose();
  });
});
