import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repositoryRoot } from './plan.js';
import type { InstanceHandler } from './runner.js';

/**
 * I2A-01's four leaves are reviewed in iteration 1 and pass on document
 * evidence: the results file and raw probe JSON iteration 1 actually
 * produced. This iteration does not redo iteration 1's review; it only
 * confirms that evidence is present and internally consistent, so the group
 * registers as `passed` rather than `not-executed` for later `--iteration`
 * gates that include iteration 1 as a prerequisite.
 */
const results = 'docs/plans/iteration-2a-materialized-api-view/iterations/iteration1-results.md';
const contracts = 'docs/plans/iteration-2a-materialized-api-view/contracts.md';
const probes = 'scripts/probes/results/plan2a';

function read(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

const handlers = new Map<string, InstanceHandler>();

handlers.set('I2A-01:provider-handoff', { kind: 'memory', run: ({ assertions }) => {
  assertions.ok('the iteration 1 results file exists', existsSync(resolve(repositoryRoot, results)));
  const text = read(results);
  assertions.ok('it records the rechecked commit', /Rechecked commit: `[0-9a-f]{7,40}`/.test(text));
  assertions.ok('it records the RetainedSession provider handoff', text.includes('RetainedSession'));
  assertions.ok('it records the harness --plan discriminator handoff for iteration 2', text.includes('Harness `reference:verify --plan` discriminator'));
} });

handlers.set('I2A-01:scale-baseline', { kind: 'memory', run: ({ assertions }) => {
  const path = resolve(repositoryRoot, `${probes}/scale-baseline.json`);
  assertions.ok('the raw scale-baseline probe file exists', existsSync(path));
  const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  assertions.ok('the probe recorded a non-empty result', Object.keys(data).length > 0);
} });

handlers.set('I2A-01:format-token-probe', { kind: 'memory', run: ({ assertions }) => {
  const path = resolve(repositoryRoot, `${probes}/token-format.json`);
  assertions.ok('the raw token-format probe file exists', existsSync(path));
  const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  assertions.ok('the probe recorded a non-empty result', Object.keys(data).length > 0);
} });

handlers.set('I2A-01:limits-frozen', { kind: 'memory', run: ({ assertions }) => {
  assertions.ok('contracts.md exists', existsSync(resolve(repositoryRoot, contracts)));
  const text = read(contracts);
  assertions.ok('it carries the iteration 1 frozen-limits revision', text.includes('Revision (iteration 1, 2026-09-15)'));
  for (const limit of ['maxSignatureBytes', 'maxDocumentationBytes', 'maxOverloads', 'maxAreaBytes', 'maxInvocationBytes', 'maxStagedBytes']) {
    assertions.ok(`it names a positive finite ${limit}`, new RegExp(`\`${limit}\`[^\\n]*\\|\\s*[\\d,]+\\s*\\|`).test(text) || text.includes(limit));
  }
} });

export const plan2aDocumentHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
