import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GitAnswer, GitPort } from '../subs/cli/src/interfaces/cli.js';

/** The advisory command: ignored untracked entries beneath the working directory,
 * a wholly ignored directory collapsed to its name with a trailing slash, NUL-terminated. */
export const gitAdviceArguments: readonly string[] = ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'];
const timeoutMs = 5_000;
const maxBytes = 16 * 1024 * 1024;

/** True when `.git`, a repository directory or a worktree's link file, exists at or above
 * `root`. Only that name is examined; no ignore file or other content is read. */
async function insideRepository(root: string): Promise<boolean> {
  for (let directory = root; ; directory = dirname(directory)) {
    try { await lstat(join(directory, '.git')); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') return false; }
    if (dirname(directory) === directory) return false;
  }
}

/**
 * The production Git port of the CLI. Outside a repository it starts nothing. Inside one it
 * runs `git` from `PATH` once, in the selected root, bounded in time and output; a missing
 * executable, a failed or interrupted command and an oversized answer each give no advice.
 */
export function createGitPort(executable = 'git'): GitPort {
  return async (root, control) => {
    if (!await insideRepository(root)) return { status: 'not-repository' };
    return new Promise<GitAnswer>(accept => {
      execFile(executable, gitAdviceArguments, { cwd: root, encoding: 'buffer', maxBuffer: maxBytes, timeout: timeoutMs,
        windowsHide: true, ...(control?.signal ? { signal: control.signal } : {}) }, (error, stdout, stderr) => {
        if (!error) { accept({ status: 'listed', output: stdout }); return; }
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') accept({ status: 'unavailable' });
        else if (/not a git repository/i.test(Buffer.from(stderr).toString('utf8'))) accept({ status: 'not-repository' });
        else accept({ status: 'failed', message: error.message.split('\n')[0] ?? 'git failed' });
      });
    });
  };
}
