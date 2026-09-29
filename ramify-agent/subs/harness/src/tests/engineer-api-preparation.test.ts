import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { privateRamify } from '../../subs/evidence/src/ramify-cli.js';
import { loadArchitectIndex } from '../../subs/evidence/src/views.js';
import { apiViewsOf, iterationApiViews } from '../work/session.js';
import { temporaryDirectory } from './helpers/fixture.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture() {
  const directory = await temporaryDirectory();
  cleanups.push(directory.remove);
  const root = directory.path;
  const files: Record<string, string> = {
    'package.json': '{"name":"api-preparation","private":true,"type":"module"}',
    'tsconfig.json': '{"compilerOptions":{"strict":true,"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext"},"include":["src/**/*.ts","subs/**/*.ts"]}',
    'module.ramify': 'ramify 1\nmodule app\nexpose-src readToken from "api.ts" to descendants\n',
    'src/api.ts': 'export function readToken(): string { return "original"; }\n',
  };
  for (const owner of ['cli', 'analysis', 'model']) {
    files[`subs/${owner}/module.ramify`] = `ramify 1\nmodule ${owner}\n`;
    files[`subs/${owner}/src/use.ts`] = 'export const ready = true;\n';
    files[`subs/${owner}/src/tests/use.test.ts`] = 'export const expected = true;\n';
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
  const cli = await privateRamify({ timeoutMs: 30_000 });
  cleanups.push(cli.dispose);
  expect(await cli.ramify.materialize(root, 'subs/cli')).toMatchObject({ ok: true });
  return { root, ramify: cli.ramify, index: await loadArchitectIndex(root) };
}

test('cold Analysis and Model preparation publishes real separate source-area views and refreshes changed APIs on every invocation', async () => {
  const { root, ramify, index } = await fixture();
  await expect(readFile(join(root, 'subs/analysis/src/.ramify/_meta.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(join(root, 'subs/model/src/.ramify/_meta.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  const first = await iterationApiViews(ramify, root, index, ['app/analysis', 'app/model']);
  for (const entry of first) {
    expect(entry.unavailable).toBeNull();
    expect(entry.views.map(view => view.area)).toEqual(['src', 'src/tests']);
    for (const view of entry.views) {
      expect(view.revision).toBeTruthy();
      expect(view.coverage).toBeNull();
      expect(await readFile(join(root, view.path, 'external/src/api.ts.md'), 'utf8')).toContain('## `readToken`');
    }
  }
  await writeFile(join(root, 'src/api.ts'), 'export function readFreshToken(): number { return 42; }\n');
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule app\nexpose-src readFreshToken from "api.ts" to descendants\n');
  const continued = await iterationApiViews(ramify, root, index, ['app/analysis', 'app/model']);
  for (const [i, entry] of continued.entries()) {
    expect(entry.unavailable).toBeNull();
    expect(entry.views[0]!.revision).not.toBe(first[i]!.views[0]!.revision);
    for (const view of entry.views) {
      const text = await readFile(join(root, view.path, 'external/src/api.ts.md'), 'utf8');
      expect(text).toContain('## `readFreshToken`');
      expect(text).not.toContain('## `readToken`');
    }
  }
  const reconstructed = await iterationApiViews(ramify, root, await loadArchitectIndex(root), ['app/analysis']);
  expect(reconstructed[0]).toEqual(continued[0]);
}, 90_000);

test('failed refresh never presents leftover views as current; a missing expected area remains explicit alongside available evidence', async () => {
  const { root, ramify, index } = await fixture();
  const initial = await apiViewsOf(ramify, root, index, 'app/analysis');
  expect(initial.evidence?.views).toHaveLength(2);
  const materialize = vi.spyOn(ramify, 'materialize').mockResolvedValue({ ok: false, message: 'partial: capture superseded' });
  expect(await apiViewsOf(ramify, root, index, 'app/analysis')).toEqual({
    evidence: null, unavailable: 'the API view could not be materialized: partial: capture superseded',
  });
  materialize.mockResolvedValue({ ok: true, output: '' });
  await rm(join(root, 'subs/analysis/src/tests/.ramify'), { recursive: true });
  const missing = await iterationApiViews(ramify, root, index, ['app/analysis']);
  expect(missing[0]!.views.map(view => view.area)).toEqual(['src']);
  expect(missing[0]!.unavailable).toContain('src/tests/.ramify: materialization reported success');
  await rm(join(root, 'subs/analysis/src/tests'), { recursive: true });
  expect((await apiViewsOf(ramify, root, index, 'app/analysis')).unavailable).toBeNull();
}, 60_000);
