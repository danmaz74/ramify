# Iteration 2: Fresh batch ownership and its public CLI document

**Plan:** [Evidence during invalid analysis](../main-plan.md).
**Prerequisites:** Iteration 1's reviewed ownership union, path validation, exposure map and fixtures.
**Owners:** `analysis/project` and `analysis` acquisition; root batch assembly; CLI ownership command and public schema.

## Goal

Answer ownership from a fresh coherent inventory even when export linking is invalid, without invoking full analysis or connecting to a daemon.

## Read first

- [Main plan](../main-plan.md), ownership and resource acceptance; [matrix](../acceptance.md), FR01 and FR03–FR08.
- [Recovery specification](../../../architecture/analysis-failure-recovery.spec.md), ownership contract.
- Iteration 1's `contracts.md` and results.
- `subs/analysis/src/inventory.ts`, `interfaces/analysis.ts`, `inventory-entry.ts`; project `ownership.ts` and acquisition contracts.
- Root `src/batch.ts`, `src/interfaces/batch.ts`, launcher assembly; CLI `arguments.ts`, `run-cli.ts`, `interfaces/cli.ts`, `index.ts`; existing inventory, path-ownership, arguments and affected-batch tests.

## Deliverables

1. Preserve canonical-root evidence on acquisition failures after root establishment. Reuse the existing capture/retry/configuration path and dispose every acquired view. Do not return partial inventory as an answer.
2. Add the root-supplied ownership operation using `acquireInventory` and `classifyProjectPath`; no retained analysis session, source catalog, linking or dependency request. Preserve acquisition input identity and warnings.
3. Implement argument dispatch, help, default `.`, distinct paths in first-request order and human/JSON output. Validate malformed arguments before acquisition; preserve existing path syntax and excluded/outside semantics.
4. Emit the strict ownership union and expose its types/schema through `ramify.ts/cli`, reusing table validation. Generic invocation failures use CLI/2; a minimal versioned generic envelope may land here, with evidence/recovery completion in iterations 3 and 6.
5. Wire both installed launcher paths, cancellation and setup failures. An absent injected operation is unavailable, never an accidental resident fallback.

## Matrix rows executed here

FR01 and FR03–FR08. FR04 establishes ownership despite invalid linking; complete diagnostic propagation follows in iteration 3.

## Verification

Extend `subs/analysis/src/tests/inventory.test.ts`, project `path-ownership.test.ts`, root batch tests and CLI argument tests; add owner-local ownership command/schema tests. Run focused files via `npm test -- <file>`, then `npm run type-check`, `npm run build` and `npm run check:self`.

Use `recovery-small`, `recovery-boundaries`, every `recovery-acquisition` variant and controlled coherence/cancellation adapters. Assert no daemon connector or full-analysis operation is called, not just that the answer looks correct. Assert failure documents omit all success-only fields. Later resident recovery remains absent as an expected intermediate state.

## Exit criteria

The built ownership command answers both valid and link-invalid projects, all acquisition/path/wire outcomes are verified, and its public schema can be imported from the CLI package entry. No second parser, classifier or table decoder exists.

## Handoff

Public ownership exports, examples, complete status/exit table, canonical-root evidence and focused results. Iteration 3 receives the structured acquisition failure representation.
