import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { RunEvent } from '../../run/log.js';
import type { RunWrite } from '../../run/service.js';
import { reduceSessions } from '../../run/sessions.js';
import {
  crashAt, committedGates, compositionCandidates, fileHashes, identityOf, logLines, materialized, plan, recordText, recoveryCompletions, removeRecordFiles,
  runDirectory, scenarios, source, statedCommands, committedRecords, type CrashPoint, type LogLine, type ScenarioName,
} from './composition.js';
import { scenariosCommitName, type GitResponses } from './recovery-git.js';
import { directReadinessExecution } from './external-tools.js';
import { onlyRun, openRuns } from './runs.js';

/*
 * The recovery tables of the ten state machines, composed into one table
 * keyed by the durable boundary a crash can land after. The keys are the
 * existing interrupted-run boundaries. The five resumable non-functional
 * boundaries have a separate witness in nonfunctional-recovery.test.ts;
 * together their keys exhaust the run service's `RunWrite` union.
 *
 * Every row is held to the same checks, whatever its machine: recovery
 * calls no agent; every record file the log commits is materialized again,
 * byte for byte, after all of them were deleted; recovery appends only the
 * completions of intents and starts the log holds open, and each once; no
 * work, obligation, decision, brief, effect or commit is duplicated; the run
 * is interrupted, or left completed; and a second restart changes nothing.
 * `appended` is each row's stated state: exactly what recovery adds to the
 * log at that boundary, apart from the `session-finished` events that every
 * row is held to by one rule. Recovery finishes each session the crash left
 * kept as `run-ended`, and one opened whose first invocation never started
 * as `interrupted`, just before the interruption; an interrupted invocation's
 * own end finishes its session as `interrupted`; and the recovered run holds
 * no live or suspended session.
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
  /** How many commits the run branch holds after recovery, beside how many before. */
  readonly commits?: { readonly before: number; readonly after: number } | undefined;
  /**
   * What the restart asks Git for at a commit boundary: whether it makes the
   * commit the interrupted attempt had not made, or finds by the attempt's
   * identity trailers the one it had. A row that states neither performs no
   * commit operation at all.
   */
  readonly recovery?: 'makes-the-commit' | 'finds-the-commit' | undefined;
  /**
   * The attempt that boundary is about, and the revision its commit is: the
   * gate the crash landed in, and the revision this row's scenario states
   * for it. A row that finds its commit is the one whose crash left it
   * behind, and it says so here rather than leaving Git to deduce it.
   */
  readonly at?: { readonly gate: string; readonly revision: string } | undefined;
  /**
   * What Git answers this row beyond its scenario's own answers, where the
   * row's crash decides it: whether the restart's lookup of the
   * materialization commit finds one.
   */
  readonly git?: ((responses: GitResponses) => GitResponses) | undefined;
}

/** The scenario's answers, with what a restart's lookup of the materialization commit finds. */
const scenariosLookup = (answer: string | null) => (responses: GitResponses): GitResponses => ({
  ...responses,
  recovered: [...(responses.recovered ?? []), { gate: scenariosCommitName, answers: [answer] }],
});

const interrupted: RunEvent['type'][] = ['job-interrupted'];

