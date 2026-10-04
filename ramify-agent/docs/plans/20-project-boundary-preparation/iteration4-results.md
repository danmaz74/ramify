# Iteration 4 results: scratch through the iteration lifecycle

Implementation commits: `4bf65140` and `0a6c69d6`.

An engineer now starts with an ignored `src/tmp/` directory in the assigned module. Scratch remains through repair turns and a suspended nested capability request. A durable iteration result releases scratch in every owner of its scope only when no other open assignment owns that module. Closure, evidence reopening and run recovery repeat this idempotent cleanup; indexed files remain in place and are reported. Single sessions remove their scratch after the writer settles and before an optional gate reads the tree, including failures before the agent starts.

Candidate previews and commit boundaries verify both Git's effective ignore decision and its index. A scratch violation at an engineer gate becomes a failed gate with path and deciding rule, no commit or audit, and repair feedback. The accepted commit verifies again immediately before staging. Engineer prompts name `tmp/` as temporary work and describe its lifetime.
Capability-needed submissions also verify scratch before provisional source capture. An unsafe submission is rejected with the deciding Git rule, and the same engineer session can repair it and resubmit; no unsafe snapshot is read.

## Acceptance evidence

- PB-A10: single-session tests verify that an ignore conflict refuses agent startup, staged scratch is preserved and reported at session end, untracked siblings are removed, and the gate fails without a commit. The session's setup rule remains an uncommitted `harnessChanged` path.
- PB-A11: `engineer-directory.test.ts` verifies directory creation for root, nested and bootstrap scopes; the public module-creation run starts from a root-only `/src/tmp/` rule, appends the general rule, lets the new child engineer write to its scratch, and removes it after acceptance.
- PB-A12: `iteration-gate.test.ts` writes and edits one scratch file through three repair turns before exhaustion; `reconciliation.test.ts` writes scratch in an accepted correction; `capability-dependencies.test.ts` observes a parent scratch file through suspension, service restart and a child closure, then its removal when the parent closes.
- PB-A13: public lifecycle cases cover accepted, partial, unsuitable and exhausted results, nested child closure with an open parent, and recovery after the durable accepted close event but before cleanup. A focused D1 owner-selection and filesystem test covers a durable superseded result with a two-owner scope and a second open assignment. `reopenEvidence`'s existing test establishes that contract revision commits a superseded result; there is no new end-to-end superseded-scratch run.
- PB-A14: an active nested `src/.gitignore` exception produces a failed gate naming its rule, with no commit or audit; the engineer repairs the exception and the next gate passes. A forced-indexed scratch file likewise fails before commit. `iterations-integration.test.ts` uses real Git and audit: starting without the general rule, the accepted commit equals the audited revision, and `git ls-tree` of that revision contains no `src/tmp/` file.
- A real-Git capability-needed case writes a nested `!tmp/` override. The first submission is rejected with that rule; after an in-session repair, exactly one safe provisional source is captured, with no engineer gate or commit before delegation.
- PB-A15: run and single-session forced-stage cases preserve the indexed file, remove an untracked sibling, and report the path. The run's next readiness refuses indexed scratch before deletion.

## Validation

- Focused scripted lifecycle group: 8 files, 58 tests passed; later scratch and accepted-commit group: 2 files, 21 tests passed.
- Capability recovery and delegation: 2 files, 27 tests passed. The three direct Git snapshot cases also passed under the default test timeout after copied fixture repositories received the general ignore rule.
- Real Git accepted/audited tree integration: 1 test passed. The post-fixture-change nested capability group passed 3 tests (parent suspension, child closure and child handback after service restart).
- Targeted module creation, repair/exhaustion, unsuitable closure, correction and close-event crash recovery cases passed.
- `npm run type-check`, `npm run check:self` and `git diff --check` passed. `check:self` reported 0 errors, 0 warnings and 316 analysis limits. The full suite was not run.

The superseded cleanup test verifies the same owner-selection function used by recovery and evidence reopening, then applies its selected removals to real files. It does not claim an end-to-end contract revision with scratch inside a superseded engineer assignment.
