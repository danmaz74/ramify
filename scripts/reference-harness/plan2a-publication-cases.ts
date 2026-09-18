import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  createControlledApiViewFilesystem, createControlledFilesystemApiViewPublisher, createFilesystemApiViewPublisher,
  createNodeApiViewFilesystem,
} from '../../subs/daemon/src/api-view-publisher.js';
import { renderApiView, renderCodeFence, renderCodeSpan, renderDocument, renderEntry, renderMeta } from '../../subs/daemon/src/api-view-documents.js';
import type { ApiViewPublishLimits } from '../../subs/daemon/src/interfaces/daemon.js';
import { apiInput, area, described, entry, file, moduleProjection, projection, truncated, unavailable } from '../../subs/daemon/src/tests/api-view-fixtures.js';
import type { Assertions, InstanceHandler } from './runner.js';

/**
 * I2A-06 (rendering) and I2A-07 (publication) handlers for iteration 6.
 * Rendering handlers call the real pure renderer directly (no fixture
 * project needed). Publication handlers exercise the real, exposed
 * `createFilesystemApiViewPublisher` (or, where a specific fault or
 * ordering must be controlled, `createControlledFilesystemApiViewPublisher`
 * over `createControlledApiViewFilesystem`) against real temporary
 * directories — the same production code path and filesystem seam the
 * daemon service will inject, not a reimplementation. `I2A-07:crash-recovery`
 * spawns the same real, separately-owned child-process fixture the unit
 * suite uses (`subs/daemon/src/tests/crash-recovery-child.ts`) and kills
 * only that one PID.
 */

const limits: ApiViewPublishLimits = { maxAreaBytes: 32 * 1024 * 1024, maxArchitectBytes: 64 * 1024 * 1024, maxInvocationBytes: 256 * 1024 * 1024, maxStagedBytes: 256 * 1024 * 1024 };

async function tempRoot(): Promise<{ root: string; dispose: () => Promise<void> }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'plan2a-publication-')));
  return { root, dispose: () => rm(root, { recursive: true, force: true }) };
}

function controlledPublisher(overrides: Partial<ApiViewPublishLimits> = {}) {
  const fs = createControlledApiViewFilesystem(createNodeApiViewFilesystem());
  let suffixCounter = 0;
  const publisher = createControlledFilesystemApiViewPublisher({ ...limits, ...overrides }, fs,
    () => (++suffixCounter).toString(16).padStart(32, '0'));
  return { fs, publisher };
}

