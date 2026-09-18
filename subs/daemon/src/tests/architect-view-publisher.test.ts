import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createControlledApiViewFilesystem, createControlledFilesystemApiViewPublisher, createFilesystemApiViewPublisher,
  createNodeApiViewFilesystem, type ApiViewFilesystemPort, type ControlledApiViewFilesystem,
} from '../api-view-publisher.js';
import type { ApiViewPublishLimits, PublishInput } from '../interfaces/daemon.js';
import type { RenderedArchitectView } from '../../../analysis/src/interfaces/architect-view.js';
import type { ApiViewProjection } from '../../../analysis/src/interfaces/session.js';
import { area, described, entry, file, moduleProjection, projection } from './api-view-fixtures.js';
import { architectView } from './architect-view-fixtures.js';

const limits: ApiViewPublishLimits = { maxAreaBytes: 32 * 1024 * 1024, maxArchitectBytes: 64 * 1024 * 1024,
  maxInvocationBytes: 256 * 1024 * 1024, maxStagedBytes: 256 * 1024 * 1024 };
const writes = ['mkdir', 'writeFile', 'rename', 'rm'];

const roots: string[] = [];
afterEach(async () => { for (const dir of roots.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function tempRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-architect-view-')));
  roots.push(root);
  await mkdir(join(root, 'mod/src'), { recursive: true });
  return root;
}
function controlled(base: ApiViewFilesystemPort = createNodeApiViewFilesystem()): ControlledApiViewFilesystem {
  return createControlledApiViewFilesystem(base);
}
function onePublisher(fs: ApiViewFilesystemPort, overrides: Partial<ApiViewPublishLimits> = {}) {
  let counter = 0;
  return createControlledFilesystemApiViewPublisher({ ...limits, ...overrides }, fs, () => (++counter).toString(16).padStart(32, '0'));
}
function api(name: string): ApiViewProjection {
  return projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [
    file('external', 'other/src/thing.ts', [entry(name, 'value', described(name, `function ${name}(): void;`))]),
  ]))]);
}
function both(apiName: string, view: RenderedArchitectView): PublishInput {
  return { api: api(apiName), architect: view };
}
function architectOnly(view: RenderedArchitectView): PublishInput {
  return { api: null, architect: view };
}

/** Every entry beneath `dir`, with its kind and content or link target, sorted. */
async function tree(dir: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string, prefix: string): Promise<void> {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const path = join(current, item.name), rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isSymbolicLink()) results.push(`${rel} -> ${await readlink(path)}`);
      else if (item.isDirectory()) { results.push(`${rel}/`); await walk(path, rel); }
      else if (item.isFile()) results.push(`${rel}: ${(await readFile(path)).toString('base64')}`);
      else results.push(`${rel} (other)`);
    }
  }
  await walk(dir, '');
  return results.sort();
}
/** The rendered view as `tree` lists it after publication. */
function expectedTree(view: RenderedArchitectView): string[] {
  const entries = new Set<string>();
  for (const item of view.files) {
    const segments = item.path.split('/');
    for (let end = 1; end < segments.length; end++) entries.add(`${segments.slice(0, end).join('/')}/`);
    entries.add(`${item.path}: ${Buffer.from(item.text, 'utf8').toString('base64')}`);
  }
  return [...entries].sort();
}
/** Every stage or rollback sibling and marker beneath `root`, not descending into them. */
async function transient(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string, prefix: string): Promise<void> {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (/^\.ramify(-architect)?\.(tmp|old)-/.test(item.name)) results.push(rel);
      else if (item.isDirectory() && !item.isSymbolicLink()) await walk(join(current, item.name), rel);
    }
  }
  await walk(root, '');
  return results.sort();
}

