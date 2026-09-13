import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { machine, type } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Host executable name; the installed launcher derives the same name from `uname -sm`. */
export const compiledClientName = `ramify-client-${type()}-${machine()}`;

// The compiled client carries the lightweight client only: no engine, compiler,
// daemon host, UI or external package. Mirrors the Node entry's process boundaries.
const excluded = [
  /^dist\/(?:subs\/analysis\/|src\/batch\.js$|src\/batch-entry\.js$)/,
  /^dist\/subs\/(?:presentation|mcp|web)\//,
  /^dist\/(?:src\/(?:daemon-entry|resident-assembly)\.js$|subs\/daemon\/(?:subs\/contexts\/|src\/(?:service|host|start-daemon|filesystem-watcher|system-clock)\.js$))/,
  /node_modules\//,
];

async function bun(cwd: string, args: readonly string[]): Promise<void> {
  const executable = fileURLToPath(new URL('./bin/bun.exe', import.meta.resolve('bun/package.json')));
  const code = await new Promise<number | null>((accept, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
    child.once('error', reject);
    child.once('close', accept);
  });
  if (code !== 0) throw new Error(`Bun failed with exit ${code}: bun ${args.join(' ')}`);
}

/** Compile `src/compiled-entry.js` of a promoted build tree into `src/<compiledClientName>`.
 * `promoted` holds what becomes dist; `scratch` receives the bundle metafile. The executable
 * embeds `buildIdentity` and refuses an installed build with a different runtime identity. */
export async function compileClient(promoted: string, scratch: string, buildIdentity: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(buildIdentity)) throw new Error('Compiled client needs a SHA-256 build identity');
  const metafile = join(scratch, 'compiled-client.meta.json');
  const output = join('src', compiledClientName);
  // Bytecode needs ESM output. The client reads no .env, bunfig, tsconfig or package.json of the project it checks.
  await bun(promoted, ['build', 'src/compiled-entry.js', '--compile', '--bytecode', '--format=esm', '--target=bun',
    '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig', '--no-compile-autoload-tsconfig', '--no-compile-autoload-package-json',
    `--define=RAMIFY_BUILD_IDENTITY=${JSON.stringify(buildIdentity)}`, `--metafile=${metafile}`, '--outfile', output]);
  const inputs = Object.keys((JSON.parse(await readFile(metafile, 'utf8')) as { inputs: Record<string, unknown> }).inputs)
    .map(path => `dist/${path.replace(/^\.\//, '')}`);
  const violations = inputs.filter(path => excluded.some(pattern => pattern.test(path)));
  if (violations.length) throw new Error(`Compiled client bundles excluded modules: ${violations.join(', ')}`);
  if (!inputs.includes('dist/subs/cli/src/run-cli.js')) throw new Error('Compiled client does not bundle the CLI handler');
  if (!(await readFile(join(promoted, output))).includes(buildIdentity)) throw new Error('Compiled client does not embed the build identity');
  return output;
}
