**Iteration 14: unbounded output repair after workflow session invalidation**

The hours-long loop was caused by cucumber-viz resuming an invalidated MCP
session indefinitely. Temporary test fixtures introduced copied seal sidecars,
invalidating the session's sealed-file index. The output repair loop had neither
a retry limit nor a transition for an unusable workflow binding. Both mechanisms
were reproduced against the installed cucumber-viz 0.6.3 runtime.

Workflow: `_JG0Ucx92X1f6WqRyuxxC`, Plan 1, iteration 14 “Reference gate”.
Project root: `/ramify`. Execution checkout:
`/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`, branch
`workflow/iteration-1-project-verifier`. The original implementation started at
`610b869b3c5c0d8d9ffbc766c1defddcac1e196f` and was committed as
`9247480c3b59905edcffe6cc0b87fa0aabed882c`.

**Observed sequence — September 10, 2026, UTC**

| Time | Evidence |
| --- | --- |
| 00:40:45 | Original iteration 14 attempt starts: `attempt_WkjCOzzfjoiXjlROxUBtR`, session `session-1789000845831-cn63wzqb`. |
| 00:49:44–00:52:37 | Four surviving toolkit fixtures acquire copies of `cucumber-viz.constraints.json.seal` beneath `examples/collection-review/.reference-work/`. Their filesystem timestamps place them after session creation. |
| Before 01:29:22 | `workflow.write_iteration_results` fails with `FRAME_MISMATCH`: “The workflow worktree or sealed index no longer matches the active frame.” The next read-only `workflow.get_publication_status` fails with `STALE_ATTEMPT`: “The workflow MCP session binding is unknown or stale.” |
| 01:29:22–05:39:47 | 1,081 missing-output repair turns run in the same session: 4 hours, 10 minutes, 24 seconds. They contain 284 failed MCP calls returning `STALE_ATTEMPT`; 800 turns make no tool calls. |
| 05:39:18 / 05:39:34 | Results and checklist are written through workflow tools. The stale session's contemporaneous turns report no successful writes, so these writes came from outside its repair turns. |
| 05:39:47–05:40:17 | The old session is asked to publish and still receives `STALE_ATTEMPT`. |
| 05:44:21 / 05:44:30 | Workflow stops and retries with a new attempt and session. |
| 05:47:09 | New attempt's publication succeeds. |
| 05:53:23 | Iteration 14 completes after subsequent checks/remediation; iteration 15 starts. |

The latest workflow detail replaces iteration 14's start time with the retry's
05:44:30 start. It therefore hides the earlier five-hour attempt unless the
journal and turns are inspected. The snapshot retains the original attempt as
superseded.

The original agent had completed local implementation and reported 305/305
required reference instances and 235 harness tests passing. Its final tool
output confirms the harness pass and clean diff check. These commands ran in
the execution checkout. This stall occurred while submitting results, before
Studio's iteration checks; the repeated turns were not rerunning the reference
gate. The successful retry eventually recorded 45 test files and 944 tests
passing at head `5640de98f2f046aea3b266a781be58eaf811da6a`.

**Responsible cucumber-viz code**

All paths below refer to `/usr/local/lib/node_modules/cucumber-viz/src/`.
Source and executed JavaScript fingerprints are retained in [evidence.json](evidence.json).

1. **Global seal-index changes invalidate every bound workflow call.**
   `domain-sub-apps/implementation-studio/core/runtime/sealed-files/production-sanctioned-sealed-write-integration.ts:268–280`
   rebuilds the index on each binding validation and compares its digest with
   the launch-time digest. Lines 419–440 hash every explicit sidecar target as
   well as constraint-derived seals. `core/shared/services/sealed-files/marker-discovery.ts:21–54`
   recursively discovers sidecars using fixed directory exclusions. Those
   exclusions do not include `.reference-work`, and this traversal does not
   consult Git ignore rules. Ramify's existing `inactiveGlobs` entry for
   `**/.reference-work/**` applies to constraint discovery, not explicit seal
   sidecars. A fixture copy therefore changes the bound index even though no
   actual project seal or protected specification was edited.

2. **The first mismatch destroys the binding, and repair does not replace it.**
   `production-sanctioned-sealed-write-integration.ts:403–413` deletes both
   binding map entries after any failed validation. Every subsequent lookup
   returns null, which `server/orchestration/mcp-http-endpoints.ts:378–395`
   exposes as `STALE_ATTEMPT`. Even deleting the temporary fixture cannot
   restore that binding. `domain-sub-apps/implementation-studio/core/workflow-service/agent-session-handlers.ts:634–716`
   sends repair prompts to the existing `chatState.sessionId` without renewing
   the binding. It waits for a terminal agent turn, so an ordinary completed
   response explaining that writes are impossible resolves successfully.

