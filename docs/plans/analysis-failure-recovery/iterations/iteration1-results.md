# Iteration 1 results

**Date:** 2026-10-12. **Status:** Contract package reviewed; iteration 1
deliverables complete. Ownership and recovery runtime are not implemented here.

[Iteration brief](iteration1.md), [contracts](../contracts.md) and
[acceptance matrix](../acceptance.md).

## Delivered and reviewed

The coordinator reviewed and adopted the concrete ownership union, public
decoder name, project-owned shared ownership/exclusion validators and extracted
path syntax predicate, canonical selected-root failure propagation, nullable
missing diagnostic locations, CLI/2 diagnostic union, bounded recovery reason
composition and both IPC carriers. A review correction identifies the exact
`ok:true` unavailable JSON example as a check operation so its pre-existing
required fields are explicit. No contract decision blocks iteration 2.

The package inventories producer/adapter losses for check, affected,
materialize and measure, including failures without reports and formatter
failure. It records the exact /3 negotiation policy, public decoder API,
signature companions and each existing/new exposure path. Owning CLI,
daemon and memory architecture documents have short reviewed-contract notes
that explicitly retain staged delivery status.

FR01–FR02 have owner-local typed examples, ten named rejected ownership
examples, negative compiler witnesses, preserved diagnostics/related locations,
and separate frozen Check/3, CLI/1 and IPC/2 JSON witnesses. CLI examples lint
the reviewed structure; they are not substitutes for the production decoder.
Daemon examples exercise the actual current /2 strict check/error boundary and
reject evidence in nonscalar `error.details`.

Analysis supplies `withRecoverySmall`, `RecoverySmallFixture`,
`recoverySmallFiles` and `recoverySmallPaths`, exposed only to testing source
through analysis → root → descendants. The builder creates isolated root,
provider and consumer modules, two explicitly exposed provider exports, one
allowed consumer import and remove/repair operations with unconditional cleanup.
Its current-provider qualification proves a passing control, unchanged ownership
after removing exports, exactly two provider missing-export diagnostics and
completed repair through fresh direct analyses.

## Identity and verification

Source base: `6161e76dcd22e45213a59e19950762750ca03e60`, plus preserved local
specification/index/roadmap/plan edits and this iteration's uncommitted changes.
Package: `ramify.ts` `0.4.3`. Host: Linux x64, Node `v22.23.3`.
Build identity: `83b86a8e3eb0af45b1485fb8a6ed86527cd9ccaf940e279981677996ba8a282a`.
The production build preceded fixture additions; no production TypeScript was
changed. Self-check analyzes the current source/declarations through that build.

| Command | Observed result / evidence |
| --- | --- |
| `npm run build` | Exit 0; production and explorer built. Existing Vite large-chunk warning retained. |
| `dist/src/ramify materialize --view architect --root .` | Exit 0; 15 modules, 2,103 records, measured dependencies. Owned temporary endpoint and daemon stop on shell exit. |
| `dist/src/ramify materialize --all --root .` | Exit 0; 29 API targets, 8,101 entries. Same owned endpoint and cleanup. Generated views were searched before new exposure decisions. |
| `npm run type-check` | Final exit 0; root, portable, scripts and reference-harness configurations passed, including negative compiler witnesses. |
| `npx vitest run subs/cli/src/tests/recovery-contracts.test.ts subs/daemon/src/tests/recovery-contracts.test.ts subs/analysis/src/tests/recovery-fixtures.test.ts` | Final exit 0; 3 files, 9 tests, 8.23 s. [Retained output](../evidence/iteration1-fixtures.log.gz). |
| `npm run check:self` | Final exit 0; completed/passed, 15 owners, 607 source files, 20 resources, 0 errors/warnings, 41 analysis limits. [Retained output](../evidence/iteration1-self-check.log.gz). |
| `git diff --check` | Exit 0 for tracked changes; new-file whitespace and document links validated separately. |

[Initial failures and corrections](../evidence/iteration1-initial-failures.md)
preserve the first type errors, duplicate finding fixture failure and aggregate
test timeout. The aggregate fixture test now has a coordinator-reviewed 30 s
Vitest timeout; no runtime deadline or resource budget increased. Self-check's
ordinary pre-existing analysis limits remain visible; its one initial new
inferred-signature note was removed by an explicit helper constant type.

FR01 and FR02 pass their iteration 1 contract/fixture portions only. FR01
runtime ownership decoding remains iteration 2; FR02 negotiated transport and
new CLI schema runtime acceptance remain iterations 5–6. This work establishes
neither installed ownership behavior, resident recovery nor process/package
acceptance. No audit, commit, push or publication was attempted. The coordinator
prepared the configured external audit installation for later clean-candidate
qualification; this dirty checkout cannot establish that gate.

## Scope changes and successor inputs

The brief and main plan remain read-only. Fixture qualification uses wildcard
root re-exposure to avoid additional root missing-export findings. A shared
testing exposure was delivered now so iteration 2 can use the exact isolated
builder from root and CLI tests. The timeout adjustment is confined to the
multi-analysis fixture qualification test. No model, grammar or interpretation
change was made.

Iteration 2 implements `OwnershipBatchInvocation`, `OwnershipBatchResult`,
`OwnershipBatchOperation`, `CliEnvironment.ownershipBatch`, `OwnershipDocument`
and `ownershipDocumentSchema`; the exact contracts are in the reviewed package.
Move the current codec validators to project's `isProjectOwnership` and
`isProjectExclusion`; extract `projectPathProblem`; add project → analysis →
root re-exposures and companions when delivering those symbols. Propagate
canonical selected root through ProjectResolution/ProjectRead/InventoryRun
failures and remove invented inventory spans.

Replace the test-local `ProposedOwnershipDocument` with the delivered type and
run every rejected example through the production decoder. Keep old JSON files
unchanged. Later iterations replace the other Proposed types with delivered
contracts. Iteration 5 replaces current /2 additive-rejection assertions with
actual /2–/3 negotiated incompatibility witnesses while retaining the frozen
examples. Additional boundary/acquisition variants should reuse the existing
project fixtures identified in the architect view, rather than duplicating
their classification rules. Refresh generated views after new production
exposures; the views generated during discovery predate this fixture exposure.
