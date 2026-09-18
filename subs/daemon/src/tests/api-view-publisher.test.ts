import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createControlledApiViewFilesystem, createControlledFilesystemApiViewPublisher, createFilesystemApiViewPublisher,
  createNodeApiViewFilesystem, type ApiViewFilesystemPort, type ControlledApiViewFilesystem,
} from '../api-view-publisher.js';
import type { ApiViewPublishLimits, MaterializedTarget } from '../interfaces/daemon.js';
import { apiInput, area, entry, described, file, moduleProjection, projection, truncated } from './api-view-fixtures.js';
import type { ApiViewProjection } from '../../../analysis/src/interfaces/session.js';

const limits: ApiViewPublishLimits = { maxAreaBytes: 32 * 1024 * 1024, maxArchitectBytes: 64 * 1024 * 1024, maxInvocationBytes: 256 * 1024 * 1024, maxStagedBytes: 256 * 1024 * 1024 };

const roots: string[] = [];
afterEach(async () => { for (const dir of roots.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function tempRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-apiview-')));
  roots.push(root);
  return root;
}

function controlled(): { readonly fs: ControlledApiViewFilesystem } {
  return { fs: createControlledApiViewFilesystem(createNodeApiViewFilesystem()) };
}

let suffixCounter = 0;
function deterministicSuffix(): () => string {
  suffixCounter = 0;
  return () => (++suffixCounter).toString(16).padStart(32, '0');
}

function onePublisher(fs: ApiViewFilesystemPort, overrides: Partial<ApiViewPublishLimits> = {}) {
  return createControlledFilesystemApiViewPublisher({ ...limits, ...overrides }, fs, deterministicSuffix());
}

function oneModuleProjection(name: string, entries: readonly ReturnType<typeof entry>[]): ApiViewProjection {
  return projection([moduleProjection(name, name, area('ordinary', `${name}/src`, [file('external', 'other/src/thing.ts', entries)]))]);
}

async function listAll(dir: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string, prefix: string): Promise<void> {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const item of entries) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) await walk(join(current, item.name), rel);
      else results.push(rel);
    }
  }
  await walk(dir, '');
  return results.sort();
}

describe('I2A-07:first-publication', () => {
  it('stages a missing target completely and switches it, with _meta.json last and exact outcome counts', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(oneModuleProjection('mod', [
      entry('greet', 'value', described('greet', 'function greet(): void;')),
      entry('Shape', 'type-only', truncated('Shape', 'interface Shape {\n}')),
    ])), 'req-1');
    expect(outcome.status).toBe('published');
    if (outcome.status !== 'published') throw new Error('unreachable');
    const target: MaterializedTarget = outcome.targets[0];
    expect(target).toMatchObject({ module: 'mod', area: 'ordinary', path: 'mod/src/.ramify', files: 2, entries: 2, changed: true });
    expect(outcome.bytesWritten).toBe(target.bytes);
    const written = await listAll(join(root, 'mod/src/.ramify'));
    expect(written).toEqual(['_meta.json', 'external/other/src/thing.ts.md']);
    const metaWriteIndex = fs.calls.findIndex(call => call.op === 'writeFile' && call.args[0].endsWith('_meta.json'));
    const docWriteIndex = fs.calls.findIndex(call => call.op === 'writeFile' && call.args[0].endsWith('thing.ts.md'));
    expect(metaWriteIndex).toBeGreaterThan(docWriteIndex);
    expect(written.some(p => p.includes('.ramify.old-'))).toBe(false);
  });
});

describe('I2A-07:stale-removal', () => {
  it('removes an obsolete file only through complete directory replacement', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    await publisher.publish(root, 'rev-1', apiInput(oneModuleProjection('mod', [
      entry('greet', 'value', described('greet', 'function greet(): void;')),
    ])), 'req-1');
    const before = await listAll(join(root, 'mod/src/.ramify'));
    expect(before).toContain('external/other/src/thing.ts.md');
    const smaller = projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', []))]);
    const outcome = await publisher.publish(root, 'rev-2', apiInput(smaller), 'req-2');
    expect(outcome.status).toBe('published');
    const after = await listAll(join(root, 'mod/src/.ramify'));
    expect(after).toEqual(['_meta.json']);
    // A committed replacement leaves no rollback directory or ownership marker beside the target.
    expect((await readdir(join(root, 'mod/src'))).sort()).toEqual(['.ramify']);
  });
});

