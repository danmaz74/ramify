import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { ArchitectIndex, ModuleEntry } from '../../subs/evidence/src/views.js';
import { engineerWorkingDirectory } from '../work/engineer-directory.js';
import type { WriteScope } from '../work/iterations.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-engineer-directory-'));
  roots.push(root);
  return root;
}

function index(modules: readonly [string, string][]): ArchitectIndex {
  return { revision: 'test', input: 'test', symbols: new Map(), modules: new Map(modules.map(([module, dir]) => [module, {
    module, dir, parent: null, children: [], tags: [], areas: ['src'],
  } satisfies ModuleEntry])) };
}

function scope(base: WriteScope['base'], roots: string[], bootstrap: WriteScope['bootstrap'] = []): WriteScope {
  return { base, bootstrap, resolved: { roots }, revision: 1 } as WriteScope;
}

test('root and multi-module assignments start in the first base module src', async () => {
  const root = await project();
  const second = 'subs/second';
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, second, 'src'), { recursive: true });
  const view = index([['app', ''], ['app/second', second]]);
  expect(await engineerWorkingDirectory(root, scope({ module: 'app', includedChildren: [] }, [join(root, 'src')]), view)).toBe(join(root, 'src'));
  expect(await engineerWorkingDirectory(root, scope({ modules: ['app/second', 'app'], rationale: 'joint work' }, [join(root, second), root]), view))
    .toBe(join(root, second, 'src'));
});

test('an authorized bootstrap prepares missing src, while an unexpected missing src fails', async () => {
  const root = await project();
  const dir = 'subs/new';
  await mkdir(join(root, dir), { recursive: true });
  const captured = scope({ module: 'app/new', includedChildren: [] }, [join(root, dir, 'src')], [{ directory: dir, capability: { id: 'c', revision: 1, hash: 'h' } }]);
  expect(await engineerWorkingDirectory(root, captured, null)).toBe(join(root, dir, 'src'));
  expect((await stat(join(root, dir, 'src'))).isDirectory()).toBe(true);
  const absent = 'subs/absent';
  await mkdir(join(root, absent), { recursive: true });
  await expect(engineerWorkingDirectory(root, scope({ module: 'app/absent', includedChildren: [] }, [join(root, absent, 'src')]), index([['app/absent', absent]])))
    .rejects.toThrow('has no src directory');
});
