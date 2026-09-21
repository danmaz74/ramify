# Iteration 4: Toolkit and reference example conform; teaching and architecture text

**Plan:** [Plan 8](../main-plan.md).
**Prerequisites:** iteration 3 and its recorded finding list.
**Owners:** every toolkit owner named by a finding; `examples/collection-review`;
the site; `CLAUDE.md`; `docs/architecture/daemon.md`.

## Goal

The toolkit and the reference example pass with the rule enforced, by
exposing companions or narrowing signatures, and the teaching and
architecture text describes the delivered rule.

## Read first

- Main plan: the rule, RD-6, SC21 and SC22.
- Iteration 3's results: the finding list.
- For each finding, the owner's `module.ramify`, its `README.md` and the
  signature named. Plans 1 to 3's "Foreign signature types" tables
  ([owners.md](../../iteration-3-project-inspection/owners.md)) state which
  foreign types were meant to travel with which contract.
- The site's exposure teaching page and its compiler scope; `CLAUDE.md`
  writing conventions.

## Deliverables

1. For each finding, one of two corrections, chosen per case and recorded
   with its reason: expose the companion through the same steps, preferring a
   move of contract vocabulary into the owner's `src/interfaces/` with a
   wildcard where the owner already curates one; or change the signature so
   that an internal type stops appearing in the contract.
2. A `requires-tag` finding is corrected by tagging the exposed symbol, never
   by removing a required-importer tag from the companion.
3. The same for `examples/collection-review`. Its expected-decision fixtures
   change only where an added exposure makes a formerly denied import
   allowed; each such change is listed.
4. The site page teaching exposure gains the rule with one application-agnostic
   example of a function, its parameter type and the finding.
5. `CLAUDE.md` names the rule in its model summary; `daemon.md` records the
   companion facts and the exposure index under the retained session, and
   keeps "there is no automatic signature-type exposure".

## Matrix rows executed here

SC21 and SC22.

## Verification

`npm run check:self`, the reference example's check and the focused suites of
each touched owner. If the finding list exceeds what one context can correct,
split by owner subtree, finish whole subtrees, and record the remainder as a
follow-up iteration through the workflow tools instead of relaxing the rule.
`ramify-agent/` is not edited.

## Exit criteria

SC21 and SC22 pass. Zero `exposed-without-companion` findings on the toolkit
and the reference example. The results list every changed exposure statement
and signature with its reason.

## Handoff

The conforming toolkit as the real-project measurement case, and the
remaining `signature-inferred` count, for iteration 5.
