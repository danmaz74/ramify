/*
 * Records the message streams the reducer's tests replay. Development only:
 * no test runs this file, and no test starts the runner. From `ramify-agent/`:
 *
 *   npx tsx subs/harness/subs/scenarios/src/tests/fixtures/record-streams.ts
 *
 * Each case builds the shelf module's profile with `buildScenarioProfile`,
 * runs the real `cucumber-js` over `sample-project/` with it, and copies the
 * stream into `streams/<case>.ndjson`.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScenarioProfile, type ScenarioSelection } from '../../profiles.js';
import type { ScenarioModule } from '../../records.js';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, 'sample-project');
const streams = join(here, 'streams');
const cucumber = join(here, '../../../../../../../node_modules/@cucumber/cucumber/bin/cucumber.js');

const shelf: ScenarioModule = { module: 'sample/shelf', dir: 'subs/shelf', testing: false };
const command = [process.execPath, '--import', 'tsx', cucumber];
const config = { support: ['src/tests/support/*.ts'], modes: { quick: { command }, full: { command } } };

const cases: { name: string; selection: ScenarioSelection; dryRun?: boolean }[] = [
  { name: 'passing', selection: { kind: 'identity', scenarios: ['sc-001'] } },
  { name: 'failing', selection: { kind: 'identity', scenarios: ['sc-002'] } },
  { name: 'undefined', selection: { kind: 'identity', scenarios: ['sc-003'] } },
  { name: 'ambiguous', selection: { kind: 'identity', scenarios: ['sc-004'] } },
  { name: 'pending', selection: { kind: 'identity', scenarios: ['sc-005'] } },
  { name: 'outline', selection: { kind: 'identity', scenarios: ['sc-006'] } },
  { name: 'bound', selection: { kind: 'identity', scenarios: ['sc-001', 'sc-007'] } },
  { name: 'all-untagged', selection: { kind: 'all-untagged' } },
  { name: 'dry-run', selection: { kind: 'all' }, dryRun: true },
];

mkdirSync(streams, { recursive: true });
for (const recording of cases) {
  const attempt = mkdtempSync(join(tmpdir(), 'scenario-recording-'));
  try {
    const profile = buildScenarioProfile(shelf, 'quick', recording.selection, config, attempt, { dryRun: recording.dryRun ?? false, projectRoot: project });
    mkdirSync(dirname(profile.profilePath), { recursive: true });
    writeFileSync(profile.profilePath, profile.profileText);
    const [program, ...args] = profile.argv;
    const run = spawnSync(program!, args, { cwd: project, encoding: 'utf8' });
    copyFileSync(profile.messagesPath, join(streams, `${recording.name}.ndjson`));
    console.log(`${recording.name}: exit ${run.status}`);
  } finally {
    rmSync(attempt, { recursive: true, force: true });
  }
}