describe('I2A-07:unchanged-noop', () => {
  it('writes zero target bytes, renames nothing and preserves mtimes on an identical rerun', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const data = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
    const first = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
    expect(first.status).toBe('published');
    const before = await stat(join(root, 'mod/src/.ramify'));
    const beforeDoc = await stat(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));
    const callsBeforeRerun = fs.calls.length;
    const second = await publisher.publish(root, 'rev-1', apiInput(data), 'req-2');
    expect(second.status).toBe('published');
    if (second.status !== 'published') throw new Error('unreachable');
    expect(second.targets[0].changed).toBe(false);
    expect(second.bytesWritten).toBe(0);
    const rerunCalls = fs.calls.slice(callsBeforeRerun);
    expect(rerunCalls.some(call => ['mkdir', 'writeFile', 'rename'].includes(call.op))).toBe(false);
    const after = await stat(join(root, 'mod/src/.ramify'));
    const afterDoc = await stat(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(afterDoc.mtimeMs).toBe(beforeDoc.mtimeMs);
  });
});

describe('I2A-07:prestage-failure', () => {
  it('preserves an existing target and cleans owned temp output when a staged write fails', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const first = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
    await publisher.publish(root, 'rev-1', apiInput(first), 'req-1');
    const before = await readFile(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));

    const second = oneModuleProjection('mod', [entry('changed', 'value', described('changed', 'function changed(): void;'))]);
    fs.failNext('writeFile', p => p.endsWith('thing.ts.md'));
    const outcome = await publisher.publish(root, 'rev-2', apiInput(second), 'req-2');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'output-failure' });
    const after = await readFile(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));
    expect(after.equals(before)).toBe(true);
    const remaining = await listAll(root);
    expect(remaining.some(p => p.includes('.ramify.tmp-'))).toBe(false);
  });

  it('also preserves an absent target (no rollback needed) and cleans the failed stage on first publication', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const data = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
    fs.failNext('mkdir', p => p.includes('.ramify.tmp-'));
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'output-failure' });
    const remaining = await listAll(root).catch(() => []);
    expect(remaining.some(p => p.includes('.ramify'))).toBe(false);
  });
});

describe('stage cleanup (AV42)', () => {
  it('keeps the marker of a failed stage whose removal failed, and the next publication reclaims the stage', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const first = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
    await publisher.publish(root, 'rev-1', apiInput(first), 'req-1');
    const before = await listAll(join(root, 'mod/src'));
    fs.failNext('writeFile', p => p.endsWith('thing.ts.md'));
    // Only the stage's removal fails; removing its marker would succeed.
    fs.failNext('rm', p => /\/\.ramify\.tmp-[0-9a-f]+$/.test(p));
    const second = oneModuleProjection('mod', [entry('changed', 'value', described('changed', 'function changed(): void;'))]);
    expect(await publisher.publish(root, 'rev-2', apiInput(second), 'req-2')).toMatchObject({ status: 'unavailable', reason: 'output-failure' });
    const stage = `.ramify.tmp-${'2'.padStart(32, '0')}`;
    expect((await readdir(join(root, 'mod/src'))).sort()).toEqual(['.ramify', stage, `${stage}.marker.json`]);
    // Recovery at the start of the next publication removes the marked stage and its marker.
    expect(await publisher.publish(root, 'rev-1', apiInput(first), 'req-3')).toMatchObject({ status: 'published', bytesWritten: 0 });
    expect((await readdir(join(root, 'mod/src'))).sort()).toEqual(['.ramify']);
    expect(await listAll(join(root, 'mod/src'))).toEqual(before);
  });

  it('keeps the marker when recovery cannot remove the stage either, and a later publication reclaims it', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const first = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
    await publisher.publish(root, 'rev-1', apiInput(first), 'req-1');
    fs.failNext('writeFile', p => p.endsWith('thing.ts.md'));
    // The failed publication's cleanup and the next publication's recovery both fail to remove the stage.
    fs.failNext('rm', p => /\/\.ramify\.tmp-[0-9a-f]+$/.test(p));
    fs.failNext('rm', p => /\/\.ramify\.tmp-[0-9a-f]+$/.test(p));
    const second = oneModuleProjection('mod', [entry('changed', 'value', described('changed', 'function changed(): void;'))]);
    expect(await publisher.publish(root, 'rev-2', apiInput(second), 'req-2')).toMatchObject({ status: 'unavailable', reason: 'output-failure' });
    const stage = `.ramify.tmp-${'2'.padStart(32, '0')}`;
    expect(await publisher.publish(root, 'rev-1', apiInput(first), 'req-3')).toMatchObject({ status: 'published', bytesWritten: 0 });
    expect((await readdir(join(root, 'mod/src'))).sort()).toEqual(['.ramify', stage, `${stage}.marker.json`]);
    expect(await publisher.publish(root, 'rev-1', apiInput(first), 'req-4')).toMatchObject({ status: 'published', bytesWritten: 0 });
    expect((await readdir(join(root, 'mod/src'))).sort()).toEqual(['.ramify']);
  });
});

