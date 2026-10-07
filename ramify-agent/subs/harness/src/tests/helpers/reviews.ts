import { readFile } from 'node:fs/promises';
import type { ScriptedAgent, ScriptedAgentOptions, ScriptStep } from '../../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../../subs/agent/src/interfaces/port.js';
import type { RunEvent } from '../../run/log.js';
import type { ReviewPolicy, RunPolicy } from '../../run/records.js';
import type { RunWrite } from '../../run/service.js';
import type { CheckExecutionPort } from '../../checks/execution.js';
import { reviewLayout, type ReviewAttempt } from '../../reviews/records.js';
import { analysis, entry, requestCompletion } from './analysis.js';
import { scriptedCandidates, testReviewPolicy, type ScriptedCandidates, type ScriptedCommit } from './candidates.js';
import { copyFixture } from './fixture.js';
import { gateGit, scenariosCommit, type GateCommit } from './gate-git.js';
import { addModule, assign, byRole, byWork, outline, submit, treeInputs } from './iterations.js';
import { installTestRunner, openRuns, runEventsOnDisk, runPath, startRun, testPolicy } from './runs.js';

/*
 * One reviewed work item for the review tests: three iterations of the
 * notes module, each closing accepted on its own audited candidate, a
 * completion request, and the reviewers each request's prompt selects. Git
 * answers the gates and the candidates from scripts; no process starts.
 */

export const plan = 'review-notes';
export const notes = 'collection-review/workspace/reviews/notes';
export const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
export const store = `${notesDirectory}/src/store.ts`;
export const limit = `${notesDirectory}/src/limit.ts`;
export const escape = `${notesDirectory}/src/escape`;
export const base = 'revision-00';
export const materialized = 'scenarios-00';
/** Exact Git tree identity of the third, final reviewed candidate. */
export const finalReviewTree = 'c'.repeat(40);
/** A commit boundary where Git reports the tree unchanged. */
export const unchanged: GateCommit = { commit: null };
/** What Git answers the three iteration gates. */
export const revisionGates: readonly GateCommit[] = [
  { commit: 'revision-01', changes: [{ status: 'A', path: store }] },
  { commit: 'revision-02', changes: [{ status: 'A', path: limit }] },
  { commit: 'revision-03', changes: [{ status: 'M', path: store }, { status: 'A', path: `${notesDirectory}/src/index.ts` }] },
];

export async function reviewTarget(cleanups: Array<() => Promise<void>>) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 500;\n',
    'src/tests/notes.test.ts': 'import { test, expect } from \'vitest\';\nimport { noteLimit } from \'../notes.ts\';\n\ntest(\'the note limit\', () => {\n  expect(noteLimit).toBe(500);\n});\n',
  });
  await installTestRunner(fixture.root);
  return fixture.root;
}

/** The three candidates: the store, then the limit, then a changed store. */
export function candidates(): Record<string, ScriptedCommit> {
  const common = { [`${notesDirectory}/src/notes.ts`]: 'export const noteLimit = 500;\n', [escape]: { symlink: '../../../../../../../etc/passwd' } };
  return {
    'revision-01': { tree: 'tree-01', base: materialized, changes: [{ status: 'A', path: store }],
      files: { ...common, [store]: 'export export const store = new Map(); // v1\n' } },
    'revision-02': { tree: 'tree-02', base: 'revision-01', changes: [{ status: 'A', path: limit }],
      files: { ...common, [store]: 'export export const store = new Map(); // v1\n', [limit]: 'export export const limit = (text: string) => text.length <= 50;\n' } },
    'revision-03': { tree: finalReviewTree, base: 'revision-02', changes: [{ status: 'M', path: store }, { status: 'A', path: `${notesDirectory}/src/index.ts` }],
      files: { ...common, [store]: 'export export const store = new Map(); // v3\n', [limit]: 'export export const limit = (text: string) => text.length <= 50;\n', [`${notesDirectory}/src/index.ts`]: 'export * from \'./store.js\';\n' } },
  };
}

export const tool = (name: string, input: unknown): ScriptStep => ({ kind: 'tool', tool: name, input });

