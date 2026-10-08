# Iteration 4: truthful hook dispositions results

**Date:** 2026-10-07. **Status:** iteration 4 source qualified by the
released `ramify-audit@0.7.2` normal audits of clean `fc2f2350` and
`2789fa1a`; branch push awaits coordinator review. **Entry source:**
`f314f8f97999ffa0f0a5f7df8cfe7980b9d323a7`. **Source commits** on
`feat/plan21-project-boundary-adoption`:

- `fc2f2350794847f756a04065f71ca569b8eb46bc` (tree
  `af7cf930183f9c2f7e15a6f1c312bd9e4c34b24b`): report per-path hook
  dispositions from `ramify.check/3`;
- `2789fa1ade1e492c150bc5536c10880c4053bf47` (tree
  `825ced8541b2d4ad13a330051b392347612d29b9`): compare excluded-only exit 1
  with the complete check. This is the final audited source.

This is intermediate Plan 21 qualification work, not production enablement.
The provider pair is unchanged: exact `ramify.ts` 0.4.1 and `ramify-audit`
0.7.2. Run policy stays `run-policy/7`; no policy bump. No protected document
was edited, nothing was pushed by the implementation agent and iteration 5 was
not started.

## Actual changes

**Strict decoding.** The evidence adapter (`ramify-cli.ts`) decodes the
changed form as `ramify.check/3` and the complete form as `ramify.analysis/3`.
The root must be the checked project (as given or its real path). A changed
document must name each requested path exactly once. Its outcome, reason,
execution, findings (with `new`), `removed`, warnings with the current codes
only, coverage and `exitCode` must agree with the process exit: exit 2 if and
only if not checked, and exit 0 without findings or not-checked paths. Each
named path keeps its disposition, module, exclusion (kind, directory, owner),
reason and, when checked, its content SHA-256 or deletion. The result carries
the provider identity (schema and revision), execution and removed ids. A
non-0/1 exit with no document, or with a `ramify.cli/1` failure, is not
checked with the CLI's reason. Anything else is `unsupported`, which is not
checked and never a pass. That includes an earlier schema version, a foreign
root, a contradiction or an unknown code. The `NotCheckedReason` list is
checked for exhaustiveness at compile time against `ramify.ts/cli`.

**Verdict apart from path status.** `hook-check` observations, transcript
`post-write-check` entries and the recorder carry `provider` and
`dispositions[]` beside the project verdict in `outcome`. Tool feedback lists
not-analyzed paths in their own block, whatever the verdict: "Not analyzed by
Ramify: no source check covers these paths, so the check verified nothing
about them and is no pass for them." Each line names the exclusion or inert
reason. A not-checked check states its reason. Where it still carried
findings, or checked some paths, it says it did not establish the project's
result and is not a pass. It then lists the paths with their own status.
An undecodable answer produces an `unsupported-check-result` coverage gap.

**Settlement from coverage.** Coverage is the `checked` dispositions of a
changed check, or every analyzed path for a complete check. It applies only
when the result was established (exit 0/1, decoded). `removed` ids clear only
when the result was established and execution completed. At exit 2, reported
findings are admitted and stand, and nothing clears. The standing findings of
not-analyzed and not-checked paths are kept, never replaced. A deleted path
that the provider confirms covers its file and clears its findings.

**Removed shortcuts.** The configuration-filename shortcut
(`isGuardedConfiguration`) is gone. The provider classifies every named path,
configuration included, and only an unknown changed set runs a complete
check. The obsolete `outside-module-source` suppression and its `evaluated`
parameter are removed from `noticesOf`. The adapter rejects that code. A
warning is relayed at its own severity, with Ramify's own code and message,
for a file this invocation wrote. That file is either listed by the warning
or lies under its `path`, as with a scratch warning that arrives with a
later revision. The `outsideModules` policy plumbing was already removed in
iteration 3. No source occurrence remains.

**Bounded behavior and wiring.** The bounded changed check and its deadline
are unchanged. Ordinary, capability and standalone engineer equipment share
the same hook (`engineer-equipment.ts` records through one `observedCheck`).
A complete check is never an automatic response to a not-analyzed path. The
harness and evidence READMEs describe the new behavior.

