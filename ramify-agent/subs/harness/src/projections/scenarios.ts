import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import {
  runQueryLimits,
  type AnalysisScenario, type GateScenarioResultView, type ObligationView, type ScenarioGateResult, type ScenarioListResponse, type ScenarioOriginView,
  type ScenarioView, type ScenarioWarningView,
} from '../interfaces/protocol/runs.js';
import type { GateAttempt } from '../checks/records.js';
import { scenarioResultsOf } from '../checks/scenario-results.js';
import { trackedScenarios, type TrackedScenarios } from '../run/feature-files.js';
import { capabilityOf } from '../work/frontier.js';
import { integrationScenarioOf } from '../work/records.js';
import { obligationsOf } from '../work/obligations.js';
import type { RunView } from './inputs.js';

/*
 * The acceptance scenarios of a run, as a client reads them: the review's
 * frozen text with the warnings the acceptance recorded, the scenario list
 * with each scenario's state and the gates whose audit ran it, and the
 * compact form of those results that a gate attempt shows.
 *
 * The records and states are replayed from the log as the harness replays
 * them; a gate's status for a scenario is read from the raw runner output
 * its audit published, never inferred from its verdict, and is shown beside
 * the state, never folded into it.
 */

/** The tracked scenarios of the run: every record in the order it was committed, with its current state. */
export function scenariosOf(view: RunView): TrackedScenarios {
  return trackedScenarios(view.entries);
}

function originOf(record: ScenarioRecord): ScenarioOriginView {
  return record.origin.kind === 'plan'
    ? { kind: 'plan', planScenario: record.origin.planScenario, lines: [record.origin.ref.lines[0], record.origin.ref.lines[1]] }
    : { kind: 'architect', refs: [...record.origin.refs] };
}

/** Every scenario as the accepted analysis froze it, with its text, and the warnings `analysis-accepted` recorded. */
export function analysisScenariosOf(view: RunView): { scenarios: AnalysisScenario[]; warnings: ScenarioWarningView[] } {
  const scenarios = scenariosOf(view).records.map(record => ({
    id: record.id,
    kind: record.kind,
    entry: record.entry,
    owner: record.owner,
    origin: originOf(record),
    partOf: record.partOf,
    subScenarios: [...record.subScenarios],
    name: record.name,
    source: [...record.source],
    file: record.file,
  }));
  const accepted = view.events.find(event => event.type === 'analysis-accepted');
  const warnings = accepted?.type === 'analysis-accepted'
    ? accepted.data.warnings.map(warning => ({ kind: warning.kind, scenarios: [...warning.scenarios], message: warning.message }))
    : [];
  return { scenarios, warnings };
}

/** The tracked scenarios a gate's audit ran, in compact form: statuses and failures, without bindings. */
export function gateScenarioViewsOf(gate: GateAttempt): GateScenarioResultView[] {
  return scenarioResultsOf(gate).map(result => ({
    id: result.id,
    check: result.check,
    command: result.command,
    status: result.status,
    file: result.file,
    line: result.line,
    failure: result.failure === null ? null : { ...result.failure },
    undefined: [...result.undefined],
  }));
}

/** Every gate attempt whose audit ran each tracked scenario, in the order the attempts were first committed. */
export function gatesByScenario(view: RunView): Map<string, ScenarioGateResult[]> {
  const byScenario = new Map<string, ScenarioGateResult[]>();
  for (const { body: gate } of view.gates.values()) {
    for (const result of scenarioResultsOf(gate)) {
      const list = byScenario.get(result.id) ?? [];
      list.push({
        gate: gate.id,
        checkpoint: gate.checkpoint,
        subject: { ...gate.subject },
        verdict: gate.verdict,
        check: result.check,
        command: result.command,
        status: result.status,
        failure: result.failure === null ? null : { ...result.failure },
        undefined: [...result.undefined],
      });
      byScenario.set(result.id, list);
    }
  }
  return byScenario;
}

/** Every tracked scenario, at most 500, with its state, origin, work item, owner, file and gates. */
export function scenarioListOf(view: RunView): ScenarioListResponse {
  const tracked = scenariosOf(view);
  const gates = gatesByScenario(view);
  const entryItem = new Map<string, string>();
  const integrationItem = new Map<string, string>();
  for (const item of view.records.workItems) {
    const entry = capabilityOf(item);
    if (entry !== null && !entryItem.has(entry)) entryItem.set(entry, item.id);
    const scenario = integrationScenarioOf(item);
    if (scenario !== null && !integrationItem.has(scenario)) integrationItem.set(scenario, item.id);
  }

  const all: ScenarioView[] = tracked.records.map(record => {
    const state = tracked.states.get(record.id) ?? 'pending';
    return {
      id: record.id,
      kind: record.kind,
      name: record.name,
      state,
      origin: originOf(record),
      entry: record.entry,
      partOf: record.partOf,
      subScenarios: [...record.subScenarios],
      workItem: (record.entry === null ? integrationItem.get(record.id) : entryItem.get(record.entry)) ?? null,
      owner: record.owner,
      file: record.file,
      gates: gates.get(record.id) ?? [],
    };
  });
  return { scenarios: all.slice(0, runQueryLimits.scenarios), total: all.length, obligations: obligationViewsOf(view, tracked) };
}

/** Every registered obligation, folded from the records and accepted submissions exactly as the harness folds them. */
export function obligationViewsOf(view: RunView, tracked: TrackedScenarios = scenariosOf(view)): ObligationView[] {
  const { obligations } = obligationsOf({ scenarios: tracked.records, workItems: view.records.workItems, events: view.events });
  return [...obligations.values()].slice(0, runQueryLimits.obligations).map(obligation => ({
    id: obligation.id,
    kind: obligation.kind,
    responsible: { ...obligation.responsible },
    status: obligation.status,
    revision: obligation.revision,
    case: obligation.case,
    description: obligation.description,
    registeredBy: obligation.registeredBy === null ? null : { invocation: obligation.registeredBy.by, submission: obligation.registeredBy.submission },
    binding: obligation.binding === null ? null : {
      fakes: [...obligation.binding.fakes], invocation: obligation.binding.by, submission: obligation.binding.submission,
      sequence: obligation.binding.sequence, at: obligation.binding.at,
    },
    report: obligation.report === null ? null : {
      judgment: obligation.report.judgment, revision: obligation.report.revision, basedOnRevision: obligation.report.basedOnRevision,
      where: obligation.report.where, invocation: obligation.report.by, submission: obligation.report.submission,
      sequence: obligation.report.sequence, at: obligation.report.at,
    },
  }));
}

/** Each entry's scenarios: how many its architect reported done of how many it has. */
export function entryScenarioCounts(view: RunView): Map<string, { done: number; total: number }> {
  const tracked = scenariosOf(view);
  const counts = new Map<string, { done: number; total: number }>();
  for (const record of tracked.records) {
    if (record.entry === null) continue;
    const count = counts.get(record.entry) ?? { done: 0, total: 0 };
    count.total += 1;
    if (tracked.states.get(record.id) === 'done') count.done += 1;
    counts.set(record.entry, count);
  }
  return counts;
}
