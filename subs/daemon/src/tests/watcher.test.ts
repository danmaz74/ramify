import fs from 'node:fs';
import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { createFilesystemWatcher } from '../filesystem-watcher.js';
import type { WatchEvent, WatcherHandle } from '../../subs/contexts/src/interfaces/contexts.js';

async function until(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 4000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('Watcher did not reach the expected state');
    await delay(10);
  }
}

async function fixture(run: (root: string, state: {
  readonly batches: (readonly WatchEvent[])[];
  readonly native: fs.FSWatcher[];
  readonly paths: string[];
  open(): Promise<WatcherHandle>;
}) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-watcher-')));
  const handles: WatcherHandle[] = [];
  const native: fs.FSWatcher[] = [];
  const paths: string[] = [];
  const batches: (readonly WatchEvent[])[] = [];
  const originalWatch = fs.watch;
  const spy = vi.spyOn(fs, 'watch').mockImplementation((...args: Parameters<typeof fs.watch>) => {
    paths.push(String(args[0]));
    const handle = originalWatch(...args);
    native.push(handle);
    return handle;
  });
  try {
    await mkdir(join(root, 'src', 'nested'), { recursive: true });
    await writeFile(join(root, 'src', 'nested', 'value.ts'), 'before');
    await run(root, { batches, native, paths, async open() {
      const handle = await createFilesystemWatcher().watch(root, events => batches.push(events));
      handles.push(handle);
      return handle;
    } });
  } finally {
    await Promise.all(handles.map(handle => handle.close()));
    try {
      for (const handle of native) expect(handle.eventNames()).toEqual([]);
      if (vi.isFakeTimers()) expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  }
}

describe('filesystem watcher', () => {
  it('observes real nested edits as immutable root-relative batches', async () => {
    await fixture(async (root, state) => {
      await state.open();
      await writeFile(join(root, 'src', 'nested', 'value.ts'), 'after');
      await until(() => state.batches.flat().some(event => event.path === join('src', 'nested', 'value.ts')));
      for (const batch of state.batches) {
        expect(Object.isFrozen(batch)).toBe(true);
        for (const event of batch) { expect(Object.isFrozen(event)).toBe(true); expect(event.path.startsWith(root)).toBe(false); }
      }
    });
  });

  it('never attaches to excluded trees at any depth or follows directory symlinks', async () => {
    await fixture(async (root, state) => {
      for (const parent of [root, join(root, 'src')]) {
        for (const name of ['node_modules', '.git', 'dist', '.reference-work']) {
          await mkdir(join(parent, name, 'child'), { recursive: true });
          await writeFile(join(parent, name, 'child', 'ignored.ts'), 'before');
        }
      }
      await symlink(join(root, 'src', 'nested'), join(root, 'linked'), 'dir');
      await state.open();
      expect(state.paths.map(path => relative(root, path)).sort()).toEqual(['', 'src', join('src', 'nested')]);
      for (const parent of [root, join(root, 'src')]) {
        for (const name of ['node_modules', '.git', 'dist', '.reference-work']) {
          await writeFile(join(parent, name, 'child', 'ignored.ts'), 'after');
        }
      }
      await writeFile(join(root, 'src', 'nested', 'value.ts'), 'positive control');
      await until(() => state.batches.flat().some(event => event.path.endsWith('value.ts')));
      expect(state.batches.flat().some(event => event.path.split(sep).some(part => ['node_modules', '.git', 'dist', '.reference-work', 'linked'].includes(part)))).toBe(false);
    });
  });

  it('attaches new directories and observes their later edits', async () => {
    await fixture(async (root, state) => {
      await state.open();
      const created = join(root, 'created');
      await mkdir(created);
      await until(() => state.paths.includes(created));
      await writeFile(join(created, 'new.ts'), 'new');
      await until(() => state.batches.flat().some(event => event.path === join('created', 'new.ts')));
      expect(state.batches.flat()).toContainEqual({ path: 'created', kind: 'renamed' });
    });
  });

  it('reattaches after a directory is replaced at the same path', async () => {
    await fixture(async (root, state) => {
      await state.open();
      const nested = join(root, 'src', 'nested');
      const old = state.native[state.paths.indexOf(nested)];
      await rename(nested, join(root, 'old'));
      await mkdir(nested);
      await until(() => state.paths.filter(path => path === nested).length === 2);
      expect(old.eventNames()).toEqual([]);
      await writeFile(join(nested, 'replacement.ts'), 'replacement');
      await until(() => state.batches.flat().some(event => event.path === join('src', 'nested', 'replacement.ts')));
    });
  });

  it('deduplicates a burst without delaying delivery indefinitely', async () => {
    await fixture(async (_root, state) => {
      await state.open(); vi.useFakeTimers();
      for (let index = 0; index < 100; index++) {
        state.native[0].emit('change', 'change', `file-${index}.ts`);
        state.native[0].emit('change', 'change', `file-${index}.ts`);
      }
      vi.advanceTimersByTime(99);
      expect(state.batches).toHaveLength(0);
      state.native[0].emit('change', 'change', 'file-0.ts');
      vi.advanceTimersByTime(1);
      expect(state.batches).toHaveLength(1);
      expect(state.batches[0]).toHaveLength(100);
      expect(new Set(state.batches[0].map(event => event.path)).size).toBe(100);
    });
  });

  it('collapses more than 10,000 paths to a conservative overflow signal', async () => {
    await fixture(async (_root, state) => {
      await state.open(); vi.useFakeTimers();
      for (let index = 0; index < 10_002; index++) state.native[0].emit('change', 'change', `file-${index}.ts`);
      vi.advanceTimersByTime(100);
      expect(state.batches).toEqual([[{ path: '', kind: 'overflow' }]]);
      state.native[0].emit('change', 'change', 'next.ts');
      vi.advanceTimersByTime(100);
      expect(state.batches[1]).toEqual([{ path: 'next.ts', kind: 'changed' }]);
    });
  });

  it.each([null, '../escape.ts', '/absolute.ts', ''])('maps unknown or invalid native name %s to overflow', async name => {
    await fixture(async (_root, state) => {
      await state.open(); vi.useFakeTimers();
      state.native[0].emit('change', 'change', name);
      vi.advanceTimersByTime(100);
      expect(state.batches).toEqual([[{ path: '', kind: 'overflow' }]]);
    });
  });

  it('preserves error and overflow signals and closes all native listeners', async () => {
    await fixture(async (_root, state) => {
      const handle = await state.open(); vi.useFakeTimers();
      state.native[0].emit('error', Object.assign(new Error('resource exhausted'), { code: 'ENOSPC' }));
      vi.advanceTimersByTime(100);
      expect(state.batches).toEqual([[{ path: '', kind: 'error' }, { path: '', kind: 'overflow' }]]);
      state.native[1].emit('error', Object.assign(new Error('watch failure'), { code: 'EIO' }));
      vi.advanceTimersByTime(100);
      expect(state.batches[1]).toEqual([{ path: '', kind: 'error' }]);
      const first = handle.close();
      expect(handle.close()).toBe(first);
      await first;
    });
  });

  it('drops queued delivery and creates no callbacks after close', async () => {
    await fixture(async (root, state) => {
      const handle = await state.open();
      state.native[0].emit('change', 'change', 'pending.ts');
      await handle.close();
      await writeFile(join(root, 'src', 'nested', 'value.ts'), 'after close');
      await delay(150);
      expect(state.batches).toEqual([]);
      expect(state.native.every(watcher => watcher.eventNames().length === 0)).toBe(true);
    });
  });

  it('rejects a missing or non-directory root without keeping resources', async () => {
    await fixture(async (root, state) => {
      await expect(createFilesystemWatcher().watch(join(root, 'absent'), () => {})).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(createFilesystemWatcher().watch(join(root, 'src', 'nested', 'value.ts'), () => {})).rejects.toThrow('not a directory');
      expect(state.native).toHaveLength(0);
    });
  });

  it('closes previously attached handles when a later attachment fails', async () => {
    await fixture(async (_root, state) => {
      const prior = vi.mocked(fs.watch).getMockImplementation()!;
      vi.mocked(fs.watch).mockImplementation((...args: Parameters<typeof fs.watch>) => {
        if (state.native.length === 1) throw Object.assign(new Error('no watcher capacity'), { code: 'ENOSPC' });
        return prior(...args);
      });
      await expect(state.open()).rejects.toMatchObject({ code: 'ENOSPC' });
      expect(state.native).toHaveLength(1);
      expect(state.native[0].eventNames()).toEqual([]);
    });
  });
});
