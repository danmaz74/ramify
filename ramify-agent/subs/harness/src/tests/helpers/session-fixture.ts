import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentPort } from '../../../subs/agent/src/interfaces/port.js';
import { extractPlanScenarios } from '../../../subs/scenarios/src/extraction.js';
import { createScriptedAgent, type ScriptedAgent, type ScriptStep } from '../../../subs/agent/src/scripted.js';
import type { CheckExecutionPort } from '../../checks/execution.js';
import { protocolPaths } from '../../interfaces/protocol/paths.js';
import { commandResponseSchema } from '../../interfaces/protocol/jobs.js';
import { runSessionsResponseSchema, type RunSessionView } from '../../interfaces/protocol/sessions.js';
import type { RunServiceOptions } from '../../run/service.js';
import { runLayout } from '../../run/records.js';
import { readTranscript } from '../../transcripts/writer.js';
import { analysis, entry, hypothesis, requestCompletion } from './analysis.js';
import { createPassingCheckExecution } from './direct-check-execution.js';
import { directReadinessExecution, openRunsWithoutProcesses } from './external-tools.js';
import { assign, byRole, completionProposed, outline, read, submit, treeInputs } from './iterations.js';
import { forkDecision, registryChange, requestPlacement } from './placement.js';
import { sharedUi, writeArchitectTreeFixture } from './progress-fixture.js';
import { emptyAnalysis, runPath, startRun, stopRun, testPolicy, until } from './runs.js';
import { declaringScenarios } from './declarations.js';
import { scenariosCommit, scriptedGit, type ScriptedGit } from './scripted-git.js';
import { runSessionScenario } from './session-scenario.js';
import { finalCandidate } from './final-candidate.js';
import { fixtureScratchGit } from './mock-git.js';

/*
 * Sessions in every state, and every lineage relation, for the browser
 * acceptance of the session views. It adds three runs to a copy of the
 * fixture project, each driven by the real run service with the scripted
 * fake:
 *
 * - `lineage` (review-notes, completed): the session scenario, whose
 *   sessions are forked, appended to, continued, requested by a contract
 *   need and, because the executor forgets each engineer session once it
 *   ends, replaced by a reconstruction. It also loses the first local
 *   architect's session after its placement request, so the continuation
 *   that follows degrades to a fresh start.
 * - `interrupted` (reviewer-identity, stopped): an initial architect that
 *   ignores the stop past its grace, so the run ends with the session its log
 *   still says is live.
 * - `live` (status-badge-tone): started by the serving process itself, since
 *   a run is live only while the process that serves it drives it. Its
 *   initial architect is kept for forks, its placement request's global fork
 *   has finished, its local architect is suspended while its engineer works,
 *   and the engineer is live. The engineer is paced: each step a `Pacer`
 *   releases adds entries to its transcript, and `finish` lets it submit, so
 *   the run goes on to complete and every session finishes.
 *
 * Git, Ramify, readiness and the gate's commands are explicit fakes, as in
 * the progress fixture. Nothing here calls a model.
 */

export const sessionPlans = {
  lineage: 'review-notes',
  interrupted: 'reviewer-identity',
  live: 'status-badge-tone',
} as const;

export interface FinishedSessionRuns {
  readonly lineage: { readonly planId: string; readonly runId: string; readonly state: string };
  readonly interrupted: { readonly planId: string; readonly runId: string; readonly state: string };
}

/**
 * Adds the `lineage` and `interrupted` runs to `root`, and the scenario's two
 * modules, then writes the architect tree fixture again so the module
 * diagram draws them.
 */
export async function addSessionRuns(root: string): Promise<FinishedSessionRuns> {
  const lineage = await lineageRun(root);
  const interrupted = await interruptedRun(root);
  await writeArchitectTreeFixture(root);
  return { lineage, interrupted };
}

