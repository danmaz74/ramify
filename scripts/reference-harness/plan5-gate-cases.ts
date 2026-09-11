import { join } from 'node:path';
import { plan5Instances } from './plan5-instances.js';
import { recordObservation } from './observations.js';
import { readReviewedPlan5, repositoryRoot, validateInstancePointers, validateInstanceRecords } from './plan.js';
import { verifyInstances } from './runner.js';
import type { HarnessRuntime, InstanceHandler } from './runner.js';

const handlers = new Map<string, InstanceHandler>();
const workRoot = join(repositoryRoot, '.reference-work');
const target = 'I5-02:required-membership';

handlers.set(target, { kind: 'memory', run: ({ assertions }) => {
  const plan = readReviewedPlan5();
  assertions.equal('independent reviewed leaf count', plan.members.length, 103);
  assertions.equal('all 103 executable records present', plan5Instances.length, 103);
  assertions.equal('every reviewed field transcribed', validateInstanceRecords(plan5Instances, plan), []);
  assertions.equal('all pointers resolve', validateInstancePointers(plan5Instances), []);
  assertions.equal('fourteen independent matrix groups', new Set(plan5Instances.map(item => item.matrixId)).size, 14);
  assertions.equal('review iteration have no matrix instances',
    plan5Instances.filter(item => item.iteration === 1), []);
} });

// These H controls only prove gate behavior. They never stand in for an engine,
// context, socket or process provider and are never registered in the runtime.
function controls(): Map<string, InstanceHandler> {
  return new Map(plan5Instances.filter(item => item.iteration === 2).map(item => [item.id, {
    kind: 'memory', run: ({ instance, assertions }) => {
      assertions.equal('H copied-record assertion control observes its own evidence kind', instance.evidenceKind, instance.matrixId === 'I5-02' ? 'unit' : 'api');
    },
  }]));
}

for (const sabotage of ['removed-record', 'failing-assertion'] as const) {
  handlers.set(`I5-02:${sabotage}-fails`, { kind: 'memory', run: async ({ assertions }) => {
    for (const iteration of [undefined, 2]) {
      const mode = iteration === undefined ? 'full' : 'iteration';
      const providers = controls();
      const runtime: HarnessRuntime = { capabilities: new Set(['engine', 'harness-gate']), handlers: providers };
      const run = (records = plan5Instances, selected = runtime) => verifyInstances({
        plan: readReviewedPlan5(), records, runtime: selected, iteration, workRoot,
      });
      const control = await run();
      assertions.equal(`${mode}: ten unsabotaged H controls pass`, control.summary.passed, 10);
      assertions.equal(`${mode}: only the intermediate H control is complete`, control.passed, iteration === 2);
      let records = plan5Instances;
      if (sabotage === 'removed-record') records = records.filter(item => item.id !== target);
      else providers.set(target, { kind: 'memory', run: ({ assertions: checks }) => {
        checks.equal('injected failed expectation', 'denied', 'allowed');
      } });
      const broken = await run(records);
      const result = broken.instances.find(item => item.id === target)!;
      assertions.equal(`${mode}: sabotage fails both completion flags`, [broken.passed, broken.planComplete], [false, false]);
      assertions.equal(`${mode}: deleted or failing slot is still required`, result.required, true);
      assertions.equal(`${mode}: all 103 slots retained`, broken.instances.length, 103);
      assertions.equal(`${mode}: exact failure retained`, [result.status, result.reason], sabotage === 'removed-record'
        ? ['not-executed', 'missing-record'] : ['failed', 'assertion-failed']);
      if (sabotage === 'removed-record') assertions.ok(`${mode}: removed record remains an inventory error`, broken.inventoryIssues.includes(`Missing reviewed instance: ${target}`));
      else assertions.equal(`${mode}: failing assertion retained in report`, result.assertions.map(item => [item.name, item.status]), [['injected failed expectation', 'failed']]);
      recordObservation('plan5-gate-sabotage', { mode, sabotage, summary: broken.summary, result, inventoryIssues: broken.inventoryIssues });
      // A registered capability cannot hide an absent handler or an empty run.
      for (const fault of ['missing-capability', 'missing-handler', 'unrun-assertion'] as const) {
        const missing = controls();
        if (fault === 'missing-handler') missing.delete(target);
        if (fault === 'unrun-assertion') missing.set(target, { kind: 'memory', run: () => {} });
        const failed = await run(plan5Instances, { capabilities: new Set(fault === 'missing-capability' ? [] : ['engine', 'harness-gate']), handlers: missing });
        assertions.equal(`${mode}: ${fault} fails gate`, failed.passed, false);
        assertions.equal(`${mode}: ${fault} is explicit`, failed.instances.find(item => item.id === target)?.reason, fault);
      }
    }
  } });
}

handlers.set('I5-02:iteration-filter', { kind: 'memory', run: async ({ assertions }) => {
  for (const [iteration, expected, count] of [[4, [2, 4], 18], [9, [2, 3, 4, 5, 6, 7, 8, 9], 74]] as const) {
    const report = await verifyInstances({ plan: readReviewedPlan5(), records: plan5Instances,
      runtime: { capabilities: new Set(), handlers: new Map() }, iteration, workRoot });
    assertions.equal(`${iteration}: exact implementing iterations`, [...new Set(report.instances.filter(item => item.required).map(item => item.iteration))].sort((a, b) => a - b), expected);
    assertions.equal(`${iteration}: exact prerequisite closure includes review and owner tests`, report.requiredIterations, [1, ...expected]);
    assertions.equal(`${iteration}: independent required count`, report.summary.required, count);
    assertions.equal(`${iteration}: every later instance is explicitly not executed`, report.instances.filter(item => !item.required).map(item => [item.status, item.reason]), Array.from({ length: 103 - count }, () => ['not-executed', 'future-iteration']));
    assertions.equal(`${iteration}: unavailable requirements fail gate`, report.passed, false);
    recordObservation('plan5-iteration-filter', { iteration, summary: report.summary, requiredIterations: report.requiredIterations });
  }
} });

export const plan5GateHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
