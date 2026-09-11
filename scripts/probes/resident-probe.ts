import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export async function archive(probe: string, evidence: unknown): Promise<void> {
  const compiler = JSON.parse(await readFile(resolve(packageRoot, 'node_modules/typescript/package.json'), 'utf8'));
  assert.equal(compiler.version, '7.0.2');
  const result = { probe, recordedAt: new Date().toISOString(), nodeVersion: process.version,
    platform: process.platform, architecture: process.arch, typescript: compiler.version,
    baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: packageRoot, encoding: 'utf8' }).trim(),
    scriptSha256: sha256(await readFile(resolve(packageRoot, `scripts/probes/${probe}.ts`))),
    evidence };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  await mkdir(resolve(packageRoot, 'scripts/probes/results'), { recursive: true });
  await writeFile(resolve(packageRoot, `scripts/probes/results/${probe}.json`), json);
  console.log(json.trimEnd());
}

export async function until(predicate: () => boolean | Promise<boolean>, label: string, timeoutMs = 5000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!await predicate()) {
    assert.ok(performance.now() < deadline, `Timed out: ${label}`);
    await delay(10);
  }
}

export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error; // Permission denied is not evidence of a dead process.
  }
}