// These boundaries resume the same phase; the table below intentionally tests
// the older interruption contract. Their dedicated tests exercise actual resume.
export const nonfunctionalRecoveryBoundaries = {
  'nonfunctional-phase-started': 'nonfunctional-recovery.test.ts',
  'candidate-prepared': 'nonfunctional-recovery.test.ts',
  'nonfunctional-assessed': 'nonfunctional-recovery.test.ts',
  'nonfunctional-repair-assigned': 'nonfunctional-recovery.test.ts',
  'nonfunctional-repair-committed': 'nonfunctional-recovery.test.ts',
} as const satisfies Partial<Record<RunWrite, string>>;
export const capabilityRecoveryBoundaries = {
  'writer-process-registered': 'capability-recovery.test.ts',
  'capability-coordinator-resumed': 'capability-recovery.test.ts',
  'capability-source-captured': 'capability-recovery.test.ts',
  'capability-exchange-opened': 'capability-recovery.test.ts',
  'capability-exchange-answered': 'capability-recovery.test.ts',
  'capability-gate-recorded': 'capability-acceptance.integration.test.ts',
  'capability-review-recorded': 'capability-acceptance.integration.test.ts',
  'capability-handed-back': 'capability-dependencies.test.ts',
  'capability-assignment-settled': 'capability-dependencies.test.ts',
  'capability-assigned': 'capability-recovery.test.ts',
  'capability-assignment-interrupted': 'capability-recovery.test.ts',
  'capability-verification-started': 'capability-acceptance.integration.test.ts',
} as const satisfies Partial<Record<RunWrite, string>>;
type InterruptedRunWrite = Exclude<RunWrite, keyof typeof nonfunctionalRecoveryBoundaries | keyof typeof capabilityRecoveryBoundaries>;

