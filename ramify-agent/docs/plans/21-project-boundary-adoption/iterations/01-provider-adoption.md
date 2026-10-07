# Iteration 1: atomic provider and layout adoption

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 0,
including the qualified ramify-audit release that exposes P3.
**Owners:** agent root, harness fixture declarations, evidence public-format
reader; other owner declarations only for required signature companions.

## Goal

Install the qualified releases and make the agent a valid project under them,
with current generated-view readers.

## Read first

[Provider receipt](../provider-requirements.md#joint-adoption-receipt),
[source state](../source-state.md), [layout contract](../contracts.md#8-agent-layout-and-public-access),
Plan 20 iteration 5 results, the installed public typings and the exact current
view metadata. Read the project's model specifications before fixing an actual
importability or exposure defect.

## Deliverables

- Update the exact pins to ramify.ts 0.4.0 and the ramify-audit release that
  iteration 0's receipt records, together with the lockfile, in one change.
  The pins change once in this plan. No local tarball
  path or floating version enters the committed package.
- Mark the root and three fixture roots; update `rootDescription` default,
  every target-project generator and intended negative fixture. Child modules
  remain ordinary `module` descriptions.
- Declare `owned-unwired "docs"` at the root. Declare each of the three harness
  fixture roots as `owned-nested-project`, using the paths in the layout
  contract; do not declare their parent `fixtures/`. Verify `.md`, `.ts`,
  `.mts` and `.mjs` docs retain ownership, receive not-analyzed and select no
  module. Preserve ordinary owner write authority over owned-unwired docs.
  Preserve fixture location, scratch rules and compiler/runner exclusions.

- Fix only the concrete newly analyzed script/config imports and companion
  exposures from iteration 0's inventory. Keep auxiliary source analyzed.
- Update evidence's architect reader and minimum provider type adaptation
  required by the new pins. Read the actual API-view version independently;
  keep ordinary/testing source areas separate. Add ownership-query decoding
  with strict shape/refusal handling and source identity, leaving authority
  policy to iteration 3.
- Remove the refused `enclosingProject` key and set `ignorePaths: ["docs/**"]`
  for full-audit reuse. Do not invent an undetected-configuration list. Update stale owner README pin
  claims where touched.

## Verification

PB3-A01–A04 and the adoption-baseline half of PB3-R03.
Extend `subs/harness/subs/evidence/src/tests/ramify-cli.test.ts` and existing
view-reader tests located through the architect view; add
`subs/harness/subs/evidence/src/tests/project-boundary.test.ts` for the real
installed root/ownership/view witness if no existing fixture fits.
Run the affected fixture and root-description tests explicitly, then type-check
and check:self. Run actual materialization from a nested module and verify its
selected project and both source-area catalogs.

Establish a clean full baseline through the adopted audit. Its expected-file
record covers the real configured suite. Old-schema evidence cannot substitute
for this baseline. Preserve nonblocking analysis diagnostics as diagnostics.

## Exit criteria

Pins, roots, declarations and necessary decoders are one coherent commit.
The agent's structural/type checks and new full baseline pass. Any broader
repair discovered by the probe is completed as an explicit prerequisite.
New target-run behavior still awaiting later iterations is stated, not enabled
as a completed migration.

## Handoff

`iteration1-results.md`, package integrity and actual format identifiers,
root/fixture inventory, materialization receipt and new-schema baseline refs.
