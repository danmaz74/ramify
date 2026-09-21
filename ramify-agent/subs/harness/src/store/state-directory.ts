import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileExclusive } from '../../subs/ledger/src/atomic.js';

/**
 * The marker in each directory the harness writes: `plans/.harness/`, and
 * each plan's `.harness/` and `map/`. Ramify's project
 * walk observes every directory listing in the project, so a file the
 * harness creates would change the input identity a job or an approval is
 * compared by. A directory that holds a `tsconfig.json` selecting no files
 * is an independent compiler scope, which the walk does not enter: the
 * harness's own records stay out of Ramify's inputs.
 */
export const stateMarker = `// ramify-agent keeps its records in this directory. This file makes it an
// independent TypeScript scope that selects no files, so that Ramify's project
// walk does not enter it and the records never change Ramify's input identity.
{ "files": [] }
`;

/**
 * What a state directory git ignores: everything in it, the marker and this
 * file included. A run's gate commits the working directory with
 * `git add -A`, so without this the run's own log, its records and the
 * project lock would be committed with the work they describe.
 */
export const stateGitignore = `# ramify-agent keeps its records in this directory. A run commits the working
# directory with \`git add -A\` after a gate passes, so everything here is
# ignored: the run's own log never changes the tree a gate compares.
*
`;

/** What a state directory holds besides the records themselves. */
export interface StateDirectoryOptions {
  /**
   * Whether the directory carries a `.gitignore` ignoring everything in it.
   * A directory of the harness's own records does; a plan's `map/`, which
   * holds project content, does not.
   */
  readonly gitignore?: boolean | undefined;
}

/**
 * Creates a state directory with its marker, and with its `.gitignore` where
 * the caller asks for one, leaving existing files unchanged.
 */
export async function ensureStateDirectory(directory: string, options: StateDirectoryOptions = {}): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFileExclusive(join(directory, 'tsconfig.json'), stateMarker);
  if (options.gitignore === true) await writeFileExclusive(join(directory, '.gitignore'), stateGitignore);
}