/** A deferred a script step can wait on and a test can settle. */
export function gate() {
  let open!: () => void;
  const opened = new Promise<void>(resolve => { open = resolve; });
  return { opened, open };
}

export interface ReviewRun {
  readonly reviewers: Readonly<Record<string, readonly ScriptStep[]>>;
  readonly engineer: ReadonlyArray<readonly ScriptStep[]>;
  readonly policy?: Partial<ReviewPolicy>;
  /** Given the scripted candidates before the run starts, for a scenario that changes their answers mid-run. */
  readonly candidates?: (source: ScriptedCandidates) => void;
  /** The run's `afterWrite` hook, where a scenario freezes it as a crash would. */
  readonly afterWrite?: (write: RunWrite, runId: string) => Promise<void>;
  /** Returns once the run is started, without waiting for its end: for a scenario that stops or crashes it. */
  readonly detached?: boolean;
  /** Stop bound of the service, for a scenario whose reader ignores its stop. */
  readonly stopGraceMs?: number;
  /** How the gates' checks run; passing and immediate by default. */
  readonly checkExecution?: CheckExecutionPort;
  /** The audited candidates Git answers for, in place of {@link candidates}. */
  readonly commits?: Record<string, ScriptedCommit>;
  /** What the scripted fake declares, such as a fork it lacks. */
  readonly agentOptions?: ScriptedAgentOptions;
  /** Given the scripted fake once the service is open, before the run starts. */
  readonly agentReady?: (agent: ScriptedAgent) => void;
  /** The local architect's turns in place of the three assignments and the completion request. */
  readonly architect?: ReadonlyArray<readonly ScriptStep[]>;
  /** The run's `now`, for a scenario that moves the clock. */
  readonly now?: () => Date;
  /**
   * The local architect's reconciliation forks, by reconciliation ID
   * (`wi-001.rc01`), or `<id>#<n>` for the nth start of one. A fork with none
   * scripted ends without a submission.
   */
  readonly reconcilers?: Readonly<Record<string, readonly ScriptStep[]>>;
  /** What Git answers at each commit boundary after the scenarios' commit, in place of the three revisions and two unchanged trees. */
  readonly gates?: readonly GateCommit[];
  /** Exact number of final candidate tree previews this scenario reaches. */
  readonly previewCount?: number;
  /** Run limits beside the test policy's, such as the reconciliation rounds. */
  readonly limits?: Partial<RunPolicy['limits']>;
  /**
   * Every role's turns by work item, as `byWork` takes them (`engineer:wi-002`),
   * in place of the one work item's analysis, architect and engineers: for a
   * scenario of several work items. `reviewers` and `reconcilers` still apply.
   */
  readonly roles?: Parameters<typeof byWork>[0];
}

/**
 * The scripted agent's answer to each session of a reviewed run: a
 * reconciliation fork by its reconciliation, a reviewer by its request and
 * start, and every other role from `roles` by work item, or from the one
 * work item's analysis, architect and engineers.
 */
