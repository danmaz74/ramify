# Iteration 4: truthful hook dispositions

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 3.
**Owners:** evidence CLI adapter; harness hook records, tool feedback and
protocol projections.

## Goal

Report the actual scope of Ramify checking without turning exit 0 into a claim
that excluded source was analyzed.

## Read first

[Hook contract](../contracts.md#4-hook-results), adopted check JSON contract,
`subs/harness/subs/evidence/src/ramify-cli.ts`,
`subs/harness/src/hooks/post-write.ts`, hook consumers and findings settlement.

## Deliverables

- Decode and retain current per-path dispositions with provider identity,
  owner/exclusion/reason and content/deletion evidence where present.
- Separate overall project verdict from path analysis status in durable records
  and tool feedback. Preserve mixed results and findings returned with exit 2.
- Drive standing-finding settlement only from actual provider coverage. Naming
  an inert or excluded path does not clear prior findings.
- Remove `outsideModules` plumbing and suppression of the obsolete warning.
  Render current boundary violations and project warnings without changing
  their severity. Remove redundant filename shortcuts for configuration paths
  the new provider can classify.
- Preserve bounded hook behavior and shared ordinary/capability/standalone
  wiring; complete checks remain explicit verification, not an automatic
  response to every not-analyzed path.

## Verification

PB3-H01–H04. Extend
`subs/harness/subs/evidence/src/tests/ramify-cli.test.ts`,
`subs/harness/src/tests/hook-checks.test.ts` and the affected shared engineer
tests. Add real captured-payload cases to the iteration 1 provider fixture:
excluded-only exits 0/1, mixed disposition, stale/deadline exit 2, source
deletion, auxiliary boundary violation and compiler-selected scratch warning.
Verify messages and stored records, then type-check/check:self.

## Exit criteria

No excluded path is represented as passing source analysis. Findings survive
uncovered/unrun paths and clear only on covering evidence. New formats are
strictly decoded; unsupported results are explicit gaps.

## Handoff

`iteration4-results.md`, captured provider payloads and disposition/protocol
mapping for the browser work in iteration 10.