describe('publishing the architect view (AV20)', () => {
  it('creates .ramify-architect at the project root with every rendered file and _meta.json written last', async () => {
    const root = await tempRoot();
    const fs = controlled();
    const view = architectView({ children: ['engine', 'gamma'] });
    const outcome = await onePublisher(fs).publish(root, 'rev-1', architectOnly(view), 'req-1');
    expect(outcome).toEqual({ status: 'published', bytesWritten: view.bytes, targets: [{
      view: 'architect', module: null, area: null, path: '.ramify-architect',
      files: view.files.length, entries: view.records, bytes: view.bytes, changed: true }] });
    expect(await tree(join(root, '.ramify-architect'))).toEqual(expectedTree(view));
    const staged = fs.calls.filter(call => call.op === 'writeFile' && call.args[0]!.includes('/.ramify-architect.tmp-')
      && !call.args[0]!.endsWith('.marker.json')).map(call => call.args[0]!.replace(/^.*\/\.ramify-architect\.tmp-[0-9a-f]+\//, ''));
    expect(staged).toHaveLength(view.files.length);
    expect(staged.at(-1)).toBe('_meta.json');
    expect(new Set(staged)).toEqual(new Set(view.files.map(item => item.path)));
    expect((await readdir(root)).sort()).toEqual(['.ramify-architect', 'mod']);
  });

  it('writes nothing on an unchanged repeat and preserves every mtime', async () => {
    const root = await tempRoot();
    const fs = controlled();
    const publisher = onePublisher(fs);
    const view = architectView();
    expect((await publisher.publish(root, 'rev-1', architectOnly(view), 'req-1')).status).toBe('published');
    const times = async () => Promise.all(['.ramify-architect', '.ramify-architect/engine', '.ramify-architect/_meta.json',
      '.ramify-architect/engine/behavior.jsonl'].map(async path => (await stat(join(root, path))).mtimeMs));
    const before = await times(), calls = fs.calls.length;
    const repeat = await publisher.publish(root, 'rev-1', architectOnly(architectView()), 'req-2');
    expect(repeat).toMatchObject({ status: 'published', bytesWritten: 0, targets: [{ view: 'architect', changed: false }] });
    expect(fs.calls.slice(calls).filter(call => writes.includes(call.op))).toEqual([]);
    expect(await times()).toEqual(before);
  });

  it('replaces a changed view completely, removing a module that no longer exists', async () => {
    const root = await tempRoot();
    const publisher = onePublisher(controlled());
    await publisher.publish(root, 'rev-1', architectOnly(architectView({ children: ['engine', 'gamma'] })), 'req-1');
    expect(await readdir(join(root, '.ramify-architect'))).toContain('gamma');
    const smaller = architectView({ revision: 'rev/2:fixture', children: ['engine'] });
    const outcome = await publisher.publish(root, 'rev-2', architectOnly(smaller), 'req-2');
    expect(outcome).toMatchObject({ status: 'published', bytesWritten: smaller.bytes, targets: [{ changed: true }] });
    expect(await tree(join(root, '.ramify-architect'))).toEqual(expectedTree(smaller));
    expect(await transient(root)).toEqual([]);
  });

  it('replaces a view whose files keep their sizes but change their bytes', async () => {
    const root = await tempRoot();
    const publisher = onePublisher(controlled());
    const first = architectView(), second = architectView({ revision: 'rev/2:fixture' });
    expect(first.files.map(item => item.text.length)).toEqual(second.files.map(item => item.text.length));
    await publisher.publish(root, 'rev-1', architectOnly(first), 'req-1');
    const outcome = await publisher.publish(root, 'rev-2', architectOnly(second), 'req-2');
    expect(outcome).toMatchObject({ status: 'published', bytesWritten: second.bytes, targets: [{ changed: true }] });
    expect(await tree(join(root, '.ramify-architect'))).toEqual(expectedTree(second));
  });

  it('replaces a recognized view holding a stray file or an empty directory, even when every rendered file is unchanged', async () => {
    const root = await tempRoot();
    const publisher = onePublisher(controlled());
    const view = architectView();
    await publisher.publish(root, 'rev-1', architectOnly(view), 'req-1');
    await writeFile(join(root, '.ramify-architect/notes.md'), 'stray\n');
    expect(await publisher.publish(root, 'rev-1', architectOnly(view), 'req-2')).toMatchObject({ targets: [{ changed: true }] });
    await mkdir(join(root, '.ramify-architect/empty'));
    expect(await publisher.publish(root, 'rev-1', architectOnly(view), 'req-3')).toMatchObject({ targets: [{ changed: true }] });
    expect(await tree(join(root, '.ramify-architect'))).toEqual(expectedTree(view));
  });

  it('publishes the API and architect views in one call, the architect target last', async () => {
    const root = await tempRoot();
    const view = architectView();
    const outcome = await onePublisher(controlled()).publish(root, 'rev-1', both('greet', view), 'req-1');
    if (outcome.status !== 'published') throw new Error(JSON.stringify(outcome));
    expect(outcome.targets.map(({ view: id, module, area: kind, path, changed }) => ({ id, module, kind, path, changed }))).toEqual([
      { id: 'api', module: 'mod', kind: 'ordinary', path: 'mod/src/.ramify', changed: true },
      { id: 'architect', module: null, kind: null, path: '.ramify-architect', changed: true },
    ]);
    expect(outcome.bytesWritten).toBe(outcome.targets[0]!.bytes + view.bytes);
    expect(await readdir(join(root, 'mod/src/.ramify'))).toEqual(['_meta.json', 'external']);
  });

  it('refuses a rendered view with an unsafe path or without a recognizable _meta.json before any filesystem work', async () => {
    const root = await tempRoot();
    const fs = controlled();
    const view = architectView();
    const meta = view.files.find(item => item.path === '_meta.json')!;
    for (const files of [
      [...view.files, { path: '../escape.md', text: 'x\n' }],
      [...view.files, { path: '/abs.md', text: 'x\n' }],
      [...view.files, { path: 'engine', text: 'x\n' }],
      [...view.files, { path: 'README.md', text: 'again\n' }],
      view.files.filter(item => item !== meta),
      view.files.map(item => item === meta ? { path: '_meta.json', text: '{"schema":"ramify.api-view/1"}\n' } : item),
    ]) {
      const outcome = await onePublisher(fs).publish(root, 'rev-1', both('greet', { ...view, files }), 'req-1');
      expect(outcome).toMatchObject({ status: 'unavailable', reason: 'invalid-path' });
    }
    expect(fs.calls).toEqual([]);
  });
});

describe('one transaction for the API and architect targets (AV21)', () => {
  async function published(fs: ControlledApiViewFilesystem) {
    const root = await tempRoot();
    const publisher = onePublisher(fs);
    expect((await publisher.publish(root, 'rev-1', both('first', architectView()), 'req-1')).status).toBe('published');
    return { root, publisher, before: await tree(root) };
  }
  const second = () => both('second', architectView({ revision: 'rev/2:fixture', children: ['engine', 'gamma'] }));
  const architectSwitch = (from?: string, to?: string) => Boolean(from?.includes('/.ramify-architect.tmp-') && to?.endsWith('/.ramify-architect'));

  it('restores the switched API target when switching the architect target fails', async () => {
    const fs = controlled();
    const { root, publisher, before } = await published(fs);
    const calls = fs.calls.length;
    fs.failNext('rename', architectSwitch);
    const outcome = await publisher.publish(root, 'rev-2', second(), 'req-2');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'output-failure' });
    const renames = fs.calls.slice(calls).filter(call => call.op === 'rename').map(call => call.args);
    const apiSwitched = renames.findIndex(([from, to]) => from!.includes('/mod/src/.ramify.tmp-') && to!.endsWith('/mod/src/.ramify'));
    const architectAttempt = renames.findIndex(([from, to]) => architectSwitch(from, to));
    expect(apiSwitched).toBeGreaterThanOrEqual(0);
    expect(architectAttempt).toBeGreaterThan(apiSwitched);
    expect(await tree(root)).toEqual(before);
  });

  it('reports rollback-failure when the switched API target cannot be restored', async () => {
    const fs = controlled();
    const { root, publisher } = await published(fs);
    fs.failNext('rename', architectSwitch);
    fs.failNext('rename', (from, to) => Boolean(from?.includes('/mod/src/.ramify.old-') && to?.endsWith('/mod/src/.ramify')));
    const outcome = await publisher.publish(root, 'rev-2', second(), 'req-2');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'rollback-failure' });
    expect((await transient(root)).some(path => path.startsWith('mod/src/.ramify.old-'))).toBe(true);
  });

  it('changes nothing when cancelled after staging and before switching', async () => {
    const fs = controlled();
    const { root, publisher, before } = await published(fs);
    const controller = new AbortController();
    const write = fs.writeFile.bind(fs);
    fs.writeFile = async (path, data) => {
      await write(path, data);
      if (/\/\.ramify-architect\.tmp-[0-9a-f]+\/_meta\.json$/.test(path)) controller.abort();
    };
    const calls = fs.calls.length;
    const outcome = await publisher.publish(root, 'rev-2', second(), 'req-2', { signal: controller.signal });
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(fs.calls.slice(calls).some(call => call.op === 'writeFile' && call.args[0]!.includes('/.ramify-architect.tmp-'))).toBe(true);
    expect(fs.calls.slice(calls).some(call => call.op === 'rename')).toBe(false);
    expect(await tree(root)).toEqual(before);
  });

  it('rolls the API target back when cancelled after it switched', async () => {
    const fs = controlled();
    const { root, publisher, before } = await published(fs);
    const controller = new AbortController();
    const rename = fs.rename.bind(fs);
    fs.rename = async (from, to) => {
      await rename(from, to);
      if (from.includes('/mod/src/.ramify.tmp-') && to.endsWith('/mod/src/.ramify')) controller.abort();
    };
    const outcome = await publisher.publish(root, 'rev-2', second(), 'req-2', { signal: controller.signal });
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(await tree(root)).toEqual(before);
  });

  it('counts the architect view against maxArchitectBytes, maxInvocationBytes and maxStagedBytes before any write', async () => {
    const root = await tempRoot();
    const view = architectView();
    const apiBytes = await (async () => {
      const outcome = await onePublisher(controlled()).publish(root, 'rev-1', { api: api('greet'), architect: null }, 'req-0');
      if (outcome.status !== 'published') throw new Error(JSON.stringify(outcome));
      return outcome.targets[0]!.bytes;
    })();
    const refusals: [Partial<ApiViewPublishLimits>, string][] = [
      [{ maxArchitectBytes: view.bytes - 1 }, 'architect view limit'],
      [{ maxInvocationBytes: apiBytes + view.bytes - 1 }, 'invocation limit'],
      // The API target is unchanged, so only the architect target is staged.
      [{ maxStagedBytes: view.bytes - 1 }, 'staged limit'],
    ];
    for (const [override, label] of refusals) {
      const fs = controlled();
      const outcome = await onePublisher(fs, override).publish(root, 'rev-1', both('greet', view), 'req-1');
      expect(outcome).toMatchObject({ status: 'unavailable', reason: 'resource-limit', message: expect.stringContaining(label) });
      expect(fs.calls.filter(call => writes.includes(call.op))).toEqual([]);
    }
    const exact = await onePublisher(controlled(), { maxArchitectBytes: view.bytes, maxInvocationBytes: apiBytes + view.bytes,
      maxStagedBytes: view.bytes }).publish(root, 'rev-1', both('greet', view), 'req-2');
    expect(exact).toMatchObject({ status: 'published', bytesWritten: view.bytes });
  });

  it('rejects a missing or non-positive maxArchitectBytes', () => {
    const { maxArchitectBytes: _omitted, ...rest } = limits;
    expect(() => createFilesystemApiViewPublisher(rest as ApiViewPublishLimits)).toThrow('maxArchitectBytes');
    expect(() => createFilesystemApiViewPublisher({ ...limits, maxArchitectBytes: 0 })).toThrow('maxArchitectBytes');
  });
});

