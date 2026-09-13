// SPIKE(bun-cli-startup): Bun client entry, bundled to dist/bun/ramify.js or compiled to dist/bin/ramify.
// Both outputs sit one level below dist, so the package root is two levels above them.
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const compiled = import.meta.url.includes('/$bunfs/');
const root = resolve(compiled ? dirname(process.execPath) : dirname(fileURLToPath(import.meta.url)), '../..');
process.env.RAMIFY_DAEMON_ENTRY ??= join(root, 'dist/src/daemon-entry.js');

if (process.argv.includes('--batch')) {
  // Batch analysis stays in Node; forward streams, signals and exit code unchanged.
  const child = spawn(process.env.RAMIFY_NODE ?? 'node', [join(root, 'dist/src/cli-entry.js'), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.on('SIGINT', () => {});
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 2); });
} else {
  await import('../../../dist/src/cli-entry.js');
}
