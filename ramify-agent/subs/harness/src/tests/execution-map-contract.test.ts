import { describe, expect, it } from 'vitest';
import {
  executionCapabilityDetailSchema, executionMapPageSchema, executionMapQuerySchema,
  executionScenarioDetailSchema,
} from '../interfaces/protocol/execution-map.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import {
  executionMapFixtureCapabilityDetail as capabilityDetail, executionMapFixtureIdentity as ids,
  executionMapFixturePage as page, executionMapFixtureScenarioDetail as scenarioDetail,
  executionMapFixtureScript as script, executionMapRunningGateFixturePage as runningGatePage,
} from './helpers/execution-map-fixture.js';

const clone = () => structuredClone(page);

describe('execution-map/1 contract', () => {
  it('accepts the structured two-root/provider/repair fixture with independent gate and audit outcomes', () => {
    expect(executionMapPageSchema.parse(page)).toEqual(page);
    expect(page.nodes.filter(node => node.kind === 'capability' && node.level === 'entry').map(node => node.key)).toEqual(ids.roots);
    expect(page.nodes.filter(node => node.kind === 'capability' && node.key === ids.sharedProvider)).toHaveLength(1);
    expect(page.links.filter(link => link.kind === 'provider-for')).toHaveLength(2);
    const failed = page.nodes.find(node => node.key === ids.failedGate);
    const repaired = page.nodes.find(node => node.key === ids.repairedGate);
    expect(failed).toMatchObject({ verdict: 'failed', audit: 'passed', repairRound: 0 });
    expect(repaired).toMatchObject({ verdict: 'passed', audit: 'incomplete', repairRound: 1 });
    expect(script.capturedWriterChanges.some(change => change.binary)).toBe(true);
    expect(script.capturedWriterChanges.some(change => change.module === null)).toBe(true);
    expect(script.capturedWriterChanges.some(change => change.coverage === 'partial')).toBe(true);
    expect(script.sessionInvocations.filter(invocation => invocation.session === 'ses-local-status').map(invocation => invocation.action))
      .toEqual(['outline', 'assess-failure', 'resume']);
    expect(script.events.map(event => event.sequence)).toEqual([9, 13, 24, 27, 34, 37, 39, 40]);
  });

  it('represents a running gate without inventing a verdict', () => {
    expect(executionMapPageSchema.parse(runningGatePage)).toEqual(runningGatePage);
    const running = structuredClone(runningGatePage);
    const gate = running.nodes[0]!;
    if (gate.kind !== 'gate') throw new Error('Running gate fixture missing');
    gate.verdict = 'not-verified';
    expect(executionMapPageSchema.safeParse(running).success).toBe(false);
    const settled = clone();
    const settledGate = settled.nodes.find(node => node.key === ids.failedGate)!;
    if (settledGate.kind !== 'gate') throw new Error('Settled gate fixture missing');
    settledGate.verdict = null;
    expect(executionMapPageSchema.safeParse(settled).success).toBe(false);
  });

  it('requires compact gate subject and evidence, iteration scope, and session reach', () => {
    const gate = clone();
    const gateNode = gate.nodes.find(node => node.key === ids.failedGate)!;
    if (gateNode.kind !== 'gate') throw new Error('Gate fixture missing');
    expect(gateNode).toMatchObject({ subject: { workItem: 'wi-status' }, evidencePresent: true });
    delete (gateNode as Partial<typeof gateNode>).subject;
    expect(executionMapPageSchema.safeParse(gate).success).toBe(false);

    const iteration = clone();
    const iterationNode = iteration.nodes.find(node => node.kind === 'iteration')!;
    if (iterationNode.kind !== 'iteration') throw new Error('Iteration fixture missing');
    delete (iterationNode as Partial<typeof iterationNode>).scopeExceptions;
    expect(executionMapPageSchema.safeParse(iteration).success).toBe(false);

    const session = clone();
    const sessionNode = session.nodes.find(node => node.kind === 'session')!;
    if (sessionNode.kind !== 'session') throw new Error('Session fixture missing');
    delete (sessionNode as Partial<typeof sessionNode>).reach;
    expect(executionMapPageSchema.safeParse(session).success).toBe(false);
  });

  it('rejects duplicate keys and link IDs', () => {
    const duplicateNode = clone();
    duplicateNode.nodes.push(duplicateNode.nodes[0]!);
    duplicateNode.coverage.nodes.shown++;
    duplicateNode.coverage.nodes.total++;
    expect(executionMapPageSchema.safeParse(duplicateNode).success).toBe(false);

    const duplicateLink = clone();
    duplicateLink.links.push(duplicateLink.links[0]!);
    duplicateLink.coverage.links.shown++;
    duplicateLink.coverage.links.total++;
    expect(executionMapPageSchema.safeParse(duplicateLink).success).toBe(false);
  });

  it('requires explicit coverage for an endpoint absent from this page', () => {
    const missing = clone();
    missing.links[0]!.to = { coverage: 'shown', key: 'work-item:lost' };
    expect(executionMapPageSchema.safeParse(missing).success).toBe(false);

    const offPage = clone();
    offPage.links[0]!.to = { coverage: 'other-page', key: 'work-item:wi-unplaced' };
    expect(executionMapPageSchema.safeParse(offPage).success).toBe(false); // present node cannot claim other page
    offPage.nodes.splice(offPage.nodes.findIndex(node => node.key === 'work-item:wi-unplaced'), 1);
    offPage.coverage.nodes.shown--;
    offPage.links[0]!.to = { coverage: 'other-page', key: 'work-item:wi-unplaced' };
    expect(executionMapPageSchema.safeParse(offPage).success).toBe(true);
    offPage.links[0]!.to = { coverage: 'unresolved', key: 'work-item:lost', reason: 'Record is not retained.' };
    expect(executionMapPageSchema.safeParse(offPage).success).toBe(true);
  });

  it('rejects mixed versions, over-limit pages and inconsistent coverage', () => {
    const mixed = clone();
    mixed.nodes[0]!.runVersion = ids.previousVersion;
    expect(executionMapPageSchema.safeParse(mixed).success).toBe(false);
    const overLimit = clone();
    const template = overLimit.nodes.find(node => node.key === 'capability:status-badge')!;
    overLimit.nodes = Array.from({ length: 101 }, (_, index) => ({ ...template, key: `capability:extra-${index}` }));
    overLimit.coverage.nodes = { shown: 101, total: 101 };
    expect(executionMapPageSchema.safeParse(overLimit).success).toBe(false);
    expect(executionMapQuerySchema.safeParse({ version: 42, limit: 101 }).success).toBe(false);
    const absent = clone();
    absent.coverage.nodes.shown--;
    expect(executionMapPageSchema.safeParse(absent).success).toBe(false);
  });

  it('keeps partial records and an unavailable tree explicit', () => {
    const partial = clone();
    partial.tree = { status: 'unavailable', message: 'Architect view is not materialized.' };
    partial.moduleMap.tree = partial.tree;
    partial.moduleMap.modules = [];
    partial.coverage.modules.shown = 1;
    partial.coverage.gaps = ['line-events/1 for inv-repair is partial'];
    const capability = partial.nodes.find(node => node.key === 'capability:status-badge')!;
    if (capability.kind !== 'capability') throw new Error('Fixture capability missing');
    capability.directRequirements.coverage = { state: 'partial', known: 1, total: null, gaps: ['Later requirement records unavailable'] };
    expect(executionMapPageSchema.safeParse(partial).success).toBe(true);
    capability.directRequirements.coverage = { state: 'complete', known: 0, total: 0 };
    expect(executionMapPageSchema.safeParse(partial).success).toBe(false);
    const mismatchedTree = clone();
    mismatchedTree.moduleMap.tree = { status: 'unavailable', message: 'Different view.' };
    expect(executionMapPageSchema.safeParse(mismatchedTree).success).toBe(false);
  });

  it('requires current-revision verification and known scenario/requirement counts', () => {
    const reopened = clone();
    const requirement = reopened.nodes.find(node => node.kind === 'requirement' && node.key === 'requirement:req-status');
    if (!requirement || requirement.kind !== 'requirement') throw new Error('Fixture requirement missing');
    requirement.state = 'verified';
    expect(executionMapPageSchema.safeParse(reopened).success).toBe(false);
    const counts = clone();
    const capability = counts.nodes.find(node => node.key === 'capability:status-badge')!;
    if (capability.kind !== 'capability') throw new Error('Fixture capability missing');
    capability.scenarios.passed = 0;
    expect(executionMapPageSchema.safeParse(counts).success).toBe(false);
  });

  it('keeps capability identity exact and current activity kind-specific', () => {
    const invalidSlug = clone();
    const capability = invalidSlug.nodes.find(node => node.key === 'capability:status-badge')!;
    capability.key = 'capability:StatusBadge';
    expect(executionMapPageSchema.safeParse(invalidSlug).success).toBe(false);
    const wrongActivity = clone();
    wrongActivity.current.awaitedSession = 'gate:ga-006';
    expect(executionMapPageSchema.safeParse(wrongActivity).success).toBe(false);
  });

  it('bounds complete details and preserves explicit unavailable detail', () => {
    expect(executionCapabilityDetailSchema.parse(capabilityDetail)).toEqual(capabilityDetail);
    expect(executionScenarioDetailSchema.parse(scenarioDetail)).toEqual(scenarioDetail);
    const record = { kind: 'analysis-entry', id: 'status-badge', sequence: 2, revision: null };
    expect(executionCapabilityDetailSchema.safeParse({ schema: 'execution-map/1', runVersion: 42,
      key: 'capability:status-badge', detail: { state: 'available', level: 'entry', description: 'Full entry description.', source: record } }).success).toBe(true);
    expect(executionScenarioDetailSchema.safeParse({ schema: 'execution-map/1', runVersion: 42,
      key: 'scenario:sc-status', detail: { state: 'available', name: 'Renders the status badge',
        source: ['Scenario: Renders the status badge', '  Given a valid status', '  Then the badge is visible'], record } }).success).toBe(true);
    expect(executionScenarioDetailSchema.safeParse({ schema: 'execution-map/1', runVersion: 42,
      key: 'scenario:sc-missing', detail: { state: 'unavailable', reason: 'Frozen source was not retained.' } }).success).toBe(true);
    expect(executionScenarioDetailSchema.safeParse({ schema: 'execution-map/1', runVersion: 42,
      key: 'scenario:sc-missing', detail: { state: 'available', name: 'Missing', source: [], record } }).success).toBe(false);
  });

  it('names version-bound URLs and the existing explicit stale-version error', () => {
    expect(protocolPaths.runExecutionMap('p', 'r 1', 42, 'cursor/1', 50))
      .toBe('/api/v1/plans/p/runs/r%201/execution-map?version=42&cursor=cursor%2F1&limit=50');
    expect(protocolPaths.runExecutionCapability('p', 'r', 'status-badge', 42)).toContain('/execution-map/capabilities/status-badge?version=42');
    expect(protocolPaths.runExecutionScenario('p', 'r', 'sc-status', 42)).toContain('/execution-map/scenarios/sc-status?version=42');
    expect(errorResponseSchema.safeParse({ error: { code: 'stale-version', message: 'Run advanced.', currentVersion: 43 } }).success).toBe(true);
  });
});