describe('an existing .ramify-architect that is not recognizably generated (AV22)', () => {
  const view = architectView();
  const meta = view.files.find(item => item.path === '_meta.json')!.text;
  const cases: [string, 'invalid-path' | 'symlink', (root: string) => Promise<void>][] = [
    ['a regular file', 'invalid-path', root => writeFile(join(root, '.ramify-architect'), 'mine\n')],
    ['a directory without _meta.json', 'invalid-path', async root => {
      await mkdir(join(root, '.ramify-architect'));
      await writeFile(join(root, '.ramify-architect/notes.md'), 'mine\n');
    }],
    ['a directory whose _meta.json names another schema', 'invalid-path', async root => {
      await mkdir(join(root, '.ramify-architect'));
      await writeFile(join(root, '.ramify-architect/_meta.json'), '{"schema":"ramify.api-view/1","module":"m"}\n');
    }],
    ['a directory whose _meta.json is not JSON', 'invalid-path', async root => {
      await mkdir(join(root, '.ramify-architect'));
      await writeFile(join(root, '.ramify-architect/_meta.json'), '{"schema":"ramify.architect-view/1"\n');
    }],
    ['a directory whose _meta.json is a directory', 'invalid-path', async root => {
      await mkdir(join(root, '.ramify-architect/_meta.json'), { recursive: true });
    }],
    ['a generated view containing a symbolic link', 'symlink', async root => {
      await mkdir(join(root, '.ramify-architect/engine'), { recursive: true });
      await writeFile(join(root, '.ramify-architect/_meta.json'), meta);
      await mkdir(join(root, 'elsewhere'));
      await symlink(join(root, 'elsewhere'), join(root, '.ramify-architect/engine/link'));
    }],
    ['a generated view whose _meta.json is a symbolic link', 'symlink', async root => {
      await mkdir(join(root, '.ramify-architect'));
      await writeFile(join(root, 'meta.json'), meta);
      await symlink(join(root, 'meta.json'), join(root, '.ramify-architect/_meta.json'));
    }],
    ['a symbolic link to a generated view', 'symlink', async root => {
      await mkdir(join(root, 'elsewhere'));
      await writeFile(join(root, 'elsewhere/_meta.json'), meta);
      await symlink(join(root, 'elsewhere'), join(root, '.ramify-architect'));
    }],
  ];

  it.each(cases)('refuses %s, writing neither target and leaving the path untouched', async (_label, reason, prepare) => {
    const root = await tempRoot();
    await prepare(root);
    const before = await tree(root);
    const fs = controlled();
    const outcome = await onePublisher(fs).publish(root, 'rev-1', both('greet', view), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason });
    expect(fs.calls.filter(call => writes.includes(call.op))).toEqual([]);
    expect(await tree(root)).toEqual(before);
  });

  it('refuses a generated view containing an entry that is neither a regular file nor a directory', async () => {
    const root = await tempRoot();
    await mkdir(join(root, '.ramify-architect'));
    await writeFile(join(root, '.ramify-architect/_meta.json'), meta);
    await writeFile(join(root, '.ramify-architect/device'), '');
    const base = createNodeApiViewFilesystem();
    // The port reports the entry as the platform would report a socket or FIFO.
    const fs = controlled({ ...base, async readdir(path) {
      return (await base.readdir(path)).map(item => item.name === 'device' ? { ...item, kind: 'other' as const } : item);
    } });
    const before = await tree(root);
    const outcome = await onePublisher(fs).publish(root, 'rev-1', both('greet', view), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'invalid-path', message: expect.stringContaining('device') });
    expect(await tree(root)).toEqual(before);
  });

  it('replaces a directory whose _meta.json names the architect schema', async () => {
    const root = await tempRoot();
    await mkdir(join(root, '.ramify-architect'));
    await writeFile(join(root, '.ramify-architect/_meta.json'), '{"schema":"ramify.architect-view/1"}\n');
    await writeFile(join(root, '.ramify-architect/stale.jsonl'), '{}\n');
    const outcome = await onePublisher(controlled()).publish(root, 'rev-1', architectOnly(view), 'req-1');
    expect(outcome).toMatchObject({ status: 'published', targets: [{ changed: true }] });
    expect(await tree(join(root, '.ramify-architect'))).toEqual(expectedTree(view));
  });
});

