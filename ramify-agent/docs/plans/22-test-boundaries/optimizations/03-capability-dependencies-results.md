# Optimization 3: capability dependency tests

**Date:** 2026-10-08. **Status:** focused checks qualified; coordinator review,
integration and complete audit remain outstanding.

Base: `afcd2e2c8c8dc07b5567d32187113d08b30db620`, branch
`perf/plan22-capability-dependencies`, worktree
`/home/app/ramify-plan22-capability-dependencies`. The implementation commit is
provided with the coordinator handoff; this receipt and its evidence belong to
that commit. No target checkout, production code, dependency pin, existing crash
fixture or other optimization family was changed.

## Change and preservation

The original dependency file retains all thirteen acceptance IDs and original outcomes. Eleven
titles are unchanged; the two gate titles now accurately say “scripted” instead
of “real”, with their exact old/destination identities recorded in the evidence. Its three ledger controls still exercise the real ledger and recovery.
The scheduling case, seven placement/unresolved decision and restart rows, and
two child-gate rows now inject scripted Git, frozen candidates, provisional
source Git reads, configured-audit answers and fake Ramify responses. Every
ordinary case guards child-process calls before imports and asserts zero
attempts after its flow and filesystem teardown; nothing resets the recorder
inside a case. Missing/unknown operations and argument failures remain recorded
when the harness catches them. Completion verifies required scenario and gate
commit answers, both source captures, index reconciliation reads, candidate
reads, checkpoint outcomes and readiness responses were consumed.

The original flow bodies and all 69 original `expect` calls moved intact into
`helpers/dependency-flow.ts` where appropriate. Boundary selection and explicit
fixture-stage changes surround those bodies. Additional teardown aggregation
preserves the original assertion failure together with response-script failures
and always removes the private fixture. Source bytes, edits, guarded writes,
scratch cleanup, immutable records, state replay, authority and scheduling remain
real. The fixture states Git answers using literal identities, path lists and
frozen byte maps; it never reads live files to infer a diff or commit.

In particular, the nested stack remains `wi-001`, `cap-001`, `cap-002`; the B
assignment waits with its original identity; decision restarts produce one
accepted decision and two delegations; a fork partial carries its unfinished
context; plan recovery rematerializes once and rejects stale replay. Child
handback still rejects a missing done report in the same turn without running a
gate in that turn, reports only `cap-002`, resumes the original B assignment
once, preserves B scratch while removing C scratch, and defers `wi-002`.

The two gate rows have explicitly labelled synthetic external evidence. One additional dedicated
`capability-dependencies.boundary.test.ts` case invokes the same original
no-restart gate assertions with actual Git, actual B/C Vitest tests and actual
TypeScript checking. Its agent, local configured-audit provider and Ramify
ownership projection remain scripted. It establishes those Git/local-command
boundaries, without claiming published audit or actual ownership conformance.
The restart row continues to verify real durable state restoration through
scripted external systems. Existing actual adapter/crash witnesses remain.

Four new guarded helper controls prove caught wrong-root Git assertions,
unknown candidates, invalid provisional reads and undeclared diffs survive into
teardown failures, and unconsumed required answers are rejected.

## Measurements and checks

From the isolated package cwd, the original focused run passed all thirteen
cases. Their summed duration was **26.021 seconds** after the earlier command
cleanup optimization. The final strict ordinary run passed the same thirteen
cases in **4.228 seconds**, about **6.1 times faster**, with **zero child-process
attempts**. Four additional script controls passed in 0.010 seconds. The retained
actual nested witness passed in **6.639 seconds**. The original rows plus the
retained witness therefore cost about 10.9 seconds of summed case time here.
These are observed single-run case durations on a shared host, not a quiet-host
benchmark or a final suite-wall-time claim. The supplied historical 300-second
number is not used as the comparison baseline.

Commands, all from `ramify-agent/` unless indicated:

- `node_modules/.bin/vitest run subs/harness/src/tests/capability-dependencies.test.ts --reporter=json --outputFile=/tmp/plan22-dependencies-before.json`: 13 passed before conversion.
- `node_modules/.bin/vitest run subs/harness/src/tests/capability-dependencies.test.ts subs/harness/src/tests/dependency-boundaries.test.ts --reporter=json --outputFile=/tmp/plan22-dependencies-qualified.json`: 17 passed after conversion; no skipped matrix row.
- `node_modules/.bin/vitest run subs/harness/src/tests/capability-dependencies.boundary.test.ts --reporter=json --outputFile=/tmp/plan22-dependencies-boundary.json`: 1 actual boundary case passed.
- `npm run type-check`: all four compiler scopes passed. A final `node_modules/.bin/tsc --noEmit` also passed after argument hardening.
- `npm run check:self`: passed, zero errors/warnings, 310 nonblocking analysis limits; coverage remains partial.
- `git diff --check`: passed.

## Retained authoring failures and limits

The first conversion run passed 10/13. Strict scripts refused a previously
unstated index read during provisional snapshot reconciliation and a committed
child stage's empty pending delta. The fixture now states unchanged index bytes
and that empty delta; the two affected focused cases passed. Later argument
hardening passed 14/17 while refusing the parent and child scratch paths used by
real write-scope resolution; those literal paths were added. Exact trailer gate
hardening also passed 14/17 until its declarations included readiness occupying
`ga-0001`: scheduling looks up `ga-0002`, and the gate flow looks up `ga-0002`
through `ga-0005`. The subsequent final 17-case run passed. These were deterministic
fixture-authoring errors, not classified as flaky production behavior.

[Compact evidence](03-capability-dependencies-evidence.json) records every exact
original/destination case, before/after durations, final source hashes, extra
controls, real-boundary scope and retained failure summaries. Temporary raw
Vitest reports remain under `/tmp/plan22-dependencies-*.json`; the committed
summary does not depend on their continued existence. Failed candidates were
uncommitted authoring snapshots, and their exact source hashes were not captured.

No direct whole-suite run or full audit was performed by this subagent. The
coordinator owns integrated verification, reconciliation with concurrent Plan 21
work and the final committed full audit. The new boundary file must join the
later exact-path boundary registry; automatic project-wide guard enforcement and
responsible-architect semantic completion remain pending.