export function reviewScript(scenario: Pick<ReviewRun, 'reviewers' | 'engineer' | 'architect' | 'reconcilers' | 'roles'>): (spec: SessionSpec) => readonly ScriptStep[] {
  const roles = (scenario.roles === undefined
    ? byRole({
      'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
      'local-architect': scenario.architect?.map(turn => [...turn]) ?? [
        submit(assign(notes, { goal: 'Add the note store.' }, outline())),
        submit(assign(notes, { goal: 'State the note limit.' })),
        submit(assign(notes, { goal: 'Export the store.' })),
        submit(requestCompletion()),
      ],
      engineer: scenario.engineer.map(turn => [...turn]),
    })
    : byWork(scenario.roles)) as (spec: SessionSpec) => readonly ScriptStep[];
  const reconcilerStarts = new Map<string, number>();
  const reviewerStarts = new Map<string, number>();
  return (spec: SessionSpec): readonly ScriptStep[] => {
    const reconciliation = /^# Reconciliation (\S+)/u.exec(spec.prompt)?.[1];
    if (spec.role === 'local-architect' && reconciliation !== undefined) {
      const starts = (reconcilerStarts.get(reconciliation) ?? 0) + 1;
      reconcilerStarts.set(reconciliation, starts);
      return scenario.reconcilers?.[`${reconciliation}#${starts}`] ?? scenario.reconcilers?.[reconciliation] ?? [{ kind: 'end', message: `no reconciliation scripted for ${reconciliation}` }];
    }
    if (spec.role !== 'reviewer') return roles(spec);
    // A design orientation is scripted as `orientation`, by the order it started in.
    const request = spec.prompt.startsWith('Design orientation.')
      ? 'orientation'
      : /(?:Code|Scope|Design) review (rq-\d{4})/u.exec(spec.prompt)?.[1] ?? 'unknown';
    const attempts = reviewerStarts.get(request) ?? 0;
    reviewerStarts.set(request, attempts + 1);
    return scenario.reviewers[`${request}#${attempts + 1}`] ?? scenario.reviewers[request] ?? [{ kind: 'end', message: `no review scripted for ${request}` }];
  };
}

/** Drives one work item of three iterations with the reviewers each request's prompt selects, to the run's end. */
export async function reviewRun(root: string, cleanups: Array<() => Promise<void>>, scenario: ReviewRun) {
  const gates = scenario.gates ?? [...revisionGates, unchanged, unchanged];
  const scripted = scenario.commits ?? candidates();
  const beforeFinal = gates.slice(0, -1).reduce((head, gate) => gate.commit ?? head, materialized);
  const afterFinal = gates.at(-1)?.commit ?? beforeFinal;
  const tree = scripted[beforeFinal]?.tree;
  const previewCount = scenario.previewCount ?? 4;
  if (previewCount > 0 && (tree === undefined || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(tree))) {
    throw new Error(`Review run must state a valid final candidate tree for ${beforeFinal}`);
  }
  const git = gateGit(root, {
    head: base,
    commits: [
      scenariosCommit(plan, materialized, base),
      ...gates,
    ],
    previews: Array.from({ length: previewCount }, (_, index) => ({ repositoryRoot: root,
      head: index === previewCount - 1 && previewCount >= 4 ? afterFinal : beforeFinal, tree: tree! })),
  });
  const source = scriptedCandidates(root, scripted);
  scenario.candidates?.(source);
  const script = reviewScript(scenario);
  const opened = await openRuns(root, {
    script,
    inputs: treeInputs(),
    git: git.git,
    candidates: source,

    policy: projectRoot => {
      const policy = testPolicy(projectRoot, { reviews: testReviewPolicy(scenario.policy) });
      return { ...policy, limits: { ...policy.limits, ...scenario.limits } };
    },
    ...(scenario.afterWrite === undefined ? {} : { afterWrite: scenario.afterWrite }),
    ...(scenario.stopGraceMs === undefined ? {} : { stopGraceMs: scenario.stopGraceMs }),
    ...(scenario.checkExecution === undefined ? {} : { checkExecution: scenario.checkExecution }),
    ...(scenario.agentOptions === undefined ? {} : { agentOptions: scenario.agentOptions }),
    ...(scenario.now === undefined ? {} : { now: scenario.now }),
  });
  if (opened.agent !== undefined) scenario.agentReady?.(opened.agent);
  if (scenario.detached !== true) cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  if (scenario.detached === true) return { ...opened, runId: receipt.jobId, git, source, events: [] as RunEvent[] };
  await opened.service.settled(plan, receipt.jobId);
  const events = await runEventsOnDisk(root, plan, receipt.jobId);
  return { ...opened, runId: receipt.jobId, git, source, events };
}

export const eventsOf = <T extends RunEvent['type']>(events: readonly RunEvent[], type: T) =>
  events.filter((event): event is Extract<RunEvent, { type: T }> => event.type === type);

export async function attemptRecord(root: string, runId: string, attempt: string): Promise<ReviewAttempt> {
  return JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.attempt(attempt)), 'utf8')) as ReviewAttempt;
}
