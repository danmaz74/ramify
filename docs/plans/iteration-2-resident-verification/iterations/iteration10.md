# Iteration 10: Entries, final declarations and boundaries

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 9 (`cli`; every earlier capability). **Owners:**
all eleven `module.ramify` files and their READMEs for the final texts;
`package.json` for the eight entries; the independent
`scripts/validate-final-contracts.ts`; root `src/tests/` boundary tests.

## Goal

Complete every declaration and package entry exactly as owners.md records
them, extend the final-contract validator to eleven owners and eight
entries, and establish with traced processes that each entry loads only its
permitted closure: the daemon entry never loads CLI, presentation, React, d3,
MCP or web modules; a daemon-backed `check` loads no batch, analysis or
compiler module in the CLI process; `--help`, `--version`, `daemon status`
and `--batch` connect to and spawn nothing they must not.

## Read first

- [owners.md](../owners.md) in full, especially every declaration text,
  Package entries and their runtime closures, the iteration 10 row of the
  Activation manifest and Manual description review.
- [contracts.md](../contracts.md): Package entries and activation.
- Main plan: Distinct entries and the separately importable client;
  Declaration stages; matrix row I2-19.
- [Processes and clients](../../../architecture/processes-and-clients.md):
  Modules and executable entry points; PC01. [Memory lifecycle](../../../architecture/memory-lifecycle.md):
  Runtime dependency boundaries; ML01.
- `scripts/validate-final-contracts.ts`, `src/tests/process.ts` and
  `src/tests/process-probe.mjs` as extended in iteration 2.

## Deliverables

1. Final declarations: every one of the eleven `module.ramify` texts equal to
   owners.md, every exposure line linked to a real export, every README first
   paragraph as recorded; no pending exposure remains.
2. `package.json` with the eight entries (`.`, `./analysis`,
   `./analysis/inventory`, `./model`, `./presentation`, `./layout`, `./cli`,
   `./client`) and `bin.ramify` unchanged; `scripts/validate-final-contracts.ts`
   extended to eleven owners and eight entries, comparing declaration texts
   and resolving every entry's `types` and `import` targets.
3. Boundary tests: root `src/tests/entry-boundaries.test.ts` tracing the
   daemon entry through a check, `ramify check` served by a daemon,
   `--help`, `--version`, `daemon status` with no daemon and `check --batch`
   with no daemon, asserting the loaded-module, spawn, connect and listener
   facts owners.md's closure table fixes.
4. Harness: process handlers for I2-19 under the `cli` capability with unique
   `RAMIFY_ENDPOINT_DIR`; `npm run reference:report` lists every capability
   registered so far.

## Matrix rows executed here

- I2-19: `daemon-entry-boundary` (no cli, presentation, layout, React, d3,
  MCP or web module; compiler only in helpers); `cli-check-boundary` (no
  `src/batch.js`, analysis or compiler module; no listener);
  `help-version-unchanged` (Plan 1 assertions; no connect, spawn or listen);
  `status-no-start` (not running, exit 0, nothing spawned or loaded);
  `batch-no-daemon` (no connect or spawn; report unchanged from Plan 1).

## Verification

```sh
npm run build && npm run type-check && npm test
npx tsx scripts/validate-final-contracts.ts          # eleven declarations, eight entries
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:self                                   # eleven owners, resident, no findings
node dist/src/cli-entry.js daemon stop
npm run reference:verify -- --plan 2 --iteration 10  # requires 2 to 10
git diff --check
```

Evidence kind: `process` for every I2-19 row with the compiled entries under
the tracing preload. The unfiltered `--plan 2` still fails on iterations 11
to 14.

## Exit criteria

- All eleven declarations and eight entries validate; each entry's traced
  closure matches owners.md; every listed instance ran.
- `npm run check:self` accepts the completed tree with no findings or limits.
- No later iteration adds a public original or exposure.

## Handoff

Iterations 11, 12 and 13 run in parallel over the completed package with
distinct endpoint directories; iteration 14 revalidates these declarations
and entries from a packed install.