describe('I2A-07:switch-rollback', () => {
  it('restores every earlier switched target byte-for-byte in reverse order on a later switch failure', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'a/src'), { recursive: true });
    await mkdir(join(root, 'b/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const first = projection([
      moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1', 'value', described('g1', 'function g1(): void;'))])])),
      moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2', 'value', described('g2', 'function g2(): void;'))])])),
    ]);
    await publisher.publish(root, 'rev-1', apiInput(first), 'req-1');
    const aBefore = await readFile(join(root, 'a/src/.ramify/external/x/src/f.ts.md'));
    const bBefore = await readFile(join(root, 'b/src/.ramify/external/x/src/f.ts.md'));

    const second = projection([
      moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1x', 'value', described('g1x', 'function g1x(): void;'))])])),
      moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2x', 'value', described('g2x', 'function g2x(): void;'))])])),
    ]);
    fs.failNext('rename', (from, to) => Boolean(to) && to.endsWith('b/src/.ramify'));
    const outcome = await publisher.publish(root, 'rev-2', apiInput(second), 'req-2');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'output-failure' });

    const aAfter = await readFile(join(root, 'a/src/.ramify/external/x/src/f.ts.md'));
    const bAfter = await readFile(join(root, 'b/src/.ramify/external/x/src/f.ts.md'));
    expect(aAfter.equals(aBefore)).toBe(true);
    expect(bAfter.equals(bBefore)).toBe(true);
    const remaining = await listAll(root);
    expect(remaining.some(p => p.includes('.ramify.tmp-') || p.includes('.ramify.old-'))).toBe(false);
  });
});

describe('I2A-07:rollback-failure-explicit', () => {
  it('reports rollback-failure and retains recovery artifacts when the rollback itself fails', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'a/src'), { recursive: true });
    await mkdir(join(root, 'b/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const first = projection([
      moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1', 'value', described('g1', 'function g1(): void;'))])])),
      moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2', 'value', described('g2', 'function g2(): void;'))])])),
    ]);
    await publisher.publish(root, 'rev-1', apiInput(first), 'req-1');

    const second = projection([
      moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1x', 'value', described('g1x', 'function g1x(): void;'))])])),
      moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2x', 'value', described('g2x', 'function g2x(): void;'))])])),
    ]);
    fs.failNext('rename', (from, to) => Boolean(to) && to.endsWith('b/src/.ramify'));
    // The rollback of target "a" renames its `.old-` backup back over the live directory;
    // fail exactly that rename so the rollback itself cannot complete.
    fs.failNext('rename', (from, to) => Boolean(from) && from.includes('.ramify.old-') && Boolean(to) && to.endsWith('a/src/.ramify'));
    const outcome = await publisher.publish(root, 'rev-2', apiInput(second), 'req-2');
    expect(outcome.status).toBe('unavailable');
    if (outcome.status !== 'unavailable') throw new Error('unreachable');
    expect(outcome.reason).toBe('rollback-failure');
    const remaining = await listAll(root);
    expect(remaining.some(p => p.includes('.ramify.old-'))).toBe(true);
  });
});

