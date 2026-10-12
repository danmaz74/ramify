# Iteration 4: Bounded recovery history in live contexts

**Plan:** [Evidence during invalid analysis](../main-plan.md).
**Prerequisites:** Iteration 3's failure evidence and iteration 1's reviewed RecoveryEvidence contract.
**Owners:** `daemon/contexts`; root dispatch accounting only where integration requires it.

## Goal

Keep one bounded set of observed changes since the last completed analysis, surviving invalid revisions and unsuccessful updates without retaining historical compiler sessions.

## Read first

- [Main plan](../main-plan.md), recovery and retention; [matrix](../acceptance.md), FR12–FR17.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md) and [daemon contract](../../../architecture/daemon.md), capture/publication and context loss.
- Contexts `context-manager.ts`, `history.ts`, `interfaces/contexts.ts`, existing context/history tests and root `src/resident-budgets.ts`.

## Deliverables

1. Add context-owned recovery state and immutable snapshots using the reviewed type. Derive the compact last-completed identity from completed publication, including ordinary check failures; retain no source bytes or compiler objects for this purpose.
2. Accumulate observed normalized paths across invalid revisions and failed updates, including create/delete, both rename names and restored edits. Keep this history independent of the queue that schedules work.
3. Use the existing ordered capture/publication boundary to reset only observations covered by a completed publication. Preserve later queued events and prevent superseded work from replacing the baseline.
4. Track no-baseline, watcher loss, overflow and context-loss gaps explicitly. A full rescan cannot reconstruct missed historical edits. Initial invalid contexts expose null baseline/unavailable coverage.
5. Account for path count and bytes in existing per-context/global budgets, status, demotion and disposal. Bounded overflow preserves a gap reason. Evicting old report objects alone need not destroy a compact live-context identity; losing the context does.
6. Attach available evidence to internal invalid/unavailable/not-checked outcomes without adding fields to old public schemas yet.

## Matrix rows executed here

FR12–FR17. FR25's long process measurements remain in iteration 7.

## Verification

Extend contexts `context-manager.test.ts` and `history.test.ts` with controlled adapters, clocks and capture barriers. Run focused tests, type checks, build and `check:self`.

Execute A→B→C→D and a variant with A/D completed but failing. Inject an event between D's capture and publication. Use very small path/byte limits to prove overflow, failed update retention and release. Verify deterministic ordering, immutable responses, no old baseline after recreation and zero recovery state after disposal. IPC/CLI recovery is still an expected intermediate gap.

## Exit criteria

Every state transition in FR12–FR17 has direct evidence; repeated invalid updates retain bounded useful history, publication never loses later events, and resource accounting includes recovery.

## Handoff

Context-owned RecoveryEvidence, internal outcome snapshots, accounting rules and race fixtures for transport. Record any discovered scheduler prerequisite explicitly rather than masking it with retries.
