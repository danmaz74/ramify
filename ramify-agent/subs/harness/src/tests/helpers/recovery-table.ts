import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { RunEvent } from '../../run/log.js';
import type { RunWrite } from '../../run/service.js';
import {
  crashAt, fileHashes, gateTrailers, identityOf, logLines, plan, recordText, recoveryCompletions, removeRecordFiles,
  runDirectory, scenarios, committedRecords, type CrashPoint, type LogLine, type ScenarioName,
} from './composition.js';
import { onlyRun, openRuns } from './runs.js';

/*
 * The recovery tables of the ten state machines, composed into one table
 * keyed by the durable boundary a crash can land after. The keys are the
 * run service's own `RunWrite` union, so a boundary the service gains
 * without a row here is a type error, not a silent gap.
 *
 * Every row is held to the same checks, whatever its machine: recovery
 * calls no agent; every record file the log commits is materialized again,
 * byte for byte, after all of them were deleted; recovery appends only the
 * completions of intents and starts the log holds open, and each once; no
 * work, obligation, decision, brief, effect or commit is duplicated; the run
 * is interrupted, or left completed; and a second restart changes nothing.
 * `appended` is each row's stated state: exactly what recovery adds to the
 * log at that boundary.
 */

export type Machine = 'SM1' | 'SM2' | 'SM3' | 'SM4' | 'SM5' | 'SM6' | 'SM7' | 'SM8' | 'SM9' | 'SM10';

export const machineNames: Readonly<Record<Machine, string>> = {
  SM1: 'the implementation run',
  SM2: 'initial analysis',
  SM3: 'a global placement request',
  SM4: 'a module work item',
  SM5: 'an iteration',
  SM6: 'contract delegation and a provider obligation',
  SM7: 'a gate, its repair and infrastructure recovery',
  SM8: 'context budget and compaction',
  SM9: 'writer ownership',
  SM10: 'stop, restart and supersession',
};

export interface RecoveryRow {
  readonly machines: readonly Machine[];
  readonly scenario: ScenarioName;
  /** The recovery the machine's table states, in its words. */
  readonly stated: string;
  /** Exactly what recovery appends to the log, in order. */
  readonly appended: readonly RunEvent['type'][];
  /** Where exactly the crash lands, when the first write of the boundary is not the one the row is about. */
  readonly when?: CrashPoint['when'];
  /** The external effect recovery performs again, named as its report names it. */
  readonly effect?: RegExp | undefined;
  /** How many commits carrying a gate trailer the branch holds after recovery, beside how many before. */
  readonly commits?: { readonly before: number; readonly after: number } | undefined;
}

const interrupted: RunEvent['type'][] = ['job-interrupted'];

