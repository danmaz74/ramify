import { join } from 'node:path';
import { plan2Instances } from './plan2-instances.js';
import { recordObservation } from './observations.js';
import { readReviewedPlan2, repositoryRoot, validateInstancePointers, validateInstanceRecords } from './plan.js';
import { verifyInstances } from './runner.js';
import type { HarnessRuntime, InstanceHandler } from './runner.js';

const handlers = new Map<string, InstanceHandler>();
const workRoot = join(repositoryRoot, '.reference-work');
const target = 'I2-28:required-membership';

handlers.set(target, { kind: 'memory', run: ({ assertions }) => {
  const plan = readReviewedPlan2();
  assertions.equal('independent reviewed leaf count', plan.members.length, 176);
  assertions.equal('all 176 executable records present', plan2Instances.length, 176);
  assertions.equal('every reviewed field transcribed', validateInstanceRecords(plan2Instances, plan), []);
  assertions.equal('all pointers resolve', validateInstancePointers(plan2Instances), []);
  assertions.equal('thirty independent matrix groups', new Set(plan2Instances.map(item => item.matrixId)).size, 30);
  assertions.equal('review and client owner-test iterations have no matrix instances',
    plan2Instances.filter(item => item.iteration === 1 || item.iteration === 7), []);
} });

// These H controls only prove gate behavior. They never stand in for an engine,
// context, socket or process provider and are never registered in the runtime.
function controls(): Map<string, InstanceHandler> {
  return new Map(plan2Instances.filter(item => item.iteration === 2).map(item => [item.id, {
    kind: 'memory', run: ({ instance, assertions }) => {
      assertions.equal('H assertion control observes its own record', [instance.fixture.code, instance.evidenceKind], ['H', 'unit']);
    },
  }]));
}

for (const sabotage of ['removed-record', 'failing-assertion'] as const) {
  handlers.set(`I2-28:${sabotage}-fails`, { kind: 'memory', run: async ({ assertions }) => {
    for (const iteration of [undefined, 2]) {
      const mode = iteration === undefined ? 'full' : 'iteration';
      const providers = controls();
      const runtime: HarnessRuntime = { capabilities: new Set(['harness-gate']), handlers: providers };
      const run = (records = plan2Instances, selected = runtime) => verifyInstances({
        plan: readReviewedPlan2(), records, runtime: selected, iteration, workRoot,
      });
      const control = await run();
      assertions.equal(`${mode}: four unsabotaged H controls pass`, control.summary.passed, 4);
      assertions.equal(`${mode}: only intermediate control is complete`, control.passed, iteration === 2);
      let records = plan2Instances;
      if (sabotage === 'removed-record') records = records.filter(item => item.id !== target);
      else providers.set(target, { kind: 'memory', run: ({ assertions: checks }) => {
        checks.equal('injected failed expectation', 'denied', 'allowed');
      } });
      const broken = await run(records);
      const result = broken.instances.find(item => item.id === target)!;
      assertions.equal(`${mode}: sabotage fails both completion flags`, [broken.passed, broken.planComplete], [false, false]);
      assertions.equal(`${mode}: deleted or failing slot is still required`, result.required, true);
      assertions.equal(`${mode}: all 176 slots retained`, broken.instances.length, 176);
      assertions.equal(`${mode}: exact failure retained`, [result.status, result.reason], sabotage === 'removed-record'
        ? ['not-executed', 'missing-record'] : ['failed', 'assertion-failed']);
      if (sabotage === 'removed-record') assertions.ok(`${mode}: removed record remains an inventory error`, broken.inventoryIssues.includes(`Missing reviewed instance: ${target}`));
      else assertions.equal(`${mode}: failing assertion retained in report`, result.assertions.map(item => [item.name, item.status]), [['injected failed expectation', 'failed']]);
      recordObservation('plan2-gate-sabotage', { mode, sabotage, summary: broken.summary, result, inventoryIssues: broken.inventoryIssues });
      // A registered capability cannot hide an absent handler or an empty run.
      for (const fault of ['missing-capability', 'missing-handler', 'unrun-assertion'] as const) {
        const missing = controls();
        if (fault === 'missing-handler') missing.delete(target);
        if (fault === 'unrun-assertion') missing.set(target, { kind: 'memory', run: () => {} });
        const failed = await run(plan2Instances, { capabilities: new Set(fault === 'missing-capability' ? [] : ['harness-gate']), handlers: missing });
        assertions.equal(`${mode}: ${fault} fails gate`, failed.passed, false);
        assertions.equal(`${mode}: ${fault} is explicit`, failed.instances.find(item => item.id === target)?.reason, fault);
      }
    }
  } });
}

handlers.set('I2-28:iteration-filter', { kind: 'memory', run: async ({ assertions }) => {
  for (const [iteration, expected, count] of [[5, [2, 3, 4, 5], 64], [9, [2, 3, 4, 5, 6, 8, 9], 134]] as const) {
    const report = await verifyInstances({ plan: readReviewedPlan2(), records: plan2Instances,
      runtime: { capabilities: new Set(), handlers: new Map() }, iteration, workRoot });
    assertions.equal(`${iteration}: exact implementing iterations`, [...new Set(report.instances.filter(item => item.required).map(item => item.iteration))].sort((a, b) => a - b), expected);
    assertions.equal(`${iteration}: exact prerequisite closure includes review and owner tests`, report.requiredIterations, Array.from({ length: iteration }, (_, index) => index + 1));
    assertions.equal(`${iteration}: independent required count`, report.summary.required, count);
    assertions.equal(`${iteration}: every later instance is explicitly not executed`, report.instances.filter(item => !item.required).map(item => [item.status, item.reason]), Array.from({ length: 176 - count }, () => ['not-executed', 'future-iteration']));
    assertions.equal(`${iteration}: unavailable requirements fail gate`, report.passed, false);
    recordObservation('plan2-iteration-filter', { iteration, summary: report.summary, requiredIterations: report.requiredIterations });
  }
} });

export const plan2GateHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
