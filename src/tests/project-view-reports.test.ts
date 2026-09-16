import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContextRevision } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import { createProjectExplorerModel } from '../../subs/service-api/src/project-view.js';
import { runBatch } from '../batch.js';

const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;

function revision(inputId: string): ContextRevision {
  return { revision: 'rev/1:00000000-0000-0000-0000-000000000001:1', fingerprints: { inputId } } as ContextRevision;
}

describe('project explorer projection over real reports', () => {
  it.each([['reference', 'examples/collection-review'], ['toolkit', '.']] as const)('%s report retains every owner and owned file exactly once', async (_name, path) => {
    const root = resolve(path);
    const run = await runBatch({ cwd: root, root, capabilities });
    expect(run.status).toBe('reported');
    if (run.status !== 'reported' || !run.report.inputId) throw new Error('Expected a completed real report');
    const projected = createProjectExplorerModel({ revision: revision(run.report.inputId), report: run.report });
    expect(projected.status).toBe('ready');
    if (projected.status !== 'ready') throw new Error(projected.reason);
    const typed = projected.view;
    expect(typed.modules).toHaveLength(run.report.snapshot!.inventory.modules.length);
    expect(typed.summary.ownedFiles).toBe(run.report.snapshot!.inventory.files.length);
    expect(typed.modules.flatMap(module => module.files).map(file => file.path).sort())
      .toEqual(run.report.snapshot!.inventory.files.map(file => file.path).sort());
    expect(new Set(typed.modules.flatMap(module => module.files).map(file => file.path)).size).toBe(typed.summary.ownedFiles);
  }, 120_000);
});
