# Iteration 4: TypeScript symbol details

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Iteration 1 contract review and frozen detail bounds.
**Owners:** `analysis/typescript` only. This iteration is independent of
iterations 2 and 3.

## Goal

Extract token-efficient, body-free signatures and the first useful
documentation paragraph for defining-file exports from the retained compiler,
with explicit bounded states.

## Read first

- [Symbol-detail semantics](../scope.md#symbol-details),
  [detail contract](../contracts.md#typescript-detail-provider) and frozen probe
  results from iteration 1.
- TypeScript source-interpretation principles.
- `interfaces/source.ts`, `compiler-helper.ts`, `bridge.ts`, `wire.ts`,
  `retained-source-analysis.ts`, catalog identity code and compiler lifecycle
  tests.
- Any declaration-rendering source cited by the probe as provenance; adapt
  algorithms, not host-domain APIs or caches.

## Deliverables

1. Implement the plain request/result vocabulary and the compiler-project
   `describeSymbolDetails` operation.
2. Resolve the requested defining-file export to the same canonical original
   as the catalog before rendering. Forwarding and Ramify aliases cannot change
   that lookup.
3. Render body-free declarations for the reviewed declaration kinds, preserve
   distinguishing overloads, normalize the first documentation paragraph and
   omit absent docs.
4. Enforce UTF-8 signature/documentation, overload and total-result bounds.
   Per-entry bounds return `truncated`; total/malformed/cancelled operations
   return no prefix.
5. Extend the retained helper protocol and adapter without adding a process or
   retained detail cache. Isolated valid-request failures return stable
   `unavailable` states.
6. Apply the reviewed exposure and relay lines and cover disposal/server-loss
   behavior.

## Matrix rows executed here

I2A-04: all eight leaves.

## Verification

Run focused detail, wire, compiler path, retention and lifecycle tests plus the
existing TypeScript owner suite. Type-check public fixtures. Assert exact output
for functions/classes/interfaces/types/variables/enums, Unicode boundaries and
back-to-back cancelled/valid requests. Confirm no declaration body or compiler
object crosses the protocol.

## Exit criteria

The retained adapter describes exact originals with deterministic bounded plain
data; exceptional states are explicit and cleanup is complete.

## Handoff

The detail provider and limits go to iteration 5 and the hot/warm query in
iteration 7.
