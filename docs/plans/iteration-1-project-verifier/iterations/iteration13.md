# Iteration 13: CLI and process behavior

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iterations 8 and 12.
**Owners:** `subs/cli/` and root (batch dispatch, invocation and result
mapping, the executable entry).

## Goal

Deliver `ramify check` as an installed executable with human
and JSON output, the documented exit codes, lazy loading of the engine, and
honest answers for everything the plan does not implement.

## Read first

- [CLI invocation](../../../architecture/cli-invocation.md) in full.
- Main plan: Reports and exit behavior in full, the `BatchInvocation` and
  `BatchResult` rows of the contract table, matrix rows I1-26 and I1-28.
- [Processes and clients](../../../architecture/processes-and-clients.md):
  CLI commands, Modules and executable entry points, PC01.
- Iteration 1's `contracts.md` entry files and `scope.md` exit table.
- Its `owners.md` final declarations and package-entry activation stages.

## Deliverables

1. `subs/cli/`: argument parsing for `check` with optional `--root <dir>`,
   `--format json` and `--batch`, plus `--help` and `--version`; invokes an injected batch operation; owns no checking
   algorithm.
2. Root: `dist/src/cli-entry.js` with a Node shebang and `bin.ramify`; the
   ordinary entry imports CLI handling only; batch dispatch lazily imports the
   analysis assembly; `--help` and `--version` load neither compiler, React,
   MCP nor web code, verified by inspecting loaded modules.
3. Output: the human formatter prints the root and how it was selected, the
   configuration, failures first, then warnings and analysis limits, then the
   completed scope; the JSON mode writes one
   versioned document to stdout with logging on stderr and no banner.
4. Exit mapping: 0, 1, 2 and 130 as documented; findings obtained before a
   later failure are retained with exit 2; exit 0 is never chosen from an
   empty diagnostic list without checking stage completion.
5. Invocation outside a ramified project without `--root` fails with exit 2
   and never searches subdirectories; unsupported commands and requested
   capabilities, including a browser-promise verifier, return an explicit
   unavailable result.
6. Tests: real CLI handlers with an injected real session over temporary
   inputs; focused subprocess tests of the compiled entry for output, exits,
   interruption, disposal and the absence of listeners or spawned processes.
7. Activate the remaining CLI/root exposures and package entries. Validate
   all nine descriptions against the complete final contracts from `owners.md`;
   every planned export now exists and no exposure remains pending.

## Matrix rows executed here

- I1-26: `human-json`, `missing-stage`, `failed-resolver`,
  `browser-verifier-request`, `help-version`.
- I1-28: `compiled-cli-clean`, `compiled-cli-denied`, `compiled-cli-invalid`,
  `compiled-cli-unavailable`, `compiled-cli-warnings`,
  `compiled-cli-stray-description`, `no-servers`. The relocated-package subcase
  belongs to iteration 15.

The warning subprocess case adds a compiler-selected `tests/helper.ts` outside
the module source areas. Assert a visible warning and exit 0 in both output
formats, without a layout error or invented testing classification.
The stray-description case adds a valid `tests/module.ramify` beside that file
and checks the same explicit project root. Assert the description's path and
a layout error in both formats, with exit 1 and no strict option.

## Verification

```sh
npm run build && npm run type-check && npm test
(cd examples/collection-review && node ../../dist/src/cli-entry.js check)
node dist/src/cli-entry.js check --root examples/collection-review --format json
npm run reference:verify -- --plan 1
```

## Exit criteria

- A developer can install the package and run both commands from the plan's
  deliverable section; every listed instance ran, including the subprocess
  ones.
- The compiled CLI, the direct API and the harness agree on semantic findings
  for the unchanged reference.
- All nine descriptions match the reviewed final contracts and link without
  diagnostics. Every final package entry resolves to implemented code.

## Handoff

Iteration 14 wires `npm run check:reference` to this executable and activates
the gate.