## Captured provider payloads

`subs/harness/subs/evidence/src/tests/project-boundary.test.ts`
("installed Ramify hook dispositions") drives the installed `ramify` 0.4.1
through a private daemon. The fixture project declares `owned-unwired
"docs"`, `owned-nested-project "fixture"` and `external "vendor"`, with a
child module and auxiliary `scripts/`. Setting `PLAN21_HOOK_PAYLOADS=<file>`
writes the payloads. The committed fixture
`subs/harness/src/tests/helpers/ramify-check-payloads.json` has 10 cases from
one run. The root is replaced by `<root>` and timings are dropped. Its case
table and SHA-256 are in
[captured-payloads.json](../evidence/iteration4-hook-dispositions/captured-payloads.json).

| Case | Exit | Dispositions | Project result |
| --- | --- | --- | --- |
| `cold` | 2 | both not-checked `cold` | not checked |
| `excluded-only-pass` | 0 | docs owned-unwired, fixture owned-nested-project, vendor external, `notes.txt` owned-non-source: all not-analyzed | checked, no findings |
| `auxiliary-boundary-violation` | 1 | `scripts/probe.ts` checked content, module `app` | `project-boundary-import` in `scripts/probe.ts` |
| `excluded-only-findings` | 1 | `docs/readme.md` not-analyzed | the same project finding |
| `complete-excluded-only-findings` | 1 | (`ramify.analysis/3`) | the same finding id; nothing under `docs/` |
| `mixed-pass-findings` | 1 | checked, not-analyzed, not-analyzed | the standing finding, `new: false` |
| `mixed-deadline` | 2 | not-checked `deadline-exceeded`, not-analyzed, not-checked | not checked, no findings |
| `source-deletion` | 0 | `scripts/probe.ts` checked `deleted`, sha256 null | `removed` lists the boundary finding |
| `compiler-selected-scratch` | 0 | `src/tmp/scratch.ts` not-analyzed scratch (`src/tmp`, owner `app`), `src/index.ts` checked | `compiler-selected-scratch` warning |
| `configuration` | 0 | `tsconfig.json` checked content | checked |

Observed provider facts: changed `findings` are the covering revision's
project-wide finding set. The provider sets `outcome` to `checked` at exit 1;
the adapter takes the verdict from the exit code. The scratch warning arrives
with a later revision than the write that caused it. The provider classifies
a named `tsconfig.json` (checked when covered, otherwise not-checked
`configuration-changed` at exit 2), which is why the filename shortcut was
removed.

## Acceptance mapping

| Case | Evidence |
| --- | --- |
| PB3-H01 | `hook-checks.test.ts` replays the captured `excluded-only-pass` payload: each path is told as not analyzed with its exclusion, and the stored dispositions match. It replays `mixed-pass-findings` and `mixed-deadline`: each path keeps its disposition and reason under a verdict and under exit 2. The real capture test asserts the same dispositions. |
| PB3-H02 | Captured `excluded-only-findings` at exit 1 reaches the engineer as a violation with its message and location. The real test compares it with the installed complete check: same finding id, nothing under `docs/`. Findings with exit 2 are reported, stand and clear nothing. The provider did not produce exit 2 with findings in practice, so this case inserts the captured boundary finding into the captured `mixed-deadline` payload (see Limitations). |
| PB3-H03 | Standing findings survive not-analyzed and not-checked (deadline) paths. The captured `source-deletion` (checked `deleted`, `removed` id) clears the finding, and the text says so. The existing suites "a finding stands until a check covering its file…" and "a check that did not evaluate imports" pass under the new rule. |
| PB3-H04 | Captured `auxiliary-boundary-violation` is relayed as a finding with Ramify's own `project-boundary-import` message, not as a coverage note. The `compiler-selected-scratch` warning is relayed as not blocking, and the scratch file is told as not analyzed. A warning that arrives later is relayed for the earlier written file. `tsconfig.json` is checked by the provider, with no filename shortcut and no complete check. |
| Unsupported results | `ramify-cli.test.ts` refuses foreign roots, other paths, contradictory exits, unknown warning codes, earlier schemas and a verdict without a document. In `hook-checks.test.ts`, "a result the harness does not read is an explicit gap, never a pass". |
| Protocol unions | `union-values.test.ts` covers every hook-check mode, outcome and disposition, and the `unsupported-check-result` gap. `composition.test.ts` names their producers. |