3. **The output-validation state machine has no stopping condition.**
   `domain-sub-apps/implementation-studio/core/machines/iteration.machine.ts:1016–1057`
   transitions from failed validation to repair, then back to validation when
   the repair turn completes. `outputValidationAttempts` is incremented at
   line 740 but never used to limit this loop. The transition also does not
   retain the validation error in `context.error`. Missing files plus a
   terminal agent response therefore produce unlimited new turns while the
   workflow remains active without a surfaced error.

The copied-sidecar explanation is strongly supported by surviving fixtures,
their timestamps, the initial exact error and the isolated reproduction.
The original in-memory binding and launch-time index were not persisted, so
the precise historical digest difference cannot be reconstructed. The
unbounded loop and loss of binding are directly established by the transcripts
and production code.

**Verification**

Run the isolated reproduction from the repository root:

```sh
node docs/analysis/2026-09-10-cucumber-viz-iteration14-loop/reproduce.mjs
```

It imports the installed production scanner, binding service and XState
iteration machine. Persistence and agent operations use synthetic data. It
does not contact the running workflow. Temporary fixture files are removed.

Observed assertions:

- A valid running binding initially resolves successfully.
- Copying the config and its seal into an ignored `.reference-work` fixture
  produces `FRAME_MISMATCH`, despite the configured inactive glob.
- Subsequent resolution returns null, including after fixture cleanup.
- Explicitly creating a replacement binding succeeds.
- After 1,100 completed but ineffective repair turns, the actual machine still
  has `status: active`, `error: null`, and `outputValidationAttempts: 1100`.
  The reproduction harness stops it at that bound.

**Concrete fix**

The first correction should be in cucumber-viz's output-repair orchestration:
bound missing/invalid-output retries and stop immediately on a known invalid
binding. Surface a typed recoverable error with the original cause and preserve
the attempt's evidence. Any supported recovery must create and attach a valid
binding before another agent turn; repeating the prompt cannot repair it.

The scanner/binding design also needs explicit treatment of generated fixture
roots, so nested project copies do not unexpectedly redefine the outer
workflow's seal inventory. Preserve protection for actual project seals and
validate genuine frame changes through controlled recovery. Merely increasing
retry limits or ignoring all seal mismatches would leave the cause unresolved.

Retain the original invalidation reason when a binding is revoked, so later
calls can explain the same problem instead of reducing it to “unknown or
stale.” Add regression coverage for copied fixtures, persistent missing or
malformed deliverables, invalid binding repair, and recovery with a new binding.

The stop/retry recovered this execution. It did not remove the underlying
defect: the installed runtime still reproduces it. At inspection time iteration
15 was running and its fixtures were also adding copied seal sidecars to the
live index.

**Primary evidence**

- [Original implementation turn](/ramify/.cucumber-viz/turns/turn_i9GtB-NIUdrWLPxeaEY_P.json:1704), including the initial `FRAME_MISMATCH` and subsequent `STALE_ATTEMPT`.
- [First repair turn](/ramify/.cucumber-viz/turns/turn_o0TLbetxQtPT0gKZuxSvc.json:57).
- [Last repair turn](/ramify/.cucumber-viz/turns/turn_S3iWvjT0YMl4lTR6JHsxk.json).
- [Old-session publication failure](/ramify/.cucumber-viz/turns/turn_0dF9j8_FeDFXhbMW81YwI.json).
- [Workflow journal](/ramify/.cucumber-viz/workflows/_JG0Ucx92X1f6WqRyuxxC/journal.ndjson:631): original attempt at lines 631–635; recovery and retry at 2796–2825; completion at 2868–2875.
- [Operational log](/ramify/.cucumber-viz/logs/planning-studio-2026-09-09.jsonl:182), correlating the original session and resumed Codex processes.
- [Extracted evidence and source fingerprints](evidence.json).

Investigation changed only this analysis package. No workflow state, check
outcomes, installed cucumber-viz implementation or running service was changed.

GitHub issue: [cucumber-viz #6](https://github.com/danmaz74/cucumber-viz/issues/6).
The issue embeds the incident evidence and full portable reproducer; its posted
body was read back and verified against `issue-body.md`.
