import { strictEqual } from 'node:assert';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRetainedSourceAnalysis, retainedCompilerEvidence } from '../retained-source-analysis.js';
import type { RetainedSourceAnalysis } from '../interfaces/source.js';
import type { ProjectInputView } from '../../../project/src/interfaces/project.js';
import { acquire, areasFor, drop, fixture, sourceLimits } from './fixtures.js';

/** Unlike deleting a file created after opening, deleting an original root
 * exercises the configured fileNames retained at compiler startup. */
export async function retainedMembershipWitness(): Promise<void> {
  const root = await fixture({ 'src/keep.ts': 'export const keep = 1;\n', 'src/remove.ts': 'export const remove = 2;\n' });
  let adapter: RetainedSourceAnalysis | undefined;
  const views: ProjectInputView[] = [];
  try {
    const initial = await acquire(root);
    views.push(initial);
    adapter = await createRetainedSourceAnalysis({ root, configuration: join(root, 'tsconfig.json'), inventory: initial.inventory,
      areas: areasFor(initial), limits: sourceLimits, sink: { file() {}, directory() {}, absent() {}, probe() {} } });
    await adapter.describe([]);
    const before = retainedCompilerEvidence(adapter);
    strictEqual(before.programHas('src/remove.ts'), true);
    await drop(root, 'src/remove.ts');
    const current = await acquire(root);
    views.push(current);
    await adapter.update({ changed: [], created: [], deleted: ['src/remove.ts'], inventory: current.inventory, invalidateAll: false });
    const after = retainedCompilerEvidence(adapter);
    strictEqual(after.syntheticConfiguration!.includes(join(root, 'src/remove.ts')), false, 'deleted original root leaves the synthetic configuration');
    strictEqual(after.programHas('src/remove.ts'), false);
    strictEqual(after.programHas('src/keep.ts'), true);
    strictEqual(after.serverPid, before.serverPid, 'membership update keeps the warm compiler server');
    strictEqual(after.liveSnapshots, 1);
  } finally {
    await adapter?.dispose();
    for (const view of views) await view.dispose();
    await rm(root, { recursive: true, force: true });
  }
}
