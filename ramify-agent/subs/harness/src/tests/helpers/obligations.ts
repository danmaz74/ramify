import { scenarioSourceHash, type ScenarioRecord } from '../../../subs/scenarios/src/records.js';
import type { WorkItem } from '../../work/records.js';
import {
  obligationsOf, type ObligationContext, type ObligationEventLine, type ObligationRegisteredData, type ObligationReportedData,
} from '../../work/obligations.js';

/*
 * The smallest run an obligation projection is judged against: two entry
 * work items with a scenario each, an integration scenario combining them
 * whose work item does not exist yet, and one delegated capability task.
 */

export const submissionHash = (letter: string): string => letter.repeat(64);

export function scenarioRecord(id: string, entry: string | null, extra: Partial<ScenarioRecord> = {}): ScenarioRecord {
  const source = [`Scenario: ${id}`, '  Then it holds'];
  return {
    schema: 'ramify-agent.scenario/1', id, kind: entry === null ? 'integration' : 'entry', entry, owner: 'shop',
    origin: { kind: 'architect', refs: [] }, partOf: null, subScenarios: [], name: id, source,
    hash: scenarioSourceHash(source), file: 'src/tests/features/p/shop.feature', ...extra,
  };
}

export function workItem(id: string, origin: WorkItem['origin']): WorkItem {
  return {
    schema: 'ramify-agent.work-item/1', id, module: 'shop', origin, goal: `Carry out ${id}.`,
    requirementRefs: [], acceptanceRefs: [], contextRefs: [], startedFor: null,
  };
}

let sequence = 100;
export function line(type: string, data: unknown): ObligationEventLine {
  sequence += 1;
  return { type, sequence, at: '2026-10-07T12:00:00.000Z', data };
}
export const registered = (data: ObligationRegisteredData): ObligationEventLine => line('obligation-registered', data);
export const reported = (data: ObligationReportedData): ObligationEventLine => line('obligation-reported', data);

export const fixtureScenarios = [
  scenarioRecord('sc-001', 'send-email', { partOf: 'sc-003' }),
  scenarioRecord('sc-002', 'keep-history', { partOf: 'sc-003' }),
  scenarioRecord('sc-003', null, { subScenarios: ['sc-001', 'sc-002'] }),
];
export const fixtureWorkItems = [workItem('wi-001', { entry: 'send-email' }), workItem('wi-002', { entry: 'keep-history' })];
export const delegated = line('capability-delegated', { task: 'cap-001', request: 'need-001', parent: 'wi-001', invocation: 'inv-0004', planRevision: 1 });

/** The fixture projection with these further events. */
export function fixtureProjection(events: readonly ObligationEventLine[] = []) {
  return obligationsOf({ scenarios: fixtureScenarios, workItems: fixtureWorkItems, events: [delegated, ...events] });
}

/** wi-001's local architect, judging against the fixture projection. */
export function localContext(events: readonly ObligationEventLine[] = [], id = 'wi-001'): ObligationContext {
  return { actor: { kind: 'work-item', id }, projection: fixtureProjection(events) };
}

/** cap-001's capability architect, whose current plan has these use cases. */
export function capabilityContext(events: readonly ObligationEventLine[] = [], useCases: readonly string[] = ['need-001.ex01', 'derived-retry']): ObligationContext {
  return { actor: { kind: 'capability-task', id: 'cap-001', useCases: new Set(useCases) }, projection: fixtureProjection(events) };
}
