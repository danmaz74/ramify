import { createHook } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeProject, observedEnumerations } from '../observer.js';
import { resolveProjectRoot } from '../resolve-root.js';
import type { InventoryUpdate, ProjectObserver, ProjectReadOptions } from '../interfaces/project.js';
import { declaration, fixture, limits, put } from './fixtures.js';

/** Files the capture opens to read bytes; pass-through otherwise. */
const opened = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: (...args: Parameters<typeof actual.open>) => { opened.paths.push(String(args[0])); return actual.open(...args); } };
});

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
/** Helper processes, directory enumerations and opened files while `operation` runs. */
async function counted<T>(observer: ProjectObserver, operation: () => Promise<T>): Promise<{ value: T; helpers: number; enumerations: number; opened: string[] }> {
  let helpers = 0;
  const enumerations = observedEnumerations(observer);
  opened.paths.length = 0;
  const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') helpers++; } }).enable();
  try {
    const value = await operation();
    return { value, helpers, enumerations: observedEnumerations(observer) - enumerations, opened: [...opened.paths] };
  } finally { hook.disable(); }
}
/** The observer's inventory, inputs and identity equal a fresh acquisition of the same disk. */
async function expectFresh(observer: ProjectObserver): Promise<void> {
  const fresh = await observe();
  expect(observer.inventory).toEqual(fresh.inventory);
  expect(JSON.stringify(observer.inputs)).toBe(JSON.stringify(fresh.inputs));
  expect(observer.inputId).toBe(fresh.inputId);
  observers.splice(observers.indexOf(fresh), 1);
  await fresh.dispose();
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

  it('configuration-projection-unchanged: an options-only edit keeps the inventory and capture, spawns one helper, walks no directory and reads only the edited file', async () => {
    const observer = await observe();
    // Selected owned files created and deleted since the acquisition leave the projection equal.
    await put(root, 'src/added.ts', 'export const added = 1;\n');
    expect(local(await observer.apply([{ path: 'src/added.ts', kind: 'created' }])).created).toEqual(['src/added.ts']);
    await unlink(join(root, 'src/value.ts'));
    expect(local(await observer.apply([{ path: 'src/value.ts', kind: 'deleted' }])).deleted).toEqual(['src/value.ts']);
    const before = observer.inventory;
    const identities = new Map(observer.inputs.map(input => [input.path, input.sha256]));
    await put(root, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler","target":"ES2023"},"include":["src"]}\n');
    const edited = await counted(observer, () => observer.apply([{ path: 'tsconfig.json', kind: 'changed' }]));
    const update = local(edited.value);
    expect([update.configuration, update.descriptions, update.readmes, update.created, update.deleted, update.changed])
      .toEqual([['tsconfig.json'], [], [], [], [], []]);
    expect([update.inventory, observer.inventory]).toEqual([before, before]);
    expect(observer.inventory).toBe(before);
    expect([edited.helpers, edited.enumerations, edited.opened]).toEqual([1, 0, [join(root, 'tsconfig.json')]]);
    expect(observer.inputs.filter(input => identities.get(input.path) !== input.sha256).map(input => input.path)).toEqual(['tsconfig.json']);
    await expectFresh(observer);

    // An extended file: adding it changes the helper's requests; an options edit of it is kept.
    await put(root, 'base.json', '{"compilerOptions":{"strict":true}}\n');
    await put(root, 'tsconfig.json', '{"extends":"./base.json","compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"]}\n');
    expect((await observer.apply([{ path: 'tsconfig.json', kind: 'changed' }])).kind).toBe('structural');
    const extended = observer.inventory;
    await put(root, 'base.json', '{"compilerOptions":{"strict":false,"noImplicitAny":false}}\n');
    const base = await counted(observer, () => observer.apply([{ path: 'base.json', kind: 'changed' }]));
    expect(local(base.value).configuration).toEqual(['base.json']);
    expect(observer.inventory).toBe(extended);
    expect([base.helpers, base.enumerations, base.opened]).toEqual([1, 0, [join(root, 'base.json')]]);
    await expectFresh(observer);

    // The replaced configuration product serves the next rebuild without a helper.
    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule renamed\n');
    const renamed = await counted(observer, () => observer.apply([{ path: 'subs/child/module.ramify', kind: 'changed' }]));
    expect([renamed.value.kind, renamed.helpers]).toEqual(['structural', 0]);
    await expectFresh(observer);
  }, 60_000);

  it('configuration-projection-unchanged: a kept edit of a configuration with references replaces the resolution the invocation check reuses', async () => {
    await put(root, 'ref/tsconfig.json', '{"files":[]}\n');
    await put(root, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"],"references":[{"path":"./ref"}]}\n');
    const observer = await observe();
    const request = { cwd: root, root, configuration: 'discover', scope: 'whole-project' } as const;
    const seeded = observer.resolution;
    expect((await counted(observer, () => resolveProjectRoot(request, undefined, [seeded]))).helpers).toBe(0);
    await put(root, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler","strict":true},"include":["src"],"references":[{"path":"./ref"}]}\n');
    expect(local(await observer.apply([{ path: 'tsconfig.json', kind: 'changed' }])).configuration).toEqual(['tsconfig.json']);
    const replaced = observer.resolution;
    expect(replaced).not.toBe(seeded);
    expect(replaced).toEqual(seeded);
    const reused = await counted(observer, () => resolveProjectRoot(request, undefined, [replaced]));
    expect([reused.value, reused.helpers]).toEqual([replaced, 0]);
    expect(reused.value).toBe(replaced);
    expect((await counted(observer, () => resolveProjectRoot(request, undefined, [seeded]))).helpers).toBe(1);
    await expectFresh(observer);
  }, 60_000);

  it('configuration-projection-changed: include, files, exclude, outDir, references, extended-file and manifest edits rebuild as a fresh acquisition', async () => {
    await put(root, 'extra/loose.ts', 'export const loose = 1;\n');
    await put(root, 'src/out/generated.ts', 'export const generated = 1;\n');
    await put(root, 'ref/tsconfig.json', '{"files":[]}\n');
    await put(root, 'base.json', '{"compilerOptions":{"strict":true}}\n');
    const observer = await observe();
    const options = '"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"}';
    const rebuilt = async (path: string, text: string): Promise<void> => {
      await put(root, path, text);
      const update = await counted(observer, () => observer.apply([{ path, kind: 'changed' }]));
      expect(update.value.kind, `${path}: ${text}`).toBe('structural');
      await expectFresh(observer);
    };
    await rebuilt('tsconfig.json', `{${options},"include":["src","subs"]}`);
    await rebuilt('tsconfig.json', `{${options},"include":["src"],"files":["extra/loose.ts"]}`);
    expect(observer.inventory.outsideModuleFiles).toEqual(['extra/loose.ts']);
    await rebuilt('tsconfig.json', `{${options},"include":["src"],"exclude":["src/generated"]}`);
    expect(observer.inventory.files.map(file => file.path)).toContain('src/out/generated.ts');
    await rebuilt('tsconfig.json', `{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler","outDir":"src/out"},"include":["src"]}`);
    expect(observer.inventory.files.map(file => file.path)).not.toContain('src/out/generated.ts');
    await rebuilt('tsconfig.json', `{${options},"include":["src"],"references":[{"path":"./ref"}]}`);
    await rebuilt('tsconfig.json', `{"extends":"./base.json",${options},"include":["src"]}`);
    await rebuilt('base.json', '{"compilerOptions":{"strict":true},"exclude":["src/generated"]}');
    await rebuilt('package.json', '{"type":"module","private":true}\n');

    // An unknown change, or a configuration edit beside another change, reconciles through a rebuild.
    const strict = `{"extends":"./base.json","compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler","strict":false},"include":["src"]}`;
    await put(root, 'tsconfig.json', strict);
    expect((await observer.apply([{ path: 'tsconfig.json', kind: 'unknown' }])).kind).toBe('structural');
    await put(root, 'tsconfig.json', strict.replace('"strict":false', '"strict":true'));
    await put(root, 'src/value.ts', 'export const value = 3;\n');
    expect((await observer.apply([{ path: 'tsconfig.json', kind: 'changed' }, { path: 'src/value.ts', kind: 'changed' }])).kind).toBe('structural');
    await expectFresh(observer);

    // A configuration the helper cannot read is reported by the rebuild, which keeps the last inventory.
    const before = observer.inventory;
    await put(root, 'tsconfig.json', `{"extends":"./missing.json",${options},"include":["src"]}`);
    const failed = await observer.apply([{ path: 'tsconfig.json', kind: 'changed' }]);
    expect(failed).toMatchObject({ kind: 'incomplete', issues: [{ code: 'read-failure' }] });
    expect(observer.inventory).toBe(before);
   }, 60_000);

  it('refuses further work once disposed', async () => {
    const observer = await observe();
    await observer.dispose();
    await expect(observer.apply([{ path: 'src/value.ts', kind: 'changed' }])).rejects.toThrow('disposed');
    await expect(observer.reobserve()).rejects.toThrow('disposed');
    await observer.dispose();
  });
});