/** One row per durable boundary of the run log. */
export const recoveryTable = {
  'job-created': {
    machines: ['SM1'], scenario: 'iteration', appended: interrupted,
    stated: 'Loads the run and appends job-interrupted; no invocation is started',
  },
  'invocation-started': {
    machines: ['SM1', 'SM10'], scenario: 'iteration', appended: ['invocation-ended', 'job-interrupted'],
    stated: 'Closes the invocation as failed with session-lost, with no agent call and no second start, then interrupts',
  },
  'invocation-ended': {
    machines: ['SM2'], scenario: 'iteration', appended: interrupted,
    stated: 'Leaves the outcome as it was and appends no second end',
  },
  'analysis-accepted': {
    machines: ['SM2'], scenario: 'iteration', appended: interrupted,
    stated: 'Re-materializes the entries, hypotheses, registry and work items from the one line; no second analysis',
  },
  'readiness-attempted': {
    machines: ['SM1', 'SM7'], scenario: 'iteration', appended: interrupted,
    stated: 'Re-materializes the readiness attempt and its gate; readiness does not run again',
  },
  'work-item-started': {
    machines: ['SM4'], scenario: 'iteration', appended: interrupted,
    stated: 'No second start, and nothing delivered',
  },
  'hypotheses-delivered': {
    machines: ['SM4', 'SM3'], scenario: 'iteration', appended: interrupted,
    stated: 'Re-materializes the work item and the hypothesis; nothing is delivered a second time',
  },
  'outline-revised': {
    machines: ['SM4'], scenario: 'iteration', appended: interrupted,
    stated: 'Re-materializes the outline revision; no second revision',
  },
  'iteration-assigned': {
    machines: ['SM5'], scenario: 'iteration', appended: interrupted,
    stated: 'Rewrites the assignment from the log; nothing is assigned twice',
  },
  'writer-acquired': {
    machines: ['SM9', 'SM5'], scenario: 'iteration', appended: ['invocation-ended', 'job-interrupted'],
    stated: 'Closes that writer\'s invocation; no second writer is acquired',
  },
  'writer-released': {
    machines: ['SM9'], scenario: 'iteration', appended: ['invocation-ended', 'job-interrupted'],
    stated: 'Keeps what the writer left in the tree, closes the invocation, releases no second writer',
  },
  'gate-attempted': {
    machines: ['SM7', 'SM5'], scenario: 'iteration', appended: ['gate-committed', 'job-interrupted'],
    effect: /the commit of gate ga-\d+/, commits: { before: 0, after: 1 },
    stated: 'The commit intent is in the log and the commit is not made: the effect is performed again and makes one commit',
  },
  'gate-committing': {
    machines: ['SM7', 'SM5'], scenario: 'iteration', appended: ['gate-committed', 'job-interrupted'],
    effect: /the commit of gate ga-\d+/, commits: { before: 1, after: 1 },
    stated: 'The commit is made and its completion is not: the commit is found by its trailer and no second one is made',
  },
  'gate-committed': {
    machines: ['SM7'], scenario: 'iteration', appended: interrupted, commits: { before: 1, after: 1 },
    stated: 'Leaves the commit alone and appends the interruption only',
  },
  'iteration-closed': {
    machines: ['SM5'], scenario: 'iteration', appended: interrupted,
    stated: 'The accepted iteration stays accepted with its one commit; the work item is not closed by the interruption',
  },
  'work-item-completed': {
    machines: ['SM4'], scenario: 'iteration', appended: interrupted,
    stated: 'The item stays completed and is not started again',
  },
  'job-completed': {
    machines: ['SM1'], scenario: 'iteration', appended: [],
    stated: 'A completed run rewrites nothing and appends nothing',
  },
  'placement-requested': {
    machines: ['SM3'], scenario: 'placement', appended: interrupted,
    stated: 'The request stands; no fork and no decision',
  },
  'view-refreshed': {
    machines: ['SM3'], scenario: 'placement', appended: interrupted,
    stated: 'The refresh stands and licensed exactly one fork, which recovery does not start',
  },
  'fork-returned-partial': {
    machines: ['SM3', 'SM8'], scenario: 'placement', appended: interrupted,
    stated: 'The partial return counts one retry and is never a decision; nothing is appended to the parent',
  },
  'decision-accepted': {
    machines: ['SM3'], scenario: 'placement', appended: ['brief-appended', 'decision-delivered', 'job-interrupted'],
    effect: /the parent append of decision gd-\d+/,
    stated: 'The decision is pending: its brief is appended once, keyed by its identifier, and it is delivered',
  },
  'brief-appending': {
    machines: ['SM3'], scenario: 'placement', appended: ['brief-appended', 'decision-delivered', 'job-interrupted'],
    effect: /the parent append of decision gd-\d+/,
    stated: 'The append reached the parent: the repeat is answered already-present and one brief exists',
  },
  'brief-appended': {
    machines: ['SM3'], scenario: 'placement', appended: ['decision-delivered', 'job-interrupted'],
    effect: /the delivery of decision gd-\d+/,
    stated: 'Appends decision-delivered once, and starts nothing',
  },
  'decision-delivered': {
    machines: ['SM3'], scenario: 'placement', appended: interrupted,
    stated: 'The delivery stands; the local architect\'s next turn belongs to a run started again',
  },
  'contract-requested': {
    machines: ['SM6', 'SM5'], scenario: 'delegation', appended: interrupted,
    stated: 'Re-materializes the contract assignment with its requestedBy; no registration and no second sub-session',
  },
  'contract-registered': {
    machines: ['SM6'], scenario: 'delegation', appended: interrupted,
    stated: 'Re-materializes the contract, the obligation, the requirement and the provider work item: one of each',
  },
  'work-item-yielded': {
    machines: ['SM6', 'SM4'], scenario: 'delegation', appended: interrupted,
    stated: 'The yield stands; no resumption, and the provider work item is not started',
  },
  'provider-conformed': {
    machines: ['SM6'], scenario: 'delegation', appended: interrupted,
    stated: 'Conformance is recorded once for the obligation revision; the consumer is not resumed by recovery',
  },
  'work-item-resumed': {
    machines: ['SM6', 'SM4'], scenario: 'delegation', appended: interrupted,
    stated: 'The resumption stands; the requirement is still open',
  },
  'requirement-verified': {
    machines: ['SM6'], scenario: 'delegation', appended: interrupted,
    stated: 'The requirement is closed once, at its revision',
  },
  'revision-needed': {
    machines: ['SM6'], scenario: 'revision', appended: interrupted,
    stated: 'The report stands, with the provider\'s iteration closed before it; nothing is revised',
  },
  'evidence-reopened': {
    machines: ['SM6'], scenario: 'revision', appended: interrupted,
    stated: 'Re-materializes one revision of the contract, obligation and requirements with the same bindings',
  },
  'dependency-cycle-detected': {
    machines: ['SM6'], scenario: 'cycle', appended: interrupted,
    stated: 'The detection stands once; the return to the architect belongs to a run started again',
  },
} satisfies Record<RunWrite, RecoveryRow>;

