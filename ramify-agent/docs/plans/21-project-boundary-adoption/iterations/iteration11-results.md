# Iteration 11: integration acceptance and handoff results

**Date:** 2026-10-08. **Status:** iteration 11 complete. Dan later approved the two
protected `harness.spec.md` patches and the coordinator applied them, completing
Plan 21 (see [final results](../final-results.md#protected-file-review)). The branch push
awaits coordinator review. **Entry source:** `42253094` (clean).
**Source commits** on `feat/plan21-project-boundary-adoption`:

- `3ac150e9f9e3441bfa594bfc3404cfe829cb06f6` (tree
  `c617f44c13edf905defa78122dad1c5c40350f2e`): remove historical readers and
  obsolete gate vocabulary;
- `f51ce5e28953ea553897190f0f991ed1fdf518c3` (tree
  `70967ceec808fbddf0d2aa14200c158e5aa6aacc`): run the standalone diagnosis
  without a test runner;
- `119c965510c33e9da299c2f3e967e7cdc030329b` (tree
  `d90629afa47ca3ff2bd971ac8c077c946d0096ee`): list registered obligations
  beside the run's scenarios;
- `cc27f03c80f8afe80010dd42cc9eae40d0dd5035` (tree
  `ca0e4c808700ea36ba9031362178fdb7a4f6adcc`): the F5 workflow test and the
  Chromium witness;
- `0108a28d24545a81db2e7c4288e3604429f1282e` (tree
  `a5def77b26395e35db77b3dbb17a9658fc3ea22e`): give the input manifest
  fixture its document manifest (a defect the first final audit found);
- `f2968d17fa2f0657112ef8edab474537473f964a` (tree
  `154c2229b7a0b9db5b2b325ecdbb3aa7a3602685`): name the ordinary workflow's
  unfinished work accurately. This is the final audited source.

The provider pair is unchanged: exact `ramify.ts` 0.4.1 and `ramify-audit`
0.7.2. Run policy stays `run-policy/7`; no policy bump. No real Pi or model
call was made. No protected document was edited.

## F5 workflows

`subs/harness/src/tests/plan21-workflows.integration.test.ts` runs three
workflows through `RunService.open` with `production: true`: the fixed
`run-policy/7` policy, its code, scope and design reviews, the installed
Ramify daemon (`viewedInputs`) and `createConfiguredAudit` over the installed
`ramify-audit` with a private test lock. Agents are scripted; every provider
answer is real. It passed in 375 s
([log evidence](../evidence/iteration11-workflows/)). Setting
`PLAN21_ITERATION11_EVIDENCE` writes the gate attempts and obligation events;
`PLAN21_ITERATION11_PROJECTS` keeps each finished project for the browser.

**W1, ordinary failure and repair** (`collection-review` copy; module `notes`
declares `owned-nested-project "report"` with its own `ramify-audit.json`).

- Run `20261008T065252Z-ca784d`. The local architect registers
  `test-001` (PB3-D01) and assigns `sc-001` with the report tree in
  `included`. The engineer writes scratch `tmp/draft.txt`, raises the limit
  in `notes.ts` and `report/limit.json`, and proposes completion without
  bindings: rejected naming `sc-001, test-001` before any commit (PB3-D11).
  With bindings (`sc-001` relying on `FakeReportReader`) the iteration gate
  `ga-0002` fails; the same engineer session continues with the digest and
  the scratch file kept (PB3-T07, PB3-S08), and `ga-0003` passes. The
  architect's completion without reports is rejected naming the missing
  IDs (PB3-C01); its done reports (`sc-001` with `where`, `test-001` without)
  are accepted (PB3-D04). The final nested gate `ga-0005` fails: root `.`
  passes (reused) and `subs/workspace/subs/reviews/subs/notes/report` fails
  (`report-limit: FAIL`, report `f92d4c5a`). The run fails
  `repair-exhausted`; both declarations stay `done` (PB3-D03), the scratch is
  gone, and the failed project's record stays retrievable.
- Run `20261008T065415Z-12a9ed`, from `main`. The engineer reports partial
  work; the iteration closes `partial` and the architect reassigns (PB3-C02).
  The second engineer fixes the report and binds over the fake; the
  architect reports `sc-001` done with `where` over the fake-backed binding;
  the third engineer rebinds with no fakes, which leaves `sc-001` `done` with
  the new fakes list (PB3-D12); the architect revises it to `bound` and
  assigns again, with the fresh briefing showing `done`/`pending` as
  recorded (PB3-C06); the fourth engineer adds an edge test; the architect's
  forgotten-report completion is rejected, then its done reports pass. The
  final nested gate `ga-0006` passes both projects (report `7250f402`). The
  first run's failing report remains a separate record (PB3-E05). Closures: `partial`, `accepted`, `accepted`, `accepted`. Every
  assignment includes the owned-nested-project tree with its reason and
  instructions.

**W2, capability delegation and suspended consumer resumption**
(`capability-coordination` copy). Run `20261008T065729Z-eab60c`.

- A's engineer writes scratch, edits `caller.ts` and raises
  `capability-needed`; qualification delegates to B. The capability
  architect assigns B; B's engineer adds `readFact(withSource = false)` and
  its tests. The capability architect's handback without a report is
  rejected; with `cap-001` done and `where` it is accepted (PB3-D08, C01).
  The handback reports only `cap-001`: the consumer's `sc-001` stays
  `pending` (PB3-D10).
- After the handback, once A's continuation has acquired the writer, the
  service closes and reopens. Recovery effect: "resumed capability
  coordination from its committed stack". The interrupted continuation is
  closed through the failure analyst and the iteration closes `partial`;
  the scratch and the suspended edit survive the suspension (PB3-S08,
  PB3-R01 new-policy recovery, PB3-C04).
- The local architect sees `sc-001` `pending` and reassigns A; the scratch
  is now gone (no iteration open in A) and the suspended edit is kept. A's
  engineer integrates `renderSourced` and binds `sc-001`; the forgotten
  report is rejected naming `sc-001`, then the done report with `where` is
  accepted. Final `ga-0006` is the full nested audit of `.` and the run
  completes. Closures: `cap-001.i01` accepted, `wi-001.i01` partial,
  `wi-001.i02` accepted.

**W3, standalone work** (`runSessionCommand` with `gate: true`, B declaring
an owned-nested-project report tree). Session `20261008T065842Z-e2f174`.
The write to `subs/b/report/limit.json` is refused with a tool error and the
file is unchanged; `fact.ts` is `checked`, `tmp/notes.txt` is `not-analyzed`
(scratch) and `docs/source.md` is `not-analyzed` (owned-non-source). The
gate is the in-place diagnosis (`type-check`, `ramify-check`), passed. HEAD
and every ref are unchanged and the tree stays dirty: no commit is made for
diagnosis (PB3-R02).

## Browser and brief projection

`scripts/browser-acceptance/plan21-workflows.ts` serves the three kept
projects through `startCliServer` (as `ramify-agent serve` starts it) with
the built web client and drives Chromium 154 at 1440x900 and 480x700. Each
projection is compared with the server's own protocol answer. 43 checks
passed with no page exception and no sideways scroll
([results](../evidence/iteration11-browser/iteration11-browser-results.json),
16 screenshots beside it):

- the failing final gate's per-project lines (`.: pass, reused, executed
  full`; `…/report: fail, ran, executed full`), the failure and the report
  commit, and the repaired gate's passing lines;
- the Scenarios area's new obligation list: status, binding fakes, the
  architect's judgment, revision and `where` hint, and "Every obligation has
  its architect's done report." beside a failed run (PB3-D04, D03);
- an architect's brief listing `sc-001 (scenario): bound, revision 0; bound
  by inv-0009 relying on fakes FakeReportReader; no report yet` and
  `test-001 … pending` (PB3-D04, E07 briefs);
- the engineer's post-write dispositions (`checked`, scratch and
  owned-nested-project `not-analyzed`, never labelled passing), separate
  from the gate's project verdicts (PB3-E07);
- the capability task's architect report with `where:
  subs/b/src/tests/fact.test.ts` and the accepted handback;
- the standalone session's refused write and its dispositions.

The run was made on the working tree later committed as `3ac150e9`…`cc27f03c`
(recorded `revision` `323bdc13`, `dirtyAtStart: true`).

## Removal inventory

The removals in `3ac150e9`, with focused tests updated rather than weakened:
gate `scenarioFindings`/`committing`/`checkFindings`; gate causes
`in-scope`, `outside-assignment` and `invalid-session`; attribution; the
`capability-candidate-accepted`, `capability-review-recorded`,
`capability-assignment-interrupted` and `capability-verification-failed`
events; the `capability-assignment/1` and `capability-review/1` records and
`work.capabilityAssignment`; `acceptance-harness-missing`; the planEvidence
legacy branch (`analysis-accepted` evidence and `documentManifest` are now
required); the narrowed gate command kinds; `scope-tests`/`unsupported-runner`;
`GateRequest.writeScope`; the `readiness-failed` gate fallback; the legacy
run branch prefix; the unused withdrawal commit helper; and stale
composition entries. The readiness gate's audit is now projected from its
recorded outcome, removing the execution map's `not-applicable` value.
Check-finding `origin` is required.

`f51ce5e2` removes the standalone diagnosis's test parser, Vitest reporter
filter and scoped test wording; the engineer and local architect procedures
name the committed audit definition (`ramify-audit.json`) as the guarded file.

The source and prompt search over `subs/` and `scripts/` finds no
package-walk discovery, warning suppression, forced reuse, view-format
versions, cited-file or owner coverage gate, or scoped test tool. Remaining
hits are refusals and their tests (`outside-modules` in
`local-architect-submission.test.ts`, `write-guard.boundary.test.ts` and the
composition inventory; `timeouts.scopedTests` in `project-config.test.ts`),
the run-policy version refusal and its tests, and unrelated words
("withdrawn" tools at the context budget, "diagnoses" by the engineer,
"historical" kinds refused at submission). Kept on purpose: the
`currentHead` re-export, `planRef.document` "absent on old runs", the
optional policy limits, and "in scope" test titles that Plan 22's inventory
cites.

## Focused verification

From `ramify-agent/`, after the changes:

- lifecycle suites: `iterations-integration`, `capability-assignments`,
  `capability-historical-resume`, `scenario-states`,
  `capability-acceptance.integration`, `capability-acceptance.boundary`,
  `single-session-integration`, `single-session`, `scratch-setup`,
  `execution-map-projection`, `engineer-briefing`, `acceptance-trial`, the
  audit conformance fixture (`audit-conformance.test.ts`) and the whole
  audit child: all passed;
- every other changed test file (18 files, 202 tests) and the web tests (one
  timing failure under load, see below);
- `plan21-workflows.integration.test.ts`: 3 passed (375 s);
- `npm run type-check` and `npm run check:self` (0 errors, 313 analysis
  limits, 8,740 allowed): passed. `check:self` first found two
  `not-visible` imports in this iteration's source; the root now re-exposes
  `ObligationView`, and the witness uses the exposed `startCliServer`.

## Final audit

From the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

| Source | Window (UTC) | Mode | Result |
| --- | --- | --- | --- |
| `cc27f03c` | 07:07:28–07:15:03 | full, nested | **fail**: 2 tests in 2 files |
| `f2968d17` | 07:16:22–07:22:49 | full, nested | **pass**: 258/259 files, 0 failed |

- **First audit, one defect of this iteration and one flake**
  ([projection](../evidence/iteration11-audit/final-audit-1-failed.json)):
  - `protocol-contract.test.ts` "an input manifest carries the plan hash,
    the checkout and the view": its fixture lacked the `documentManifest`
    that `3ac150e9` made required. `0108a28d` adds it and asserts that a
    manifest without it is refused. No test was weakened.
  - `run-recovery.test.ts` "a crash after immutable analysis evidence is
    staged…": the flake recorded below.
- **Final audit.** The projection is
  [final-audit.json](../evidence/iteration11-audit/final-audit.json); the
  raw JSON is `/tmp/pb3-it11-final-audit.json` (SHA-256 `2b2986d2…26130`).
  It ran fresh (`ramify-audit` 0.7.2, requested and executed `full`, no
  reuse) over clean `f2968d17` (tree `154c2229`), took 385.6 s, and the CLI
  exited 0 with status `completed`, invocation verdict `pass`, overall
  `pass`.
- **Identifiers.** Request `24e18305-12c7-4322-b7b8-b01a954ea11b`, run
  `7c665598-d088-4631-80da-cba4cc20342e`, report
  `2444954766cacd45866bbef2c47100c29a1feb51`, run ref
  `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T07-22-49Z-f2968d17f`.
- **Nested discovery** is complete with no skipped or undecided definition;
  the one eligible project is `ramify-agent` (`pass`, `ran`).
- **Checks.** All six selected and passed: agent-scenarios (0 scenarios),
  agent-structure (17.9 s), agent-tests (347.3 s), agent-typecheck (7.5 s),
  agent-web-build (0.6 s) and patch-integrity.
- **Expected files.** 259 expected and 259 run (`ownership-answer`):
  `complete`.
- **Counts.** Files: 258 passed, 0 failed and 1 skipped (the opt-in
  `fixture-trials`). Tests: 2,006 passed, 0 failed and 2 skipped.
- **Ledger** complete with no entry; stderr empty; no cancellation.

## Deviations and limitations

- **Flakes recorded, not hunted.**
  - `run-recovery.test.ts` "a crash after immutable analysis evidence is
    staged…" failed in the first final audit (a half-written
    `events.jsonl` line read by the polling helper, then `ENOTEMPTY` on
    cleanup). It passed three isolated runs and the whole file passed.
  - `session-timeline.test.tsx` "a live session's timeline grows…" failed
    once while the 375 s workflow test ran beside it and passed three
    isolated runs.
- **Writer-settlement race.** Closing the service within milliseconds
  after `writer-acquired`, before the agent's script starts, once produced
  `job-failed` `writer-unsettled`. W2 waits for the continuation's script
  and writer before closing. The narrow window is a known limitation.
- **Interruption of an ordinary run** is terminal (`job-interrupted`); only
  capability coordination and nonfunctional phases resume. W1 therefore
  exercises restart between runs and W2 the resumed interruption.
- **Nested projects in the agent's own audit.** The three harness fixtures
  are owned-nested-project trees without a `ramify-audit.json`, so the
  agent's nested audit discovers only `ramify-agent`. Committing one would
  make it a nested project of the agent's own audit; F4 and W1 exercise
  nested projects instead.
- **Gate view `provider`** remains an unbounded `z.unknown()` copy of the
  provider answer.
- **`agent-scenarios`** runs 0 scenarios; the agent has no feature files.
- **Carried from iteration 3:** discovery after an included module is
  removed is not verified; a failed contract sub-session's dirty interface
  is committed only at the work-item checkpoint.
- **Carried from iteration 8:** `acceptance-incomplete` has no driven test.
- **Plan 22 inventory drift.** `docs/plans/22-test-boundaries/case-inventory.json`
  is a static capture; it still holds the CA24 titles that
  `capability-tasks-projection.test.ts` and `run-page.test.tsx` renamed. No
  code reads it. The protocol fixture kept its title for the same reason.
- **Evidence production.** Workflow evidence is written by the committed
  test with commit IDs of temporary repositories; the browser witness runs
  the test itself unless `PLAN21_ITERATION11_PROJECTS` names kept projects.
- **Concurrent Plan 22 commits** since entry, none mine, all before the
  audited source: `00e91eba`, merge `62dbc276`, `e30a8bf0`, merge
  `b60e92f8`, `8a0f9260`, merge `bb62ca0c`, `6124e256`, `0b4f64e1`,
  `77eac8be`, `fcc89393`, `80cd98c2`, `23318db9`, `42038395`, `5c62119f`,
  `1f0c20cf`, `42a2f37a`, `3367bb72`, `09350e8c` and `323bdc13`. None
  overlaps this iteration's files.
- This receipt commit is documentation only. The audit checked source
  `f2968d17`, not the receipt commit.

## Protected-file comparison

The entry baseline (`/home/app/pb3-it11-scratch/protected-*`) lists the 16
tracked `.principles.md`/`.spec.md` files, which is exactly the tracked set
at `f2968d17`. All 16 match it in the worktree (`sha256sum -c`), at HEAD
(`git ls-tree` blobs) and on the filesystem (no untracked or renamed
protected file). `ramify-agent/docs/harness.spec.md` still hashes to
`f3635d7e25b8b6d175e543197be9c7d12356048f92266fbf1c5df6431ff948bc`. The two
pending `harness.spec.md` patches were not applied; see the
[final results](../final-results.md#protected-file-review).
