# cucumber-viz publication stalls before iteration 14

Investigated on 2026-09-10. The two substantial stalls were after iterations
**3 and 8**. Their automated checks and commits finished, but publication did
not complete. The immediate cause was a lifecycle mismatch: cucumber-viz
completed the attempt before asking its agent to publish, while the agent's
MCP connection allowed only running attempts. Both publication calls returned
`STALE_ATTEMPT`. The agent then ended normally, leaving the scheduler waiting
for publication indefinitely.

An earlier generated-artifact ownership failure led both iterations into this
publication path. That older error remained visible during the stall, obscuring
the subsequent transport rejection. Fixing only the displayed
`FILE_POLICY_VIOLATION` would leave the completed-attempt defect in place.

**Environment and scope**

| Field | Observed value |
| --- | --- |
| Installed cucumber-viz | `0.6.3`, `/usr/local/lib/node_modules/cucumber-viz` |
| Installed commit | Package has no `gitHead`; source and compiled-file SHA-256 fingerprints are in `evidence.json` |
| Configured project | `/ramify`, Studio port `4080` |
| Workflow | `_JG0Ucx92X1f6WqRyuxxC`, Plan 1: Verify a real Ramify project |
| Execution worktree | `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier` |
| Branch | `workflow/iteration-1-project-verifier` |
| Relevant configuration | Codex execution, sequential iterations, `launchAffordances: false`, deterministic and agent checks enabled |

The current workflow had accepted iterations 1–14 and was executing iteration
15 when inspected. This report concerns the earlier stalls; it does not
diagnose iteration 14's separate missing-deliverable/recovery sequence.
Inspection and reproduction did not restart Studio, invoke recovery, change
workflow state, or change cucumber-viz implementation.

**Incident timeline**

All times below are UTC on 2026-09-09. Waiting duration is measured from
automated pipeline completion to the next iteration's start.

| Event | Iteration 3: Definitive model | Iteration 8: Toolkit migration |
| --- | --- | --- |
| Earlier publication ownership rejection | 10:31:05.715, `iteration2-check-results.md` | 14:22:18.761, `iteration7-check-results.md` |
| Tested pipeline commit | `33b0972d8a09565ca2273c284bc60b35b65e28f8` | `dfaa044c3c7a552970924bbde5c31290c5a89baf` |
| Pipeline finished | 10:35:37.847 | 14:28:02.143 |
| Attempt marked completed | 10:35:37.871 | 14:28:02.162 |
| Publication turn started | 10:35:37.877 | 14:28:02.167 |
| Publication turn result | `STALE_ATTEMPT`; chat completed normally | `STALE_ATTEMPT`; chat completed normally |
| Runtime exited, code 0 | 10:35:51.006 | 14:29:27.666 |
| Recovery bookkeeping commit | 11:03:47.482, `17db228` | 21:02:41.668, `bba4f21` |
| Publication accepted | 11:03:47.805 | 21:02:42.398 |
| Next iteration started | 11:03:47.816 | 21:02:42.412 |
| Waiting duration | **28m 09.969s** | **6h 34m 40.269s** |

Both pipelines passed static, scope, sealed-file, constraint and regression
checks. Static checks ran `npm run worktree:prepare`, then `npm run type-check`.
Post-commit regressions ran `npm test` in the execution worktree: iteration 3
passed **511 tests in 19 files**; iteration 8 passed **764 tests in 38 files**.
The regression phases took approximately 3.25 and 15.21 seconds. The long
waits occurred after these checks, with no publication worker still running.

Primary historical records, relative to `/ramify`:

- Journal: `.cucumber-viz/workflows/_JG0Ucx92X1f6WqRyuxxC/journal.ndjson`,
  lines 95–96, 120–130 and 325–326, 350–360.
- Failed final publication turns:
  `.cucumber-viz/turns/turn_svFsBcKExiOo_6_VgFQ78.json` and
  `.cucumber-viz/turns/turn_K1JgXup1zk2NaexmCCM4e.json`.
- Successful interactive recovery turns:
  `.cucumber-viz/turns/turn_JiTMRcUxSfKTRQXHXZS8A.json` and
  `.cucumber-viz/turns/turn_gbA45MJRaOL0m-lAaheGx.json`.
