import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GitService } from '../../subs/evidence/src/git.js';
import { scenarioRecordSchema, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { renderFeatureFiles, type RenderedFeatureFile } from '../../subs/scenarios/src/rendering.js';
import {
  applyScenarioEvent, initialScenarioStates, scenarioEventTypes, type ScenarioEvent, type ScenarioState, type ScenarioStates,
} from '../../subs/scenarios/src/states.js';
import { resolveContainedPath } from '../guard/resolve-contained-path.js';
import { runTrailer } from './gates.js';
import { entryAssignmentsSchema } from './records.js';

/*
 * The tracked feature files of one run, architecture §5 and §12.
 *
 * Their content is a pure function of the scenario records and states the
 * ledger holds, so the harness never reads a feature file to learn what it
 * should say. A re-rendering computes every tracked file's expected content,
 * writes the files that differ and reports whether a commit is needed. It
 * is the one way a feature file changes: the materialization after the run
 * branch exists, the recovery of a crash, every state change that alters a
 * pending tag, and a plan deviation that rewords a pending scenario, which
 * revises its record.
 */

/** The trailer that identifies a run's scenario commits beside its `Ramify-Run`. */
export const scenariosTrailer = 'Ramify-Scenarios';
/** The trailer value of the commit that materializes the feature files. */
export const materializedTrailerValue = 'materialized';

/** One ledger line as far as the scenarios are concerned: its event and the record bodies it commits. */
export interface ScenarioLedgerLine {
  readonly transaction: {
    readonly event: { readonly type: string };
    readonly records: ReadonlyArray<{ readonly body: unknown }>;
  };
}

/** What the ledger holds of the run's scenarios: the records, their states and the entries that describe the files. */
export interface TrackedScenarios {
  readonly records: readonly ScenarioRecord[];
  readonly states: ScenarioStates;
  readonly entries: ReadonlyArray<{ readonly capability: string; readonly description: string }>;
}

/**
 * Replays the ledger into the tracked scenarios. Every scenario starts
 * `pending` at `analysis-accepted`, and each accepted binding and report
 * applies in order, as the obligation projection applies them.
 */
export function trackedScenarios(lines: readonly ScenarioLedgerLine[]): TrackedScenarios {
  const { written: _written, ...tracked } = replayScenarios(lines);
  return tracked;
}

/**
 * The tracked scenarios with the states the tree holds them in: the states
 * as of the harness's latest rendering, which is the materialization, a
 * gate's commit or a rewording commit. An accepted binding or report
 * changes a state at once and the tree only at the next of those, so a gate
 * compares the tree against this rendering, not the current one.
 */
export function writtenScenarios(lines: readonly ScenarioLedgerLine[]): TrackedScenarios {
  const { written, ...tracked } = replayScenarios(lines);
  return { ...tracked, states: written };
}

/** One pass over the ledger: the records, the current states, the entries, and the states as last rendered. */
function replayScenarios(lines: readonly ScenarioLedgerLine[]): TrackedScenarios & { readonly written: ScenarioStates } {
  const records: ScenarioRecord[] = [];
  let entries: TrackedScenarios['entries'] = [];
  let states: ScenarioStates = initialScenarioStates([]);
  let written: ScenarioStates = states;
  for (const line of lines) {
    for (const record of line.transaction.records) {
      const schema = (record.body as { schema?: unknown } | null)?.schema;
      if (schema === 'ramify-agent.scenario/1') {
        // A plan deviation's rewording revises a record in place: the latest wins.
        const scenario = scenarioRecordSchema.parse(record.body);
        const at = records.findIndex(held => held.id === scenario.id);
        if (at < 0) records.push(scenario);
        else records[at] = scenario;
      }
      if (schema === 'ramify-agent.entry-assignments/1') {
        entries = entryAssignmentsSchema.parse(record.body).entries.map(entry => ({ capability: entry.capability, description: entry.description }));
      }
    }
    const event = line.transaction.event as { readonly type: string };
    if (event.type === 'analysis-accepted') states = initialScenarioStates(records.map(record => record.id));
    if ((scenarioEventTypes as readonly string[]).includes(event.type)) states = applyScenarioEvent(states, event as unknown as ScenarioEvent);
    // The points where the harness renders the files into the tree.
    if (event.type === 'scenarios-materializing' || event.type === 'gate-committing' || event.type === 'scenarios-rewording') written = states;
  }
  return { records, states, entries, written };
}

/** One tracked scenario the final gate cannot run over: its entry (null for an integration scenario), its state and its record's path as evidence. */
export interface IncompleteScenario {
  readonly id: string;
  readonly entry: string | null;
  readonly state: ScenarioState;
  readonly evidence: string;
}

/**
 * The harness rule `acceptance-incomplete`: before the final run every
 * tracked scenario, integration scenarios included, has its responsible
 * architect's `done` report. Every one that has none, with its record as
 * evidence. No execution result enters this: the final audit's verdict is a
 * separate fact.
 */
export function incompleteScenarios(tracked: TrackedScenarios): IncompleteScenario[] {
  return tracked.records
    .map(record => ({ id: record.id, entry: record.entry, state: tracked.states.get(record.id) ?? 'pending', evidence: join('scenarios', `${record.id}.json`) }))
    .filter(scenario => scenario.state !== 'done');
}

/** Every tracked file's expected content under the current states, ordered by path. */
export function expectedFeatureFiles(tracked: TrackedScenarios, run: { readonly planId: string; readonly runId: string }): RenderedFeatureFile[] {
  if (tracked.records.length === 0) return [];
  return renderFeatureFiles(tracked.records, tracked.states, { planId: run.planId, runId: run.runId, entries: tracked.entries });
}

/** The SHA-256 of a file's content, as the guarded files are hashed. */
export function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Each tracked file with the hash of its expected rendering, for a guarded list. */
export function expectedFeatureHashes(files: readonly RenderedFeatureFile[]): Array<{ path: string; hash: string }> {
  return files.map(file => ({ path: file.path, hash: contentHash(file.content) }));
}

/** What one re-rendering did. */
export interface FeatureRerendering {
  /** Every tracked file, project-relative and ordered by path. */
  readonly files: readonly string[];
  /** The files whose content differed from the expected rendering and were written. */
  readonly written: readonly string[];
  /**
   * Whether the tree now differs from what was last committed because of
   * this re-rendering. A caller that recovers a crash commits regardless,
   * since the interrupted attempt may have written the files already.
   */
  readonly commitNeeded: boolean;
}

/**
 * Writes every tracked file whose content differs from its expected
 * rendering, and nothing else. Run twice over the same states, the second
 * run writes nothing. A path outside the project is refused before any file
 * is written.
 */
export async function rerenderFeatureFiles(projectRoot: string, expected: readonly RenderedFeatureFile[]): Promise<FeatureRerendering> {
  const targets = expected.map(file => {
    const target = resolveContainedPath(projectRoot, file.path);
    if (!target.ok) throw new RangeError(`A feature file must lie within the project: ${file.path}`);
    return { file, absolute: target.resolved };
  });
  const written: string[] = [];
  for (const { file, absolute } of targets) {
    if (await readText(absolute) === file.content) continue;
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, 'utf8');
    written.push(file.path);
  }
  return { files: expected.map(file => file.path), written, commitNeeded: written.length > 0 };
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR') return null;
    throw error;
  }
}

