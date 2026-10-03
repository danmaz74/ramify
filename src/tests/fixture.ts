import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BatchOperation } from '../interfaces/batch.js';
import { runBatch } from '../batch.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import type { RunControl } from '../../subs/analysis/src/interfaces/analysis.js';

export async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
export async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-cli-')));
  try {
    for (const [path, text] of Object.entries({
      'module.ramify': 'ramify 1\nroot module fixture\nexpose-src value from "interfaces/api.ts" to descendants\n',
      'README.md': '# Fixture\n\nA CLI fixture.\n',
      'package.json': '{"type":"module"}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler',
        types: [], skipLibCheck: true }, include: ['src', 'subs', 'tests'] }),
      'src/interfaces/api.ts': 'export const value: number = 1; export const privateValue = 2;\n',
      'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
      'subs/consumer/src/use.ts': "import { value } from '../../../src/interfaces/api.js'; void value;\n",
    })) await put(root, path, text);
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
export async function invoke(root: string, argv: readonly string[], batch: BatchOperation = runBatch, control?: RunControl) {
  const stdout: string[] = [], stderr: string[] = [];
  const exitCode = await runCli(argv, { cwd: root, version: '1.2.3', connect: async () => { throw new Error('Unexpected daemon connection'); }, stdout: text => { stdout.push(text); },
    stderr: text => { stderr.push(text); }, batch }, control);
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join(''), writes: stdout.length };
}

/** The affected-module reference project: `example/app -> example/mid -> example/core`, where an arrow
 * means "depends on", an unrelated `example/lone`, and an unowned `docs/notes.md`. */
export const affectedFiles: Readonly<Record<string, string>> = {
  'module.ramify': 'ramify 1\nroot module example\nexpose-sub * from core to descendants\nexpose-sub * from mid to descendants\n',
  'README.md': '# Example\n\nThe affected-module reference project.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true },
    include: ['src', 'subs'] }),
  'docs/notes.md': '# Notes\n',
  'subs/core/module.ramify': 'ramify 1\nmodule core\nexpose-src * from "interfaces/api.ts" to parent\n',
  'subs/core/src/interfaces/api.ts': 'export const coreValue: number = 1;\n',
  'subs/mid/module.ramify': 'ramify 1\nmodule mid\nexpose-src * from "interfaces/api.ts" to parent\n',
  'subs/mid/src/interfaces/api.ts': "import { coreValue } from '../../../core/src/interfaces/api.js';\nexport const midValue: number = coreValue + 1;\n",
  'subs/app/module.ramify': 'ramify 1\nmodule app\n',
  'subs/app/src/main.ts': "import { midValue } from '../../mid/src/interfaces/api.js';\nvoid midValue;\n",
  'subs/lone/module.ramify': 'ramify 1\nmodule lone\n',
  'subs/lone/src/alone.ts': 'export const alone: number = 1;\n',
};
export async function affectedFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-affected-')));
  try {
    for (const [path, text] of Object.entries(affectedFiles)) await put(root, path, text);
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
