import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createFilesystemApiViewPublisher } from '../api-view-publisher.js';
import type { ApiViewPublishLimits } from '../interfaces/daemon.js';
import { apiInput, area, described, entry, file, moduleProjection, projection } from './api-view-fixtures.js';
import { architectView } from './architect-view-fixtures.js';

const limits: ApiViewPublishLimits = { maxAreaBytes: 32 * 1024 * 1024, maxArchitectBytes: 64 * 1024 * 1024, maxInvocationBytes: 256 * 1024 * 1024, maxStagedBytes: 256 * 1024 * 1024 };

const roots: string[] = [];
afterEach(async () => { for (const dir of roots.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function tempRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-apiview-crash-')));
  roots.push(root);
  return root;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
async function until(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Condition not reached in time');
    await delay(20);
  }
}

describe('I2A-07:crash-recovery', () => {
  it('leaves only marked owned stage/rollback directories after a killed publisher, and the next run restores them without deleting an unmarked lookalike', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'mod/src'), { recursive: true });
    const publisher = createFilesystemApiViewPublisher(limits);
    const original = projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [
      file('external', 'other/src/thing.ts', [entry('greet', 'value', described('greet', 'function greet(): void;'))]),
    ]))]);
    const first = await publisher.publish(root, 'rev-1', apiInput(original), 'req-1');
    expect(first.status).toBe('published');
    const originalBytes = await readFile(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));

    // An unmarked lookalike directory beside the real target: this publisher
    // never writes a marker for it, so recovery must never touch it.
    const lookalike = join(root, 'mod/src/.ramify.tmp-deadbeefdeadbeefdeadbeefdeadbeef');
    await mkdir(lookalike);
    await writeFile(join(lookalike, 'keep.txt'), 'not ours');

    const checkpointPath = join(root, 'checkpoint');
    const script = fileURLToPath(new URL('./crash-recovery-child.js', import.meta.url));
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), script, root, checkpointPath]);
    let stderr = '';
    child.stderr?.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
    let killed = false;
    try {
      await until(() => exists(checkpointPath), 15000);
      expect(child.pid).toBeDefined();
      process.kill(child.pid!, 'SIGKILL');
      killed = true;
      await new Promise<void>(resolveExit => { child.once('exit', () => resolveExit()); });
    } finally {
      if (!killed && child.pid) child.kill('SIGKILL');
    }
    expect(stderr).toBe('');

    // Mid-crash: the switch renamed the original target away to `.old-`
    // (marked) and never completed the second rename; the staged `.tmp-`
    // for this run (marked) is still present too, alongside the unmarked
    // lookalike this test created above.
    const midCrash = await readdir(join(root, 'mod/src'));
    expect(midCrash.some(name => /^\.ramify\.old-[0-9a-f]+\.marker\.json$/.test(name))).toBe(true);
    expect(midCrash.some(name => /^\.ramify\.tmp-[0-9a-f]+\.marker\.json$/.test(name))).toBe(true);
    expect(midCrash).toContain('.ramify.tmp-deadbeefdeadbeefdeadbeefdeadbeef');
    expect(midCrash).not.toContain('.ramify');

    const recovered = await publisher.publish(root, 'rev-1', apiInput(original), 'req-2');
    expect(recovered.status).toBe('published');
    if (recovered.status !== 'published') throw new Error('unreachable');
    expect(recovered.targets[0].changed).toBe(false);

    const restoredBytes = await readFile(join(root, 'mod/src/.ramify/external/other/src/thing.ts.md'));
    expect(restoredBytes.equals(originalBytes)).toBe(true);

    const after = await readdir(join(root, 'mod/src'));
    expect(after.some(name => name.startsWith('.ramify.old-') || (name.startsWith('.ramify.tmp-') && name !== '.ramify.tmp-deadbeefdeadbeefdeadbeefdeadbeef'))).toBe(false);
    // The unmarked lookalike survives untouched, byte-for-byte.
    expect(after).toContain('.ramify.tmp-deadbeefdeadbeefdeadbeefdeadbeef');
    expect(await readFile(join(lookalike, 'keep.txt'), 'utf8')).toBe('not ours');
  }, 30000);
});

async function files(dir: string, prefix = ''): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) for (const [path, text] of await files(join(dir, item.name), rel)) found.set(path, text);
    else found.set(rel, await readFile(join(dir, item.name), 'utf8'));
  }
  return found;
}

describe('crash recovery of the architect target (AV22)', () => {
  it('restores .ramify-architect from its marked backup after a publisher is killed between the switch renames', async () => {
    const root = await tempRoot();
    const publisher = createFilesystemApiViewPublisher(limits);
    const original = architectView();
    expect((await publisher.publish(root, 'rev-1', { api: null, architect: original }, 'req-1')).status).toBe('published');
    const lookalike = join(root, '.ramify-architect.tmp-deadbeefdeadbeefdeadbeefdeadbeef');
    await mkdir(lookalike);
    await writeFile(join(lookalike, 'keep.txt'), 'not ours');

    const checkpointPath = join(root, 'checkpoint');
    const script = fileURLToPath(new URL('./crash-recovery-child.js', import.meta.url));
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), script, root, checkpointPath, 'architect']);
    let stderr = '';
    child.stderr?.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
    let killed = false;
    try {
      await until(() => exists(checkpointPath), 15000);
      process.kill(child.pid!, 'SIGKILL');
      killed = true;
      await new Promise<void>(resolveExit => { child.once('exit', () => resolveExit()); });
    } finally {
      if (!killed && child.pid) child.kill('SIGKILL');
    }
    expect(stderr).toBe('');

    const midCrash = await readdir(root);
    expect(midCrash.some(name => /^\.ramify-architect\.old-[0-9a-f]{32}\.marker\.json$/.test(name))).toBe(true);
    expect(midCrash.some(name => /^\.ramify-architect\.tmp-[0-9a-f]{32}\.marker\.json$/.test(name))).toBe(true);
    expect(midCrash).not.toContain('.ramify-architect');

    const recovered = await publisher.publish(root, 'rev-1', { api: null, architect: architectView() }, 'req-2');
    expect(recovered).toMatchObject({ status: 'published', bytesWritten: 0, targets: [{ view: 'architect', changed: false }] });
    expect(await files(join(root, '.ramify-architect'))).toEqual(new Map(original.files.map(item => [item.path, item.text])));
    const after = await readdir(root);
    expect(after.filter(name => /^\.ramify-architect\.(tmp|old)-/.test(name))).toEqual(['.ramify-architect.tmp-deadbeefdeadbeefdeadbeefdeadbeef']);
    expect(await readFile(join(lookalike, 'keep.txt'), 'utf8')).toBe('not ours');
  }, 30000);
});
