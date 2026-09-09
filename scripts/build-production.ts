import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireProductionSelection } from './production-selection.js';
import { compilerSource, promoteProductionArtifacts } from './production-artifacts.js';

async function emit(root: string, config: string): Promise<void> {
  const compiler = fileURLToPath(new URL('./bin/tsc', import.meta.resolve('typescript/package.json')));
  const code = await new Promise<number | null>((accept, reject) => {
    const child = spawn(process.execPath, [compiler, '--project', config], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', accept);
  });
  if (code !== 0) throw new Error(`Production compiler failed with exit ${code}`);
}

/** Source-entry bootstrap: no operation reads an existing dist file. */
export async function buildProduction(root: string): Promise<void> {
  root = resolve(root);
  const { document, snapshot } = await acquireProductionSelection(root);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as Record<string, unknown>;
  const scratch = join(root, '.reference-work');
  await mkdir(scratch, { recursive: true });
  const workspace = await mkdtemp(join(scratch, 'production-'));
  const staging = join(workspace, 'staging'), promoted = join(workspace, 'promoted');
  const dist = join(root, 'dist'), previous = join(workspace, 'previous-dist');
  try {
    await mkdir(staging); await mkdir(promoted);
    const config = join(workspace, 'tsconfig.json');
    const sourceFiles = document.files.filter(file => compilerSource.test(file));
    await writeFile(config, `${JSON.stringify({ extends: join(root, 'tsconfig.build.json'),
      compilerOptions: { rootDir: root, outDir: staging, incremental: false },
      files: sourceFiles.map(file => join(root, file)), include: [], exclude: [] }, null, 2)}\n`);
    if (sourceFiles.length) await emit(root, config);
    await promoteProductionArtifacts(root, staging, promoted, document.files, manifest);
    // Do not publish artifacts after selected source changed under the build.
    const hashes = new Map(snapshot.inventory.files.map(file => [file.path, file.sha256]));
    for (const file of document.files) {
      if (createHash('sha256').update(await readFile(join(root, file))).digest('hex') !== hashes.get(file)) {
        throw new Error(`Production source changed during build: ${file}`);
      }
    }
    let replaced = false;
    try { await rename(dist, previous); replaced = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await rename(promoted, dist); }
    catch (error) { if (replaced) await rename(previous, dist); throw error; }
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildProduction(process.cwd()); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