/** One row per durable boundary with the interrupted-run recovery contract. */
export const recoveryTable = {
  'job-created': {
    machines: ['SM1'], scenario: 'iteration', appended: interrupted,
    stated: 'Loads the run and appends job-interrupted; no invocation is started',
  },
  'session-opened': {
    machines: ['SM1'], scenario: 'iteration', appended: interrupted,
    stated: 'The session opened before its first invocation started is finished as interrupted; no invocation is started',
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
  'analysis-evidence-staged': {
    machines: ['SM2'], scenario: 'iteration', appended: interrupted,
    stated: 'Immutable catalog and incorporation files may be orphaned; no analysis was accepted and recovery interrupts the run',
  },
  'readiness-attempted': {
    machines: ['SM1', 'SM7'], scenario: 'iteration', appended: interrupted,
    stated: 'Re-materializes the readiness attempt and its gate; readiness does not run again',
  },
  'scenarios-materializing': {
    machines: ['SM1'], scenario: 'iteration', appended: ['scenarios-materialized', 'job-interrupted'],
    effect: /the materialization of the feature files/, commits: { before: 0, after: 1 }, recovery: 'makes-the-commit',
    at: { gate: scenariosCommitName, revision: materialized }, git: scenariosLookup(null),
    stated: 'The intent is durable and no file is committed: recovery re-renders the feature files, finds no commit by its trailers, makes it once and records it',
  },
  'scenarios-committed': {
    machines: ['SM1'], scenario: 'iteration', appended: ['scenarios-materialized', 'job-interrupted'],
    effect: /the materialization of the feature files/, commits: { before: 1, after: 1 }, recovery: 'finds-the-commit',
    at: { gate: scenariosCommitName, revision: materialized }, git: scenariosLookup(materialized),
    stated: 'The commit is made and not recorded: recovery re-renders nothing new, finds the commit by its run and scenario trailers, and records it without a second commit',
  },
  'scenarios-materialized': {
    machines: ['SM1'], scenario: 'iteration', appended: interrupted, commits: { before: 1, after: 1 },
    stated: 'The materialization and its one commit stand; nothing is written or committed again',
  },
  'work-item-started': {
    machines: ['SM4'], scenario: 'iteration', appended: interrupted,
    stated: 'No second start, and nothing delivered',
  },
  'work-orientation-recorded': {
    machines: ['SM4'], scenario: 'iteration', appended: interrupted,
    stated: 'The immutable orientation packet stays committed and the run is interrupted without a second orientation',
  },
  'context-selection-recorded': {
    machines: ['SM4'], scenario: 'iteration', appended: interrupted,
    stated: 'The immutable selection and package stay committed; recovery does not rerun the selector',
  },
  'context-package-append-requested': {
    machines: ['SM4'], scenario: 'iteration', appended: ['context-package-appended', 'job-interrupted'],
    effect: /the context append of wi-001/,
    stated: 'Recovery retries the same keyed package append and records its actual outcome without selecting again',
  },
  'context-package-appended': {
    machines: ['SM4'], scenario: 'iteration', appended: interrupted,
    stated: 'The completed context append remains once and recovery does not append it again',
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
    machines: ['SM7', 'SM5'], scenario: 'iteration', appended: ['gate-attempted', 'job-interrupted'],
    effect: /the commit and audit of gate ga-\d+/, commits: { before: 1, after: 2 }, recovery: 'makes-the-commit',
    at: { gate: 'ga-0002', revision: source(1) },
    stated: 'The verified operation is durable and the commit is not made: recovery makes and audits one commit, then writes the complete attempt once',
  },
  'gate-committing': {
    machines: ['SM7', 'SM5'], scenario: 'iteration', appended: ['gate-attempted', 'job-interrupted'],
    effect: /the commit and audit of gate ga-\d+/, commits: { before: 2, after: 2 }, recovery: 'finds-the-commit',
    at: { gate: 'ga-0002', revision: source(1) },
    stated: 'The commit is made and the audit is not complete: recovery finds and re-audits that commit, then writes one complete attempt',
  },
  'gate-committed': {
    machines: ['SM7'], scenario: 'iteration', appended: interrupted, commits: { before: 2, after: 2 },
    stated: 'Leaves the complete attempt and its one commit alone and appends the interruption only',
  },
  'iteration-closed': {
    machines: ['SM5'], scenario: 'iteration', appended: interrupted,
    stated: 'The accepted iteration stays accepted with its one commit; the work item is not closed by the interruption',
  },
  'session-finished': {
    machines: ['SM5'], scenario: 'iteration', appended: interrupted,
    stated: 'The engineer session its accepted iteration released stays finished; the sessions the run still keeps are finished before the interruption',
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
} satisfies Record<InterruptedRunWrite, RecoveryRow>;

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
  'job-created': 'document-manifest-committed',
  'analysis-evidence-staged': 'invocation-ended',
  'readiness-attempted': 'readiness-passed',
  'scenarios-committed': 'scenarios-materializing',
  'gate-attempted': 'gate-committing',
  'gate-committing': 'gate-committing',
  'gate-committed': 'gate-attempted',
  'brief-appending': 'decision-accepted',
  'capability-assignment-interrupted': 'capability-assignment-interrupted',
  'capability-coordinator-resumed': 'capability-coordinator-resumed',
  'capability-verification-started': 'capability-verification-started',
  'capability-source-captured': 'invocation-ended',
  'capability-exchange-opened': 'capability-exchange-opened',
  'capability-exchange-answered': 'capability-exchange-answered',
  'capability-gate-recorded': 'gate-attempted',
  'capability-review-recorded': 'capability-review-recorded',
  'capability-assignment-settled': 'capability-assignment-settled',
  'writer-process-registered': 'writer-process-registered',
  'capability-assigned': 'capability-assigned',
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
  const stated = scenarios[row.scenario];
  const scenario = row.git === undefined ? stated : { ...stated, git: row.git(stated.git) };
  const crashed = await crashAt(scenario, { write: row.write, when: row.when });
  const { root, runId, agent, git } = crashed;
  const reopened: Array<{ close(): Promise<void> }> = [];
  try {
    const frozen = await logLines(root, runId);
    // The crash landed where the row says: the last line is the boundary's own.
    expect(frozen.at(-1)?.event.type, `the last line before the crash at ${row.name}`).toBe(lastLineOf[row.write]);
    const frozenTerminal = ['job-completed', 'job-failed', 'job-stopped', 'job-interrupted'].includes(frozen.at(-1)?.event.type ?? '');
    const committedBefore = committedGates(git);
    const askedBefore = { made: git.commits().length, found: git.recovered().length };
    const jobRecord = await readFile(join(runDirectory(root, runId), 'job.json'), 'utf8');
    await removeRecordFiles(root, runId, frozen);
    const sessionsBefore = agent.sessions.length;

    // The attempt the boundary is about is the one the log names, and the
    // row states which it is.
    if (row.at !== undefined && row.at.gate === scenariosCommitName) {
      expect(frozen.map(line => line.event.type), `the materialization the crash at ${row.name} landed in`).toContain('scenarios-materializing');
    } else if (row.at !== undefined) {
      const boundary = frozen.map(line => line.event).filter(event => event.type === 'gate-committing').at(-1);
      expect(boundary?.data.gate, `the gate the crash at ${row.name} landed in`).toBe(row.at.gate);
    }
    // The same Git answers the restart: the commit the interrupted run made
    // is the one this one finds by the attempt's identity trailers.
    const first = await openRuns(root, {
      agent, git, candidates: compositionCandidates(root, scenario), readinessExecution: directReadinessExecution(),
      // Recovery runs no command; one it ran would fail here rather than
      // starting a process.
      commandExecution: statedCommands(root, []),
      inputs: scenario.inputs(),
    });
    reopened.push(first.service);
    const recovered = await logLines(root, runId);

    // Recovery called no agent.
    expect(agent.sessions.length, 'recovery started a session').toBe(sessionsBefore);

    // The log up to the crash is untouched, and what recovery appended is
    // exactly the row's stated state.
    expect(recovered.slice(0, frozen.length).map(line => line.text)).toEqual(frozen.map(line => line.text));
    const appended = recovered.slice(frozen.length).map(line => line.event);
    expect(appended.filter(event => event.type !== 'session-finished').map(event => event.type), `what recovery appended after ${row.name}`).toEqual(row.appended);
    expectSessionsFinished(frozen.map(line => line.event), appended, recovered.map(line => line.event), row.name);
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
        case 'gate-attempted':
          expect(frozenEvents.some(e => e.type === 'gate-committing' && e.data.gate === data.gate)).toBe(true);
          break;
        case 'scenarios-materialized':
          expect(frozenEvents.some(e => e.type === 'scenarios-materializing')).toBe(true);
          break;
        case 'brief-appended': case 'global-context-rebuilt':
          expect(frozenEvents.some(e => e.type === 'decision-accepted')).toBe(true);
          break;
        case 'session-finished':
          expect(frozenEvents.some(e => e.type === 'session-opened' && e.data.session === data.session)).toBe(true);
          break;
        default:
          break;
      }
    }

    // No work, obligation, decision, brief or effect is in the log twice.
    const identities = recovered.map(line => identityOf(line.event)).filter((identity): identity is string => identity !== null);
    expect(identities.filter((identity, index) => identities.indexOf(identity) !== index), 'duplicated in the log').toEqual([]);

    // One commit per changed attempt, and no gate committed twice.
    const committed = committedGates(git);
    expect(committed.filter((gate, index) => committed.indexOf(gate) !== index), 'a gate committed twice').toEqual([]);
    if (row.commits !== undefined) {
      expect(committedBefore.length, 'the commits the branch held before the restart').toBe(row.commits.before);
      expect(committed.length, 'the commits the branch holds after the restart').toBe(row.commits.after);
    }
    // What the restart asked Git for at the boundary: the commit it made, or
    // the one it found again, and nothing where the row states neither.
    const asked = { made: git.commits().length - askedBefore.made, found: git.recovered().length - askedBefore.found };
    expect(asked, `what the restart after ${row.name} asked Git to do`).toEqual({
      made: row.recovery === 'makes-the-commit' ? 1 : 0,
      found: row.recovery === 'finds-the-commit' ? 1 : 0,
    });
    if (row.recovery === 'makes-the-commit') {
      expect(git.commits().at(-1)).toEqual({ gate: row.at!.gate, commit: row.at!.revision });
    }
    if (row.recovery === 'finds-the-commit') expect(git.recovered()).toEqual([row.at!.gate]);
    git.assertAnswered();
    // Every attempt the log records a commit for is a commit the branch
    // holds, and the attempts name the revisions Git answered with, in order.
    const attempts = recovered.flatMap(line => line.records.flatMap(record => {
      const body = record.body as { schema?: unknown; commit?: unknown } | null;
      return body?.schema === 'ramify-agent.gate-attempt/3' && typeof body.commit === 'string' ? [body.commit] : [];
    }));
    expect(attempts).toEqual(git.commits().flatMap(call => (call.commit === null || call.gate === scenariosCommitName ? [] : [call.commit])));
    // The materialization the log records names the commit Git answered.
    const recorded = recovered.map(line => line.event).find(event => event.type === 'scenarios-materialized');
    const made = git.commits().filter(call => call.gate === scenariosCommitName);
    expect(recorded?.data.commit ?? null).toBe(recorded === undefined ? null : made[0]?.commit ?? null);
    expect(new Set(committed).size).toBe(committed.length);

    // Every record file the log commits is there again, byte for byte, and
    // the run's own record was never touched.
    await expectMaterialized(root, runId, recovered);
    expect(await readFile(join(runDirectory(root, runId), 'job.json'), 'utf8')).toBe(jobRecord);

    // A second restart finds nothing to do.
    const hashes = await fileHashes(runDirectory(root, runId));
    await first.service.close();
    reopened.pop();
    const askedAgain = { made: git.commits().length, found: git.recovered().length };
    const second = await openRuns(root, {
      agent, git, candidates: compositionCandidates(root, scenario), readinessExecution: directReadinessExecution(),
      commandExecution: statedCommands(root, []),
      inputs: scenario.inputs(),
    });
    reopened.push(second.service);
    expect(second.recovery.interrupted).toEqual([]);
    expect(second.recovery.effects).toEqual([]);
    expect(second.recovery.rematerialized).toEqual([]);
    // The second restart makes no commit and looks none up: it performs no
    // external effect at all.
    expect({ made: git.commits().length, found: git.recovered().length }).toEqual(askedAgain);
    expect(committedGates(git)).toEqual(committed);
    expect((await logLines(root, runId)).map(line => line.text)).toEqual(recovered.map(line => line.text));
    expect(await fileHashes(runDirectory(root, runId))).toEqual(hashes);
    expect(agent.sessions.length).toBe(sessionsBefore);
  } finally {
    for (const service of reopened) await service.close();
    await crashed.remove();
  }
}

