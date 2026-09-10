import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const install = resolvePath(process.argv[2] ?? '/usr/local/lib/node_modules/cucumber-viz');
const load = relative => import(pathToFileURL(join(install, relative)).href);
const { createSealedFilesService } = await load('dist/core/shared/services/sealed-files/index.js');
const { createProductionSanctionedSealedWriteIntegration } = await load('dist/domain-sub-apps/implementation-studio/core/runtime/sealed-files/production-sanctioned-sealed-write-integration.js');
const { iterationMachine } = await load('dist/domain-sub-apps/implementation-studio/core/machines/iteration.machine.js');
const { createActor, fromPromise } = await load('node_modules/xstate/dist/xstate.esm.js');

// Uses production discovery, binding resolution and machine code. Only workflow
// persistence and agent operations are faked; no running workflow is contacted.
const root = await mkdtemp(join(tmpdir(), 'cucumber-viz-frame-repro-'));
try {
  await writeFile(join(root, 'cucumber-viz.constraints.json'), JSON.stringify({
    version: 1, inactiveGlobs: ['**/.reference-work/**'], rules: [],
  }));
  await writeFile(join(root, 'cucumber-viz.constraints.json.seal'), '{}');
  await writeFile(join(root, '.gitignore'), '.reference-work/\n');
  const state = {
    currentAttemptByWorkUnit: { 'iteration:14:draft': 'attempt-repro' },
    attempts: { 'attempt-repro': { status: 'running' } },
  };
  const integration = createProductionSanctionedSealedWriteIntegration({
    projectRoot: root,
    stateStore: { loadAndValidateSnapshot: async () => ({ supported: true, state }) },
    artifactStore: { getWorkflowDir: id => join(root, '.cucumber-viz', 'workflows', id) },
    checkFindingStore: {},
  });
  const input = {
    workflowId: 'workflow-repro', attemptId: 'attempt-repro',
    iterationIndex: 14, workingDirectory: root,
  };
  const { bindingId } = await integration.createWorkflowMcpSessionBinding(input);
  const resolve = () => integration.workflowSessionBindingResolver.resolveActiveBinding(bindingId);
  assert.equal((await resolve()).ok, true);
  const fixture = join(root, '.reference-work', 'run-test', 'project');
  await mkdir(fixture, { recursive: true });
  for (const name of ['cucumber-viz.constraints.json', 'cucumber-viz.constraints.json.seal']) {
    await copyFile(join(root, name), join(fixture, name));
  }
  const index = await createSealedFilesService({ repoRoot: root }).buildIndex();
  assert.equal(index.fileSidecars.length, 2);
  const firstFailure = await resolve();
  assert.equal(firstFailure.code, 'FRAME_MISMATCH');
  assert.equal(await resolve(), null);
  await rm(join(root, '.reference-work'), { recursive: true });
  assert.equal(await resolve(), null);
  // Explicit rebinding works, but the existing repair path never does it.
  const replacement = await integration.createWorkflowMcpSessionBinding(input);
  assert.equal((await integration.workflowSessionBindingResolver.resolveActiveBinding(replacement.bindingId)).ok, true);
  console.log(JSON.stringify({
    binding: 'PASS', copiedSealIndexedDespiteInactiveGlob: true,
    firstFailure: firstFailure.code, subsequentResolution: null,
    fixtureCleanupRestoresOldBinding: false, explicitRebindingWorks: true,
  }));
} finally {
  await rm(root, { recursive: true, force: true });
}

let repairTurns = 0;
const machine = iterationMachine.provide({
  actions: { broadcastUpdate: () => {} },
  actors: {
    startAgentSession: fromPromise(async () => ({ sessionId: 'session-repro' })),
    waitForCompletion: fromPromise(async () => {}),
    validateOutput: fromPromise(async () => { throw new Error('iteration14-results.md not found'); }),
    // A completed agent turn that reports STALE_ATTEMPT still resolves normally
    // in handleSendFixPrompt: it waits for terminal status, not successful writes.
    sendFixPrompt: fromPromise(async () => { repairTurns++; }),
  },
});
const actor = createActor(machine, { input: {
  iterationIndex: 14, chatKey: 'repro',
  pipelineConfig: { simplify: false, iterationChecks: { deterministic: true, agentic: true, constraints: true } },
  checkRegistrySnapshot: { version: 1, checks: [] },
  hasHooks: false, hasPreRemediationHooks: false, startedAt: new Date().toISOString(),
} });
await new Promise((resolve, reject) => {
  actor.subscribe({
    error: reject,
    next: snapshot => {
      if (repairTurns >= 1100 && snapshot.value === 'validate_output') {
        const result = {
          machine: 'PASS', repairTurns,
          outputValidationAttempts: snapshot.context.outputValidationAttempts,
          state: snapshot.value, status: snapshot.status, error: snapshot.context.error,
          stoppedBy: 'reproduction harness after 1100 completed repairs',
        };
        actor.stop();
        assert.equal(result.status, 'active');
        assert.equal(result.error, null);
        assert.equal(result.outputValidationAttempts, 1100);
        console.log(JSON.stringify(result));
        resolve();
      }
    },
  });
  actor.start();
});
