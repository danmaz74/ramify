import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/*
 * The target project's own configuration for the harness, `ramify-agent.json`
 * beside `package.json`. This module reads its bytes and says whether it is
 * there; what the file must say, and what an invalid one means for a run,
 * belong to the caller.
 */

/** The configuration's path, relative to the project root. */
export const projectConfigurationFile: string = 'ramify-agent.json';

/** What reading the configuration found: its text and hash, or why there is none. */
export type ProjectConfigurationRead =
  | { readonly status: 'present'; readonly path: string; readonly text: string; readonly hash: string }
  | { readonly status: 'missing'; readonly path: string }
  | { readonly status: 'unreadable'; readonly path: string; readonly message: string };

/** Reads `ramify-agent.json` at the project root. A missing or unreadable file is an answer, never a throw. */
export async function readProjectConfiguration(projectRoot: string): Promise<ProjectConfigurationRead> {
  const path = projectConfigurationFile;
  let bytes: Buffer;
  try {
    bytes = await readFile(join(projectRoot, path));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { status: 'missing', path };
    return { status: 'unreadable', path, message: error instanceof Error ? error.message : String(error) };
  }
  return {
    status: 'present',
    path,
    text: bytes.toString('utf8'),
    hash: createHash('sha256').update(bytes).digest('hex'),
  };
}
