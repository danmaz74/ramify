# Plan 13 implementation results

## Iteration 1 — contract alignment and exact capture records

**Starting revision:** `4adc79f4d22319801ed383760b7fab14d09a632d` on
`feat/plan13-evidence-nonfunctional`. The execution worktree had no dirty
files before this iteration. The reviewed plan, analysis, glossary and
principles input edits were already in the starting commit. The main
`/ramify` checkout was not changed.

The [contract appendix](contract-appendix.md) fixes owner operations,
exposures, exact document and passage identity, immutable byte storage,
catalog order, selection append recovery, assessment and candidate binding,
deviation origins, event order and old-run reads. Exactly two untagged harness
children now own the new domain schemas: `plan-evidence` and `nonfunctional`.
The harness owns composition records and a `run-policy/4` default of three
non-functional rounds. Earlier `run-policy/3` records and single-plan
references remain readable; absent non-functional evidence projects
`unavailable`. The web's exhaustive role display map was extended for the
three recorded roles. Completion wording in the harness principles,
CheckFinding principles, acceptance architecture and glossary now separates
automated completion from revision-bound merge readiness.

**Baseline before edits:** `npm run worktree:prepare` completed. From
`ramify-agent/`, `npm run type-check`, `npm run build:web` and
`npm run check:self` passed. The self-check covered 10 owners and 471 files,
with 0 errors, 0 warnings and 287 analysis limits. The existing full
`ramify-agent/audit/ramify-agent-suite.request.json` audit ran in the clean
worktree on the starting commit: run
`88cb2514-2fdf-49ce-bf2e-cd64fefd665f`, source tree
`b7c344292c09dce5d621d9738099dfa2a198cd08`, overall **pass**, all five
checks passed in 217.137 seconds. Its machine report is
`/tmp/plan13-coordination/baseline-audit.json` and published audited run ref is
`refs/audited/runs/2026-09-25T12-30-30Z-4adc79f4d`.

**Focused iteration evidence:** Five Vitest files passed, 56 tests total:
exact multi-document manifest and passage fixtures, changed hash and invalid
passage rejection, stable catalog ID checks, assessment coverage and candidate
tree identity, an old single-plan record and terminal event replay, run policy
and protocol regressions. `npm run type-check` and `npm run build:web` passed.
The exact focused command, run from `ramify-agent/`, was:

```sh
npx vitest run subs/harness/subs/plan-evidence/src/tests/contracts.test.ts subs/harness/subs/nonfunctional/src/tests/contracts.test.ts subs/harness/src/tests/plan-evidence-compatibility.test.ts subs/harness/src/tests/run-policy.test.ts subs/harness/src/tests/protocol-contract.test.ts
```

`npm run check:self` passed across 12 owners and 478 source files, with 0
errors, 0 warnings, 0 denied accesses and 297 analysis limits. The increase
in owner count is the two new children. The harness's generated foreign API
view was refreshed with `node_modules/.bin/ramify materialize --view api --from subs/harness --root .` (revision 1, two targets, 744 entries).
The complete suite was run only by
the baseline audit before source edits; no post-edit full audit is claimed.

**Handoff to iteration 2:** Use
`plan-evidence/src/interfaces/contracts.ts` for captured document, passage and
catalog validation, `runLayout.documentManifest` and
`runLayout.documentBytes` for the immutable files, and the appendix's
byte-file effect and recovery order. Extend `run/inputs.ts` and plan discovery
without changing the old root-plan read path. Record the actual principles
scan in the same manifest's `principlesScan`. New cross-module imports require
a refreshed generated API view. Catalog extraction and incorporation
acceptance are iteration 3 consumers; the added records/events are schemas
only until those paths are implemented. PE01 and PE14 have schema/replay
evidence here; filesystem discovery, semantic judgment, live candidate
binding, browser behavior and final merge readiness remain unverified until
their assigned iterations. No CheckFinding was opened in this iteration.