/** The rows a boundary alone cannot place: the same write, at a moment another machine owns. */
export const narrowedRows: ReadonlyArray<RecoveryRow & { readonly name: string; readonly write: RunWrite }> = [
  {
    name: 'invocation-ended of a context-budget return',
    write: 'invocation-ended',
    when: events => (events.at(-1)?.data as { ended?: string }).ended === 'context-budget-reached',
    machines: ['SM8'], scenario: 'iteration', appended: interrupted,
    stated: 'The budget return is kept as it was: never a completion, counted over committed history, and no successor is started by recovery',
  },
  {
    name: 'writer-released after a stop was requested',
    write: 'writer-released',
    when: events => events.some(event => event.type === 'stop-requested'),
    machines: ['SM10', 'SM9'], scenario: 'stop', appended: ['invocation-ended', 'job-interrupted'],
    stated: 'A stop that has not reached job-stopped leaves a run with no terminal event: it is interrupted on load, the writer stays released, and the stopped invocation is closed without an agent call',
  },
];

/**
 * The event of the last line a crash at each boundary leaves. Most
 * boundaries are named for their event; the others are the moment inside a
 * transition that the service marks.
 */
const lastLineOf: Readonly<Record<RunWrite, RunEvent['type']>> = {
  ...Object.fromEntries(Object.keys(recoveryTable).map(write => [write, write])) as Record<RunWrite, RunEvent['type']>,
  'job-created': 'job-started',
  'readiness-attempted': 'readiness-passed',
  'gate-committing': 'gate-attempted',
  'brief-appending': 'decision-accepted',
};

/** Every row, named. */
export function allRows(): Array<RecoveryRow & { readonly name: string; readonly write: RunWrite }> {
  return [
    ...Object.entries(recoveryTable).map(([write, row]) => ({ ...(row as RecoveryRow), name: write, write: write as RunWrite })),
    ...narrowedRows,
  ];
}

