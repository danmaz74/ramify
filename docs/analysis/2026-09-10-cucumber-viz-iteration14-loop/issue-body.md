An invalidated workflow MCP binding causes an **unbounded missing-output repair loop**. In a real iteration, cucumber-viz launched **1,081 repair turns over 4 hours 10 minutes**, repeatedly asking the same unusable session to write its results and checklist. The workflow remained active without surfacing the cause.

The likely incident trigger was temporary test fixtures containing copied `.seal` sidecars. The scanner includes them in the enclosing workflow's sealed-file index, so adding a fixture invalidates the binding. This trigger and the unlimited retry behavior were both reproduced against the installed production code.

Related: #5 covers final publication after an attempt is marked completed. This issue concerns the earlier output-validation loop while the original attempt was still running. Fixing completed-attempt publication alone would not fix this loop.

**Affected environment**

- cucumber-viz **0.6.3**, installed globally from `npm.braimax.com`; Node **v22.23.2**, Linux devcontainer, Codex execution backend.
- Sequential workflow; `launchAffordances: false`, `simplify: false`, iteration deterministic/agentic/constraint checks enabled.
- Project `/ramify`; workflow `_JG0Ucx92X1f6WqRyuxxC`, Plan 1, iteration 14 “Reference gate”.
- Execution checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`, branch `workflow/iteration-1-project-verifier`.
- Original attempt `attempt_WkjCOzzfjoiXjlROxUBtR`; session `session-1789000845831-cn63wzqb`; initial turn `turn-1789000845831-z4y2tlso`.
- The source paths and line numbers below refer to **the installed 0.6.3 package**. At issue preparation, this GitHub repository's `main` was `44b7f30e0fdfda79ead8363ef4c85c100e36fda0` with package version 0.3.0 and did not contain the affected source paths. Code excerpts, fingerprints and the full reproducer are included below to avoid dependence on unavailable source links or the originating workspace.

**Observed timeline — September 10, 2026, UTC**

| Time | Event |
| --- | --- |
| 00:40:45 | Original iteration 14 attempt and bound session start. |
| 00:49:44–00:52:37 | Four surviving toolkit fixtures acquire copies of `cucumber-viz.constraints.json.seal` beneath `examples/collection-review/.reference-work/`. |
| Before 01:29:22 | Results write fails with `FRAME_MISMATCH`; next read-only publication-status call fails with `STALE_ATTEMPT`. |
| 01:29:22.841–05:39:47.299 | **1,081 missing-output repair turns**, lasting **4h 10m 24.458s**, use the same session. |
| 05:39:18 / 05:39:34 | Results and checklist are written through workflow tools. Contemporaneous stale-session turns show no successful writes; these writes occurred outside that session's repair turns. |
| 05:39:47–05:40:17 | Old-session publication also fails with `STALE_ATTEMPT`. |
| 05:44:21 / 05:44:30 | Workflow stops, then retries with a new attempt and session. |
| 05:47:09 | New attempt's publication succeeds. |
| 05:53:23 | Iteration 14 completes after checks/remediation; iteration 15 starts. |

Counts are from the 1,081 persisted turns whose session ID matches the original session and whose prompt begins `## Create Missing Iteration Deliverables`. They contain **284 MCP tool errors, all `STALE_ATTEMPT`**: 281 `workflow.get_publication_status` calls and three `workflow.write_iteration_results` calls. **800 repair turns make no tool calls** and simply explain the existing blocker. All were treated as completed agent turns.

The initial implementation had completed local work, reported 305/305 required reference instances passing, and recorded 235 harness tests passing before attempting submission. Its implementation commit was `9247480c3b59905edcffe6cc0b87fa0aabed882c`, based on `610b869b3c5c0d8d9ffbc766c1defddcac1e196f` in the Ramify repository. The repeated repair turns occurred before Studio's iteration checks; they were not rerunning those tests. Stop/retry recovered execution without repairing cucumber-viz's implementation.

**Representative persisted evidence**

The initial `workflow.write_iteration_results` call returned:

```json
{
  "ok": false,
  "error": {
    "code": "FRAME_MISMATCH",
    "message": "The workflow worktree or sealed index no longer matches the active frame.",
    "issues": []
  }
}
```

The next `workflow.get_publication_status` call, and subsequent repair calls, returned:

```json
{
  "ok": false,
  "error": {
    "code": "STALE_ATTEMPT",
    "message": "The workflow MCP session binding is unknown or stale.",
    "issues": []
  }
}
```

The recurring prompt requested `iteration14-results.md` and `iteration14-checklist.json`, required workflow MCP writers, and prohibited direct edits. The original execution prompt explicitly told the agent to stop workflow writes on `STALE_ATTEMPT`. A representative completed repair response was:

> Both deliverables remain missing. The last workflow MCP check returned `STALE_ATTEMPT`; restoration requires a refreshed session binding.
>
> No files were edited, committed, or published this turn.

Thus the agent followed its instructions, but the scheduler kept sending the same impossible task.