- Operational log: `.cucumber-viz/logs/planning-studio-2026-09-09.jsonl`,
  lines 40–45 and 108–111. Studio PID remained `10586` across both incidents.

The relevant records, IDs, exact tool results, check references and Git diffs
are preserved in [evidence.json](evidence.json). The two runtime IDs for the
failed publication turns were `codex-runtime-1788950137879-15` and
`codex-runtime-1788964082168-49`.

**Confirmed mechanism: the attempt is completed before publication**

Source locations below are relative to the installed package. For brevity,
`I` denotes `src/domain-sub-apps/implementation-studio`.

1. `I/core/workflow-service/spawn-iterations.ts:1727–1761` persists a pending
   draft, calls `markWorkflowAttemptCompletedInternal`, registers the pending
   publication resolver, and calls `handleRequestPublicationPrompt` with the
   same attempt ID. This ordering is visible in both journal/turn timelines.
2. `I/core/runtime/sealed-files/production-sanctioned-sealed-write-integration.ts:41–42`
   allows only `running` attempts through the bound MCP transport.
   `validateBinding`, at lines 247–266, therefore rejects the just-completed
   attempt with the exact observed message:
   `The workflow attempt associated with this MCP binding is no longer active.`
3. `src/server/orchestration/mcp-http-endpoints.ts:379–393` returns that
   rejection before calling the workflow tool dispatcher. Consequently the
   publication service never sees this call, never updates `lastPublishResult`,
   and never journals its own `publication.stale_attempt_rejected` event.
4. `I/core/workflow-service/iteration-invoke-services.ts:823–861` waits for
   the publication chat to finish. It does not check whether publication was
   accepted or the pending publication resolver was settled. Both agents obeyed
   their instruction to stop workflow writes on `STALE_ATTEMPT`; their chats
   and runtime processes completed normally. No exception reached the detached
   publication catch in `spawn-iterations.ts:1762`.
5. Only accepted publication resolves the gate. The scheduler remains in
   `executing`, showing a completed iteration with pending publication and no
   top-level error. There is no successful publication or new iteration event
   during either waiting interval.

This is a deterministic incompatibility between attempt lifecycle and transport
authorization on this path. It does not require slow tests, a crashed agent,
a service restart, or parallel execution.

The resolver also deletes the binding after rejecting it
(`production-sanctioned-sealed-write-integration.ts:403–413`). Repeating the
same bound request then reports an unknown/stale binding. Reusing the same URL
or retrying the same prompt cannot repair this by itself.

**Why interactive recovery succeeded**

The recovery turns called `workflow.publish_iteration_draft` with the same
attempt IDs used by the rejected workers:

- Iteration 3: `attempt_mhbYNTHGn40H6Dgjt3nRy`.
- Iteration 8: `attempt_fEZBdwt7YFpcol2rF6xZ2`.

The interactive route reached the publication service. Its attempt validator,
`I/core/runtime/work-units/index.ts:49–70`, compares the supplied ID with
`currentAttemptByWorkUnit` and does not reject a matching ID just because its
status is `completed`. That differs from the bound transport's status check.

The publication service then committed the current iteration's generated
regression result, accepted publication, and resolved the scheduler gate.
Both recovery commits added only `- **Regression Tests**: PASSED` to the
current iteration's check-results file. No new attempt or source repair was
needed for these two recoveries.

The earlier interactive diagnoses reported the retained sibling-file error as
the immediate blocker. The final publication turn records show why that
explanation was incomplete: the last calls had been rejected before reaching
publication validation.

**Preceding defect: generated results cross the publication boundary**

Iterations 2 and 7 successfully requested publication during their initial
implementation turns, before their automated pipeline and post-commit
regression finished. Their later control-plane writes added the regression
line to `iteration2-check-results.md` and `iteration7-check-results.md` after
their managed commits. Those files remained dirty for the next iteration.

The source supports this ordering: the checked lifecycle commits before
`post_commit_regression`, then calls `writeCheckResults` on completion
(`I/core/machines/checked-iteration-lifecycle.machine.ts:1470–1542`). The
action starts an unawaited file write
(`I/core/workflow-service/machine-wiring.ts:1249–1269`). Successful early
publication also bypasses the later publication prompt and bookkeeping fold
(`spawn-iterations.ts:1711–1726`).

