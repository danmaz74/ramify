# Iteration 3: The finding in batch, the retained session and the CLI

**Plan:** [Plan 8](../main-plan.md).
**Prerequisites:** iterations 1 and 2.
**Owners:** `descriptions` (pass-through in link), `analysis` (session facts,
revision paths, batch evaluation, diagnostics), `cli` (pinned forms only).

## Goal

A project with a missing companion fails its check with the plan's finding,
on every revision path and in batch, while every import decision is still
evaluated.

## Read first

- Main plan: the runnable outcome, RD-1, the contract's Finding section,
  SC16 to SC20.
- `subs/analysis/subs/descriptions/src/link.ts` where originals enter
  `LinkedDescriptions`.
- `subs/analysis/src/session-facts.ts` (stages, the `invalid` short-circuit,
  `factBytes`), `session-revision.ts` (`originalSurface()`, `patchPositions`,
  `relinkAndDecide`, the six revision paths, stage timings),
  `evaluate-accesses.ts`, `report-data.ts` (`diagnostic()`),
  `interfaces/analysis.ts` (`AnalysisCode`, the category union).
- `subs/daemon/subs/contexts/src/context-manager.ts` for the delta's `new` and
  `removed`; `subs/cli/src/format.ts`, `changed-command.ts`.
- [CLI invocation contract](../../../architecture/cli-invocation.spec.md)
  "Hook and complete checks"; [daemon.md](../../../architecture/daemon.md)
  "Implemented retained session".

## Deliverables

1. Link and model building carry `companions` from the catalog into
   `Model.originals` unchanged.
2. `originalSurface()` includes `named`, `inferred` and `unresolved`;
   `patchPositions` refreshes declarations and companion `evidence` on the
   `moved` path before diagnostics and coverage notes are regenerated.
3. `AnalysisCode` gains `exposed-without-companion`, the category union gains
   `exposure`, and one function turns a `CompanionViolation` into a
   diagnostic: location the statement, related location the naming position,
   message as the runnable outcome shows, with the `requires-tag` variant
   naming the tags to add to the symbol.
4. The decide stage calls `listCompanionViolations` whenever the model was
   rebuilt or patched, or `delta.changed` or `delta.moved` is not empty, and
   in the batch engine. Position-only revisions rerun the pass against the
   patched model and regenerate diagnostics, including related locations,
   messages and IDs. They need no relink or extra compiler requests for this
   pass. Reuse previous outputs only when semantic inputs and positional
   evidence are unchanged. Identity follows the existing diagnostic rules;
   a move must match fresh batch output, not preserve an obsolete ID. The
   pass has its own stage timing, `companions`.
5. The coverage notes `signature-inferred` and `signature-unresolved`, one
   per original with an effective exposure, derived in the same stage from
   the retained `inferred` and `unresolved` facts. Unexposed originals
   produce none. Regenerate the notes on position-only revisions too, using
   current declaration evidence and the same identity rules as batch.
6. The cli-invocation contract lists the finding and the two notes. The CLI's
   text and JSON forms are pinned by golden tests; change `format.ts` only if
   a pinned form shows a defect.

## Matrix rows executed here

SC16 to SC20.

## Verification

Direct-adapter tests of the retained session and the batch engine on a
fixture project derived from the reference example's shape, with one owned,
one re-exposed and one tag violation. SC16 also runs the missing-companion
case with explicitly typed arrows and function expressions, verifies failure
before and success after companion exposure, and checks that fully annotated
signatures have no inference note. Include a partial annotation case with
both a failing companion finding and a nonblocking inference note.
SC17 adds an unrelated denied import
and asserts both findings and a non-`invalid` execution. SC18 drives one
session through a signature edit, a body edit leaving signature evidence
unchanged, a blank-line insertion before the violating signature, a move of
only its naming position within the declaration, a `module.ramify` fix, a
file creation and a configuration edit. For the position cases, keep the
violation present and include exposed originals with inferred and unresolved
signatures. Compare complete diagnostic and coverage records with a fresh
batch check after each edit, including locations, related locations, messages,
IDs and duplicate counts. Assert `moved` rather than `changed` for position
edits, no relink or extra compiler requests for their companion pass, and
zero compiler work on the `description` path. SC19 uses the installed
executable against a real daemon and pins updated text/JSON locations after
a position-only edit that leaves the violation present and the exit code 1.
**Expected intermediate failure:** `npm run check:self` and the
reference example's check may now report findings in the toolkit's own
exposures. Record the full list in the results for iteration 4; do not
relax the rule, add an exclusion or edit toolkit exposures here.

## Exit criteria

SC16 to SC20 pass. The list of toolkit and reference example findings and
`signature-inferred` notes is recorded. No existing finding's identity
changed on the pre-existing fixtures.

## Handoff

The finding list and note counts for iteration 4, and the `companions` stage
timing for iteration 5.
