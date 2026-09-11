import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
const [directory, index] = process.argv.slice(2);
const lock = join(directory, 'start.lock');
let collisions = 0;
for (let iteration = 0; iteration < 20; iteration++) {
  let handle;
  while (!handle) {
    try { handle = await open(lock, 'wx', 0o600); }
    catch (error) { if (error.code !== 'EEXIST') throw error; collisions++; await delay(2); }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
    // An independent exclusive marker makes overlapping critical sections fail.
    const active = await open(join(directory, 'active'), 'wx'); await active.close();
    try {
      const previous = JSON.parse(await readFile(join(directory, 'record.json'), 'utf8'));
      const sequence = previous.sequence + 1;
      const temporary = join(directory, `record-${index}.tmp`);
      await writeFile(temporary, JSON.stringify({ sequence, payload: String(sequence).padStart(6, '0').repeat(10000) }));
      await rename(temporary, join(directory, 'record.json'));
      await delay(2);
    } finally { await unlink(join(directory, 'active')); }
  } finally { await handle.close(); await unlink(lock); }
}
console.log(JSON.stringify({ index: Number(index), pid: process.pid, writes: 20, collisions }));