function oneModuleProjection(moduleName: string, entries: readonly ReturnType<typeof entry>[]) {
  return projection([moduleProjection(moduleName, moduleName,
    area('ordinary', `${moduleName}/src`, [file('external', 'other/src/thing.ts', entries)]))]);
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

export const plan2aPublicationHandlers: ReadonlyMap<string, InstanceHandler> = new Map([
  ['I2A-06:minimal-described', { kind: 'memory', run: ({ assertions }: { assertions: Assertions }) => {
    const document = renderDocument(file('external', 'subs/x/src/thing.ts', [entry('greet', 'value', described('greet', 'function greet(): void;'))]));
    assertions.equal('a described value entry with no documentation renders exactly a heading, a ts fence and one final newline',
      document.toString('utf8'), '## `greet`\n\n```ts\nfunction greet(): void;\n```\n');
    const withDocs = renderDocument(file('external', 'f.ts', [entry('greet', 'value', described('greet', 'function greet(): void;', 'Greets.'))]));
    assertions.equal('one optional paragraph follows the fence when documentation is present',
      withDocs.toString('utf8'), '## `greet`\n\n```ts\nfunction greet(): void;\n```\n\nGreets.\n');
  } }],
  ['I2A-06:type-marker', { kind: 'memory', run: ({ assertions }: { assertions: Assertions }) => {
    const typeOnly = renderEntry(entry('Shape', 'type-only', described('Shape', 'interface Shape {\n}')));
    assertions.equal('a type-only entry carries [type-only] on its heading',
      typeOnly, '## `Shape` [type-only]\n\n```ts\ninterface Shape {\n}\n```');
    const value = renderEntry(entry('greet', 'value', described('greet', 'function greet(): void;')));
    assertions.ok('a value entry emits no [type-only] or other availability marker', !/\[type-only\]|\[value\]|\[available\]/.test(value));
  } }],
  ['I2A-06:exception-markers', { kind: 'memory', run: ({ assertions }: { assertions: Assertions }) => {
    const truncatedRendered = renderEntry(entry('big', 'value', truncated('big', 'function big(): void;')));
    assertions.equal('a truncated entry renders bounded content plus [truncated]',
      truncatedRendered, '## `big` [truncated]\n\n```ts\nfunction big(): void;\n```');
    const unavailableRendered = renderEntry(entry('hidden', 'value', unavailable('hidden')));
    assertions.equal('an unavailable entry renders [details-unavailable] and no fence',
      unavailableRendered, '## `hidden` [details-unavailable]');
    assertions.equal('marker order is [type-only] before [truncated]/[details-unavailable] when both apply',
      renderEntry(entry('Hidden', 'type-only', unavailable('Hidden'))), '## `Hidden` [type-only] [details-unavailable]');
  } }],
  ['I2A-06:omitted-redundancy', { kind: 'memory', run: ({ assertions }: { assertions: Assertions }) => {
    const document = renderDocument(file('children', 'subs/y/src/thing.ts', [
      entry('greet', 'value', described('greet', 'function greet(): void;', 'Docs.')),
      entry('Shape', 'type-only', truncated('Shape', 'interface Shape {\n}')),
      entry('Hidden', 'value', unavailable('Hidden')),
    ])).toString('utf8').toLowerCase();
    for (const forbidden of ['provider', 'exposure', 'alias', 'availability', 'original', 'tag']) {
      assertions.ok(`rendered document never mentions "${forbidden}"`, !document.includes(forbidden));
    }
    const meta = JSON.parse(renderMeta('m', 'r1', area('ordinary', 'src', [])).toString('utf8'));
    assertions.ok('_meta.json never carries a provider or timestamp field', !('provider' in meta) && !('timestamp' in meta));
  } }],
  ['I2A-06:markdown-delimiters', { kind: 'memory', run: ({ assertions }: { assertions: Assertions }) => {
    assertions.equal('a plain name uses a single backtick', renderCodeSpan('plain'), '`plain`');
    assertions.equal('a name with one backtick run uses a delimiter one longer, padded', renderCodeSpan('`leading'), '`` `leading ``');
    assertions.equal('a signature fence is longer than any leading backtick run, minimum three',
      renderCodeFence('```not really code', 'ts'), '````ts\n```not really code\n````');
    const rendered = renderDocument(file('external', 'f.ts', [entry('odd', 'value', described('odd', 'const odd: `template ${string}`;'))])).toString('utf8');
    assertions.equal('a signature containing a backtick run still renders as one valid, closed fence with the literal text intact',
      rendered, '## `odd`\n\n```ts\nconst odd: `template ${string}`;\n```\n');
  } }],
  ['I2A-06:metadata-minimal', { kind: 'memory', run: ({ assertions }: { assertions: Assertions }) => {
    const minimal = renderMeta('root/sub', 'rev-7', area('ordinary', 'subs/sub/src', [])).toString('utf8');
    assertions.equal('_meta.json is schema/module/area/revision, one line, final newline, with no zero-valued exceptional count',
      minimal, '{"schema":"ramify.api-view/1","module":"root/sub","area":"ordinary","revision":"rev-7"}\n');
    const withCounts = JSON.parse(renderMeta('m', 'rev-1', area('tests', 'src/tests', [], { coverage: 2, truncated: 1 })).toString('utf8'));
    assertions.equal('only nonzero exceptional counts appear, in coverage/detailsUnavailable/truncated order',
      Object.keys(withCounts), ['schema', 'module', 'area', 'revision', 'coverage', 'truncated']);
  } }],
  ['I2A-06:byte-determinism', { kind: 'memory', run: ({ assertions }: { assertions: Assertions }) => {
    const entries = [entry('greet', 'value', described('greet', 'function greet(): void;', 'Greets.')), entry('Shape', 'type-only', truncated('Shape', 'interface Shape {\n}'))];
    const areaA = area('ordinary', 'subs/x/src', [file('external', 'a.ts', entries), file('children', 'b.ts', [entry('h', 'value', unavailable('h'))])]);
    const projectionA = projection([moduleProjection('x', 'subs/x', areaA)]);
    const projectionB = projection([moduleProjection('x', 'subs/x', { ...areaA, files: [...areaA.files].reverse() })]);
    const flatten = (targets: ReturnType<typeof renderApiView>) => new Map(targets.flatMap(target => target.files.map(f => [f.relativePath, f.bytes.toString('utf8')] as const)));
    const renderedA = flatten(renderApiView(projectionA, 'rev-9'));
    const renderedB = flatten(renderApiView(projectionB, 'rev-9'));
    assertions.equal('a shuffled equivalent projection renders a byte-identical relative tree', renderedA, renderedB);
    const everything = [...renderedA.values()].join('');
    assertions.ok('no absolute path, timestamp, PID or request ID occurs anywhere in the rendered output',
      !/\/(?:home|Users|tmp)\//.test(everything) && !/\d{4}-\d{2}-\d{2}T/.test(everything) && !/\bpid\b/i.test(everything) && !everything.includes('request'));
  } }],

  ['I2A-07:first-publication', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const { root, dispose } = await tempRoot();
    try {
      await mkdir(join(root, 'mod/src'), { recursive: true });
      const { fs, publisher } = controlledPublisher();
      const outcome = await publisher.publish(root, 'rev-1', apiInput(oneModuleProjection('mod', [
        entry('greet', 'value', described('greet', 'function greet(): void;')),
        entry('Shape', 'type-only', truncated('Shape', 'interface Shape {\n}')),
      ])), 'req-1');
      if (outcome.status !== 'published') throw new Error(`Expected published, got ${JSON.stringify(outcome)}`);
      assertions.equal('a missing target is staged completely and switched, with exact outcome counts',
        { module: outcome.targets[0]!.module, area: outcome.targets[0]!.area, path: outcome.targets[0]!.path,
          files: outcome.targets[0]!.files, entries: outcome.targets[0]!.entries, changed: outcome.targets[0]!.changed },
        { module: 'mod', area: 'ordinary', path: 'mod/src/.ramify', files: 2, entries: 2, changed: true });
      assertions.equal('the written tree contains exactly the rendered documents plus _meta.json',
        await listAll(join(root, 'mod/src/.ramify')), ['_meta.json', 'external/other/src/thing.ts.md']);
      const metaIndex = fs.calls.findIndex(call => call.op === 'writeFile' && call.args[0]!.endsWith('_meta.json'));
      const docIndex = fs.calls.findIndex(call => call.op === 'writeFile' && call.args[0]!.endsWith('thing.ts.md'));
      assertions.ok('_meta.json is staged after the document it accompanies', metaIndex > docIndex);
    } finally { await dispose(); }
  } }],

  ['I2A-07:stale-removal', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const { root, dispose } = await tempRoot();
    try {
      await mkdir(join(root, 'mod/src'), { recursive: true });
      const { publisher } = controlledPublisher();
      await publisher.publish(root, 'rev-1', apiInput(oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))])), 'req-1');
      const smaller = projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', []))]);
      const outcome = await publisher.publish(root, 'rev-2', apiInput(smaller), 'req-2');
      if (outcome.status !== 'published') throw new Error(`Expected published, got ${JSON.stringify(outcome)}`);
      assertions.equal('removing an available API leaves only _meta.json, through complete directory replacement',
        await listAll(join(root, 'mod/src/.ramify')), ['_meta.json']);
    } finally { await dispose(); }
  } }],

  ['I2A-07:unchanged-noop', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const { root, dispose } = await tempRoot();
    try {
      await mkdir(join(root, 'mod/src'), { recursive: true });
      const { fs, publisher } = controlledPublisher();
      const data = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
      const first = await publisher.publish(root, 'rev-1', apiInput(data), 'req-1');
      if (first.status !== 'published') throw new Error(`Expected published, got ${JSON.stringify(first)}`);
      const before = await import('node:fs/promises').then(fsp => fsp.stat(join(root, 'mod/src/.ramify')));
      const callsBefore = fs.calls.length;
      const second = await publisher.publish(root, 'rev-1', apiInput(data), 'req-2');
      if (second.status !== 'published') throw new Error(`Expected published, got ${JSON.stringify(second)}`);
      assertions.equal('an identical rerun reports the target unchanged and writes zero bytes', { changed: second.targets[0]!.changed, bytesWritten: second.bytesWritten }, { changed: false, bytesWritten: 0 });
      const rerunCalls = fs.calls.slice(callsBefore);
      assertions.ok('an identical rerun performs no mkdir, writeFile or rename', !rerunCalls.some(call => ['mkdir', 'writeFile', 'rename'].includes(call.op)));
      const after = await import('node:fs/promises').then(fsp => fsp.stat(join(root, 'mod/src/.ramify')));
      assertions.equal('the target directory mtime is preserved', after.mtimeMs, before.mtimeMs);
    } finally { await dispose(); }
  } }],

  ['I2A-07:prestage-failure', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const { root, dispose } = await tempRoot();
    try {
      await mkdir(join(root, 'mod/src'), { recursive: true });
      const { fs, publisher } = controlledPublisher();
      await publisher.publish(root, 'rev-1', apiInput(oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))])), 'req-1');
      const before = await readFile(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));
      fs.failNext('writeFile', p => p.endsWith('thing.ts.md'));
      const outcome = await publisher.publish(root, 'rev-2', apiInput(oneModuleProjection('mod', [entry('changed', 'value', described('changed', 'function changed(): void;'))])), 'req-2');
      assertions.equal('a staged-write failure reports output-failure', outcome.status === 'unavailable' && outcome.reason, 'output-failure');
      const after = await readFile(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));
      assertions.ok('the previous target is preserved byte-for-byte', after.equals(before));
      const remaining = await listAll(root);
      assertions.ok('no owned temp output remains', !remaining.some(p => p.includes('.ramify.tmp-')));
    } finally { await dispose(); }
  } }],

  ['I2A-07:switch-rollback', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const { root, dispose } = await tempRoot();
    try {
      await mkdir(join(root, 'a/src'), { recursive: true });
      await mkdir(join(root, 'b/src'), { recursive: true });
      const { fs, publisher } = controlledPublisher();
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
      fs.failNext('rename', (from, to) => Boolean(to) && to!.endsWith('b/src/.ramify'));
      const outcome = await publisher.publish(root, 'rev-2', apiInput(second), 'req-2');
      assertions.equal('the later switch failure reports output-failure', outcome.status === 'unavailable' && outcome.reason, 'output-failure');
      const aAfter = await readFile(join(root, 'a/src/.ramify/external/x/src/f.ts.md'));
      const bAfter = await readFile(join(root, 'b/src/.ramify/external/x/src/f.ts.md'));
      assertions.ok('the earlier switched target is restored byte-for-byte', aAfter.equals(aBefore));
      assertions.ok('the never-switched target is untouched byte-for-byte', bAfter.equals(bBefore));
      const remaining = await listAll(root);
      assertions.ok('no stage or rollback siblings remain', !remaining.some(p => p.includes('.ramify.tmp-') || p.includes('.ramify.old-')));
    } finally { await dispose(); }
  } }],

  ['I2A-07:rollback-failure-explicit', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const { root, dispose } = await tempRoot();
    try {
      await mkdir(join(root, 'a/src'), { recursive: true });
      await mkdir(join(root, 'b/src'), { recursive: true });
      const { fs, publisher } = controlledPublisher();
      const first = projection([
        moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1', 'value', described('g1', 'function g1(): void;'))])])),
        moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2', 'value', described('g2', 'function g2(): void;'))])])),
      ]);
      await publisher.publish(root, 'rev-1', apiInput(first), 'req-1');
      const second = projection([
        moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1x', 'value', described('g1x', 'function g1x(): void;'))])])),
        moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2x', 'value', described('g2x', 'function g2x(): void;'))])])),
      ]);
      fs.failNext('rename', (from, to) => Boolean(to) && to!.endsWith('b/src/.ramify'));
      fs.failNext('rename', (from, to) => Boolean(from) && from!.includes('.ramify.old-') && Boolean(to) && to!.endsWith('a/src/.ramify'));
      const outcome = await publisher.publish(root, 'rev-2', apiInput(second), 'req-2');
      assertions.equal('a failure during rollback itself reports rollback-failure, never success', outcome.status === 'unavailable' && outcome.reason, 'rollback-failure');
      const remaining = await listAll(root);
      assertions.ok('the recovery artifact from the failed rollback is retained, not silently discarded', remaining.some(p => p.includes('.ramify.old-')));
    } finally { await dispose(); }
  } }],

  ['I2A-07:cancel-boundaries', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const before = await tempRoot();
    try {
      await mkdir(join(before.root, 'mod/src'), { recursive: true });
      const { fs, publisher } = controlledPublisher();
      const controller = new AbortController();
      const originalWriteFile = fs.writeFile.bind(fs);
      fs.writeFile = async (path: string, data: Buffer) => {
        await originalWriteFile(path, data);
        if (path.endsWith('_meta.json') && path.includes('.ramify.tmp-')) controller.abort();
      };
      const data = oneModuleProjection('mod', [entry('greet', 'value', described('greet', 'function greet(): void;'))]);
      const outcome = await publisher.publish(before.root, 'rev-1', apiInput(data), 'req-1', { signal: controller.signal });
      assertions.equal('cancellation before switching starts preserves every target', outcome, { status: 'cancelled' });
      const remaining = await listAll(before.root).catch(() => []);
      assertions.ok('no generated output remains after a pre-switch cancellation', !remaining.some(p => p.includes('.ramify')));
    } finally { await before.dispose(); }

    const mid = await tempRoot();
    try {
      await mkdir(join(mid.root, 'a/src'), { recursive: true });
      await mkdir(join(mid.root, 'b/src'), { recursive: true });
      const { fs, publisher } = controlledPublisher();
      const controller = new AbortController();
      const first = projection([
        moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1', 'value', described('g1', 'function g1(): void;'))])])),
        moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2', 'value', described('g2', 'function g2(): void;'))])])),
      ]);
      await publisher.publish(mid.root, 'rev-1', apiInput(first), 'req-1');
      const aBefore = await readFile(join(mid.root, 'a/src/.ramify/external/x/src/f.ts.md'));
      const bBefore = await readFile(join(mid.root, 'b/src/.ramify/external/x/src/f.ts.md'));
      const second = projection([
        moduleProjection('a', 'a', area('ordinary', 'a/src', [file('external', 'x/src/f.ts', [entry('g1x', 'value', described('g1x', 'function g1x(): void;'))])])),
        moduleProjection('b', 'b', area('ordinary', 'b/src', [file('external', 'x/src/f.ts', [entry('g2x', 'value', described('g2x', 'function g2x(): void;'))])])),
      ]);
      const originalRename = fs.rename.bind(fs);
      fs.rename = async (from: string, to: string) => {
        await originalRename(from, to);
        if (to.endsWith('a/src/.ramify') && !to.includes('.ramify.old-')) controller.abort();
      };
      const outcome = await publisher.publish(mid.root, 'rev-2', apiInput(second), 'req-2', { signal: controller.signal });
      assertions.equal('cancellation mid-switch finishes rolling back the already-switched target', outcome, { status: 'cancelled' });
      const aAfter = await readFile(join(mid.root, 'a/src/.ramify/external/x/src/f.ts.md'));
      const bAfter = await readFile(join(mid.root, 'b/src/.ramify/external/x/src/f.ts.md'));
      assertions.ok('the switched-then-cancelled target is restored byte-for-byte', aAfter.equals(aBefore));
      assertions.ok('the never-switched target is untouched byte-for-byte', bAfter.equals(bBefore));
    } finally { await mid.dispose(); }
  } }],

  ['I2A-07:symlink-traversal', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const ancestor = await tempRoot();
    try {
      await mkdir(join(ancestor.root, 'real-src'));
      await symlink(join(ancestor.root, 'real-src'), join(ancestor.root, 'mod'));
      const { publisher } = controlledPublisher();
      const data = projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [file('external', 'x/src/f.ts', [entry('g', 'value', described('g', 'function g(): void;'))])]))]);
      const outcome = await publisher.publish(ancestor.root, 'rev-1', apiInput(data), 'req-1');
      assertions.equal('a symlinked ancestor path component refuses the publish', outcome.status === 'unavailable' && outcome.reason, 'symlink');
      const stat = await import('node:fs/promises').then(fsp => fsp.lstat(join(ancestor.root, 'mod')));
      assertions.ok('the ancestor symlink is neither followed nor deleted', stat.isSymbolicLink());
    } finally { await ancestor.dispose(); }

    const target = await tempRoot();
    try {
      await mkdir(join(target.root, 'mod/src'), { recursive: true });
      await mkdir(join(target.root, 'elsewhere'));
      await symlink(join(target.root, 'elsewhere'), join(target.root, 'mod/src/.ramify'));
      const { publisher } = controlledPublisher();
      const data = oneModuleProjection('mod', [entry('g', 'value', described('g', 'function g(): void;'))]);
      const outcome = await publisher.publish(target.root, 'rev-1', apiInput(data), 'req-1');
      assertions.equal('a symlinked target itself refuses the publish', outcome.status === 'unavailable' && outcome.reason, 'symlink');
      const stat = await import('node:fs/promises').then(fsp => fsp.lstat(join(target.root, 'mod/src/.ramify')));
      assertions.ok('the target symlink is neither followed nor deleted', stat.isSymbolicLink());
    } finally { await target.dispose(); }

    const contents = await tempRoot();
    try {
      await mkdir(join(contents.root, 'mod/src/.ramify/external'), { recursive: true });
      await writeFile(join(contents.root, 'mod/src/.ramify/_meta.json'), '{}\n');
      await mkdir(join(contents.root, 'outside-file'));
      await symlink(join(contents.root, 'outside-file'), join(contents.root, 'mod/src/.ramify/external/link'));
      const { publisher } = controlledPublisher();
      const data = oneModuleProjection('mod', [entry('g', 'value', described('g', 'function g(): void;'))]);
      const outcome = await publisher.publish(contents.root, 'rev-1', apiInput(data), 'req-1');
      assertions.equal('a symlinked entry inside an existing target refuses the publish', outcome.status === 'unavailable' && outcome.reason, 'symlink');
      const stat = await import('node:fs/promises').then(fsp => fsp.lstat(join(contents.root, 'mod/src/.ramify/external/link')));
      assertions.ok('the contained symlink is neither followed nor deleted', stat.isSymbolicLink());
    } finally { await contents.dispose(); }
  } }],

  ['I2A-07:path-escape', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const { root, dispose } = await tempRoot();
    try {
      await mkdir(join(root, 'neighbor/src'), { recursive: true });
      await writeFile(join(root, 'neighbor/keep.txt'), 'keep');
      const { fs, publisher } = controlledPublisher();
      const cases = [
        projection([moduleProjection('mod', 'mod', area('ordinary', '../escape/src', []))]),
        projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [file('external', '../../etc/passwd', [entry('g', 'value', described('g', 'function g(): void;'))])]))]),
        projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [file('external', '/abs/path.ts', [entry('g', 'value', described('g', 'function g(): void;'))])]))]),
        projection([moduleProjection('mod', 'mod', area('ordinary', 'mod\\src', []))]),
      ];
      for (const [index, data] of cases.entries()) {
        const outcome = await publisher.publish(root, `rev-${index}`, apiInput(data), `req-${index}`);
        assertions.equal(`escaping/absolute/separator-confused case ${index} is rejected before any write`, outcome.status === 'unavailable' && outcome.reason, 'invalid-path');
      }
      assertions.ok('no mkdir, writeFile, rename or rm call was ever made', !fs.calls.some(call => ['mkdir', 'writeFile', 'rename', 'rm'].includes(call.op)));
      assertions.equal('an unrelated neighboring file is untouched', await readFile(join(root, 'neighbor/keep.txt'), 'utf8'), 'keep');
    } finally { await dispose(); }
  } }],

  ['I2A-07:crash-recovery', { kind: 'memory', run: async ({ assertions }: { assertions: Assertions }) => {
    const { root, dispose } = await tempRoot();
    try {
      await mkdir(join(root, 'mod/src'), { recursive: true });
      const publisher = createFilesystemApiViewPublisher(limits);
      const original = projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [file('external', 'other/src/thing.ts', [entry('greet', 'value', described('greet', 'function greet(): void;'))])]))]);
      const first = await publisher.publish(root, 'rev-1', apiInput(original), 'req-1');
      if (first.status !== 'published') throw new Error(`Expected published, got ${JSON.stringify(first)}`);
      const originalBytes = await readFile(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));

      const lookalike = join(root, 'mod/src/.ramify.tmp-deadbeefdeadbeefdeadbeefdeadbeef');
      await mkdir(lookalike);
      await writeFile(join(lookalike, 'keep.txt'), 'not ours');

      const checkpointPath = join(root, 'checkpoint');
      const script = fileURLToPath(new URL('../../subs/daemon/src/tests/crash-recovery-child.js', import.meta.url));
      const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), script, root, checkpointPath]);
      let stderr = '';
      child.stderr?.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
      let killed = false;
      try {
        const deadline = Date.now() + 15000;
        while (!await access(checkpointPath).then(() => true, () => false)) {
          if (Date.now() > deadline) throw new Error('crash-recovery-child did not reach its checkpoint in time');
          await delay(20);
        }
        if (!child.pid) throw new Error('child process has no PID');
        process.kill(child.pid, 'SIGKILL');
        killed = true;
        await new Promise<void>(resolveExit => { child.once('exit', () => resolveExit()); });
      } finally { if (!killed && child.pid) child.kill('SIGKILL'); }
      assertions.equal('the killed process wrote no error output', stderr, '');

      const midCrash = await readdir(join(root, 'mod/src'));
      assertions.ok('the mid-crash state has a marked rollback backup', midCrash.some(name => /^\.ramify\.old-[0-9a-f]+\.marker\.json$/.test(name)));
      assertions.ok('the mid-crash state has a marked, still-present stage', midCrash.some(name => /^\.ramify\.tmp-[0-9a-f]+\.marker\.json$/.test(name)));
      assertions.ok('the unmarked lookalike directory this test created is present, untouched, before recovery', midCrash.includes('.ramify.tmp-deadbeefdeadbeefdeadbeefdeadbeef'));

      const recovered = await publisher.publish(root, 'rev-1', apiInput(original), 'req-2');
      if (recovered.status !== 'published') throw new Error(`Expected recovery publish to succeed, got ${JSON.stringify(recovered)}`);
      assertions.ok('the recovered target matches the pre-crash original exactly, so the next publish reports it unchanged', recovered.targets[0]!.changed === false);
      const restoredBytes = await readFile(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));
      assertions.ok('the restored document is byte-identical to the pre-crash original', restoredBytes.equals(originalBytes));

      const after = await readdir(join(root, 'mod/src'));
      assertions.ok('every owned stage/rollback sibling is gone after recovery',
        !after.some(name => name.startsWith('.ramify.old-') || (name.startsWith('.ramify.tmp-') && name !== '.ramify.tmp-deadbeefdeadbeefdeadbeefdeadbeef')));
      assertions.ok('the unmarked lookalike directory survives untouched', after.includes('.ramify.tmp-deadbeefdeadbeefdeadbeefdeadbeef'));
      assertions.equal('the unmarked lookalike\'s own content is unchanged', await readFile(join(lookalike, 'keep.txt'), 'utf8'), 'not ours');
    } finally { await dispose(); }
  } }],
]);
