# Iteration 2 results: optional discovery records

**Status:** implemented; focused checks passed; coordinator source review accepted.
**Date:** 2026-10-09.
**Source commit:** `83ab0d59753c25c5d269b122a2ecb2d706c42f30`.
**Base:** iteration 1 receipt `13818cd9821d50ba7c6e1fd8cf06f475421a955c`,
with accepted source `e1678996ca8e8f1402ffec817e187cdb01ff48a6`.
**Branch:** `feat/plan25-carry-discovery-forward`.
**Worktree:** `/home/app/ramify-plan25-carry-discovery-forward`.

## Delivered behavior and acceptance witnesses

The shared harness-internal `work/starting-points.ts` defines a strict
`{ path, note }` shape and an optional array used by work orientation,
assignment submissions and committed assignments, engineer completion/partial
submissions, and committed iteration results. Paths use literal normalized
project-relative syntax: absolute, drive-prefixed, tilde-root, traversal,
backslash, glob and control-character syntax is refused. Root `.` is allowed.
Notes must contain text. Neither validation nor construction probes pointer
existence, source semantics or usefulness.

| Case | Evidence |
| --- | --- |
| D1 | Independently authored legacy orientation packet text retains its exact rendering/hash. Both engineer schema paths accept omission; pointer-free committed assignment/result shapes retain their exact serialized hashes. Existing legacy `/1` operation replay and retained packet/schema regressions pass. |
| D2 | New record tests retain exact path/note pairs in actual orientation packets, assignments and results across crashes after partial/completion submission and after the accepted iteration gate. Assignment and orientation packet bytes remain unchanged after restart; no second engineer runs. Capability assignment tests retain pairs in four accepted task-owned assignments/results and an explicit partial result, including the harness-owned capability task/sequence origins. Recovery uses the same shared record constructor. |
| D3 | Validator and actual JSON-schema regex accept useful positive controls, including missing paths and testing API-view paths, while refusing absolute/traversal/glob syntax. A foreign hint leaves assignment rules unchanged; hints cannot replace obligation bindings or make an empty partial report valid. Existing capability scope guards still refuse foreign writes and retain the original mutated-path evidence. |

The shared assignment constructor copies optional arrays for ordinary and
capability assignments. The shared result constructor reads the closing
engineer submission, selecting the successful gate's `proposedBy` invocation
when applicable, including restart after gate success. It checks retained
submission bytes against the original recorded hash before retaining declared
pairs. Other outcomes/roles acquire no new submission fields. Records without
the optional field acquire no default array and are not rewritten.

Orientation pointers are retained in its existing packet, with optional
navigation framing. Its existing submission/invocation identifies the producer;
its event retains packet identity/hash and point. No new discovery index or
provenance supplied by the agent is introduced.

Actual tool schemas are generated from the expanded validators. Producers are
asked for a few useful locations encountered during their existing work, with
short notes; the architect selects assignment pointers for its engineer. There
is no extra discovery turn, completeness rule or change in read/write,
obligation, gate or completion authority.

Affected packages were updated with their schemas and prose: current
`local-architect/11`, `engineer/8` and `capability-architect/3`; legacy workflow
variants `local-architect/12` and `engineer/9`. Distinct versions avoid reusing
previous role-version identities. Original captured-package/restart checks,
immutable same-name tool declarations, and original-intent replay remain in
force. No hot schema upgrade or schema-conflict fallback was introduced.

## Checks and retained evidence

Commands ran from `ramify-agent/`; output lives under
`/home/app/ramify-plan25-evidence/`. All `iteration02-*.log` files are bounded
below 64 KiB. Larger ownership-check output is preserved in `iteration02-raw/`;
`iteration02-log-bounds.json` records original paths, bytes and SHA-256 values.

| Check | Outcome and evidence |
| --- | --- |
| Required five exact file filters, plus package schema/prose, task-packet, immutable retry/session, and ordinary restart regressions | Passed: 9 files, 135 tests; `iteration02-final-tests.log`. Exact command is retained at the beginning of the log. |
| `npm run type-check` on final source | Passed across project, web, scripts and browser-acceptance compiler scopes; `iteration02-final-typecheck.log`. |
| `npm run check:self` on final source | Passed: 12 owners, 698 source files, 50 resources, 13,615 accesses; 0 errors/warnings and 328 nonblocking analysis limits; `iteration02-final-check-self.log`. |
| Configured discovery | `node_modules/.bin/vitest list --filesOnly --json`; `iteration02-configured-discovery.json`. Every one of the nine selectors was confirmed in the configured ordinary Node project. |
| Process guard | Exact final test window: 9 per-file receipts, zero allowed launches and zero refused attempts; `iteration02-process-guard.json`. No native exemption was added. |
| Root `git diff --check` and coordinator source review | Passed; coordinator accepted the in-scope source changes contingent on the passing final checks and this receipt. |

Initial development failures remain retained. New recovery fixtures initially
omitted the scripted `scenarios-of-review-notes` candidate; those failures were
fixed by supplying the exact external answers, not by using Git. The required
capability tests also exposed an inherited iteration 1 fixture matcher that
expected the `Perform` objective directly below the current-task header,
before the newly inserted role/procedure selection. The matcher now selects
the latest renderer-owned objective, leaving production behavior unchanged.
Initial test typing errors were repaired before the final type-check. Original
failure logs are retained as `iteration02-record-tests-initial.log`,
`iteration02-record-tests-debug.log`, `iteration02-focused-tests-initial.log`,
`iteration02-capability-*.log` and the initial/intermediate type-check logs;
none is labeled passing or treated as a flake.

No direct whole suite, configured audit, native/live provider or performance
trial ran in this iteration. The iteration 0 baseline outcome is unchanged;
combined final qualification remains iteration 5's gate.

## Iteration 3 handoff and limits

- Import `StartingPoint` or its shared schemas internally from
  `work/starting-points.ts`; arrays preserve producer order and exact pairs.
  Consumer coalescing, provenance grouping and snapshot filtering remain
  iteration 3 work.
- Assignments expose optional `startingPoints` alongside their existing
  work-item/outline/coordination/source identities. Results expose optional
  engineer pairs beside iteration/coordination/invocations/gate/commit.
- Accepted orientation pointers remain in its existing packet and original
  `work-orientation/1` submission at the event's invocation. Preserve packet
  hash verification and ordinary legacy/fresh fallback when they are absent.
- Consumer task delivery, independent review pointers, and NFR historical
  comparisons are not implemented here. Pointer notes remain unverified advice.
- This task wrote only the isolated worktree and its external evidence folder.
  It did not write `/ramify` or copy that checkout's concurrent source changes.
  No merge, push or publication occurred.