The existing project configuration already contained `inactiveGlobs: ["docs/plans/**", "docs/analysis/**", "**/.reference-work/**"]`. Explicit seal-sidecar discovery does not use those constraint exclusions. Four preserved fixture sidecars had these timestamps and paths, relative to the execution checkout:

| Timestamp, UTC | Copied sidecar |
| --- | --- |
| 00:49:44.628457 | `examples/collection-review/.reference-work/run-3qBaiH/I1-30:test-discovery/toolkit/project/cucumber-viz.constraints.json.seal` |
| 00:49:46.898435 | `examples/collection-review/.reference-work/run-dHSoIB/I1-30:production-selection/toolkit/project/cucumber-viz.constraints.json.seal` |
| 00:52:35.935779 | `examples/collection-review/.reference-work/run-Xw1pxm/I1-30:test-discovery/toolkit/project/cucumber-viz.constraints.json.seal` |
| 00:52:37.044768 | `examples/collection-review/.reference-work/run-yUmcok/I1-30:production-selection/toolkit/project/cucumber-viz.constraints.json.seal` |

The original in-memory binding and launch-time index were not persisted, so the precise historical digest difference cannot be reconstructed. The copied-sidecar trigger is strongly supported by these files, their timestamps, the initial exact error, unchanged tracked seal/config files, and the isolated reproduction. The unbounded retry and binding deletion are directly established by the transcripts and production code.

**Cause in installed 0.6.3**

Let `I` mean `src/domain-sub-apps/implementation-studio`.

1. **A copied sidecar changes the enclosing session's index.** `src/core/shared/services/sealed-files/marker-discovery.ts:21–54` recursively discovers sidecars using fixed directory exclusions; `.reference-work` is not excluded, and Git ignore rules are not consulted. Constraint `inactiveGlobs` only affect constraint-derived seals. `I/core/runtime/sealed-files/production-sanctioned-sealed-write-integration.ts:419–440` hashes all explicit-sidecar and constraint-seal paths. At lines 268–280, `validateBinding` compares this newly built digest with the launch-time digest and returns `FRAME_MISMATCH` when it changes.

2. **The mismatch permanently removes that binding.** `production-sanctioned-sealed-write-integration.ts:403–413` contains:

   ```ts
   async resolveActiveBinding(bindingId) {
     const session = bindingsById.get(bindingId);
     if (!session) return null;
     const validation = await validateBinding(session, TRANSPORT_BINDING_ATTEMPT_STATUSES);
     if (validation.ok) return { ok: true, callerAuth: session.callerAuth };
     bindingsById.delete(bindingId);
     bindingIdByAttempt.delete(
       `${session.binding.activeAttempt.workflowId}\0${session.binding.activeAttempt.attemptId}`,
     );
     return validation;
   }
   ```

   Later lookups return null, which `src/server/orchestration/mcp-http-endpoints.ts:378–395` exposes as unknown/stale `STALE_ATTEMPT`, before dispatching the requested tool. Removing the copied fixture does not recreate the binding.

3. **Repair resumes the same session and treats turn completion as repair completion.** `I/core/workflow-service/agent-session-handlers.ts:634–716`, `handleSendFixPrompt`, uses `agentChat.addUserPrompt({ sessionId: chatState.sessionId, ... })`, then awaits `handleWaitForCompletion(chatKey)`. It does not renew the workflow binding or propagate the failed MCP write as a typed workflow interruption. A completed agent response reporting the blocker resolves normally.

4. **No guard bounds the resulting cycle.** In `I/core/machines/iteration.machine.ts:1016–1057`, validation errors always enter `validate_output_retry`, and successful completion of the repair turn always returns to `validate_output`. The essential transitions are:

   ```text
   validate_output
     validation fails -> incrementOutputValidationAttempts -> validate_output_retry
   validate_output_retry
     sendFixPrompt completes -> validate_output
   ```

   `outputValidationAttempts` is incremented at line 740 but never limits this loop. These validation-error transitions also do not assign the error to `context.error`. A separate one-shot self-assessment policy does not bound missing/invalid-output repair.

**Self-contained runnable reproduction**

Save the complete script below as `reproduce.mjs`. Point it at an affected cucumber-viz 0.6.3 installation, or the corresponding built checkout, containing both `dist/` and installed dependencies:

```sh
node reproduce.mjs /path/to/cucumber-viz
# For a global installation:
node reproduce.mjs "$(npm root -g)/cucumber-viz"
```

The script was rerun successfully against the affected installation. It imports the production scanner, binding service and XState machine, uses synthetic workflow persistence/agent operations, and creates/removes a disposable directory. It does not launch a model or contact any running workflow. Its `PASS` labels mean the defective behavior was reproduced. The 1,100-turn stop is imposed by the reproducer, not cucumber-viz.

```js
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
```

Actual output on 0.6.3, exit code 0:

```json
{"binding":"PASS","copiedSealIndexedDespiteInactiveGlob":true,"firstFailure":"FRAME_MISMATCH","subsequentResolution":null,"fixtureCleanupRestoresOldBinding":false,"explicitRebindingWorks":true}
{"machine":"PASS","repairTurns":1100,"outputValidationAttempts":1100,"state":"validate_output","status":"active","error":null,"stoppedBy":"reproduction harness after 1100 completed repairs"}
```

The two parts isolate the binding invalidation and the machine's no-progress loop. Real persisted turns establish their combination in this incident; the script does not claim to reproduce a full Codex/MCP transport session.

**Expected behavior and proposed regression coverage**

- Bound structural output-repair attempts, including missing files, empty results and malformed checklists. Exhaustion must preserve the draft and enter an explicit recoverable failure.
- Detect an invalid/revoked workflow binding before another repair turn. Preserve the original cause and use supported recovery to create and attach a valid binding; repeating the same prompt cannot fix transport authorization.
- Define how generated fixture roots and nested project copies participate in the enclosing workflow's seal inventory. Preserve enforcement for actual project seals and validate genuine frame changes through controlled recovery. Constraint `inactiveGlobs` currently do not exclude explicit sidecars.
- Retain the invalidation reason after revocation so subsequent calls explain the same failure rather than only “unknown or stale.” Surface iteration, attempt, session/turn and retry count in workflow diagnostics.
- Test a repair agent that returns a completed turn after `STALE_ATTEMPT`; assert bounded retries or an immediate recovery state. Also cover fixture addition/removal, persistent missing/malformed outputs, successful replacement binding, and rejection of superseded attempts.

The original five-hour attempt remained in the journal/snapshot as superseded, but the latest iteration detail showed only the retry's 05:44:30 start time. Diagnostic presentation should retain attempt history so recovery does not hide the loop's duration.

**Exact runtime fingerprints and evidence identifiers**

SHA-256 values below identify the installed source and executed JavaScript used for this diagnosis; they are not Git commit IDs:

```json
{
  "src/domain-sub-apps/implementation-studio/core/machines/iteration.machine.ts": "79e5b8f9192238bca439efc6c0c8fb8f33a4a7eeca20f273a942456118a234fe",
  "dist/domain-sub-apps/implementation-studio/core/machines/iteration.machine.js": "591b66d880d15c92b4803db2ab7b745815b3739a169012249cde4911bc56c2d3",
  "src/domain-sub-apps/implementation-studio/core/workflow-service/agent-session-handlers.ts": "b2aa5c1b7a3cfd9f4bf836283bd9b55c157ff6e10924c809f85fdadeccee711c",
  "dist/domain-sub-apps/implementation-studio/core/workflow-service/agent-session-handlers.js": "13b5056cdce2cc5464b82047ac6b3dd9ad755f472db0bd612d228261241a9236",
  "src/domain-sub-apps/implementation-studio/core/runtime/sealed-files/production-sanctioned-sealed-write-integration.ts": "01160495055f327c2e568d8a5797e9a4fafa421be2a4c4c1d864f0e5e311f15c",
  "dist/domain-sub-apps/implementation-studio/core/runtime/sealed-files/production-sanctioned-sealed-write-integration.js": "cc8ce60c93375abee377b66781835880b29f71986860867a3a447c563386ed49",
  "src/core/shared/services/sealed-files/marker-discovery.ts": "d8cc29dc982c74d68561f7b87be230ed78a1a383515821ee0282eed421b74158",
  "dist/core/shared/services/sealed-files/marker-discovery.js": "a6f23603c7cd92647ac08db8ecce5a02647f8f039218f62b42a0e63d042ce50c",
  "src/server/orchestration/mcp-http-endpoints.ts": "c1bf0fefdd8da90c5aa0226b064366512d876b73b27fbc5df9391ea02b57766f",
  "dist/server/orchestration/mcp-http-endpoints.js": "0709c1c3aa21a4eed0a2b226c6d1c686a3bf0fd92e33cfb888d7640cea7c5701"
}
```

Original record identifiers are included for correlation, not as dependencies of this report:

- Journal `.cucumber-viz/workflows/_JG0Ucx92X1f6WqRyuxxC/journal.ndjson`: original attempt at lines 631–635; writes/recovery/retry at 2796–2825; completion at 2868–2875.
- Initial implementation transcript `turn_i9GtB-NIUdrWLPxeaEY_P.json` (first mismatch at line 1704); first repair `turn_o0TLbetxQtPT0gKZuxSvc.json`; last repair `turn_S3iWvjT0YMl4lTR6JHsxk.json`; old-session publication failure `turn_0dF9j8_FeDFXhbMW81YwI.json`.
- Operational log `planning-studio-2026-09-09.jsonl`, starting at line 182, correlates the original session with the initial runtime `codex-runtime-1789000845833-86` and subsequent resumed processes.
- Retry attempt `attempt__Qxe2YLX2hL8XJv2p5f6w`, session `session-1789019070999-blsz3ve1`, completed at 05:53:23.

The timeline, representative errors, configuration, code excerpts, fingerprints, reproducer and observed output are embedded in this issue; access to Ramify's local logs or analysis files is not required to reproduce or assess the defect.