## Iteration 2 — capture plan and principles evidence

**Starting revision:** `47f3dd66` (iteration 1 handoff). The independent
non-functional pure-provider commit `dd0bc2df` landed while this iteration
was in progress; it does not implement iteration 2 behavior. The execution
worktree was clean at the handoff, and `/ramify` was not changed.

The `plan-evidence` child now discovers the root plan, local text in its plan
directory, linked local text and project-owned `*.principles.md` files. It
resolves relative paths, including in-project `..` and symlinks, once by
canonical path; rejects project escapes and invalid UTF-8; records missing
links with byte offsets; and reports unreadable principles as partial scan
coverage. Independent nested project roots are excluded from that scan.
Markdown inline, reference-style and HTML links are supported. Discovery
does not decide whether linked text is binding.

Each new run stores exact bytes in `input/plan.md` and immutable companion
files, with `input/documents.json` binding their paths, sizes and SHA-256
hashes. The input manifest points to that file. Atomic exclusive writes are
verified before `job.json` and `job-started` publish the run. Recovery refuses
an incomplete prefix and reconstructs a missing manifest event only after
all recorded bytes verify. Plan documents have `revision.dirty: null` because
the implementation-source Git status excludes `plans/`; their byte hashes
are authoritative. The appendix now states this publication order.

The shared passage resolver retains exact whitespace and reports unknown
documents, invalid ranges and changed bytes explicitly. Analysis reference
validation uses the captured document set, and scope review reads its cited
passages through the same resolver; old root-only references still read as
`doc-001`. The run revalidates the captured corpus before analysis acceptance,
approval, scope review and both sides of the final gate. A companion changed
during the gate cannot lead to `job-completed`.

The scenarios child can extract an explicit ordered document selection with
one run-wide `ps-NN` sequence. Extracted scenarios and accepted origins carry
document identity; citation matching requires that identity, so equal headings
and line ranges in different files do not satisfy each other. Legacy records
without a document still mean the root. Scenario content hashes retain their
source-text meaning. Iteration 3 will accept the architect's incorporation
judgment before supplying the selected documents to this extraction path.

**Verification:** 16 focused Vitest files passed, 196 tests. The cases cover
cycles and duplicate references, reference-style and parenthesized links,
missing files, invalid text, in-project and escaping symlinks, nested project
principles, exact passages, equal scenario ranges in two documents, approval
refusal after a companion edit, mutation during the final gate, and both
startup recovery prefixes. `npm run type-check`, `npm run build:web`, and
`npm run check:self` passed. The self-check covered 12 owners and 486 source
files with 0 errors, 0 warnings, 0 denied accesses and 297 analysis limits.
The focused command, run from `ramify-agent/`, was:

```sh
npx vitest run subs/harness/subs/plan-evidence/src/tests subs/harness/subs/scenarios/src/tests subs/harness/src/tests/analysis-scenarios.test.ts subs/harness/src/tests/analysis-submission.test.ts subs/harness/src/tests/review-stop.test.ts subs/harness/src/tests/plan-deviations.test.ts subs/harness/src/tests/plan-evidence-compatibility.test.ts
```

The baseline full suite was already run by audit; no new full-suite audit is
claimed for this intermediate commit.

**Handoff to iteration 3:** Use the fixed manifest and byte reader in
`run/document-inputs.ts`, `resolvePlanReference` for citations, and
`extractDocumentScenarios` only after accepted incorporation selects the
binding scenario documents. Missing links remain `unjudged` until the
architect's required/unclear/advisory judgment is accepted. The initial
architect still receives the root plan briefing; focused access to all
captured sources and the catalog judgment are iteration 3 work. Later
assignment authority must add every captured plan path to protected files;
the current `deniedFiles` service path protects scenario files but does not
yet include this manifest's plan set. No semantic classification or binding
force was inferred by capture. No CheckFinding was opened.

