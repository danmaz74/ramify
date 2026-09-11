# Iteration 13: Declarations, document revisions, self-check and completion

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iterations 11 and 12 (`live-equivalence` and
`fast-measure`; every earlier capability). **Owners:** any owner whose real
violation the self-check finds; the independent scripts scope; the
architecture documents, the roadmap and the development guides.

## Goal

Close the plan: validate the eleven final declarations and the unchanged
package entries, turn the resident checker on the toolkit, revise the
architecture documents to state what was implemented, run both earlier gates
and the unfiltered `--plan 5` gate on one build, and write the completion
report Plans 3, 4 and 6 start from.

## Read first

- Main plan: [Validation and completion conditions](../main-plan.md#validation-and-completion-conditions);
  [Deliverable and completion boundary](../main-plan.md#deliverable-and-completion-boundary);
  [Exposure rules for this plan](../main-plan.md#exposure-rules-for-this-plan);
  matrix row I5-14.
- [scope.md](../scope.md#document-revisions): Document revisions;
  [Explicit deferrals](../scope.md#explicit-deferrals);
  [Plan 2 supersession](../scope.md#plan-2-supersession).
- [owners.md](../owners.md) in full, especially Package entries, Foreign
  signature types, the Activation manifest and the Manual description review.
- [Tooling roadmap](../../../roadmap.md): the
  [Plan 5 brief](../../../roadmap.md#plan-5-fast-incremental-checks),
  [Information to preserve between plans](../../../roadmap.md#information-to-preserve-between-plans)
  and authoring rule 9.
- Plan 2's [iteration 14](../../done/iteration-2-resident-verification/iterations/iteration14.md)
  and its [completion report](../../done/iteration-2-resident-verification/iterations/iteration14-results.md)
  as the report's pattern; `scripts/validate-final-contracts.ts`,
  `scripts/reference-harness/{self-cases,relocation,completion-cases}.ts`.
- [Development testing guide](../../../development/testing.md): Commands
  currently available, Report what ran.

## Deliverables

1. Final declarations: `scripts/validate-final-contracts.ts` extended to read
   [owners.md](../owners.md) as the third reviewed layer, so all eleven
   `module.ramify` files are compared with the accepted texts, every exposure
   links to a real export, and the `./analysis` entry witness is
   `openRetainedSession` rather than `analyzeIncrement`. All eight package
   entries and `bin.ramify` resolve from a packed install.
2. Self-check: `npm run check:self` over the eleven-owner toolkit, resident
   under a harness-owned `RAMIFY_ENDPOINT_DIR`, reports every owned file with
   no finding and no analysis limit; a real violation is fixed in its owner
   and nothing is exempted.
3. Document revisions exactly as [scope.md](../scope.md#document-revisions)
   lists: [daemon and analysis](../../../architecture/daemon.md) gains the
   session-in-a-thread structure, the per-file fact granularity, the covering
   rule, the sweep and the hook request and reply;
   [memory lifecycle](../../../architecture/memory-lifecycle.md) gains the
   compiler server as a bounded cost and the hot and warm levels;
   [processes and clients](../../../architecture/processes-and-clients.md)
   gains `check --changed` and its exits. The two fast-check analyses under
   `docs/analysis/` are marked as superseded by the implemented architecture
   where they differ, and the roadmap's Plan 5 row and section are advanced to
   the delivered scope with links to the evidence. MCP, overlay and explorer
   claims stay false.
4. Regression on one build: `npm run reference:verify -- --plan 1` with all
   308 Plan 1 instances passing; `npm run reference:verify -- --plan 2` with
   the ten superseded records and the remaining 166 passing; the unfiltered
   `npm run reference:verify -- --plan 5` requiring all 103 instances and
   passing; no daemon surviving any gate; the worker and process suites with a
   recorded macOS pass.
5. Command documentation updated: the testing guide's command list gains
   `ramify check --changed`, `npm run measure:fast` and the
   `RAMIFY_ENDPOINT_DIR` convention for every scripted resident run, and the
   example hook adapter is documented where the CLI commands are described.
6. The completion report `iteration13-results.md` beside this file recording:
   executed capabilities and instance outcomes by evidence kind; the session,
   revision, checked-set, delta and timing vocabulary; the compact reply, the
   `ramify.check/1` document and the hook contract with its exits; the
   covering rule, the sweep, the deadlines and the hot and warm levels; the
   measured budgets with their platform and the deferral triggers evaluated
   in iteration 12; the Plan 2 supersession with its amendment; the fixtures,
   sequences and recipes Plans 3, 4 and 6 inherit; and the known limits,
   including the advisory S500 and S1000 rows, the deferred proportional
   relink, the deferred resolution-bounded narrowing, the deferred persistent
   checkpoints and the unchanged `unsupported-commonjs` limit.

## Matrix rows executed here

- I5-14: `self-check-eleven` (eleven owners, every owned file catalogued, no
  finding or limit); `declarations-final` (eleven declarations match
  owners.md, including the six added lines and the removed increment line);
  `package-entries-unchanged` (eight entries from a packed install, the
  `./cli` and `./client` closures free of session, worker and compiler
  modules); `plan1-regression` (308 instances); `plan2-regression` (166
  required with ten superseded); `documents-revised` (the three architecture
  documents state the implemented session, and the analyses are marked
  superseded where they differ).

## Verification

Every command of the main plan's validation section, in order, under one
exported `RAMIFY_ENDPOINT_DIR` that the last `daemon stop` empties:

```sh
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run build && npm run type-check && npm test
npm run reference:cases
npm run check:reference && npm run check:self
npx tsx scripts/validate-final-contracts.ts
npm run reference:verify -- --plan 1
npm run reference:verify -- --plan 2
npm run reference:verify -- --plan 5
npm run measure:fast && npm run measure:resident
npm run reference:report
npm run diagrams && npm run site:build
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kinds: `process` for five I5-14 rows over the toolkit copy `T` and
the reference copy `R`, and `unit` for `documents-revised`. Expected
intermediate failures: none remain by design; the unfiltered `--plan 5` gate
is this plan's completion gate, and a failure here is a defect to fix, not a
record to retire.

## Exit criteria

- Every checkbox of the main plan's completion list holds with cited
  evidence, and all three gates pass on one build.
- The eleven declarations, the eight package entries and the toolkit
  self-check accept the delivered contract.
- The architecture documents and the roadmap state the implemented session,
  and the completion report exists beside this file answering every item of
  the roadmap's Plan 5 handoff row.

## Handoff

Plans 3, 4 and 6 begin from the implemented session, revision and delta
contracts, the compact reply, the hook command, the live sequences and the
measured limits this report records, rather than from the roadmap's proposed
names. The retained facts and reverse indexes are the inputs an inspection
command and the explorer will query; no query field beyond this plan's is
implemented.
