import { join } from 'node:path';
import { runIsolatedProject } from '../../mutation.js';
import { createProjectFixture } from '../plan1/project.js';

/** Nine independent F roots for I2-27, in the order callers open/release them.
 * The existing mutation lifetime owns setup, callback and failure cleanup.
 * This creates project inputs only; the lifecycle handler must obtain real
 * leases and observe eviction through the daemon's public service.
 */
export async function withLifecycleProjects<T>(workRoot: string,
  run: (roots: readonly string[]) => Promise<T>): Promise<T> {
  const names = Array.from({ length: 9 }, (_, index) => `fixture-${index + 1}`);
  const result = await runIsolatedProject({
    workRoot, instanceId: 'I2-27:eviction-under-many-contexts',
    fixture: { kind: 'create', create: async root => {
      for (const name of names) await createProjectFixture(join(root, name));
    } },
  }, ({ root }) => run(names.map(name => join(root, name))));
  if (!result.ok) throw result.error;
  return result.value;
}