describe('I2A-07:cancel-boundaries', () => {
  it('preserves every target when cancellation happens before switching starts', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const controller = new AbortController();
    const publisher = onePublisher(fs);
    const originalWriteFile = fs.writeFile.bind(fs);
    fs.writeFile = async (path, data) => {
      await originalWriteFile(path, data);
      if (path.endsWith('_meta.json') && path.includes('.ramify.tmp-')) controller.abort();
    };
    const data = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1', { signal: controller.signal });
    expect(outcome).toEqual({ status: 'cancelled' });
    const remaining = await listAll(root).catch(() => []);
    expect(remaining.some(p => p.includes('.ramify'))).toBe(false);
  });

  it('finishes rolling back any switched target before returning cancelled when cancellation happens mid-switch', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'a/src'), { recursive: true });
    await mkdir(join(root, 'b/src'), { recursive: true });
    const { fs } = controlled();
    const controller = new AbortController();
    const publisher = onePublisher(fs);
    const first = projection([
      moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1', 'value', described('g1', 'function g1(): void;'))])])),
      moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2', 'value', described('g2', 'function g2(): void;'))])])),
    ]);
    await publisher.publish(root, 'rev-1', apiInput(first), 'req-1');
    const aBefore = await readFile(join(root, 'a/src/.ramify/external/x/src/f.ts.md'));
    const bBefore = await readFile(join(root, 'b/src/.ramify/external/x/src/f.ts.md'));

    const second = projection([
      moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1x', 'value', described('g1x', 'function g1x(): void;'))])])),
      moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2x', 'value', described('g2x', 'function g2x(): void;'))])])),
    ]);
    const originalRename = fs.rename.bind(fs);
    fs.rename = async (from, to) => {
      await originalRename(from, to);
      if (to.endsWith('a/src/.ramify') && !to.includes('.ramify.old-')) controller.abort();
    };
    const outcome = await publisher.publish(root, 'rev-2', apiInput(second), 'req-2', { signal: controller.signal });
    expect(outcome).toEqual({ status: 'cancelled' });
    const aAfter = await readFile(join(root, 'a/src/.ramify/external/x/src/f.ts.md'));
    const bAfter = await readFile(join(root, 'b/src/.ramify/external/x/src/f.ts.md'));
    expect(aAfter.equals(aBefore)).toBe(true);
    expect(bAfter.equals(bBefore)).toBe(true);
    const remaining = await listAll(root);
    expect(remaining.some(p => p.includes('.ramify.tmp-') || p.includes('.ramify.old-'))).toBe(false);
  });
});

describe('I2A-07:symlink-traversal', () => {
  it('refuses when an ancestor path component is a symlink, without following or deleting it', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'real-src'));
    await symlink(join(root, 'real-src'), join(root, 'mod'));
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const data = projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [file('external', 'x/src/f.ts', [entry('g', 'value', described('g', 'function g(): void;'))])]))]);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'symlink' });
    expect((await lstat(join(root, 'mod'))).isSymbolicLink()).toBe(true);
  });

  it('refuses when the target itself is a symlink', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    await mkdir(join(root, 'elsewhere'));
    await symlink(join(root, 'elsewhere'), join(root, 'mod/src/.ramify'));
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const data = oneModuleProjection('mod', [entry('g', 'value', described('g', 'function g(): void;'))]);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'symlink' });
    expect((await lstat(join(root, 'mod/src/.ramify'))).isSymbolicLink()).toBe(true);
  });

  it('refuses when an existing target contains a symlinked entry', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src/.ramify/external'), { recursive: true });
    await writeFile(join(root, 'mod/src/.ramify/_meta.json'), '{}\n');
    await mkdir(join(root, 'outside-file'));
    await symlink(join(root, 'outside-file'), join(root, 'mod/src/.ramify/external/link'));
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const data = oneModuleProjection('mod', [entry('g', 'value', described('g', 'function g(): void;'))]);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'symlink' });
    expect((await lstat(join(root, 'mod/src/.ramify/external/link'))).isSymbolicLink()).toBe(true);
  });
});