/** The message of the commit that materializes the feature files, written mechanically from the records. */
export function materializationMessage(parts: { readonly planId: string; readonly runId: string; readonly files: readonly string[]; readonly scenarios: number }): string {
  return [
    `Scenarios of ${parts.planId}`,
    '',
    `The ${parts.scenarios} acceptance scenario${parts.scenarios === 1 ? '' : 's'} of the accepted analysis, written by ramify-agent`,
    'with the pending tag until each is bound or reported done. Agents never edit these files.',
    '',
    ...parts.files.map(file => `  ${file}`),
    '',
    `${runTrailer}: ${parts.runId}`,
    `${scenariosTrailer}: ${materializedTrailerValue}`,
    '',
  ].join('\n');
}

/**
 * The materialization commit, or the one an interrupted attempt already
 * made. The live attempt appended its intent a moment ago, so no commit of
 * it can exist and it commits at once; a recovery looks the commit up by
 * its run and scenario trailers first and makes none where it finds one.
 * Nothing to commit is `null`.
 */
export async function commitForMaterialization(
  projectRoot: string,
  runId: string,
  message: string,
  recovering: boolean,
  git: Pick<GitService, 'findCommitByTrailers' | 'commitAccepted'>,
  verifyRecovered: (commit: string) => Promise<void>,
  prepareCommit?: () => Promise<void>,
): Promise<string | null> {
  return commitForScenarios(projectRoot, runId, materializedTrailerValue, message, recovering, git, verifyRecovered, prepareCommit);
}

/**
 * The commit of one of the harness's own scenario commits, identified by its
 * `Ramify-Scenarios` value beside `Ramify-Run`: the live attempt commits at
 * once, a recovery finds the commit an interrupted attempt made first.
 */
export async function commitForScenarios(
  projectRoot: string,
  runId: string,
  trailerValue: string,
  message: string,
  recovering: boolean,
  git: Pick<GitService, 'findCommitByTrailers' | 'commitAccepted'>,
  verifyRecovered: (commit: string) => Promise<void>,
  prepareCommit?: () => Promise<void>,
): Promise<string | null> {
  if (recovering) {
    const existing = await git.findCommitByTrailers(projectRoot, [
      { key: runTrailer, value: runId },
      { key: scenariosTrailer, value: trailerValue },
    ]);
    if (existing !== null) { await verifyRecovered(existing); return existing; }
  }
  await prepareCommit?.();
  return git.commitAccepted(projectRoot, message);
}

/** The trailer value of a run's nth rewording commit. */
export function rewordedTrailerValue(rewording: number): string {
  return `reworded-${rewording}`;
}

/** A scenario's name, from the `Scenario:` line its source starts with; null where it has none. */
export function scenarioNameOf(source: readonly string[]): string | null {
  const first = source.find(line => line.trim() !== '');
  const match = first === undefined ? null : /^\s*Scenario(?: Outline)?:\s*(.*?)\s*$/u.exec(first);
  return match === null ? null : match[1]!;
}

/**
 * The message of a rewording commit, "Reword sc-003", written mechanically
 * from the intent: the plan deviation that rewords the pending scenarios,
 * and their files.
 */
export function rewordingMessage(parts: {
  readonly runId: string;
  readonly rewording: number;
  readonly deviation: string;
  readonly scenarios: readonly string[];
  readonly files: readonly string[];
}): string {
  return [
    `Reword ${parts.scenarios.join(', ')}`,
    '',
    `Plan deviation ${parts.deviation} rewords ${parts.scenarios.length === 1 ? 'this pending scenario' : 'these pending scenarios'}. The plan file is`,
    'unchanged; the deviation beside it is the record of the new wording.',
    '',
    ...parts.files.map(file => `  ${file}`),
    '',
    `${runTrailer}: ${parts.runId}`,
    `${scenariosTrailer}: ${rewordedTrailerValue(parts.rewording)}`,
    '',
  ].join('\n');
}
