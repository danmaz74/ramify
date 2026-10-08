import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Git reads needed by provisional capture; defaults preserve the actual index boundary. */
export interface ProvisionalSourceGit {
  stagedPaths(root: string): Promise<readonly string[]>;
  readBlob(root: string, revision: string, path: string): Promise<Buffer | null>;
}

export const productionSourceGit: ProvisionalSourceGit = {
  async stagedPaths(root) {
    const staged = await exec('git', ['diff', '--cached', '--name-only', '-z'], { cwd: root });
    return staged.stdout.split('\0').filter(Boolean);
  },
  readBlob: gitBlob,
};

async function gitBlob(root: string, revision: string, path: string): Promise<Buffer | null> {
  try {
    const result = await exec('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
    return Buffer.from(result.stdout);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 128) return null;
    throw error;
  }
}
