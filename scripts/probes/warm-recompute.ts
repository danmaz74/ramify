import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { once } from 'node:events';
import { hundredOwnerFiles } from './fixtures/hundred-owners.js';
import { archive, packageRoot, sha256 } from './resident-probe.js';

// Keep fixture creation and process startup outside the twenty measured calls.
await mkdir(resolve(packageRoot, '.reference-work'), { recursive: true });
const scratch = await mkdtemp(resolve(packageRoot, '.reference-work/warm-recompute-'));
const files = hundredOwnerFiles();
try {
  for (const [path, content] of files) {
    await mkdir(dirname(resolve(scratch, path)), { recursive: true });
    await writeFile(resolve(scratch, path), content);
  }
  const worker = resolve(packageRoot, 'scripts/probes/fixtures/warm-recompute-worker.mjs');
  const samples = [];
  for (const [workload, root, owners] of [
    ['reference', resolve(packageRoot, 'examples/collection-review'), 15],
    ['hundred-owners', scratch, 100],
  ] as const) {
    const child = spawn(process.execPath, [worker, root, String(owners)], {
      cwd: packageRoot, stdio: ['ignore', 'pipe', 'inherit'],
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    const [code, signal] = await once(child, 'exit');
    assert.equal(code, 0, `${workload}: worker failed (${signal})`);
    samples.push({ workload, ...JSON.parse(output) });
  }
  await archive('warm-recompute', {
    recipe: 'One fresh compiled worker per workload; twenty serial in-process runBatch calls; no retained engine or compiler state; no warmup omitted; imports and fixture creation outside timing.',
    instrumentation: 'In-memory load hook inserts phase marks in the compiled Plan 1 pipeline. Parse callback time is subtracted from acquisition. Access includes source-helper disposal; seal/dispose and report assembly are separate. No owner file is edited.',
    workerSha256: sha256(await readFile(worker)),
    fixtureSha256: sha256(JSON.stringify([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))),
    samples,
    limitations: ['In-process recompute floor, not resident acceptance or cold CLI latency.',
      'Per-stage medians need not sum to median total.', 'RSS is parent-only end-of-call; no peak or memory acceptance claim.'],
  });
} finally { await rm(scratch, { recursive: true, force: true }); }