async function lineageRun(root: string): Promise<FinishedSessionRuns['lineage']> {
  const cleanups: Array<() => Promise<void>> = [];
  let forgetting: ReturnType<typeof setInterval> | undefined;
  const forgotten = new Set<object>();
  try {
    const scenario = await runSessionScenario({
      root,
      cleanup: step => { cleanups.push(step); },
      // The executor can no longer read an engineer session once it ends, so
      // the provider's repair, which asks to continue it, is a reconstruction.
      // It also loses the first local architect's session once its placement
      // request ends, so the continuation after the answer starts fresh.
      port: scripted => {
        forgetting = setInterval(() => {
          const firstArchitect = scripted.sessions.find(session => session.spec.role === 'local-architect');
          for (const session of scripted.sessions) {
            if (session.outcome === undefined) continue;
            if (session.spec.role === 'engineer' || (session === firstArchitect && !forgotten.has(session))) {
              forgotten.add(session);
              scripted.forget(session.ref);
            }
          }
        }, 5);
        return scripted;
      },
    });
    return { planId: sessionPlans.lineage, runId: scenario.runId, state: scenario.service.getRun(sessionPlans.lineage, scenario.runId)?.state ?? 'unknown' };
  } finally {
    clearInterval(forgetting);
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}

async function interruptedRun(root: string): Promise<FinishedSessionRuns['interrupted']> {
  const planId = sessionPlans.interrupted;
  const git = scriptedGit(root, { head: 'session-fixture-interrupted', checkpoints: [] });
  const { service, agent } = await openRunsWithoutProcesses(root, git, {
    inputs: treeInputs(),
    stopGraceMs: 200,
    script: [
      { kind: 'message', text: 'Orienting before the analysis.' },
      { kind: 'stall', ms: 1500, thenIgnoreStop: true },
      { kind: 'submit', input: emptyAnalysis() },
    ],
  });
  try {
    const runId = (await service.execute(startRun(planId))).jobId;
    // The intake is the first session and the initial architect the second.
    await until(async () => agent!.sessions.length === 2
      && (await readTranscript(runPath(root, planId, runId, runLayout.transcript('ses-0002')))).entries.length >= 3);
    await service.execute(stopRun(planId, runId, service.getRun(planId, runId)!.version));
    await service.settled(planId, runId);
    // The session keeps going past the stop and submits late; its output is discarded.
    await until(() => agent!.sessions[1]!.outcome !== undefined);
    return { planId, runId, state: service.getRun(planId, runId)?.state ?? 'unknown' };
  } finally {
    await service.close();
  }
}

/**
 * Releases a paced session one step at a time. Each `step` lets one waiting
 * step of the script go on, or the next one to arrive; `finish` lets every
 * remaining step go on at once and the session submit.
 */
export class Pacer {
  private readonly waiting: Array<() => void> = [];
  private readonly finishing: Array<() => void> = [];
  private credit = 0;
  private finished = false;
  /** How many steps have been released. */
  released = 0;

  constructor(readonly steps: number) {}

  /** What a paced step awaits. */
  next(): Promise<void> {
    if (this.finished) return Promise.resolve();
    if (this.credit > 0) {
      this.credit -= 1;
      return Promise.resolve();
    }
    return new Promise(resolve => this.waiting.push(resolve));
  }

  /** What the step before the submission awaits. */
  end(): Promise<void> {
    return this.finished ? Promise.resolve() : new Promise(resolve => this.finishing.push(resolve));
  }

  /** Releases one step; false once every step has been released. */
  step(): boolean {
    if (this.finished || this.released >= this.steps) return false;
    this.released += 1;
    const waiting = this.waiting.shift();
    if (waiting) waiting();
    else this.credit += 1;
    return true;
  }

  /** Releases every remaining step and the submission. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.released = this.steps;
    for (const resolve of this.waiting.splice(0)) resolve();
    for (const resolve of this.finishing.splice(0)) resolve();
  }

  get done(): boolean {
    return this.finished;
  }
}

const tone = 'badge-tone';
const palette = 'tone-palette';
const badge = 'subs/workspace/subs/shared-ui/src/status-badge.tsx';

/** The paced engineer's steps: an opening read, then `pacer.steps` steps, each a thought and a message or a read. */
function pacedEngineer(pacer: Pacer): ScriptStep[] {
  const steps: ScriptStep[] = [
    {
      kind: 'message', text: 'I will read the badge before I give it a tone.',
      blocks: [{ type: 'thinking', text: 'The plan wants a tone prop and a data-tone attribute; the badge is in the shared UI.', visibility: 'full' }],
    },
    read(badge),
  ];
  for (let index = 1; index <= pacer.steps; index += 1) {
    steps.push({ kind: 'await', until: () => pacer.next() });
    steps.push(index % 3 === 0
      ? read(badge)
      : {
        kind: 'message', text: `Step ${index}: ${index % 3 === 1 ? 'the tone reaches the markup as data-tone.' : 'a badge without a tone reads neutral.'}`,
        blocks: [{ type: 'thinking', text: `Step ${index} of the paced engineer.`, visibility: 'full' }],
        usage: { input: 1000 + index * 10, output: 40, cacheRead: 800, cacheWrite: 0, total: 1840 + index * 10 },
      });
  }
  steps.push({ kind: 'await', until: () => pacer.end() });
  steps.push(...submit(completionProposed('The badge takes a tone and carries it as data-tone; no tone reads neutral.')));
  return steps;
}

/**
 * The live run's script: a placement request, its fork, an iteration and a
 * paced engineer. The entry takes the plan's two scenarios verbatim, and
 * its completion request declares them.
 */
function liveScript(root: string, pacer: Pacer) {
  const { scenarios } = extractPlanScenarios(readFileSync(join(root, 'plans', sessionPlans.live, 'plan.md'), 'utf8'));
  return declaringScenarios(byRole({
    'initial-architect': [submit(analysis(
      [entry(tone, sharedUi, 'Gives the status badge a tone its markup carries.')],
      [hypothesis('tone-legend', { change: 'create', suggestedOwner: sharedUi, dependsOn: [tone] })],
      [],
      scenarios.map((scenario, index) => ({
        key: `badge-tone-${index + 1}`,
        entry: tone,
        origin: { kind: 'plan' as const, planScenario: scenario.id },
        refs: [`${tone}-acceptance`],
        gherkin: scenario.source.join('\n'),
      })),
    ))],
    'local-architect': [
      submit(requestPlacement({
        forCapability: tone,
        question: 'Do the tone names belong to the badge, or to a palette the shared UI keeps?',
        requiredBehavior: 'Four named tones a badge can carry: neutral, positive, warning and critical.',
        candidates: [{ owner: sharedUi, note: 'The badge is the only reader so far.' }],
      })),
      submit(assign(sharedUi, {}, outline({ changes: 'Give the badge a tone prop and carry it as data-tone.' }))),
      submit(requestCompletion()),
    ],
    'global-fork': [submit(forkDecision({
      decision: {
        question: 'Do the tone names belong to the badge, or to a palette the shared UI keeps?',
        outcome: 'create', capability: palette, changesExistingSymbols: false, owner: sharedUi,
        rationale: 'The tones are shared vocabulary of the shared UI, and the badge is their first reader.',
        constraints: [], uncertainties: [], evidence: { citations: [{ module: sharedUi }], gaps: [] },
      },
      registry: [registryChange({
        capability: palette, owner: sharedUi, behavior: 'Names the four badge tones.',
        consumers: [{ capability: tone, workItem: 'wi-001' }],
      })],
      brief: 'tone-palette is new in the shared UI; badge-tone consumes it.',
    }))],
    engineer: [pacedEngineer(pacer)],
  }));
}

/** The server settings that let the serving process drive the live run. */
export interface LiveRunSettings {
  readonly agent: AgentPort;
  readonly runs: Partial<Omit<RunServiceOptions, 'projectRoot' | 'lock' | 'agent' | 'ramify'>>;
  readonly git: ScriptedGit;
  readonly scripted: ScriptedAgent;
}

/** The agent and run settings the server that drives the live run is started with. */
export function liveRunSettings(root: string, pacer: Pacer, checkExecution: CheckExecutionPort = createPassingCheckExecution()): LiveRunSettings {
  const planId = sessionPlans.live;
  const final = finalCandidate(root, `scenarios-of-${planId}`);
  const git = scriptedGit(root, {
    head: 'session-fixture-live',
    previews: final.previews,
    checkpoints: [
      // The run's feature files, committed once readiness has passed.
      scenariosCommit(planId),
      ...['wi-001.i01', 'wi-001', `final verification of plan "${planId}"`].map(subject => ({ subject, commit: null, changes: [] })),
    ],
  });
  const scripted = createScriptedAgent(liveScript(root, pacer));
  return {
    agent: scripted,
    scripted,
    git,
    runs: {
      inputs: treeInputs(),
      git: fixtureScratchGit(git),
      candidates: final.candidates,
      readinessExecution: directReadinessExecution(),
      checkExecution,
      policy: projectRoot => testPolicy(projectRoot),
      stopGraceMs: 500,
      warn: () => undefined,
    },
  };
}

async function sessionsOf(origin: string, planId: string, runId: string): Promise<RunSessionView[]> {
  const response = await fetch(`${origin}${protocolPaths.runSessions(planId, runId)}`);
  return runSessionsResponseSchema.parse(await response.json()).sessions;
}

/**
 * Starts the live run through the server's command endpoint, as the Plan
 * page does, and waits until its engineer is live with its opening entries.
 */
export async function startLiveRun(origin: string, root: string): Promise<{ planId: string; runId: string; engineer: string }> {
  const planId = sessionPlans.live;
  const response = await fetch(`${origin}${protocolPaths.commands}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(startRun(planId, 'scripted', `session-fixture-live-${Date.now()}`)),
  });
  if (response.status !== 202) throw new Error(`The live run was not started: ${response.status} ${await response.text()}`);
  const { receipt: { jobId: runId } } = commandResponseSchema.parse(await response.json());
  let engineer: string | undefined;
  await until(async () => {
    engineer = (await sessionsOf(origin, planId, runId)).find(session => session.role === 'engineer' && session.state === 'live')?.session;
    return engineer !== undefined
      // Its start, the prompt, the opening message, the read and its result.
      && (await readTranscript(runPath(root, planId, runId, runLayout.transcript(engineer)))).entries.length >= 5;
  }, 60_000);
  return { planId, runId, engineer: engineer! };
}
