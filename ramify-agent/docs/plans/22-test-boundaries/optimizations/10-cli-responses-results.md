# Optimization 10: process-free hook and CLI response matrices

All 41 original cases remain: 25 ordinary hook cases, all 15 evidence CLI cases,
and the original unanswered-executable case in `hook-checks.boundary.test.ts`.
Ordinary tests use the production RamifyCli argument builders and decoders over
strict finite raw replies. They retain actual filesystem writes, hook log files,
FindingsSeen, RunService, guarded edits, observation records and ledger transitions.
No production source, dependency pin, configured timeout, retry or skip changed.

The branch is `perf/plan22-cli-responses`, based on
`8222af73afb7d68bc411e3d7ff005a3cf23cb2bc`. The target's committed HEAD remained
that base at qualification. No unfinished Plan 21 changes were adopted. The
[compact evidence](10-cli-responses-evidence.json) records exact source/configuration
hashes, all 41 case destinations, expectation-source occurrences, callback hashes,
commands, failures, timings, configured discovery and outstanding coordinator gates.

## Preserved behavior and strict boundaries

All 172 original expectation-source occurrences remain within their cases,
including the original expectation in the composed case's test fixture string.
Literal title registrations and PB3-H01–H04 identities remain. Review of the diff
retains their complete original assertions, including findings lifecycle, per-path
coverage and dispositions, unsupported schemas, root/path/exit contradictions,
complete versus changed argument arrays, deadlines and logged output.

`ScriptedCli` belongs to evidence testing source. A reply independently states
argv, cwd, stdout, stderr, exit and its finite required count. Unknown operations,
wrong arguments, exhaustion and unused replies fail; caught refusals remain in
its completion check. The two original hook cases which intentionally repeat
one answer explicitly require two uses. Hook request paths independently set the
expected command, with the hook's normalization, rather than reading expected
argv from the actual invocation. The child CLI cases independently declare their
complete/changed argv, and still assert the original recorded argument arrays.

The single composed edit case initializes no Git repository and installs no
command runner. Its two original edits still fail without changing a file, then
succeed in changing the real note limit from 400 to 500. A declared fixture state
advances only after that second edit settles. Literal Git heads/trees, source
bytes, collection-review topology and notes ownership answer the existing ports;
no response infers ownership, commits or differences from live files. Three gate
lookup/commit responses exhaust: the iteration commits the declared new head,
and the work-item and final gates return no change. Readiness and final audits
are full nested; iteration and work-item audits retain the project-default policy.
All audit answers are explicitly synthetic harness-policy evidence.

Only declared configuration, head, preview, changed-path, diff-pair, candidate,
index/refresh, version/measurement, ownership and unavailable materialization
reads are repeatable. Diff replies require explicit revision pairs, including
empty same-head replies. Each port validates its project and operation-specific
arguments. Branch creation, scenario commit, captured inputs, each audited gate
and the explicit edit transition consume exactly one response at that boundary.
No provisional-source read or external command is declared; either refuses
persistently instead of falling through to native execution. Setup, service
settlement and reverse cleanup run under the local process guards. Teardown
collects cleanup/refusal errors and verifies zero attempted process launches.

The named cross-owner test exposures include their signature companions. Evidence
exposes `ScriptedCli` and `CliReply` to its parent; harness exposes the existing
local guard/read contracts to descendants. Reset is not exposed. Generated
owner testing views were materialized before the API addition under one owned
private endpoint; the installed CLI stopped it and the endpoint was removed.
Root-owned automatic enforcement and retirement/forwarding of these local guards
remain Plan 22 iteration 6 work.

## Native timeout ownership

The original deadline test callback is byte-identical after its move, SHA-256
`a89b26c8fba36c823a6baf43c77e8c7a427b8b261af35cb153a112b7e7db4bca`.
Its native RamifyCli still invokes the unanswered producer with the original
400 ms timeout and original not-checked/provider/path assertions. Actual installed
payload/ownership conformance remains in the existing project-boundary witnesses.

The original helper launched `sleep 30` through a shell. After baseline execution,
PID 2801212 was observed as an orphan `sleep 30` with parent PID 1. The retained
helper now records its producer PID and uses `exec sleep 30`, replacing the shell
with that single owned producer. Native teardown verifies the recorded PID no
longer exists (`ESRCH`) before removing the fixture. The final native case passed
this liveness check. No broad process termination was used, and no remaining
owned analysis supervisor/daemon was found at handoff.

## Verification and failures retained

The focused baseline passed all 41 originals. Authoring failures remain in the
compact evidence and `/tmp/plan22-cli-responses-*.json`/logs. They exposed missing
hook path normalization, two explicit repeated replies, literal scenario/test
ownership paths, the scenario commit/materialization responses, and the separate
work-item gate. The fixture was corrected against the original scenario and
checkpoint contracts. Focused reproductions were used for the composed edit
case; no whole-suite retry, increased timeout or skip was used.

The final exact selection passed **65 cases, zero failures and zero skips**:

```text
node_modules/.bin/vitest run subs/harness/src/tests/hook-checks.test.ts subs/harness/src/tests/hook-run-boundaries.test.ts subs/harness/subs/evidence/src/tests/ramify-cli.test.ts subs/harness/subs/evidence/src/tests/scripted-cli.test.ts subs/harness/src/tests/hook-checks.boundary.test.ts subs/harness/src/tests/composition.test.ts --reporter=json --outputFile=/tmp/plan22-cli-responses-final.json
```

That is all 41 originals, 13 strict positive/refusal/consumption controls, and
all 11 `composition.test.ts` cases. Controls cover unknown/wrong argv and cwd,
unused/exhausted replies, explicitly repeated replies, preserved stderr, wrong
revision pairs, undeclared source bytes, unknown ownership, exhausted branch
mutation and refused provisional-index access. Caught failures persist to the
completion check. All four compiler scopes passed `npm run type-check`.
`npm run check:self` passed with 0 errors, 0 warnings and 313 analysis limits.
Configured `vitest list --json` discovered 2,039 cases in 266 selected files,
including all three newly added test files.

| Selection | Baseline file time | Qualified file time |
| --- | --- | --- |
| Original mixed hook file → ordinary hook file | 2.433 s, including native deadline | 0.649 s ordinary |
| Evidence CLI matrix | 0.151 s | 0.029 s |
| Retained native deadline | included above | 0.412 s |

These are focused same-host observations, with evolving concurrent host load;
the split hook times must be compared together and are not a full-suite speedup
claim. The primary ordinary invariant is zero launch attempts through setup,
flow and cleanup. Only the explicitly retained timeout witness launches a process.

The released **full nested audit is unrun by this subagent** and must pass on the
clean committed candidate before the coordinator merges it. Integrated target
focused checks follow the merge. This receipt establishes engineer observations,
not Plan 22 completion or responsible-architect semantic acceptance.