## Iteration 3 — fixed catalog, incorporation and analysis review

**Starting provider revision:** `9eb4d46fe572998a380831474b4efd94ec6ec7ab`.
The worktree was clean at release. Parallel preparation commits added later
pure context-selection, candidate-tree and readiness code; iteration 3 did
not edit those files.

The initial architect now receives a compact index of captured plan and
principle files, immutable read paths, missing-link locations and scenario
candidates. It reads focused source passages and submits a judgment for every
plan document and missing reference. Only incorporated documents feed the
existing scenario form rules. Required missing text rejects analysis before
acceptance; unclear gaps remain nonblocking and the review shows the exact
referring excerpt, source path and byte range.

The submission has an explicit catalog, including an explicit empty array.
It contains near-verbatim passage references, separate classification,
stated or inferred conditions and uncertainty, with no agent-assigned IDs.
`plan-evidence` sorts by captured document and byte order, verifies every
quote against immutable bytes and assigns separate `nfr-001` and `adv-001`
sequences. The harness stages immutable content-addressed catalog and
incorporation files, then the one `analysis-accepted` event binds their paths
and hashes beside the functional records and counts. Rejection commits none
of these. Old runs without accepted evidence project `unavailable`; an
accepted empty catalog projects `available` with zero items.

The existing analysis review now shows NFR passages, conditions, uncertainty,
source hash and byte range. Advice and incorporation decisions are in a
separate expandable section; advice has no review or satisfaction count.
The browser witness uses an actual disk-backed harness analysis projection
rendered through `PlanAndEntries` in Chromium. It passed 11 checks at desktop
and mobile sizes, including NFR, unclear-source, separate-advice and
empty-versus-unavailable states. This is a component-browser witness, not a
live HTTP or agent-model acceptance run; the browser artifacts were refreshed
while this iteration's source revision was dirty and should be rerun after
the final integration revision.

**Verification:** six focused Vitest files passed, 92 tests, covering exact
catalog IDs, required and unclear missing references, incomplete and
duplicate incorporation, companion scenario incorporation, rejected source
quotes, review projection and prior review-stop behavior. A separate
crash-prefix test passed: staging evidence before the accepted event leaves
an interrupted run with no accepted analysis on recovery, and a fresh run
can accept changed evidence without colliding with the orphaned file.
`npm run type-check`, `npm run build:web` and `npm run check:self` passed; the
self-check covered 12 owners and 497 source files with 0 errors, 0 warnings,
0 denied accesses and 298 analysis limits. The exact focused commands were:

```sh
npx vitest run subs/harness/subs/plan-evidence/src/tests/contracts.test.ts subs/harness/src/tests/analysis-plan-evidence.test.ts subs/harness/src/tests/analysis-scenarios.test.ts subs/harness/src/tests/analysis-submission.test.ts subs/harness/src/tests/review-stop.test.ts subs/web/src/tests/run-page.test.tsx --maxWorkers=2 --testTimeout=15000
npx vitest run subs/harness/src/tests/run-recovery.test.ts -t 'crash after immutable analysis evidence' --maxWorkers=1 --testTimeout=15000
npx tsx scripts/browser-acceptance/plan13-review.ts
```

A broader seven-file command that included the entire recovery suite was
stopped after 90 seconds without a result; no full post-edit suite pass is
claimed. The later plan audit remains the executable whole-run gate.

**Handoff to iteration 4:** `analysis/evidence.ts:readAcceptedEvidence` reads
the authoritative accepted event and verifies both immutable files and the
captured corpus. Use its explicit available/unavailable result for the
one-time selector; do not infer an empty catalog from an absent record.
`runLayout.catalogVersion` and `incorporationVersion` are the immutable paths.
The accepted catalog is fixed; assignment delivery may cite its IDs but may
not add or reclassify items. The current harness recovery policy interrupts
an in-flight run after a crash; this iteration did not add same-run resume.
No CheckFinding was opened.
