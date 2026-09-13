import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { machine, tmpdir, type } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { repositoryRoot } from './process.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

/** A package tree with the real launcher, a stand-in client and a stand-in Node entry. */
async function tree(options: { client: boolean }) {
  const root = await mkdtemp(join(tmpdir(), 'ramify-launcher-')); roots.push(root);
  const src = join(root, 'pkg/dist/src'), bin = join(root, 'node_modules/.bin');
  await mkdir(src, { recursive: true }); await mkdir(bin, { recursive: true });
  await copyFile(join(repositoryRoot, 'src/ramify'), join(src, 'ramify')); await chmod(join(src, 'ramify'), 0o755);
  await writeFile(join(src, 'cli-entry.js'), 'console.log(JSON.stringify(["node", ...process.argv.slice(2)]));\n');
  if (options.client) {
    await writeFile(join(src, `ramify-client-${type()}-${machine()}`), '#!/bin/sh\nprintf "[\\"client\\""; for a in "$@"; do printf ",\\"%s\\"" "$a"; done; echo "]"\n', { mode: 0o755 });
  }
  await symlink('../../pkg/dist/src/ramify', join(bin, 'ramify'));
  return { launcher: join(src, 'ramify'), linked: join(bin, 'ramify') };
}
const call = async (path: string, args: readonly string[]) => JSON.parse((await promisify(execFile)(path, args)).stdout);

describe('installed launcher script', () => {
  it('runs the host client beside the real file, through a relative bin symlink, with arguments intact', async () => {
    const { launcher, linked } = await tree({ client: true });
    expect(await call(linked, ['check', '--changed', 'a b.ts'])).toEqual(['client', 'check', '--changed', 'a b.ts']);
    expect(await call(launcher, ['--version'])).toEqual(['client', '--version']);
  });

  it('falls back to the Node entry when no client exists for this host', async () => {
    const { linked } = await tree({ client: false });
    expect(await call(linked, ['check', '--format', 'json'])).toEqual(['node', 'check', '--format', 'json']);
  });
});
