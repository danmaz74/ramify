/*
 * Runs every probe in order and prints the table the results note carries.
 *
 *   node_modules/.bin/tsx spikes/autonomous-loop/run-all.ts
 *   node_modules/.bin/tsx spikes/autonomous-loop/run-all.ts --json
 *
 * Nothing here reaches a network: every probe runs a real pi session over a
 * scripted provider in a temporary directory.
 */

import { attempt, type ProbeResult } from './lib/probe.js';
import { probe as p01 } from './probes/p01-continue-session.js';
import { probe as p02 } from './probes/p02-continue-after-terminate.js';
import { probe as p03 } from './probes/p03-fork.js';
import { probe4, probe5, release } from './probes/p04-append.js';
import { probe as p06 } from './probes/p06-context.js';
import { probe7, probe8 } from './probes/p07-compaction.js';
import { probe as p09 } from './probes/p09-final-response.js';
import { probe10, probe11 } from './probes/p10-guard.js';
import { probe as p12 } from './probes/p12-cancellation.js';
import { probe as p13 } from './probes/p13-restart.js';
import { probe as p14 } from './probes/p14-no-shell.js';
import { probe as p15 } from './probes/p15-events.js';
import { probe as p16 } from './probes/p16-invalid-input.js';

const probes = [p01, p02, p03, probe4, probe5, p06, probe7, probe8, p09, probe10, probe11, p12, p13, p14, p15, p16];

const results: ProbeResult[] = [];
for (const probe of probes) {
  process.stderr.write(`probe ${probe.number}: ${probe.title}\n`);
  results.push(await attempt(probe));
}
await release();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const entry of results) {
    console.log(`\n## ${entry.number}. ${entry.title} — **${entry.verdict}**`);
    if (entry.note !== undefined) console.log(`\n${entry.note}`);
    console.log('\n```text');
    for (const line of entry.evidence) console.log(line);
    console.log('```');
  }
  const counts = results.reduce<Record<string, number>>((all, entry) => ({ ...all, [entry.verdict]: (all[entry.verdict] ?? 0) + 1 }), {});
  console.log(`\n${results.length} probes: ${Object.entries(counts).map(([verdict, count]) => `${count} ${verdict}`).join(', ')}`);
}
