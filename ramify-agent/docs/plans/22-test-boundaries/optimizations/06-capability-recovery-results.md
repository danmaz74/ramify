# Optimization 6: capability recovery boundaries

Implemented from Plan 21 commit `fcc89393e9f9daa357476236fb397c3aa3a79ce0`
in `/home/app/ramify-plan22-capability-recovery`, branch
`perf/plan22-capability-recovery`. No production, dependency, runner or audit
configuration changed. Concurrent unfinished Plan 21 edits were not adopted.
The released full nested audit is **unrun** for this candidate. The coordinator
must audit the clean combined committed candidate before merging into Plan 21.

All 18 original cases remain. The first three actual witnesses moved to
`capability-recovery.boundary.test.ts`: registered process crash settlement,
exact staged/worktree/untracked/deleted snapshot adoption, and changed index or
untracked bytes refusal. Their three registrations and callback bodies are byte
identical, including the command-completion freeze needed to simulate a dead
service without a second ledger writer. The remaining 15 cases retain their
literal titles, replay boundaries, acceptance IDs and outcomes. All 105 original
assertion lines remain verbatim. This is mechanical preservation evidence;
responsible architect assessment remains separate from automated execution.

Ordinary cases now copy real filesystem fixtures, open the real service, write
and replay real ledgers and execute real source capture and write guards. Strict
scripts independently declare heads, trees, producer changes, ownership,
accepted/index bytes and unavailable Ramify results. Cases explicitly advance
literal A or B edit states; no answer comes from inspecting live fixture files
or implementing Git history. The copied fixture bytes are frozen in
`recovery-files.ts` at authoring time. Only generated run IDs are bound at runtime.

Branch creation, producer commit, trailer lookup and null completion responses
are consumed once and refuse exhaustion. Required source captures and configured
audit requests are counted. Version, measure, unavailable materialization, hook,
ownership and frozen candidate reads are declared repeatable and validate their
arguments. Unexpected calls and caught port failures persist through teardown.
No daemon stop is declared. The readiness request requires `full` and `nested:
true`; the five no-edit B completion cases use their actual **iteration**
checkpoint contract, `project-default` and `nested: false`. They reach no final
gate. Scripted audit records are synthetic harness-policy evidence.

Both ordinary files guard every process-starting child-process export and assert
zero attempts after cleanup. Ten negative controls cover caught Git, candidate,
provisional source and Ramify failures, branch/trailer/completion exhaustion,
unused required answers, wrong readiness mode/nesting and an undeclared daemon
stop. `composition.test.ts` and `recovery-table.ts` now point the registered
process witness to its exact new file. Other composition references remain.

Verification from the `ramify-agent/` package directory:

- Baseline original file: 18 passed, zero failed; 14.363 s file duration. The
  15 ordinary case bodies summed to 12.857 s; the three actual bodies summed to
  1.505 s. This is a focused post-cleanup baseline, not the supplied historical
  277 s timing.
- Four-file focused qualification: 38 passed, zero failed or skipped (15
  ordinary, three actual, 11 composition, nine then-present negative controls).
  Actual file duration was 1.878 s. Its code was unchanged afterward.
- Final ordinary, controls and composition qualification: 36 passed, zero
  failed or skipped, including the added tenth exhaustion control. The ordinary recovery file took
  4.664 s in this combined run. Both
  ordinary files report zero process attempts during setup, execution and
  teardown. The evidence JSON records exact file/case timing and source hashes.
- `npm run type-check`: all four compiler scopes passed.
- `npm run check:self`: zero errors, zero warnings, 313 existing analysis
  limits. Coverage remains partial; that is not a claim of complete analysis.
- Configured `vitest list --filesOnly --json`: 256 files, including both new
  test files. Discovery is not execution, and the global runner partition is
  still pending Plan 22 work.
- `git diff --check`: passed.

The final standalone ordinary qualification took 3.989 s before the last strict
validator controls; combined runs varied with shared-host load. The removal of
ordinary processes is established by the guard. These measurements do not
establish controlled whole-suite speed improvement or audit qualification.

Authoring failures were retained in `/tmp/plan22-recovery-*` artifacts, with
hashes in the evidence JSON. They exposed an incorrect two-feature declaration
in one-entry cases, missing no-change trailer/commit answers, an incorrect
expected source-read count, unstated identical-tree diffs and hook paths. The
coordinator initially requested full nested validation for `ga-0002`, then
corrected that assumption after verifying it was an iteration checkpoint. A
later validator incorrectly compared the readiness run ID with a branch that
had not yet been created; readiness now binds that generated ID and branch
creation validates it afterward. Those two early invalid script runs were
terminated in their own processes after a focused diagnosis; no other process
was stopped. One negative-control TypeScript input also included a nonexistent
`runDirectory` field and was corrected. No outcome assertion, skip, retry or
timeout was changed to hide these failures.

[Compact evidence and all 18 case mappings](06-capability-recovery-evidence.json)
record the commands' source identities, durations and retained artifact hashes.
