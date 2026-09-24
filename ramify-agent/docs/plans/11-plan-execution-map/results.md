# Plan 11 execution results

## Iteration 1 — public contract and representative run

**Starting commit:** `7d6af7f410aba9e644044719f1903bd39deaf6e8`. The design proposal and source dashboard material were untracked in the starting checkout and are committed with this iteration. The toolkit and agent packages were prepared in this worktree. The first agent type-check could not resolve `ramify.ts/module-tree` because the linked toolkit had not yet been built; the first `check:self` could not find the linked `ramify` binary. `npm run build` at the worktree root followed by `npm --prefix ramify-agent ci` created those artifacts. Both required checks then passed. These were preparation gaps, not source findings.

### Delivered

- Browser-safe `execution-map/1` node, link, page, cursor query, complete detail and source-reference schemas under the harness protocol owner; the root re-exposes their named symbols to the web owner.
- Version-bound path functions for map pages and targeted capability/scenario detail. The existing `stale-version` error remains the 409 response with `currentVersion`.
- A structured two-root scripted fixture with expected IDs, source sequences, run versions and the provider, requirement, repair, cycle, proposed/unplaced module and captured writer-change cases. Its expected outcomes are literal fixture data rather than a projection's own output.
- A semantic light/dark token map and [field provenance, cursor and contrast contract](iteration-1-contract.md). No map endpoint or UI component is implemented in this iteration.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/execution-map-contract.test.ts` | Pass, 9 tests | Runtime schema validation, fixture identity, gate/audit independence, duplicate and dangling references, mixed versions, page bounds, partial/unavailable records, exact capability keys, current activity, complete detail and stale error shape. No HTTP handler or durable-run projection yet. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness, web and scripts TypeScript scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings; 186 analysis limits | Batch ownership and exposure analysis over 9 owners. Limits are signature inference coverage, including the new Zod schemas; this is not an executable acceptance run. |
| `npm run build:web` in `ramify-agent/` | Pass | Build of the existing web app with the added token module. Vite reports a chunk-size advisory. No browser interaction has been tested. |
| `git diff --check` | Pass | Tracked diff whitespace only; staging and commit review follows. |

### Handoff to iteration 2

Use `subs/harness/src/interfaces/protocol/execution-map.ts`, the path functions and `subs/harness/src/tests/helpers/execution-map-fixture.ts` as the public wire and independent expected data. Implement the census from durable run records, retaining every gate attempt and run session, and add the targeted complete capability/scenario detail projection. The fixture's scripted inputs are not themselves durable records; adapt them through existing run-test helpers rather than treating this contract test as projection acceptance. Keep gate verdict separate from audit lifecycle, preserve previous verified requirement revision after reopening, and report missing or partial source data explicitly. The current schema's per-page checks cannot by themselves prove snapshot-wide uniqueness or cursor ordering; the projection and HTTP layers must enforce those rules.

The separate recorded `status-badge-tone` pi witness has not been replayed. Full harness, browser and audit acceptance remain iteration 9 work.
