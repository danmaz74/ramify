# Iteration 4 results

**Date:** 2026-10-12. **Status:** Implemented and qualified for the context owner.

[Iteration brief](iteration4.md), [adopted contracts](../contracts.md), [acceptance matrix](../acceptance.md), and [iteration 3 handoff](iteration3-results.md) govern this result. Source base was `6161e76dcd22e45213a59e19950762750ca03e60` with the prior uncommitted iterations preserved. Package `ramify.ts` was `0.4.3`; Node was `v22.23.3` on Linux x64. No commit, push, audit, release, service protocol change, or public schema change was made.

## Delivered behavior

`daemon/contexts` owns the `RecoveryEvidence` type and `RecoveryHistory`. A live context retains a compact completed identity, bounded observed path set, ordered gap codes, and receipt sequences. It retains no historical compiler session, report, or source bytes for recovery. Completed analysis with ordinary violations establishes a baseline; invalid and unsuccessful updates do not. A completed publication removes only observations and gaps at or before its capture sequence. The same path observed after capture therefore survives, even if seen earlier. Publication checks cancellation and byte admission after its final await, then appends, resets recovery, and advances the context without yielding.

Watcher and synchronized request paths contribute observations. Created and deleted paths, both observed rename names, and repeated or restored paths appear once in UTF-8 byte order. Watcher failure, registration loss, path overflow, and byte pressure produce explicit gaps. An established context without a baseline reports `no-completed-baseline` and unavailable coverage. A bounded tombstone map lets a later generation of an evicted selection also report `context-evicted`; it never copies the old identity. An unknown restart has no durable identity or inferred cause.

Recovery bytes include map entries and their sequences, gap codes, and baseline identity. They participate in per-context and global admission, historical demotion, diagram admission, status `retainedBytes`, and disposal. `history.bytes` remains a separate status member; total context accounting adds it to `retainedBytes`. If even a mandatory marker cannot fit, the context is evicted rather than exceeding the bound. Disposal charges zero recovery bytes. Returned snapshots are detached, deeply frozen, and caller-owned; the context keeps no response-copy cache.

The internal staging API is `ContextManager.recovery(token)`. It returns a snapshot for a live token and the existing `Unavailable` outcome for a missing or expired token. The `/2` service and IPC remain unchanged. Iteration 5 must capture this snapshot synchronously in each context outcome-completion path, before a later event or publication can change the context, and then forward that captured value through `/3`. A service-time lookup after awaiting the outcome would risk attaching later history to an earlier failure. The direct FR15 witness here proves the capture cutoff and immutable snapshots; correlated outcome-to-wire timing remains iteration 5.

## Acceptance evidence

| Case | Direct context evidence |
| --- | --- |
| FR12 | A remains the baseline across invalid B and C and a separate incomplete update; paths from all three remain until completed D. Request-origin paths also survive an invalid revision. |
| FR13 | A and D can each be completed with a failed check. A remains the compact baseline even after its report history entry is evicted. |
| FR14 | Creation, deletion, both rename names, repeats, a restored path, and Unicode paths are deduplicated and byte ordered. |
| FR15 | An event for a path already seen before D's capture, plus a new path, survives D's completed publication. An earlier frozen snapshot remains unchanged. |
| FR16 | Initial invalid input has null baseline and unavailable coverage. Eviction removes the old identity; a new generation reports `no-completed-baseline; context-evicted`. |
| FR17 | Watcher loss and path overflow retain a bounded prefix and gaps through an unsuccessful sweep. Tight baseline, mandatory marker, path, and two-context global byte limits refuse or evict without overrun; disposal releases recovery bytes. |

The controlled cases use scripted analysis and watcher ports. They establish context behavior, not socket or installed-process behavior. FR25 long-run measurement remains iteration 7.

## Verification

| Command | Final result |
| --- | --- |
| `npm test -- subs/daemon/subs/contexts/src/tests --maxWorkers 1 --no-file-parallelism` | Exit 0; 16 files, 201 tests. [Final log](../evidence/iteration4-owner-tests.log.gz). |
| `npm run type-check` | Exit 0 for root, portable, scripts, and reference-harness configurations. |
| `npm run build` | Exit 0 for production and explorer. Existing Vite chunk-size warning. Built CLI SHA-256: `7d6c07700cd42b05ac4aa9e28b53a5ef30cdcc7894590a5a0f94e0838d503a3a`; compiled entry SHA-256: `3718fdae5c6f60433b0f4a0094c05464660b1099cc96ce9a2173ada759aeb41f`. |
| `npm run check:self` | Exit 0: 15 owners, 617 source files, 20 resources, zero errors/warnings, 45 existing analysis limits. |
| `git diff --check` | Exit 0. |

Initial focused recovery tests found two test-harness assumptions: a background capture was correctly cancelled by a newer watcher event, and a missing context returns `status: unavailable` with `reason: unknown-context`. The FR15 test now uses a request-held capture and the FR16 expectation uses the actual outcome shape. The first owner regression run had 13 failures from previous fixed `retainedBytes` expectations and injected limits that excluded new recovery bytes. Assertions now measure the prior retained state and verify exact diagram additions and resource refusals; all 201 owner tests pass. A subsequent type check found two TypeScript narrowing errors after the atomic publication correction; the final signal/disposal guard is equivalent because eviction aborts the running controller. The final type check passes. These intermediate failures were corrected, not counted as acceptance.

## Successor inputs and limits

Iteration 5 receives the context type, frozen snapshot API, capture-sequence semantics, and byte accounting. It owns context-outcome snapshot attachment, typed service evidence assembly, strict `/3` carriers, and incompatible-peer handling. It must leave `/2` schemas strict and avoid a field-stripping compatibility path. Full process witnesses, 1,000 invalid revisions, and package qualification remain iteration 7.

## Follow-up: incremental recovery accounting

The parked provider comparison identified a scale risk in recovery byte accounting. `RecoveryHistory` now updates exact compact JSON byte charges for each path or gap insertion, replacement and deletion, including commas, UTF-8 path bytes and sequence digit changes. A gap that needs room iterates a single reversed path list when dropping observations. Completed publication may scan its bounded set once; ordinary insertion and repeated overflow no longer serialize the entire set on every event.

`npm test -- subs/daemon/subs/contexts/src/tests/recovery.test.ts subs/daemon/subs/contexts/src/tests/history.test.ts --maxWorkers 1 --no-file-parallelism` passed: 2 files, 21 tests. The new direct witness inserts 10,000 paths, repeats overflow 1,000 times, crosses sequence digit widths, checks exact retained bytes against the compact representation, tests publication filtering and gap-driven drops, and verifies disposal. This follow-up changed only `recovery.ts` and its test; iteration 5 owns the concurrent context-manager and interface work and will run final type/build/self qualification. The prior 201-test owner log describes the earlier iteration 4 state, not this follow-up.