The next iteration encountered this sequence:

1. Publication returned `WORKTREE_DIRTY` for the previous iteration's result.
   The recovery guidance said to commit it.
2. The agent preserved that generated line in a separate commit: `70203cb`
   during iteration 3 and `88682ef` during iteration 8.
3. Publication then returned `FILE_POLICY_VIOLATION`, because the committed
   diff included another iteration's artifact. Both original lines and both
   errors are preserved in the evidence bundle.

`commitPublishTimeBookkeeping` only commits the current iteration's sidecars
and `status.md` (`publication-service.ts:2985–3021`). The sibling filter
rejects other changed iteration artifacts unless they match accepted evidence
or meet its pending-sibling exception (`publication-service.ts:878–935`).

For these legacy check-results files, accepted metadata was absent. The
fallback compares against `publication.lastWorkflowBranchCommit`
(`publication-service.ts:826–873`). The later managed iteration commit updates
that pointer (`commit-hooks.ts:338–341`), explaining how the unchanged
previous sidecar can pass on the subsequent interactive retry. This explanation
comes from tracing the installed code and commit contents; there is no
historical snapshot of every intermediate pointer value in the journal.

There is another potential race to cover in a fix: completion does not await
the final check-results write, so a publication fold can run before it finishes.
The incident evidence establishes leftover generated files; it does not prove
that this race, rather than successful early publication, produced them here.

The same stale-attempt publication failure also appears after iteration 5 in
`turn_ByBzIT3-mjBfDwcs2uqxu.json`, at 12:18:49.211. Interactive intervention
started at 12:24:27 and iteration 6 started at 12:29:19.081. That shorter
incident also involved project-code fixes, so its recovery should not be
described as an identical publication-only intervention.

**Reproduction and verification**

[reproduce-binding.mjs](reproduce-binding.mjs) imports the installed compiled
production binding integration and publication attempt validator. It uses a
synthetic workflow state and a disposable temporary directory; it never reads
or writes the live workflow.

```sh
node docs/analysis/2026-09-10-cucumber-viz-publication-stalls/reproduce-binding.mjs
```

An optional first argument selects another cucumber-viz installation. On
`0.6.3` the reproduction passed these assertions:

- A running attempt passes the production bound MCP validator.
- Marking the same current attempt completed returns the exact historical
  `STALE_ATTEMPT` message.
- The publication service's ID validator still accepts that completed attempt.
- The rejected transport binding has been deleted.
- A superseded ID is still rejected by the service validator.

This reproduces the authorization mismatch, not the full scheduler or artifact
sequence. The two real workflow histories supply the evidence for the resulting
stall. The installed integration test at
`production-sanctioned-sealed-write-integration.test.ts:121–125` already
expects completed attempts to lose their binding; fixing the lifecycle must
account for that intentional restriction.

**Concrete next action for the cucumber-viz fix**

Add an integration regression that runs a sequential iteration through checks
without successful early publication, uses the production bound MCP resolver,
and ends the publication turn normally after a rejected tool call. Assert that
the workflow either accepts and starts the next iteration or enters a visible,
recoverable publication failure. It must never remain silently executing.

Then address the boundaries together:

- Make final publication a control-plane operation after checks and awaited
  artifact writes, or introduce an explicit publication phase with narrowly
  scoped authorization. Keep completed/superseded workers unable to edit
  source or invoke sealed-write tools; globally allowing all completed
  attempts through the transport would weaken an existing guard.
- Check durable publication success when a publication turn ends. Preserve
  the pending draft and expose failure if no acceptance occurred. The current
  exception handler cannot handle a normal chat completion after tool rejection.
- Record publication transport failures in workflow-visible diagnostics,
  including iteration, attempt and turn IDs, so an older error cannot masquerade
  as the latest cause.
- Finalize and commit each iteration's post-commit evidence before advancing.
  Ensure early publication cannot leave unfinished accepted evidence. Do not
  broadly relax the sibling-artifact ownership check or tell agents to commit
  a file that publication will then reject.

Regression coverage should include successful early publication followed by
post-commit evidence, delayed final artifact writes, rejected publication with
normal chat completion, repeated/superseded calls, and publication recovery of
the existing draft. These cases exercise the actual boundaries implicated by
the incidents rather than only testing that a publication prompt was emitted.
