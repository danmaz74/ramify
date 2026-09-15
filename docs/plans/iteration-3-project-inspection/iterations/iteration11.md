# Iteration 11: Declarations, document revisions, self-check and completion

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 10 (process evidence and the archived query
measurements). If iteration 9's join is still pending because Plan 5 has not
merged, this iteration runs and records the I3-12 instances as pending; the
plan is then not complete, and the completion report says so in its first
section rather than claiming the gate. **Owners:** all eleven owners'
declarations and the documentation under `docs/`.

## Goal

Close the plan: final declaration texts validated, the eleven-owner self-check
accepting the toolkit, the architecture and roadmap documents revised to
record what is now implemented, every gate run on one build, and the
completion report handing Plans 4 and 6 the query vocabulary, the document,
the rules and the fixtures they consume. No new capability is implemented
here; a gap this iteration finds is fixed in its owning iteration's files and
re-verified there.

## Read first

- [owners.md](../owners.md) in full, especially the final declaration texts,
  the foreign signature types, the package entries and the activation manifest
  with its iteration 11 row.
- [scope.md](../scope.md#document-revisions): the exact list of documents and
  the sections to revise; [Budgets](../scope.md#budgets) and
  [Explicit deferrals](../scope.md#explicit-deferrals) as the completion
  report's sources.
- Main plan: [Deliverable and completion boundary](../main-plan.md#deliverable-and-completion-boundary);
  [Validation and completion conditions](../main-plan.md#validation-and-completion-conditions)
  with its checklist; matrix row I3-14;
  [Acceptance matrix](../main-plan.md#acceptance-matrix) as the inventory the
  gate enforces.
- [subcases.md](../subcases.md) in full, to confirm every instance is executed
  or explicitly pending.
- [Daemon and analysis](../../../architecture/daemon.md): Service operations
  and client behavior; Acceptance evidence; Decisions still requiring review.
  [Processes and clients](../../../architecture/processes-and-clients.md): CLI
  commands. [Memory lifecycle](../../../architecture/memory-lifecycle.md):
  Measurement and acceptance, ML06.
  [Roadmap](../../../roadmap.md): the Plan 3 brief, its status and handoff
  rows.
- [Module-description principles](../../../model/module-description.principles.md)
  for the final review of every added declaration line.
- Source: every `module.ramify` this plan touched, root's `module.ramify`,
  `scripts/validate-final-contracts.ts` and `scripts/reference-harness/completion-cases.ts`;
  Plan 1's and Plan 2's completion reports as the shape for this one.

## Deliverables

1. Final declaration texts in every `module.ramify` this plan touched,
   matching [owners.md](../owners.md) exactly, with comment identifiers
   continuing Plan 5's numbering and no line reordered or renumbered.
   `scripts/validate-final-contracts.ts` extended to validate the plan's
   added lines and the eight package entries, which are unchanged.
2. Document revisions, as [scope.md](../scope.md#document-revisions) lists:
   the [daemon architecture](../../../architecture/daemon.md) service
   operation table gains `inspect` with the consumer rule and the detail
   tiers; the [processes and clients](../../../architecture/processes-and-clients.md)
   command table records `available`, `inspect` and `explain` as implemented
   with their exits; [memory lifecycle](../../../architecture/memory-lifecycle.md)
   records ML06's status with the measured detail bounds; the
   [roadmap](../../../roadmap.md) status and handoff rows are updated; the
   development guides' command lists gain the three commands. No model
   document changes.
3. `CLAUDE.md`'s implementation architecture paragraph extended with the three
   commands and the `inspect` operation, stating only what is implemented on
   this build.
4. The completion report `iterations/iteration11-results.md` recording: the
   query vocabulary and the `ramify.inspect/1` document, the consumer-area
   rule, the spelling rule and its deferred alternatives, the detail contract
   with its limits and states, the harness fixtures and capabilities, the
   archived measurements with their binding and advisory rows, every
   remaining limitation, and the pending state of the join if iteration 9 has
   not run. It names what Plans 4 and 6 consume: `InspectionQuery`,
   `InspectionResult`, `InspectDocument`, `InspectParams`, `InspectOutcome`,
   the consumer rule, the spelling rule and the round-trip fixtures.
5. The `completion` capability registered and executed in the `--plan 3`
   inventory, so the unfiltered gate requires every instance and passes for
   the first time on this build.
6. Regression evidence on one build: Plan 1's 308-instance gate, Plan 2's
   gate and, once Plan 5 has merged, Plan 5's gate, together with
   `npm run check:self` over eleven owners and `npm run check:reference` over
   fifteen.

## Matrix rows executed here

- I3-14: `self-check-eleven`, `declarations-final`,
  `package-entries-unchanged`, `plan1-regression`, `plan2-regression`,
  `plan5-regression`, `documents-revised`, `handoff-recorded`.

## Verification

```sh
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run build
npm run type-check
npm test
npm run reference:cases
npm run check:reference          # fifteen owners
npm run check:self               # eleven owners
npm run reference:verify -- --plan 1
npm run reference:verify -- --plan 2
npm run reference:verify -- --plan 5
npm run reference:verify -- --plan 3      # the unfiltered gate, expected to pass here first
npm run measure:inspect
npm run reference:report
npm run diagrams
npm run site:build
node dist/src/cli-entry.js daemon stop
git diff --check
```

Expected intermediate failures: none. This is the plan's completion gate, and
the unfiltered `--plan 3` run that failed in every earlier iteration must pass
here. `--plan 5` is required only once Plan 5 has merged; when the join is
pending, the I3-12 instances are reported pending and the plan is recorded as
incomplete rather than passed. By hand: every declaration line against the
description principles' review checklist, and every completion condition of
the main plan's checklist against the evidence cited in the report.

## Exit criteria

- Every I3 instance of the acceptance matrix ran and asserted its own
  expectation, or is explicitly recorded pending on the join, and the
  unfiltered `--plan 3` gate reflects that state.
- `npm run check:self` accepts eleven owners, `check:reference` fifteen, the
  final declaration texts validate and the eight package entries are
  unchanged.
- Plan 1's, Plan 2's and, when merged, Plan 5's gates pass on this build.
- The five architecture and roadmap documents and the development guides are
  revised, and no model document changed.
- The completion report records the vocabulary, the document, the rules, the
  measurements, the limitations and the successor inputs.

## Handoff

Plan 4 maps `inspect`, `available` and `explain` to MCP tools over
`InspectionQuery` and `InspectionResult` as recorded here. Plan 6 builds the
explorer on the same vocabulary, adding the aggregates, counting units,
cursors and ranking this plan deferred. The round-trip fixtures and the
archived measurements are the baselines both successors start from.