describe('leftover architect siblings (AV22)', () => {
  const lookalike = `.ramify-architect.tmp-${'deadbeef'.repeat(4)}`;

  it('discards a marked rollback backup left beside a live view, and never an unmarked lookalike', async () => {
    const root = await tempRoot();
    const fs = controlled();
    const publisher = onePublisher(fs);
    const first = architectView(), second = architectView({ revision: 'rev/2:fixture', children: ['engine', 'gamma'] });
    await publisher.publish(root, 'rev-1', architectOnly(first), 'req-1');
    await mkdir(join(root, lookalike));
    await writeFile(join(root, lookalike, 'keep.txt'), 'not ours');
    // The best-effort removal of the backup fails, so the switched publish leaves it, still marked.
    fs.failNext('rm', path => /\/\.ramify-architect\.old-[0-9a-f]+$/.test(path));
    expect(await publisher.publish(root, 'rev-2', architectOnly(second), 'req-2')).toMatchObject({ status: 'published' });
    const backup = `.ramify-architect.old-${'2'.padStart(32, '0')}`;
    expect(await transient(root)).toEqual([backup, `${backup}.marker.json`, lookalike].sort());
    const repeat = await publisher.publish(root, 'rev-2', architectOnly(second), 'req-3');
    expect(repeat).toMatchObject({ status: 'published', bytesWritten: 0, targets: [{ changed: false }] });
    expect(await transient(root)).toEqual([lookalike]);
    expect(await readFile(join(root, lookalike, 'keep.txt'), 'utf8')).toBe('not ours');
    expect(await tree(join(root, '.ramify-architect'))).toEqual(expectedTree(second));
  });

  it('discards a marked stage left by a failed publication and keeps the previous view', async () => {
    const root = await tempRoot();
    const fs = controlled();
    const publisher = onePublisher(fs);
    const first = architectView();
    await publisher.publish(root, 'rev-1', architectOnly(first), 'req-1');
    fs.failNext('writeFile', path => /\/\.ramify-architect\.tmp-[0-9a-f]+\/_meta\.json$/.test(path));
    // Both removals fail, so the stage and its marker remain for the next invocation to recover.
    fs.failNext('rm', path => path.includes('/.ramify-architect.tmp-'));
    fs.failNext('rm', path => path.includes('/.ramify-architect.tmp-'));
    const failed = await publisher.publish(root, 'rev-2', architectOnly(architectView({ revision: 'rev/2:fixture' })), 'req-2');
    expect(failed).toMatchObject({ status: 'unavailable', reason: 'output-failure' });
    const stage = `.ramify-architect.tmp-${'2'.padStart(32, '0')}`;
    expect(await transient(root)).toEqual([stage, `${stage}.marker.json`]);
    const repeat = await publisher.publish(root, 'rev-1', architectOnly(first), 'req-3');
    expect(repeat).toMatchObject({ status: 'published', bytesWritten: 0, targets: [{ changed: false }] });
    expect(await transient(root)).toEqual([]);
  });
});