describe('missing source area', () => {
  it('refuses invalid-path for a target whose parent src/ does not exist, without creating it', async () => {
    const root = await tempRoot();
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const data = oneModuleProjection('mod', [entry('g', 'value', described('g', 'function g(): void;'))]);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'invalid-path' });
    expect(fs.calls.some(call => ['mkdir', 'writeFile', 'rename'].includes(call.op))).toBe(false);
    await expect(lstat(join(root, 'mod'))).rejects.toThrow();
  });

  it('refuses invalid-path for a testing target whose parent src/tests does not exist, without creating it', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const data = projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', []),
      area('tests', 'mod/src/tests', [file('external', 'other/src/thing.ts', [entry('g', 'value', described('g', 'function g(): void;'))])]))]);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'invalid-path' });
    expect(fs.calls.some(call => ['mkdir', 'writeFile', 'rename'].includes(call.op))).toBe(false);
    await expect(lstat(join(root, 'mod/src/tests'))).rejects.toThrow();
  });
});

describe('I2A-07:path-escape', () => {
  it('rejects an absolute, escaping or separator-confused projected path before any write, leaving neighbors untouched', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'neighbor/src'), { recursive: true });
    await writeFile(join(root, 'neighbor/keep.txt'), 'keep');
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const cases: ApiViewProjection[] = [
      projection([moduleProjection('mod', 'mod', area('ordinary', '../escape/src', []))]),
      projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [file('external', '../../etc/passwd', [entry('g', 'value', described('g', 'function g(): void;'))])]))]),
      projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [file('external', '/abs/path.ts', [entry('g', 'value', described('g', 'function g(): void;'))])]))]),
      projection([moduleProjection('mod', 'mod', area('ordinary', 'mod\\src', []))]),
    ];
    for (const [index, data] of cases.entries()) {
      const outcome = await publisher.publish(root, `rev-${index}`, apiInput(data), `req-${index}`);
      expect(outcome).toMatchObject({ status: 'unavailable', reason: 'invalid-path' });
    }
    expect(fs.calls.some(call => ['mkdir', 'writeFile', 'rename', 'rm'].includes(call.op))).toBe(false);
    expect(await readFile(join(root, 'neighbor/keep.txt'), 'utf8')).toBe('keep');
  });
});

describe('resource limits', () => {
  it('refuses with resource-limit when one target exceeds maxAreaBytes, before any write', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const { fs } = controlled();
    const publisher = onePublisher(fs, { maxAreaBytes: 10 });
    const data = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
    expect(fs.calls.some(call => ['mkdir', 'writeFile', 'rename'].includes(call.op))).toBe(false);
  });

  it('the production factory rejects non-positive or non-finite limits', () => {
    expect(() => createFilesystemApiViewPublisher({ ...limits, maxAreaBytes: 0 })).toThrow();
    expect(() => createFilesystemApiViewPublisher({ ...limits, maxInvocationBytes: -1 })).toThrow();
    expect(() => createFilesystemApiViewPublisher({ ...limits, maxStagedBytes: Number.POSITIVE_INFINITY })).toThrow();
  });
});

describe('cancellation before any work', () => {
  it('returns cancelled immediately for an already-aborted signal, with no writes', async () => {
    const root = await tempRoot();
    const { fs } = controlled();
    const publisher = onePublisher(fs);
    const controller = new AbortController();
    controller.abort();
    const data = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
    const outcome = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1', { signal: controller.signal });
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(fs.calls).toHaveLength(0);
  });
});
