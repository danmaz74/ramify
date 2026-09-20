import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileExclusive } from './atomic.js';

/**
 * The marker in each directory the harness writes: `plans/.harness/`, and
 * each plan's `.harness/` and `map/`. Ramify's project
 * walk observes every directory listing in the project, so a file the
 * harness creates would change the input identity a job's evidence is
 * compared by. A directory that holds a `tsconfig.json` selecting no files
 * is an independent compiler scope, which the walk does not enter: the
 * harness's own records stay out of Ramify's inputs.
 */
export const stateMarker = `// ramify-agent keeps its records in this directory. This file makes it an
// independent TypeScript scope that selects no files, so that Ramify's project
// walk does not enter it and the records never change Ramify's input identity.
{ "files": [] }
`;

/** Creates a state directory with its marker, leaving an existing one unchanged. */
export async function ensureStateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFileExclusive(join(directory, 'tsconfig.json'), stateMarker);
}
