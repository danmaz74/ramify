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
      'module.ramify': 'ramify 1\nmodule fixture\nexpose-src value from "interfaces/api.ts" to descendants\n',
      'README.md': '# Fixture\n\nA CLI fixture.\n',
      'package.json': '{"type":"module"}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler',
        types: [], skipLibCheck: true }, include: ['src', 'subs', 'tests'] }),
      'src/interfaces/api.ts': 'export const value = 1; export const privateValue = 2;\n',
      'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
      'subs/consumer/src/use.ts': "import { value } from '../../../src/interfaces/api.js'; void value;\n",
    })) await put(root, path, text);
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
export async function invoke(root: string, argv: readonly string[], batch: BatchOperation = runBatch, control?: RunControl) {
  const stdout: string[] = [], stderr: string[] = [];
  const exitCode = await runCli(argv, { cwd: root, version: '1.2.3', stdout: text => { stdout.push(text); },
    stderr: text => { stderr.push(text); }, batch }, control);
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join(''), writes: stdout.length };
}
