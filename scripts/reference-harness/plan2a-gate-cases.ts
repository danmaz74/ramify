import { join } from 'node:path';
import { plan2aInstances } from './plan2a-instances.js';
import { recordObservation } from './observations.js';
import { readReviewedPlan2a, repositoryRoot, validateInstancePointers, validateInstanceRecords } from './plan.js';
import { verifyInstances } from './runner.js';
import type { HarnessRuntime, InstanceHandler } from './runner.js';

const handlers = new Map<string, InstanceHandler>();
const workRoot = join(repositoryRoot, '.reference-work');
const target = 'I2A-02:harness-membership';

handlers.set(target, { kind: 'memory', run: ({ assertions }) => {
  const plan = readReviewedPlan2a();
  assertions.equal('independent reviewed leaf count', plan.members.length, 104);
  assertions.equal('all 104 executable records present', plan2aInstances.length, 104);
  assertions.equal('every reviewed field transcribed', validateInstanceRecords(plan2aInstances, plan), []);
  assertions.equal('all pointers resolve', validateInstancePointers(plan2aInstances), []);
  assertions.equal('thirteen independent matrix groups', new Set(plan2aInstances.map(item => item.matrixId)).size, 13);
  assertions.equal('duplicate IDs are rejected', validateInstanceRecords([...plan2aInstances, plan2aInstances[0]!], plan)
    .some(issue => issue.includes('Duplicate instance')), true);
} });

// These H controls only prove gate behavior. They never stand in for an
// inventory, session, quick or process provider and are never registered
// in the runtime.
const expectedEvidence: Readonly<Record<string, string>> = {
  'I2A-01:provider-handoff': 'document', 'I2A-01:scale-baseline': 'measurement',
  'I2A-01:format-token-probe': 'measurement', 'I2A-01:limits-frozen': 'document',
  'I2A-02:harness-membership': 'unit', 'I2A-02:harness-missing-record': 'unit',
  'I2A-02:harness-failing-assertion': 'unit', 'I2A-02:harness-filter': 'unit',
  'I2A-02:ordinary-inventory-excluded': 'api', 'I2A-02:tests-inventory-excluded': 'api',
  'I2A-02:explicit-config-excluded': 'api', 'I2A-02:exposure-rejected': 'api',
  'I2A-02:observer-input-stable': 'session', 'I2A-02:watcher-silent': 'quick',
  'I2A-02:tests-area-not-created': 'api', 'I2A-02:transient-names-excluded': 'api',
};
// The `--iteration 2` closure requires iteration 1 (I2A-01) as a prerequisite
// too, unlike Plan 5's iteration 1 (which registers zero leaves): every H
// control here must cover both iterations for the "intermediate" mode below
// to be completable.
function controls(): Map<string, InstanceHandler> {
  return new Map(plan2aInstances.filter(item => item.iteration <= 2).map(item => [item.id, {
    kind: 'memory', run: ({ instance, assertions }) => {
      assertions.equal('H copied-record assertion control observes its independently expected evidence kind', instance.evidenceKind, expectedEvidence[instance.id]);
    },
  }]));
}

for (const sabotage of ['removed-record', 'failing-assertion'] as const) {
  handlers.set(`I2A-02:harness-${sabotage === 'removed-record' ? 'missing-record' : 'failing-assertion'}`, { kind: 'memory', run: async ({ assertions }) => {
    for (const iteration of [undefined, 2]) {
      const mode = iteration === undefined ? 'full' : 'iteration';
      const providers = controls();
      const runtime: HarnessRuntime = { capabilities: new Set(['isolation', 'provider-review']), handlers: providers };
      const run = (records = plan2aInstances, selected = runtime) => verifyInstances({
        plan: readReviewedPlan2a(), records, runtime: selected, iteration, workRoot,
      });
      const control = await run();
      assertions.equal(`${mode}: sixteen unsabotaged H controls pass`, control.summary.passed, 16);
      assertions.equal(`${mode}: only the intermediate H control is complete`, control.passed, iteration === 2);
      let records = plan2aInstances;
      if (sabotage === 'removed-record') records = records.filter(item => item.id !== target);
      else providers.set(target, { kind: 'memory', run: ({ assertions: checks }) => {
        checks.equal('injected failed expectation', 'denied', 'allowed');
      } });
      const broken = await run(records);
      const result = broken.instances.find(item => item.id === target)!;
      assertions.equal(`${mode}: sabotage fails both completion flags`, [broken.passed, broken.planComplete], [false, false]);
      assertions.equal(`${mode}: deleted or failing slot is still required`, result.required, true);
      assertions.equal(`${mode}: all 104 slots retained`, broken.instances.length, 104);
      assertions.equal(`${mode}: exact failure retained`, [result.status, result.reason], sabotage === 'removed-record'
        ? ['not-executed', 'missing-record'] : ['failed', 'assertion-failed']);
      if (sabotage === 'removed-record') assertions.ok(`${mode}: removed record remains an inventory error`, broken.inventoryIssues.includes(`Missing reviewed instance: ${target}`));
      else assertions.equal(`${mode}: failing assertion retained in report`, result.assertions.map(item => [item.name, item.status]), [['injected failed expectation', 'failed']]);
      recordObservation('plan2a-gate-sabotage', { mode, sabotage, summary: broken.summary, result, inventoryIssues: broken.inventoryIssues });
      // A registered capability cannot hide an absent handler or an empty run.
      for (const fault of ['missing-capability', 'missing-handler', 'unrun-assertion'] as const) {
        const missing = controls();
        if (fault === 'missing-handler') missing.delete(target);
        if (fault === 'unrun-assertion') missing.set(target, { kind: 'memory', run: () => {} });
        const failed = await run(plan2aInstances, { capabilities: new Set(fault === 'missing-capability' ? [] : ['isolation', 'provider-review']), handlers: missing });
        assertions.equal(`${mode}: ${fault} fails gate`, failed.passed, false);
        assertions.equal(`${mode}: ${fault} is explicit`, failed.instances.find(item => item.id === target)?.reason, fault);
      }
    }
  } });
}

handlers.set('I2A-02:harness-filter', { kind: 'memory', run: async ({ assertions }) => {
  for (const [iteration, expected, count] of [[4, [1, 4], 12], [8, [1, 2, 3, 4, 5, 6, 7, 8], 83]] as const) {
    const report = await verifyInstances({ plan: readReviewedPlan2a(), records: plan2aInstances,
      runtime: { capabilities: new Set(), handlers: new Map() }, iteration, workRoot });
    assertions.equal(`${iteration}: exact implementing iterations`, [...new Set(report.instances.filter(item => item.required).map(item => item.iteration))].sort((a, b) => a - b), expected);
    assertions.equal(`${iteration}: exact prerequisite closure`, report.requiredIterations, expected);
    assertions.equal(`${iteration}: independent required count`, report.summary.required, count);
    assertions.equal(`${iteration}: every later instance is explicitly not executed`, report.instances.filter(item => !item.required).map(item => [item.status, item.reason]), Array.from({ length: 104 - count }, () => ['not-executed', 'future-iteration']));
    assertions.equal(`${iteration}: unavailable requirements fail gate`, report.passed, false);
    recordObservation('plan2a-iteration-filter', { iteration, summary: report.summary, requiredIterations: report.requiredIterations });
  }
} });

export const plan2aGateHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
