# Iteration 2: Source-line and delivered-change evidence

**Goal:** produce reproducible `S0`, `A`, `D` and `C` facts from Ramify's
inventory and identified Git endpoints.

## Prerequisites

Iteration 1 complete. The merged Plan 3 measurement capture and
`harness/evidence` Git surface are the starting implementation.

## Work

1. Extend `harness/evidence`'s `ramify.measure/1` schema with
   `ownershipRule`, `files` and `outsideModuleFiles`. Validate path, owner,
   physical area, kind and bytes. Keep invalid or incompatible documents
   unavailable with their reason.
2. Implement the policy's source classification from the inventory. Do not
   select files by extension or directory heuristics.
3. Count baseline nonblank source lines from an identified commit, normalizing
   line endings and retaining production/test file and line subtotals. Define
   `ramify-agent.source-line-baseline/1` in the harness and return evidence
   inputs from the evidence module without putting run policy into the child.
4. Add an evidence-module endpoint diff using Git with recorded version and
   fixed options: no external diff driver, no text conversion, zero context and
   an explicit rename threshold. Count nonblank added/deleted source lines under
   each endpoint's inventory classification.
5. Define `ramify-agent.delivered-change/1` with endpoint and inventory
   references, diff recipe, production/test subtotals, `A`, `D`, `C`,
   transitions and coverage.
6. Make binary inventoried source, unreadable commit content, a missing
   endpoint, inventory mismatch and an unobserved changed path that might be
   source explicit unavailable cases.

## Required fixture cases

- production and test source, including ordinary source in a testing module;
- comments, blank-only lines, line-ending normalization and replacements;
- deletion, new file, pure rename, copy that leaves its original, and rename
  with edits;
- a path changing between production source, test source and non-source;
- generated, dependency, documentation and resource paths excluded by policy;
- binary source and an inventory whose revision does not match its endpoint;
- overlapping module subtrees without double counting.

## Acceptance cases owned

TE05–TE09.

## Exit evidence

- Each fixture has named expected `S0`, `A`, `D`, `C` and subtotals.
- Repeating a measurement against the same commits produces byte-identical
  evidence apart from no time-dependent field.
- No ramify.ts source is imported; the consumer uses the CLI document and the
  evidence module's own Git API.
- The four standard project checks pass.