## Disposition and protocol mapping (iteration 10 handoff)

[disposition-protocol-mapping.json](../evidence/iteration4-hook-dispositions/disposition-protocol-mapping.json)
maps each `ramify.check/3` disposition and verdict to the adapter result, the
`hook-check` observation, the transcript `post-write-check` entry and the
engineer text. In summary:

- `outcome` (`passed`/`findings`/`not-checked`) with `reason` is the project
  verdict. `provider` is `{schema, revision}`, or null when nothing was
  decoded.
- `dispositions[]` is `{path, disposition, reason, module, exclusion: {kind,
  directory, owner} | null, sha256}`. It is empty for complete, undecoded and
  unrun checks.
- `checked` covers (`content` with SHA-256, `deleted` with null).
  `not-analyzed` (`owned-unwired`, `owned-nested-project`, `external`,
  `scratch`, `reserved`, `owned-non-source`) and `not-checked` (CLI reason)
  never cover.
- `subs/web/src/transcript.tsx` is unchanged. Its `post-write-check` case
  receives the typed entries but renders neither provider nor dispositions.
  Iteration 10 renders them.

## Focused verification

All commands ran from `ramify-agent/` with the installed Vitest and explicit
files. No `npm test` or unrestricted `vitest run` was used.

```sh
./node_modules/.bin/vitest run --project node subs/harness/subs/evidence/src/tests/ramify-cli.test.ts subs/harness/subs/evidence/src/tests/project-boundary.test.ts subs/harness/src/tests/hook-checks.test.ts subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/composition.test.ts subs/harness/src/tests/engineer-submission.test.ts subs/harness/src/tests/single-session.test.ts subs/harness/src/tests/single-session-integration.test.ts
npm run type-check
npm run check:self
```

At `2789fa1a`, the eight files passed **126/126 tests in 8/8 files**, with
none filtered or skipped, in 52.65 s
([log](../evidence/iteration4-hook-dispositions/focused-final.log)).
`npm run type-check` exited 0 for all four compiler configurations
([log](../evidence/iteration4-hook-dispositions/type-check.log)).
`npm run check:self` passed with 0 errors, 0 warnings and 319 nonblocking
analysis limits, over 12 owners, 584 source files, 56 resources and 11,650
accesses ([log](../evidence/iteration4-hook-dispositions/check-self.log)).
Both ran on the tree committed as `fc2f2350`. `2789fa1a` changes only test
files, and its audit repeats both checks. During development,
`transcript-run`, `gate-diagnostics` and `gate-repair-routing` also passed
(39/39 with the engineer and single-session files).

## Delivery audits

Both attempts used the exact normal command from the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

| Attempt | Source | Window (UTC) | Executed mode | Result |
| --- | --- | --- | --- | --- |
| 1 | `fc2f2350` | 20:43:04–20:59:45 | ramify-partial (baseline `1f920462`, chain depth 1) | **pass**: 221/221 files, 0 failed |
| 2 | `2789fa1a` | 21:00:00–21:15:59 | ramify-partial (baseline `fc2f2350`, chain depth 2) | **pass**: 221/221 files, 0 failed |

Projections are in
[evidence/iteration4-hook-dispositions](../evidence/iteration4-hook-dispositions/)
(`delivery-attempt1.json`, `delivery-attempt2.json`). The raw JSON is in
`/tmp/pb3-it4-audit.json` and `/tmp/pb3-it4-audit2.json`, with each SHA-256
recorded in its projection.

