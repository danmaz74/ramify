// Diagnosis only: all workflow state is synthetic; filesystem access uses a temporary directory.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const install = process.argv[2] ?? '/usr/local/lib/node_modules/cucumber-viz';
const base = path.join(install, 'dist/domain-sub-apps/implementation-studio/core');
const { createProductionSanctionedSealedWriteIntegration } = await import(pathToFileURL(path.join(base, 'runtime/sealed-files/production-sanctioned-sealed-write-integration.js')));
const { validateAttemptForWorkflowState } = await import(pathToFileURL(path.join(base, 'runtime/work-units/index.js')));
const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cucumber-publication-repro-'));
try {
  const state = {
    workflowId: 'diagnosis', manifest: null,
    iterationsDir: path.join(projectRoot, 'docs/plans/demo/iterations'),
    currentAttemptByWorkUnit: { 'iteration:3:draft': 'attempt-demo' },
    attempts: { 'attempt-demo': { workflowId: 'diagnosis', workUnitId: 'iteration:3:draft', attemptId: 'attempt-demo', status: 'running' } },
  };
  const integration = createProductionSanctionedSealedWriteIntegration({
    projectRoot,
    stateStore: { loadAndValidateSnapshot: async () => ({ supported: true, state }), readJournal: async () => [] },
    artifactStore: { getWorkflowDir: id => path.join(projectRoot, '.cucumber-viz/workflows', id), readPublicationState: async () => null },
    checkFindingStore: {},
  });
  const { bindingId } = await integration.createWorkflowMcpSessionBinding({ workflowId: 'diagnosis', attemptId: 'attempt-demo', iterationIndex: 3, workingDirectory: projectRoot });
  const resolver = integration.workflowSessionBindingResolver;
  assert.equal((await resolver.resolveActiveBinding(bindingId)).ok, true);
  console.log('running attempt: production bound MCP validator accepts');

  state.attempts['attempt-demo'].status = 'completed';
  const rejected = await resolver.resolveActiveBinding(bindingId);
  assert.equal(rejected.code, 'STALE_ATTEMPT');
  console.log('same current attempt after completion:', JSON.stringify(rejected));

  const serviceValidation = validateAttemptForWorkflowState(state, 'iteration:3:draft', 'attempt-demo');
  assert.equal(serviceValidation.ok, true);
  console.log('same completed attempt: publication service identity validator accepts');
  assert.equal(await resolver.resolveActiveBinding(bindingId), null);
  console.log('repeat bound MCP lookup: binding has been deleted');

  state.currentAttemptByWorkUnit['iteration:3:draft'] = 'attempt-new';
  assert.equal(validateAttemptForWorkflowState(state, 'iteration:3:draft', 'attempt-demo').ok, false);
  console.log('superseded attempt: publication service identity validator rejects');
} finally {
  await fs.rm(projectRoot, { recursive: true, force: true });
}