/** Crashes one row's scenario at its boundary, restarts twice, and holds the recovered state to every check. */
export async function verifyRow(row: RecoveryRow & { readonly name: string; readonly write: RunWrite }): Promise<void> {
  const scenario = scenarios[row.scenario];
  const crashed = await crashAt(scenario, { write: row.write, when: row.when });
  const { root, runId, agent } = crashed;
  const reopened: Array<{ close(): Promise<void> }> = [];
  try {
    const frozen = await logLines(root, runId);
    // The crash landed where the row says: the last line is the boundary's own.
    expect(frozen.at(-1)?.event.type, `the last line before the crash at ${row.name}`).toBe(lastLineOf[row.write]);
    const frozenTerminal = ['job-completed', 'job-failed', 'job-stopped', 'job-interrupted'].includes(frozen.at(-1)?.event.type ?? '');
    const trailersBefore = await gateTrailers(root, runId);
    const jobRecord = await readFile(join(runDirectory(root, runId), 'job.json'), 'utf8');
    await removeRecordFiles(root, runId, frozen);
    const sessionsBefore = agent.sessions.length;

    const first = await openRuns(root, { agent, inputs: scenario.inputs() });
    reopened.push(first.service);
    const recovered = await logLines(root, runId);

    // Recovery called no agent.
    expect(agent.sessions.length, 'recovery started a session').toBe(sessionsBefore);

    // The log up to the crash is untouched, and what recovery appended is
    // exactly the row's stated state.
    expect(recovered.slice(0, frozen.length).map(line => line.text)).toEqual(frozen.map(line => line.text));
    const appended = recovered.slice(frozen.length).map(line => line.event);
    expect(appended.map(event => event.type), `what recovery appended after ${row.name}`).toEqual(row.appended);
    for (const event of appended) expect(recoveryCompletions.has(event.type), `${event.type} is not a completion`).toBe(true);
    if (!frozenTerminal) {
      expect(first.recovery.interrupted).toEqual([`${plan}/${runId}`]);
      expect(onlyRun(first.service, plan).state).toBe('interrupted');
    } else {
      expect(first.recovery.interrupted).toEqual([]);
    }
    if (row.effect !== undefined) expect(first.recovery.effects.some(effect => row.effect!.test(effect)), first.recovery.effects.join('; ')).toBe(true);
    else expect(first.recovery.effects).toEqual([]);

    // Each completion recovery appended completes something the log held open.
    const frozenEvents = frozen.map(line => line.event);
    for (const event of appended) {
      const data = event.data as Record<string, unknown>;
      switch (event.type) {
        case 'invocation-ended':
          expect(frozenEvents.some(e => e.type === 'invocation-started' && (e.data as { invocation: string }).invocation === data.invocation)).toBe(true);
          break;
        case 'gate-committed':
          expect(frozenEvents.some(e => e.type === 'gate-attempted' && (e.data as { gate: string }).gate === data.gate)).toBe(true);
          break;
        case 'brief-appended': case 'global-context-rebuilt':
          expect(frozenEvents.some(e => e.type === 'decision-accepted')).toBe(true);
          break;
        default:
          break;
      }
    }

    // No work, obligation, decision, brief or effect is in the log twice.
    const identities = recovered.map(line => identityOf(line.event)).filter((identity): identity is string => identity !== null);
    expect(identities.filter((identity, index) => identities.indexOf(identity) !== index), 'duplicated in the log').toEqual([]);

    // One commit per gate, whatever recovery did.
    const trailers = await gateTrailers(root, runId);
    expect(trailers.filter((trailer, index) => trailers.indexOf(trailer) !== index), 'a gate committed twice').toEqual([]);
    if (row.commits !== undefined) {
      expect(trailersBefore.length).toBe(row.commits.before);
      expect(trailers.length).toBe(row.commits.after);
    }
    const committedGates = recovered.filter(line => line.event.type === 'gate-committed' && (line.event.data as { commit: string | null }).commit !== null);
    expect(trailers.length).toBe(committedGates.length);

    // Every record file the log commits is there again, byte for byte, and
    // the run's own record was never touched.
    await expectMaterialized(root, runId, recovered);
    expect(await readFile(join(runDirectory(root, runId), 'job.json'), 'utf8')).toBe(jobRecord);

    // A second restart finds nothing to do.
    const hashes = await fileHashes(runDirectory(root, runId));
    await first.service.close();
    reopened.pop();
    const second = await openRuns(root, { agent, inputs: scenario.inputs() });
    reopened.push(second.service);
    expect(second.recovery.interrupted).toEqual([]);
    expect(second.recovery.effects).toEqual([]);
    expect(second.recovery.rematerialized).toEqual([]);
    expect((await logLines(root, runId)).map(line => line.text)).toEqual(recovered.map(line => line.text));
    expect(await fileHashes(runDirectory(root, runId))).toEqual(hashes);
    expect(agent.sessions.length).toBe(sessionsBefore);
  } finally {
    for (const service of reopened) await service.close();
    await crashed.remove();
  }
}

async function expectMaterialized(root: string, runId: string, lines: readonly LogLine[]): Promise<void> {
  const missing: string[] = [];
  const differing: string[] = [];
  for (const [path, body] of committedRecords(lines)) {
    const absolute = join(runDirectory(root, runId), path);
    if (!existsSync(absolute)) missing.push(path);
    else if ((await readFile(absolute, 'utf8')) !== recordText(body)) differing.push(path);
  }
  expect({ missing, differing }).toEqual({ missing: [], differing: [] });
}