/**
 * The sessions recovery finished: one `session-finished` for each session the
 * crash left kept, as `run-ended`, and for each opened with no invocation
 * started, as `interrupted`, in the order they were opened and just before
 * the interruption; an interrupted invocation's end finishing its session as
 * `interrupted`; and no session live or suspended afterwards.
 */
function expectSessionsFinished(frozen: readonly RunEvent[], appended: readonly RunEvent[], recovered: readonly RunEvent[], name: string): void {
  const left = [...reduceSessions(frozen).values()];
  const released = appended.filter(event => event.type === 'session-finished').map(event => event.data);
  if (frozen.some(event => ['job-completed', 'job-failed', 'job-stopped', 'job-interrupted'].includes(event.type))) {
    expect(released, `sessions finished after the ended run ${name}`).toEqual([]);
  } else {
    expect(released, `the sessions recovery finished after ${name}`).toEqual(left.flatMap(session =>
      session.state === 'suspended' ? [{ session: session.id, reason: 'run-ended' }]
        : session.state === 'live' && session.awaiting === null ? [{ session: session.id, reason: 'interrupted' }]
          : []));
    const tail = appended.slice(appended.length - 1 - released.length).map(event => event.type);
    expect(tail, `where recovery finished the sessions after ${name}`).toEqual([...released.map(() => 'session-finished'), 'job-interrupted']);
  }
  for (const event of appended) {
    if (event.type !== 'invocation-ended') continue;
    expect(event.data, `the session of the invocation recovery closed after ${name}`).toMatchObject({ kept: false, finished: 'interrupted' });
  }
  const states = [...reduceSessions(recovered).values()].map(session => session.state);
  expect(states.filter(state => state !== 'finished'), `sessions a recovered run still holds after ${name}`).toEqual([]);
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
