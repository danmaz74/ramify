# Iteration 6: Edit semantics through the quick service

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 5 (`daemon-service`, the quick environment).
May run in parallel with iteration 7, which touches daemon's wire and client
source while this iteration touches harness handlers. **Owners:** the
independent `scripts/reference-harness/` scope; an owner (`contexts`,
`analysis` or its children, `daemon`) only to fix a defect these scenarios
find, with a regression test in that owner.

## Goal

Verify with the real engine every resident rule that an edit drives:
synchronized checks answered from a capture after acknowledgment while the
watcher is silent, `expect` verification and supersession, provider-influence
rechecks, and the sixteen edit classes of I2-09, from exposure removal and
tag changes through wildcard growth, merged declarations, configuration and
shim edits, README edits, invalid descriptions and an acquisition failure
delivered unpublished. Each scenario asserts its independent expectation
through the direct channel.

## Read first

- [scope.md](../scope.md): Freshness and supersession guarantees;
  Invalidation dependency model (the reconsideration table); Batch and
  incremental comparison.
- [subcases.md](../subcases.md): Fixture and evidence conventions (statement
  IDs, `remove-hop`, `restore-hop`); rows I2-02 and I2-09.
- Main plan: Engine results and their delivery; matrix rows I2-02 and I2-09;
  Resolved decision 3.
- [contracts.md](../contracts.md): the ordering and watcher rules under
  Contexts; the `CheckOutcome` and `OpenOutcome` shapes.
- [Daemon and analysis](../../../architecture/daemon.md): DA02, DA05 to
  DA09, DA13, DA14. [Reference contract map](../../reference-project/contract-map.md)
  for W2, C1, K1 and the `remove-hop` anchor; [reference cases](../../reference-project/cases.md):
  Exposure and original identity, Tags and source areas, Testing and
  composition.
- Iteration 3's I2-11 handlers and `scripts/reference-harness/mutation.ts`
  (`replaceExactlyOnce`); iteration 5's `createQuickEnvironment`.

## Deliverables

1. Scenario handlers over `Q/R` and `Q/F` copies: each names its anchor,
   asserted to occur exactly once before writing, applies one mutation,
   drives the controlled watcher (withheld, delivered or erroring) and the
   controlled clock, and asserts the expectation subcases.md records,
   including `freshness.verified`, `captureStarted >= acknowledged` and the
   expected `reusedRevision` on every synchronized check.
2. Fixture variants for F: the consumer's `./later.js` import for
   `missing-file-appears`, the `@provider/*` path mapping for `config-change`,
   the `Type` re-declaration for `type-to-runtime-merge` and the aliased
   default export for `alias-identity`; the CSS-module shim edit and the K
   description mutation for R.
3. A driver wrapper that injects one acquisition read failure for
   `resolver-failure`, so the engine returns its incomplete report and the
   service delivers it `reported` with `published: false`.
4. Defects found in an owner are fixed there with a regression test; the
   harness never widens an assertion.

## Matrix rows executed here

- I2-02: `delayed-watcher` (denial from a capture after acknowledgment; the
  watcher never fired); `expect-match` (`reported`, `verified`, not reused);
  `expect-superseded` (`superseded` with observed identity; captured
  revision published); `provider-influence` (unchanged importer denied; the
  driver-reported `changed` lists W's description only).
- I2-09: `remove-exposure` (`not-visible` denial at root; carried by the watch
  event); `repair-exposure` (denial gone; counts at baseline); `tag-change`
  (core originals gain `ui`; adapter imports denied; revert clears);
  `move-to-testing` (`testing-origin` denial; move back clears);
  `wildcard-add` (C1 and W1 expand without a description edit);
  `wildcard-remove` (`missing-export`; contract shrinks);
  `foreign-wildcard-invalid` (`foreign-original`; invalid revision;
  `lastValid` retained); `type-to-runtime-merge` (a type-only availability
  check, then a value check for the unchanged importer; no tag denial from
  the untagged fixture); `alias-identity` (identity preserved; no new
  binding); `config-change` (`unresolved-target` coverage, restored
  decision, `configuration` fingerprint changed); `shim-change` (located
  `missing-export`; resource identities unchanged); `missing-file-appears`
  (coverage, then a decision; `absent` drove the rerun); `readme-edit` (only
  `metadata` recomputed; decisions unchanged); `invalid-description` (invalid
  revision with located `missing-file`; no answer from the previous model);
  `invalid-recovery` (valid revision; `lastValid` advances);
  `resolver-failure` (`reported` with `published: false` and the acquisition
  diagnostic; published revision and `lastValid` unchanged; `reconciling`,
  then a fresh publication).

## Verification

```sh
npm run build && npm run type-check && npm test
npm run reference:verify -- --plan 2 --iteration 6   # requires 2 to 6
npm run check:self                                   # unchanged declarations
git diff --check
```

Evidence kind: `quick` only; a scenario that passes only with a widened
assertion is a defect in an owner. The unfiltered `--plan 2` still fails.

## Exit criteria

- All twenty instances ran through `createQuickEnvironment` and asserted
  their own expectation.
- Every synchronized check in the scenarios records `verified: true` and a
  capture started after acknowledgment; the unpublished delivery leaves the
  published revision unchanged.
- No owner change here lacks a regression test.

## Handoff

Iteration 9's I2-24 flows and iteration 11's recorded sequences reuse these
mutations and fixture variants at the CLI and process level.
