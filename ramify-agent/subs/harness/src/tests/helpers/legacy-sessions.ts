import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionsDirectory } from '../../projections/standalone-records.js';

/*
 * Two sessions as the `session` command recorded them before it ran on the
 * invocation runner, under `plans/.harness/sessions/`: one finished, and one
 * whose outcome a test removes as though its harness died before writing it.
 * Nothing writes this layout any more; existing directories are left in
 * place and still read, so a test installs them as recorded.
 */

const recorded = fileURLToPath(new URL('./legacy-sessions/', import.meta.url));

/** The recorded sessions' identifiers. */
export const legacySessions = { finished: '20261010T084131Z-f82842', crashed: '20261010T084131Z-725903' } as const;

/** Installs the recorded sessions in a project, as an earlier `session` command left them. */
export async function installLegacySessions(projectRoot: string): Promise<typeof legacySessions> {
  for (const id of Object.values(legacySessions)) {
    await cp(join(recorded, id), join(projectRoot, sessionsDirectory, id), { recursive: true });
  }
  return legacySessions;
}