**Attempt 1** took 1,001 s from launch to exit (1,000.261 s producer), CLI
exit 0. Request `71e0f83b-16b3-417b-8e83-bb5d7e47817f`, run
`16b70dba-7d21-4fd6-bb11-b2e05edaea09`, report
`6c9fea9af15e40bd10f28ad06514bed2d3c018ab`. It **requested
`ramify-partial` (defaulted) and executed `ramify-partial`**, linked to
iteration 3's full report `1cad33f3` at chain depth 1. The ownership answer
came from installed `ramify.ts` 0.4.1 (`ramify.affected-cli/4`). The
selection was scoped to six modules (root, harness, agent/pi, audit,
evidence, web) and all five checks. agent-structure 17.6 s, agent-tests
963.2 s, agent-typecheck 6.3 s, agent-web-build 0.6 s and patch-integrity
0.01 s all passed. Expected files were 221, run 221, status `complete`.
Files: 219 passed, 0 failed, 2 skipped. Tests: 1,717 passed, 0 failed, 6
skipped. The skipped files are the opt-in `fixture-acceptance` and
`fixture-trials` suites; skips are unrun, not passes. The failure ledger is
complete with zero entries, with no carried failures. Scoped composition is
`pass` with zero outstanding failures.

**Attempt 2** ran on clean `2789fa1a` and is the final source result. It
took 959 s from launch to exit (958.343 s producer), CLI exit 0. Request
`cde93108-f61d-4336-9587-171ec4f090e2`, run
`33e9058f-297a-45c1-99c5-d6bd25cb22ce`, report
`81f67cd250e1157958306b2187944960bf982a9c`. It **requested
`ramify-partial` (defaulted) and executed `ramify-partial`**, linked to
attempt 1's report `6c9fea9a` at chain depth 2, rooted at `1cad33f3`. The
changed paths were the payload fixture, its helper and the capture test.
The selection was the same six modules and all five checks.
agent-structure 17.5 s, agent-tests 921.1 s, agent-typecheck 6.1 s,
agent-web-build 0.7 s and patch-integrity 0.005 s all passed. Expected files
were 221, run 221, `complete`. Files: 219 passed, 0 failed, 2 skipped (the
same opt-in suites). Tests: 1,717 passed, 0 failed, 6 skipped. The ledger is
complete with zero entries and no carried failures. Scoped composition is
`pass` with zero outstanding failures. No flaky test was observed in either
attempt.

## Limitations

- The installed provider produced no exit-2 document that still carried
  findings: exit-2 documents were cold or past the deadline, with empty
  `findings`. The retained-findings-at-exit-2 path is therefore exercised by
  a captured `mixed-deadline` payload with the captured boundary finding
  inserted, not by a pure provider capture.
- A complete check (`ramify.analysis/3`) has no per-path list. Its
  dispositions are empty and it covers every analyzed path. Paths outside
  analysis are never claimed for it.
- The new `provider` and `dispositions` fields are required in `hook-check`
  observations and transcript entries. Records written by iteration 3
  source under the same `run-policy/7` (development runs only) do not decode
  against the new schema. No historical adapter was added, consistent with
  iteration 3's removal of old-record decoding.
- The browser does not yet render dispositions (iteration 10).
- The paid Plan 13 probe and the opt-in fixture acceptance/trial suites were
  not run.
- This receipt commit is documentation only. The audits checked source
  `fc2f2350` and `2789fa1a`, not the receipt commit.

## Protected-file comparison

The baseline taken at entry `f314f8f9` lists the 16 tracked
`.principles.md`/`.spec.md` files, which are exactly the tracked set at
`2789fa1a`. Before the receipt commit, all 16 match the baseline in HEAD, the
index and the worktree. No protected path is staged, unstaged, untracked or
renamed, and no protected file changed in any commit since entry
([comparison](../evidence/iteration4-hook-dispositions/protected-comparison.json)).
No protected patch was proposed or needed. The coordinator repeats the
comparison at the receipt HEAD.

## Next-iteration prerequisites

Iteration 5 (architect declarations) may start after the coordinator reviews
this receipt and pushes the branch, verifying `HEAD ==
origin/feat/plan21-project-boundary-adoption` on the live remote. It builds
on `run-policy/7` and the exact `ramify.ts` 0.4.1 / `ramify-audit` 0.7.2
pair. Iteration 10 takes the disposition/protocol mapping and the captured
payloads above for the browser projection.