const tools = ['rg', 'git'].every(tool => spawnSync(tool, ['--version'], { stdio: 'ignore' }).status === 0);
const toolkit = new URL('../../../../', import.meta.url);
const ignoreFiles = [['toolkit', new URL('.gitignore', toolkit)], ['reference', new URL('examples/collection-review/.gitignore', toolkit)]] as const;
const patterns = ['.ramify-architect/', '.ramify-architect.tmp-*/', '.ramify-architect.old-*/'];

describe('visibility to rg (AV23)', () => {
  it.each(ignoreFiles)('the %s .gitignore lists the three architect patterns', async (_label, url) => {
    const lines = (await readFile(url, 'utf8')).split('\n');
    for (const pattern of patterns) expect(lines).toContain(pattern);
  });

  it.skipIf(!tools).each(ignoreFiles)('with the %s .gitignore, rg from the root finds no view line and rg on the view finds them all', async (_label, url) => {
    const root = await tempRoot();
    const env = { ...process.env };
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'RIPGREP_CONFIG_PATH']) delete env[name];
    const run = (command: string, args: readonly string[]) => {
      // No stdin: given no path and a readable stdin, rg would search stdin instead of the directory.
      const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (result.status !== 0 && result.status !== 1) throw new Error(`${command} ${args.join(' ')}: ${result.stderr}`);
      return result.stdout.split('\n').filter(Boolean);
    };
    run('git', ['init', '-q']);
    await writeFile(join(root, '.gitignore'), await readFile(url));
    await writeFile(join(root, 'mod/src/input.ts'), 'export function debounce(): void {}\n');
    const view = architectView({ term: 'debounce', children: ['engine', 'gamma'] });
    expect(await createFilesystemApiViewPublisher(limits).publish(root, 'rev-1', architectOnly(view), 'req-1'))
      .toMatchObject({ status: 'published' });
    for (const path of [`.ramify-architect.tmp-${'a'.repeat(32)}/behavior.jsonl`, `.ramify-architect.old-${'b'.repeat(32)}/behavior.jsonl`,
      'mod/.ramify-architect/behavior.jsonl']) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), '{"name":"debounceStaged"}\n');
    }
    const search = ['--no-config', '--no-heading', '--color', 'never', '-n'];
    const source = ['mod/src/input.ts:1:export function debounce(): void {}'];
    expect(run('rg', [...search, 'debounce'])).toEqual(source);
    // Hidden files included: the ignore entries alone keep the view and its siblings out.
    const hidden = run('rg', [...search, '--hidden', 'debounce']);
    expect(hidden).toEqual(expect.arrayContaining(source));
    expect(hidden.filter(line => line.includes('ramify-architect'))).toEqual([]);
    const expected = view.files.flatMap(item => item.text.split('\n').flatMap((line, index) =>
      line.includes('debounce') ? [`.ramify-architect/${item.path}:${index + 1}:${line}`] : [])).sort();
    expect(expected.length).toBeGreaterThanOrEqual(9);
    expect(run('rg', [...search, 'debounce', '.ramify-architect/']).sort()).toEqual(expected);
    // The control: without the ignore file, a hidden search reaches the view.
    expect(run('rg', [...search, '--hidden', '--no-ignore-vcs', 'debounce']).some(line => line.startsWith('.ramify-architect/'))).toBe(true);
    expect(run('git', ['status', '--porcelain', '--untracked-files=all']).filter(line => line.includes('.ramify-architect'))).toEqual([]);
  });
});
