import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { z } from 'zod';
import { decideCheckFindingChange } from '../../subs/check-findings/src/decide.js';
import { applyCheckFindingEvent } from '../../subs/check-findings/src/replay.js';
import {
  checkFindingIdSchema, checkFindingRejectionCodeSchema,
  type CheckFindingCommand, type CheckFindingEntry, type CheckFindingEvent, type CheckFindingEvidence, type CheckFindingObligation,
  type CheckFindingOwner, type CheckFindingState, type CheckFindingWitness,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import { scenarioIdSchema } from '../../subs/scenarios/src/records.js';
import { canonicalJson } from '../jobs/commands.js';
import { reportCommand } from '../check-findings/report.js';
import { maximumCarriedEvents } from '../check-findings/records.js';
import type { GateAttempt, GateCommandRecord, ScenarioCheckResult, ScenarioCheckSummary } from './records.js';

/*
 * The scenario-check producer adapter (Plan 12 iteration 6, appendix §7): the
 * one integration that turns a gate's scenario results into CheckFinding
 * evidence. It reads only committed gate attempts and the tracked scenario
 * records, and binds every trusted field itself; no agent text reaches it.
 *
 * A failed tracked scenario stays on its gate attempt, where the immediate
 * repair path already answers it. It is promoted only when it needs
 * continuity across attempts: the same scenario failed an earlier gate of
 * the same work item as well, or a CheckFinding for it already exists. The
 * promotion then reports each of those failures, oldest first, so the
 * CheckFinding holds the history and its credibility is reproduced.
 *
 * A passing gate is the witness. For each open scenario CheckFinding of its
 * work item that the gate's scenario check observed, it offers a witness of
 * the same scenario, on the audited tree being accepted, with the coverage
 * and outcome the message stream established; the child decides whether
 * that fixes it. Nothing here reads a process exit alone, and a scenario the
 * gate did not observe is never a witness. The gate's verdict is decided
 * before any of this and is never read back from it.
 *
 * The project's own scenarios are counted on the attempt and never
 * identified; a dry run proves no execution; readiness and the final gate
 * have no work item to own a CheckFinding. None of them is promoted.
 */

/** The producer every scenario report and witness names. */
export const scenarioProducer = 'check:scenario';

/** A scenario's issue key and obligation subject. */
export const scenarioSubject = (scenario: string): string => `scenario:${scenario}`;

/**
 * The obligation a tracked scenario is verified against. Scenario records
 * are immutable once written, so every scenario is at its first revision;
 * only an authorized `revise-obligation` decision moves a CheckFinding to
 * another one, and a witness of revision 1 does not verify that.
 */
export const scenarioObligation = (scenario: string): CheckFindingObligation => ({ subject: scenarioSubject(scenario), revision: 1 });

/** The most failures of one scenario one promotion reports: the latest, oldest first. */
export const maximumPromotedFailures = 10;

/** A tracked scenario as the adapter reads its record. */
export interface ScenarioFacts {
  readonly id: string;
  /** The owner module's declared-name path. */
  readonly owner: string;
  /** The project-relative feature file its record names. */
  readonly file: string;
}

/** Which scenarios one module's run selected beside the observed one. */
export type ScenarioBreadth =
  | { readonly kind: 'identity'; readonly scenarios: readonly string[] }
  | { readonly kind: 'all-untagged' }
  | { readonly kind: 'all' };

/** What one gate attempt's scenario check established about one tracked scenario. */
export interface ScenarioObservation {
  readonly scenario: string;
  readonly gate: string;
  /**
   * The conditions it ran under, which a witness must share with the
   * failure: `<mode>/<run module>@<hash of the mode's command>`. The
   * captured support files, setup and teardown are the run's configuration
   * and the same for every gate of it.
   */
  readonly selection: string;
  /** What else the same run selected; a witness run must be at least as broad as the failure's. */
  readonly breadth: ScenarioBreadth;
  /**
   * `complete`: the stream holds every pickle and step of it; `partial`:
   * some did not finish, or no step ran; `not-run`: it was selected and has
   * no result.
   */
  readonly coverage: 'complete' | 'partial' | 'not-run';
  /** `failed` only for a failure a finished step observed; a gap is `inconclusive`. */
  readonly outcome: 'passed' | 'failed' | 'inconclusive';
  /** The feature file and line the stream named; null when it has no result. */
  readonly file: string | null;
  readonly line: number | null;
  /** The module whose run it was selected in. */
  readonly run: string;
  /** The stream the result was read from, relative to the gate's output directory; null when it has no result. */
  readonly messages: string | null;
  /** One line: its status and failing step, or why it has no result. */
  readonly detail: string;
}

/**
 * Every tracked scenario one gate attempt's scenario check executed or
 * selected by identity. A dry run executed nothing and is left out, as is a
 * scenario of an `all` or `all-untagged` run with no result: nothing says it
 * was selected. The project's own scenarios are only counted on the attempt.
 */
export function scenarioObservations(attempt: GateAttempt, tracked: readonly ScenarioFacts[]): ScenarioObservation[] {
  const command = attempt.commands.find(entry => entry.kind === 'scenarios' && entry.scenarios !== undefined);
  const summary = command?.scenarios;
  if (command === undefined || summary === undefined || summary.dryRun) return [];
  const facts = new Map(tracked.map(scenario => [scenario.id, scenario]));
  const observations: ScenarioObservation[] = [];
  const observed = new Set<string>();
  for (const result of summary.scenarios) {
    if (!facts.has(result.id) || observed.has(result.id)) continue;
    observed.add(result.id);
    const run = summary.runs.find(entry => entry.module === result.run);
    observations.push({
      scenario: result.id,
      gate: attempt.id,
      selection: selectionOf(summary, command, result.run),
      breadth: breadthOf(summary, result.run, facts),
      ...resultCoverage(result),
      file: result.file,
      line: result.line,
      run: result.run,
      messages: run?.messages ?? null,
      detail: resultDetail(result),
    });
  }
  if (summary.selection.kind === 'identity') {
    for (const id of summary.selection.scenarios) {
      const fact = facts.get(id);
      if (fact === undefined || observed.has(id)) continue;
      observed.add(id);
      const run = summary.runs.find(entry => entry.module === fact.owner);
      observations.push({
        scenario: id,
        gate: attempt.id,
        selection: selectionOf(summary, command, fact.owner),
        breadth: breadthOf(summary, fact.owner, facts),
        coverage: 'not-run',
        outcome: 'inconclusive',
        file: null,
        line: null,
        run: fact.owner,
        messages: null,
        detail: notRunDetail(command, run === undefined ? undefined : run.exit),
      });
    }
  }
  return observations.sort((a, b) => a.scenario.localeCompare(b.scenario, 'en', { numeric: true }));
}

function selectionOf(summary: ScenarioCheckSummary, command: GateCommandRecord, module: string): string {
  const hash = createHash('sha256').update(canonicalJson(command.command.argv)).digest('hex').slice(0, 16);
  return `${summary.mode}/${module}@${hash}`;
}

function breadthOf(summary: ScenarioCheckSummary, module: string, facts: ReadonlyMap<string, ScenarioFacts>): ScenarioBreadth {
  if (summary.selection.kind !== 'identity') return { kind: summary.selection.kind };
  return { kind: 'identity', scenarios: summary.selection.scenarios.filter(id => facts.get(id)?.owner === module) };
}

const failing: ReadonlySet<string> = new Set(['failed', 'undefined', 'pending', 'ambiguous']);

function resultCoverage(result: ScenarioCheckResult): Pick<ScenarioObservation, 'coverage' | 'outcome'> {
  if (result.unfinished !== undefined) {
    // The stream does not hold the whole scenario. What a finished step
    // observed failing is a failure; anything else is an execution gap.
    return { coverage: 'partial', outcome: failing.has(result.unfinished.observed) ? 'failed' : 'inconclusive' };
  }
  if (result.status === 'passed') return { coverage: 'complete', outcome: 'passed' };
  // In an executing run a scenario whose worst step is skipped ran no assertion.
  if (result.status === 'skipped') return { coverage: 'partial', outcome: 'inconclusive' };
  return { coverage: 'complete', outcome: 'failed' };
}

function resultDetail(result: ScenarioCheckResult): string {
  const gap = result.unfinished === undefined ? '' : `; the stream holds no result for ${result.unfinished.steps} step(s) and ${result.unfinished.pickles} pickle(s)`;
  if (result.failure === undefined) return `${result.status}${gap}`;
  return `${result.status} at "${result.failure.step}": ${firstLine(result.failure.message)}${gap}`;
}

function notRunDetail(command: GateCommandRecord, exit: number | null | undefined): string {
  if (command.notVerified !== undefined) return `selected and not executed: the scenario check was not verified (${command.notVerified})`;
  if (exit === undefined) return 'selected and not executed: its module had no run';
  if (exit === null) return 'selected and not executed: its run did not complete';
  return 'selected and not executed: the run\'s stream holds no result for it';
}

function firstLine(text: string): string {
  return (text.split('\n').find(line => line.trim() !== '') ?? '').trim().slice(0, 500);
}

/** Whether a run of breadth `witness` selected at least what the run of breadth `failure` did. */
export function coversBreadth(witness: ScenarioBreadth, failure: ScenarioBreadth): boolean {
  if (witness.kind === 'all') return true;
  if (witness.kind === 'all-untagged') return failure.kind !== 'all';
  return failure.kind === 'identity' && failure.scenarios.every(id => witness.scenarios.includes(id));
}

// Classification.

/** What a sequence of attempts of one scenario on one source says. */
export const scenarioClassificationSchema = z.enum(['reproduced', 'intermittent', 'inconclusive']);
export type ScenarioClassification = z.infer<typeof scenarioClassificationSchema>;

/**
 * The classification of the attempts of one scenario on one source
 * (architecture, Factual checks and flaky tests): `intermittent` needs a
 * failure and at least two complete passes, and is always provisional;
 * `reproduced` two failures and no pass; anything else, a timeout or a
 * runner error among them, is `inconclusive`. It classifies; it never fixes
 * a CheckFinding and never passes a gate.
 */
export function classifyScenarioAttempts(outcomes: readonly ScenarioObservation['outcome'][]): {
  readonly classification: ScenarioClassification;
  readonly provisional: boolean;
  readonly passed: number;
  readonly failed: number;
  readonly inconclusive: number;
} {
  const count = (outcome: ScenarioObservation['outcome']) => outcomes.filter(entry => entry === outcome).length;
  const passed = count('passed');
  const failed = count('failed');
  const inconclusive = count('inconclusive');
  const classification: ScenarioClassification = failed >= 1 && passed >= 2 ? 'intermittent' : failed >= 2 && passed === 0 ? 'reproduced' : 'inconclusive';
  return { classification, provisional: classification === 'intermittent', passed, failed, inconclusive };
}

// What a gate commits.

/**
 * Why one scenario's CheckFinding part was left out of a gate's line: the
 * child's refusal of a report or witness, `obligation-changed` where the
 * adapter cannot attest that the frozen scenario ran, or `event-bound` where
 * the line had no room. A witness refused as `failure-source` carries the
 * classification of the attempts on that source.
 */
export const scenarioFindingNoteSchema = z.object({
  scenario: scenarioIdSchema,
  checkFinding: checkFindingIdSchema.nullable(),
  step: z.enum(['promotion', 'witness']),
  code: z.union([checkFindingRejectionCodeSchema, z.enum(['event-bound', 'source-unavailable'])]),
  /** Only a pass on the failure's tree is classified, so never `reproduced`. */
  classification: scenarioClassificationSchema.exclude(['reproduced']).optional(),
}).strict();
export type ScenarioFindingNote = z.infer<typeof scenarioFindingNoteSchema>;

/**
 * The CheckFinding part of a gate's line when it is not simply its events:
 * why the whole part was refused, with the attempt committed all the same,
 * and each scenario left out. Absent when there is nothing to say.
 */
export const gateCheckFindingOutcomeSchema = z.object({
  /**
   * `source-unavailable`: an audited tree the part needs could not be read;
   * `transition-refused`: the transition refused what the plan had decided,
   * which its message names and which no plan should reach.
   */
  refused: z.object({
    reason: z.enum(['source-unavailable', 'transition-refused']),
    message: z.string(),
  }).strict().nullable(),
  notes: z.array(scenarioFindingNoteSchema).max(maximumCarriedEvents),
}).strict();
export type GateCheckFindingOutcome = z.infer<typeof gateCheckFindingOutcomeSchema>;

/** One gate attempt as the adapter needs it: its observations, and the tree it audited where one was read. */
export interface ObservedGate {
  readonly gate: string;
  readonly tree: string | null;
  readonly observations: readonly ScenarioObservation[];
  /** The gate record's path and its output directory, under the run directory. */
  readonly record: string;
  readonly output: string;
}

/**
 * What a gate's completion decides from: the attempt, its work item, the
 * tracked scenarios it observed, and every earlier committed gate attempt
 * of the work item, oldest first. Read before the run mutex is taken; the
 * gate records it names are immutable.
 */
export interface ScenarioGateInputs {
  readonly workItem: string;
  readonly verdict: GateAttempt['verdict'];
  /** Feature files whose change the attempt's guarded comparison reported, authorized or not. */
  readonly changedFiles: readonly string[];
  readonly current: ObservedGate & { readonly tree: string };
  readonly earlier: readonly ObservedGate[];
  readonly tracked: readonly ScenarioFacts[];
}

/** The commands a gate's line carries, and what was left out. */
export interface ScenarioFindingPlan {
  readonly commands: readonly CheckFindingCommand[];
  readonly notes: readonly ScenarioFindingNote[];
}

/**
 * Plans the CheckFinding part of one gate's line against the state as it
 * stands under the run mutex. Every command is decided here in order, as
 * the transition will decide it again, so a refusal leaves out that
 * scenario only, as a note, and never the attempt or another scenario.
 */
export function planScenarioFindings(state: CheckFindingState, inputs: ScenarioGateInputs): ScenarioFindingPlan {
  const owner: CheckFindingOwner = { kind: 'work-item', workItem: inputs.workItem };
  const facts = new Map(inputs.tracked.map(scenario => [scenario.id, scenario]));
  const commands: CheckFindingCommand[] = [];
  const notes: ScenarioFindingNote[] = [];
  let current = state;
  let events = 0;

  /** Decides one scenario's commands together; all of them go into the line, or none. */
  const attempt = (scenario: string, checkFinding: string | null, step: ScenarioFindingNote['step'], batch: readonly CheckFindingCommand[], extra: Partial<ScenarioFindingNote> = {}): void => {
    let next = current;
    const decided: CheckFindingEvent[] = [];
    for (const command of batch) {
      const change = decideCheckFindingChange(next, command);
      if (!change.ok) {
        notes.push({ scenario, checkFinding, step, code: change.rejection.code, ...extra });
        return;
      }
      for (const event of change.events) {
        const applied = applyCheckFindingEvent(next, event);
        if (!applied.ok) throw new Error(`The CheckFinding child returned an event it cannot apply: ${applied.rejection.message}`);
        next = applied.state;
      }
      decided.push(...change.events);
    }
    if (events + decided.length > maximumCarriedEvents) {
      notes.push({ scenario, checkFinding, step, code: 'event-bound' });
      return;
    }
    events += decided.length;
    commands.push(...batch);
    current = next;
  };

  if (inputs.verdict !== 'passed') {
    for (const observation of inputs.current.observations) {
      if (observation.outcome !== 'failed') continue;
      const fact = facts.get(observation.scenario);
      if (fact === undefined) continue;
      const held = holderOf(current, owner, observation.scenario);
      const earlier = held !== undefined ? [] : inputs.earlier.flatMap(gate => {
        const failure = gate.observations.find(entry => entry.scenario === observation.scenario && entry.outcome === 'failed');
        return failure === undefined ? [] : [{ gate, failure }];
      });
      // A first failure stays on its gate attempt: the immediate repair answers it.
      if (held === undefined && earlier.length === 0) continue;
      const reported = [...earlier.slice(-(maximumPromotedFailures - 1)), { gate: inputs.current, failure: observation }];
      if (reported.some(entry => entry.gate.tree === null)) {
        notes.push({ scenario: observation.scenario, checkFinding: held?.id ?? null, step: 'promotion', code: 'source-unavailable' });
        continue;
      }
      attempt(observation.scenario, held?.id ?? null, 'promotion', reported.map(entry => reportCommand({
        producer: scenarioProducer,
        attempt: entry.gate.gate,
        reportKey: scenarioSubject(observation.scenario),
        owner,
        source: { kind: 'tree', id: entry.gate.tree! },
        issueKey: scenarioSubject(observation.scenario),
        verification: {
          kind: 'check',
          producer: scenarioProducer,
          obligation: scenarioObligation(observation.scenario),
          selection: entry.failure.selection,
          required: true,
        },
        observation: {
          kind: 'check-failed',
          summary: `Scenario ${observation.scenario} failed gate ${entry.gate.gate}: ${entry.failure.detail}`.slice(0, 4000),
          evidence: evidenceOf(entry.gate, entry.failure),
          locations: [{ path: entry.failure.file ?? fact.file, startLine: entry.failure.line, endLine: null }],
        },
        judgment: null,
        suggests: null,
        credibility: 'objective',
        modules: [fact.owner],
      })));
    }
    return { commands, notes };
  }

  // A passing gate: its audited tree is the candidate being accepted.
  const candidate = { kind: 'tree' as const, id: inputs.current.tree };
  for (const entry of [...current.findings.values()].filter(held => held.standing === 'open' && sameOwner(held.owner, owner))) {
    if (entry.verification.kind !== 'check' || entry.verification.producer !== scenarioProducer) continue;
    const scenario = entry.verification.obligation.subject.replace(/^scenario:/u, '');
    const observation = inputs.current.observations.find(held => held.scenario === scenario);
    // Absence from a gate is never a witness.
    if (observation === undefined) continue;
    const fact = facts.get(scenario);
    if (fact === undefined || !frozenScenarioRan(observation, fact, inputs.changedFiles)) {
      notes.push({ scenario, checkFinding: entry.id, step: 'witness', code: 'obligation-changed' });
      continue;
    }
    const failure = latestFailure(entry, inputs.earlier, scenario);
    const narrower = failure === undefined || !coversBreadth(observation.breadth, failure.breadth);
    const witness: CheckFindingWitness = {
      producer: scenarioProducer,
      attempt: inputs.current.gate,
      obligation: scenarioObligation(scenario),
      selection: observation.selection,
      source: candidate,
      // A run narrower than the one that observed the failure covered less than the obligation.
      coverage: narrower && observation.coverage === 'complete' ? 'partial' : observation.coverage,
      outcome: observation.outcome,
      evidence: evidenceOf(inputs.current, observation),
    };
    const extra = failureSourceClassification(entry, inputs, scenario);
    attempt(scenario, entry.id, 'witness', [{
      type: 'dispose',
      checkFinding: entry.id,
      expectedRevision: entry.revision,
      decision: {
        actor: { kind: 'harness', reason: `gate ${inputs.current.gate} passed with ${scenario} in its scenario check` },
        source: candidate,
        rationale: `Gate ${inputs.current.gate} passed on the audited tree ${inputs.current.tree}; its scenario check observed ${scenario}: ${observation.detail}`.slice(0, 4000),
        evidence: witness.evidence,
        communication: { mode: 'quiet' },
        decision: { action: 'fix-by-check', candidate, witness },
      },
    }], extra);
  }
  return { commands, notes };
}

/**
 * The earlier gate attempts whose audited trees a gate's completion needs,
 * or null when it has nothing to promote or witness and needs none, the
 * current one's included. Read before the mutex from the state as it stands;
 * the plan decides again under it, and a tree it lacks is a note.
 */
export function scenarioGatesToRead(
  state: CheckFindingState,
  workItem: string,
  verdict: GateAttempt['verdict'],
  current: readonly ScenarioObservation[],
  earlier: readonly Pick<ObservedGate, 'gate' | 'observations'>[],
): string[] | null {
  const owner: CheckFindingOwner = { kind: 'work-item', workItem };
  if (verdict !== 'passed') {
    const failedEarlier = (scenario: string) => earlier.filter(gate => gate.observations.some(entry => entry.scenario === scenario && entry.outcome === 'failed'));
    const promoted = current.filter(entry => entry.outcome === 'failed')
      .filter(entry => holderOf(state, owner, entry.scenario) !== undefined || failedEarlier(entry.scenario).length > 0);
    if (promoted.length === 0) return null;
    return [...new Set(promoted.flatMap(entry => (holderOf(state, owner, entry.scenario) === undefined ? failedEarlier(entry.scenario).map(gate => gate.gate) : [])))];
  }
  const witnessed = [...state.findings.values()]
    .filter(entry => entry.standing === 'open' && sameOwner(entry.owner, owner) && entry.verification.kind === 'check' && entry.verification.producer === scenarioProducer)
    .map(entry => (entry.verification.kind === 'check' ? entry.verification.obligation.subject.replace(/^scenario:/u, '') : ''))
    .filter(scenario => current.some(entry => entry.scenario === scenario));
  if (witnessed.length === 0) return null;
  // Every attempt that observed one of them, for the classification on the source of its latest failure.
  return earlier.filter(gate => gate.observations.some(entry => witnessed.includes(entry.scenario))).map(gate => gate.gate);
}

/** The CheckFinding of this owner whose issue key names the scenario, if any. */
function holderOf(state: CheckFindingState, owner: CheckFindingOwner, scenario: string): CheckFindingEntry | undefined {
  const key = scenarioSubject(scenario);
  return [...state.findings.values()].find(entry => sameOwner(entry.owner, owner)
    && entry.reports.some(report => report.producer === scenarioProducer && report.issueKey === key));
}

function sameOwner(a: CheckFindingOwner, b: CheckFindingOwner): boolean {
  return a.kind === b.kind && (a.kind === 'run' || (b.kind === 'work-item' && a.workItem === b.workItem));
}

/**
 * Whether the scenario that ran is the frozen one: its result names the
 * feature file its record names, and the attempt's guarded comparison found
 * that file unchanged from the harness's rendering. Otherwise the adapter
 * cannot attest the obligation, and a pass proves nothing about it.
 */
function frozenScenarioRan(observation: ScenarioObservation, fact: ScenarioFacts, changedFiles: readonly string[]): boolean {
  return observation.file === fact.file && !changedFiles.includes(fact.file);
}

/** The observation of the scenario's latest failure this CheckFinding holds, from the gate that reported it. */
function latestFailure(entry: CheckFindingEntry, earlier: readonly ObservedGate[], scenario: string): ScenarioObservation | undefined {
  const report = [...entry.reports].reverse().find(held => held.observation.kind === 'check-failed');
  if (report === undefined) return undefined;
  return earlier.find(gate => gate.gate === report.attempt)?.observations.find(held => held.scenario === scenario);
}

/**
 * Where a witness would pass on the source of the latest failure, the
 * classification of every attempt of the scenario on that source; the
 * child refuses such a witness as `failure-source`.
 */
function failureSourceClassification(entry: CheckFindingEntry, inputs: ScenarioGateInputs, scenario: string): Partial<ScenarioFindingNote> {
  const report = [...entry.reports].reverse().find(held => held.observation.kind === 'check-failed');
  if (report === undefined || report.source.id !== inputs.current.tree) return {};
  const outcomes = [...inputs.earlier, inputs.current]
    .filter(gate => gate.tree === inputs.current.tree)
    .flatMap(gate => gate.observations.filter(held => held.scenario === scenario).map(held => held.outcome));
  const { classification } = classifyScenarioAttempts(outcomes);
  // The current attempt is a pass, so the attempts are never only failures.
  return classification === 'reproduced' ? {} : { classification };
}

function evidenceOf(gate: ObservedGate, observation: ScenarioObservation): CheckFindingEvidence[] {
  return [
    { kind: 'gate-attempt', ref: gate.record, hash: null },
    ...(observation.messages === null ? [] : [{ kind: 'message-stream', ref: posix.join(gate.output, observation.messages), hash: null }]),
  ];
}
