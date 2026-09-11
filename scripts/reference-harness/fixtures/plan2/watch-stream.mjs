#!/usr/bin/env node
// Reader control only: emits protocol bytes, never a daemon or analysis result.
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';

if (process.env.RAMIFY_WATCH_CONTROL_PID) writeFileSync(process.env.RAMIFY_WATCH_CONTROL_PID, String(process.pid));
process.on('SIGINT', () => process.exit(130));
async function put(text) { if (!process.stdout.write(text)) await once(process.stdout, 'drain'); }
const status = index => JSON.stringify({ schemaVersion: 'ramify.watch/1', event: 'status', index });
const mode = process.env.RAMIFY_WATCH_CONTROL;
if (mode === 'fragmented') {
  const line = status(1);
  await put(line.slice(0, 10));
  await new Promise(resolve => setTimeout(resolve, 30));
  await put(line.slice(10) + '\n');
} else if (mode === 'coalesced') {
  await put(status(1) + '\n' + status(2) + '\n');
} else if (mode === 'exact-boundary' || mode === 'oversized') {
  const limit = 32 * 1024 ** 2 + 65536;
  const prefix = '{"schemaVersion":"ramify.watch/1","event":"status","index":1,"padding":"';
  const suffix = '"}';
  await put(prefix);
  for (let left = limit - Buffer.byteLength(prefix + suffix); left > 0;) {
    const count = Math.min(left, 65536);
    await put('x'.repeat(count)); left -= count;
  }
  // Finish one line and start another in the same write. The first line's
  // exact bound must not include its delimiter or the following line's bytes.
  await put((mode === 'oversized' ? 'x' : '') + suffix + '\n' + status(2) + '\n');
} else if (mode === 'malformed') {
  await put('{invalid-json}\n');
} else if (mode === 'partial-exit') {
  await put(status(1));
  process.exit(0);
} else if (mode === 'silent') {
  // Establish startup before exercising the deadline for a subsequent line.
  await put(status(1) + '\n');
} else {
  throw new Error('Unknown watch reader control');
}
setInterval(() => {}, 1000);
