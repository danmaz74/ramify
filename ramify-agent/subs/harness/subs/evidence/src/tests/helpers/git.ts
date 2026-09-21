import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { temporaryDirectory } from './temporary.js';

const exec = promisify(execFile);

/** A repository built for one test, with no person's git configuration in reach. */
export interface TestRepository {
  readonly root: string;
  /** Runs git in the repository under a fixed identity, and answers what it printed. */
  git(...args: string[]): Promise<string>;
  write(path: string, content: string): Promise<void>;
  remove(): Promise<void>;
}

const setupIdentity = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost'];

/**
 * A repository with one commit on `main`. `GIT_CONFIG_GLOBAL` and
 * `GIT_CONFIG_SYSTEM` are neutralized for every git the test runs, including
 * the ones the evidence module runs, so a commit that needs an identity gets
 * none unless the caller supplies it.
 */
export async function testRepository(): Promise<TestRepository> {
  const directory = await temporaryDirectory();
  const root = join(directory.path, 'project');
  await mkdir(root, { recursive: true });

  const repository: TestRepository = {
    root,
    async git(...args: string[]): Promise<string> {
      const { stdout } = await exec('git', args, { cwd: root });
      return stdout;
    },
    async write(path: string, content: string): Promise<void> {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    },
    remove: directory.remove,
  };

  await repository.git('init', '--initial-branch=main');
  await repository.write('README.md', 'fixture\n');
  await repository.git('add', '--all');
  await repository.git(...setupIdentity, 'commit', '--message', 'first');
  return repository;
}

/** Neutralize the person's git configuration for the duration of a test. */
export function withoutGitConfiguration(): () => void {
  const inherited = { global: process.env['GIT_CONFIG_GLOBAL'], system: process.env['GIT_CONFIG_SYSTEM'] };
  process.env['GIT_CONFIG_GLOBAL'] = '/dev/null';
  process.env['GIT_CONFIG_SYSTEM'] = '/dev/null';
  return () => {
    restore('GIT_CONFIG_GLOBAL', inherited.global);
    restore('GIT_CONFIG_SYSTEM', inherited.system);
  };
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
