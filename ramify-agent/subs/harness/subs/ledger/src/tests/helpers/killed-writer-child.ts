import { join } from 'node:path';
import { z } from 'zod';
import { openLedger } from '../../ledger.js';

/**
 * A real writer, for the killed-writer test. It opens the ledger on the
 * directory it is given, reports that it is ready, and then appends
 * transactions in a loop until the parent kills it with `SIGKILL`.
 */
async function main(): Promise<void> {
  const directory = process.argv[2];
  if (directory === undefined) throw new Error('usage: killed-writer-child <directory>');

  const ledger = await openLedger({
    logPath: join(directory, 'events.jsonl'),
    recordsRoot: join(directory, 'records'),
    eventSchema: z.object({ kind: z.string().min(1), step: z.number().int() }),
  });

  process.stdout.write(`ready ${ledger.version}\n`);

  let step = ledger.version;
  for (;;) {
    step += 1;
    await ledger.append({
      event: { kind: 'step', step },
      records: [
        { path: `run/${String(step).padStart(4, '0')}.json`, id: 'run', revision: step, body: { step, filler: 'x'.repeat(4_000) } },
        { path: 'run/latest.json', id: 'run', revision: step, body: { step } },
      ],
    });
  }
}

await main();
