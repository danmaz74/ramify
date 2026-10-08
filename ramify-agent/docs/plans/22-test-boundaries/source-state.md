# Plan 22 source state

**Inspected:** 2026-10-08, active
`/home/app/ramify-plan21-project-boundary-adoption/ramify-agent` worktree,
branch `feat/plan21-project-boundary-adoption`. Plan 21 delivery is evolving;
the discovery snapshot records its own exact HEAD and file hashes separately.

## Confirmed implementation

- `subs/harness/subs/evidence/src/run-command-with-cleanup.sh` calls
  `cleanup_child` after `wait`; both cleanup branches unconditionally sleep
  0.2 seconds after TERM, even when the target has exited.
- `subs/harness/subs/evidence/src/tests/run-command.test.ts` already verifies
  leaked-descendant settlement, cancellation, timeout, output cap, command
  outcome, durable group registration and stdin through the start barrier.
- `subs/harness/src/run/service.ts` independently defaults `git` to `gitService`
  and `candidates` to `gitCandidateSource`. Both seams already exist.
- `subs/harness/src/tests/helpers/{mock-git,scripted-git,gate-git,recovery-git,candidates}.ts`
  provide external-response doubles; `mock-git.ts` includes scratch operations
  and the standard-fixture scratch wrapper.
- `subs/harness/src/tests/helpers/direct-check-execution.ts` now provides
  scripted configured audits and `localCommandAudit`; the latter runs real
  local commands and is not a no-process double.
- `subs/harness/src/tests/helpers/{external-tools,process-guard}.ts` provide
  opt-in refusal/attempt checks. Ordinary enforcement is currently per-file.
- Capability assignment, consultation, submission, delegation, dependencies,
  acceptance and recovery files explicitly inject production Git.
  Nonfunctional recovery/repair/run files do so as well. Some files mix ordinary
  lifecycle matrices with actual process/Git assertions.
- `capability-acceptance.integration.test.ts` drives twelve variants of a shared
  migration helper, with real Git and configured local test/type-check commands.
- `vitest.config.ts` declares `node` and `web`; configured includes select
  ordinary and boundary files together. Fixture and scratch exclusions are
  already present and must survive migration.
- `ramify-audit.json` runs the complete four-worker Vitest configuration plus
  type checks, Cucumber, structural checks, web build and committed patch checks.
  Installed provider pins are `ramify.ts` 0.4.1 and `ramify-audit` 0.7.2 at
  inspection. The package's `test` script is `vitest run`.

## Measurement provenance

The user's supplied analysis reports 961 s suite wall time, 959 s in the
twelve-case acceptance file, 369 Git calls in one case, and 27 real-Git files
contributing 2573 s of 3144 s aggregate test time. Repeated cold Ramify CLI
work reportedly contributes about 400 s across seven files. No raw trace or
source-bound timing artifact was supplied in this conversation, so these are
diagnostic inputs, not newly reproduced measurements.

An independent ten-command probe in this conversation used `/usr/bin/true`,
not Git: direct execution took 0.005 s and the production cleanup wrapper took
2.219 s, with `start\n` supplied to its start barrier. The wrapper was identical
in `/ramify` and the active Plan 21 worktree. This proves the mechanism on a
small sample; it does not establish whole-suite performance or cleanup safety.

The historical Plan 7 report had already identified the unconditional sleep
and completed ordinary external-boundary conversions. Its measured 90.94 s
suite is a predecessor result with a smaller/different case set.

## Required inventory refinement

`configured-files.json` is captured using actual installed Vitest file discovery.
Iteration 0 traces each selected file's helpers, setup/teardown, candidate
reads, local audit commands and child-provider calls. Record case titles,
acceptance IDs and independently expected assertions. Classify mixed files by
case and split them before granting a whole-file boundary registration.

The initial search leads are the capability and nonfunctional families above,
`late-writes`, `writer-settlement`, `readiness`, `measurement`, `hook-checks`,
`unguarded-write`, review snapshots/composition, fixture/iteration/session
integration files, and evidence/audit/agent child tests. Source imports alone
do not prove runtime process use; do not equate search-hit counts with the
reported 27 real-Git files or assert a complete classification before tracing.
