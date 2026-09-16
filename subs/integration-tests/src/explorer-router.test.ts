import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from '../../../src/tests/quick-environment.js';
import { createExplorerRouter } from '../../service-api/src/router.js';

const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;

async function put(root: string, path: string, value: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), value);
}

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-explorer-router-')));
  try {
    for (const [path, value] of Object.entries({
      'module.ramify': 'ramify 1\nmodule fixture\nexpose-src value from "interfaces/api.ts" to descendants\n',
      'README.md': '# Fixture\n\nAn explorer fixture.\n',
      'package.json': '{"type":"module"}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
      'src/interfaces/api.ts': 'export const value = 1; export const privateValue = 2;\n',
      'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
      'subs/consumer/README.md': '# Consumer\n\nConsumes the public value.\n',
      'subs/consumer/src/use.ts': "import * as React from 'react'; import { readFile } from 'node:fs/promises'; import { value } from '../../../src/interfaces/api.js'; void React; void readFile; void value;\n",
    })) await put(root, path, value);
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe('project explorer router over the real resident service', () => {
  it('projects a published report, validates identity and refuses old revision details after publication', () => fixture(async root => {
    const environment = await createQuickEnvironment({ maxHistoryRevisions: 1 });
    try {
      const opened = await environment.service.openContext({ project: { cwd: root, root,
        scope: 'whole-project', configuration: 'discover' }, setup: { registry: 'default', capabilities } });
      if (!opened.ok || opened.value.status !== 'opened') throw new Error(JSON.stringify(opened));
      const token = opened.value.token;
      const published = await environment.service.check({ token, requestId: 'await-opening', scope: 'report',
        freshness: { mode: 'published', wait: true } });
      if (!published.ok || published.value.status !== 'reported') throw new Error(JSON.stringify(published));
      const reportAccesses = published.value.report?.snapshot?.accesses ?? [];
      expect(reportAccesses.some(access => access.target.kind === 'external'
        && access.target.resolution === 'package')).toBe(true);
      expect(reportAccesses.some(access => access.target.kind === 'external'
        && access.target.resolution === 'builtin')).toBe(true);
      const caller = createExplorerRouter({ service: environment.service, requestId: () => 'explorer-test' }).createCaller({});
      const first = await caller.projectView({ token });
      expect(first.status).toBe('ready');
      if (first.status !== 'ready') throw new Error(JSON.stringify(first));
      expect(first.view.modules.map(module => module.id)).toEqual(expect.arrayContaining(['fixture', 'fixture/consumer']));
      const moduleIds = new Set(first.view.modules.map(module => module.id));
      expect(first.view.edges.length).toBeGreaterThan(0);
      expect(first.view.edges.every(edge => moduleIds.has(edge.consumer) && moduleIds.has(edge.provider))).toBe(true);
      const wireJson = JSON.stringify(first.view);
      expect(wireJson).not.toContain('otherTargets');
      expect(wireJson).not.toContain('targetIds');
      expect(wireJson).not.toContain('node:fs/promises');
      expect(wireJson).not.toContain('react');
      expect(first.revision.revision).toBe(first.view.revision);
      expect(await caller.projectView({ token, revision: first.revision.revision })).toMatchObject({
        status: 'ready', revision: { revision: first.revision.revision },
      });
      await expect(caller.projectView({ token: { ...token, context: 'bad' } })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(caller.projectView({ token, revision: 'rev/invalid' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      const loadable = first.view.modules.flatMap(module => module.exports)
        .find(item => item.signature.state === 'loadable');
      if (!loadable || loadable.signature.state !== 'loadable') throw new Error('Expected a loadable export');
      const details = await caller.explorerDetails({ token, revision: first.revision.revision,
        requests: [loadable.signature.request] });
      expect(details).toMatchObject({ status: 'ready', revision: { revision: first.revision.revision },
        details: [{ state: 'described' }] });

      await put(root, 'src/interfaces/api.ts', 'export const value = 2; export const privateValue = 2;\n');
      const sha256 = createHash('sha256').update(await readFile(join(root, 'src/interfaces/api.ts'))).digest('hex');
      const next = await environment.service.check({ token, requestId: 'publish-next', scope: 'report',
        freshness: { mode: 'synchronized', expect: [{ path: 'src/interfaces/api.ts', sha256 }] } });
      if (!next.ok || next.value.status !== 'reported' || next.value.revision === null) throw new Error(JSON.stringify(next));
      expect(next.value.revision.revision).not.toBe(first.revision.revision);
      expect(await caller.explorerDetails({ token, revision: first.revision.revision,
        requests: [loadable.signature.request] })).toEqual({
        status: 'superseded', reason: 'The displayed revision is no longer current',
      });
      expect(await caller.projectView({ token, revision: first.revision.revision })).toMatchObject({ status: 'unavailable' });
      expect(await caller.contextStatus({ token })).toMatchObject({ status: 'ready',
        current: { published: { revision: next.value.revision.revision } } });
    } finally { await environment.dispose(); }
  }), 120_000);
});
