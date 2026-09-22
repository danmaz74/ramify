import type { ModuleTree } from '../interfaces/protocol/evidence.js';
import { loadModuleTree } from '../../subs/evidence/src/views.js';

/*
 * The project's current module tree, as the architect view was last
 * materialized: the one read both the module-tree query and the
 * module-capability comparison make, so both report the same `unavailable`
 * result for the same failure. It reads the view and writes nothing.
 */

/** The current module tree with the view's revision and input identity, or why there is none. */
export async function currentModuleTree(projectRoot: string): Promise<ModuleTree> {
  try {
    const { revision, input, modules } = await loadModuleTree(projectRoot);
    return {
      status: 'available',
      revision,
      input,
      // The protocol's module carries its name, directory and parent only.
      modules: modules.map(entry => ({ module: entry.module, dir: entry.dir, parent: entry.parent })),
    };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      status: 'unavailable',
      message: missing
        ? 'The architect view has not been materialized yet; a run materializes it before its initial analysis.'
        : `The architect view cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
