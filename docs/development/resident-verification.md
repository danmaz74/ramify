# Resident verification readiness

Plan 2 is incomplete on the iteration-14 checkpoint. Eleven owners exist, but
the service, retained analysis, context manager, client and daemon entry chain
are missing. Workflow publication of an iteration does not establish its
functional exit criteria. The [iteration-14 report](../plans/iteration-2-resident-verification/iterations/iteration14-results.md)
records the current checks and remaining provider work.

| Command | Current behavior |
| --- | --- |
| `ramify check [--root <dir>] [--format json]` | Fresh batch analysis; human output identifies `Mode: batch`. |
| `ramify check --batch [...]` | Explicit batch analysis, with the unchanged `ramify.analysis/1` JSON report. |
| `ramify watch [...]` | Exit 2: resident service not implemented. |
| `ramify daemon status`, `ramify daemon stop` | Exit 2: resident service not implemented. |
| `ramify --help`, `ramify --version` | Available without starting an engine or daemon. |
| `npm run check:self`, `npm run check:reference` | Existing scripts invoke ordinary `check`; currently batch. |

The planned resident default, synchronized checks after saves, bounded watch
updates and `ramify.ts/client` import require the missing providers. No MCP,
overlay, inspection or explorer capability is delivered by this checkpoint.

## Endpoint ownership during verification

Every scripted resident run must own its endpoint directory. Use a short path
under the system temporary directory, with permissions `0700`, to keep Unix
socket paths within platform limits. Never use the developer's ordinary daemon
group for a harness run. In shell, after resident commands are implemented:

```sh
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference
npm run check:self
node dist/src/cli-entry.js daemon stop
```

Automated harnesses put stop and cleanup in `finally`, including after failed
assertions. They wait for the daemon and observed descendants to exit, fail on
leaks, terminate survivors, then remove only the temporary directories they
created. A successful stop can leave a stopped record; it does not imply that
the directory is empty. Remove that owned directory after confirming exit.

## Completion witnesses

`scripts/reference-harness/completion-cases.ts` supplies all six I2-30 handlers.
The self-check requires the compiled CLI to connect to its own endpoint and
keeps the existing full-file catalogue assertions. The contexts negative
requires the real `RamifyService` export and compiler-valid source, then checks
R6 visibility and the missing `dispatch` tag in batch and resident reports.

The final-contract handler runs the strict validator as a subprocess. Packed
package handlers bootstrap an external copy, install its actual `npm pack`
archive, require an independent eight-entry literal and inspect the isolated
client import closure. Relocation additionally requires equal batch/resident
reports, an installed daemon entry listening on the private socket, and stop
with process cleanup. Current provider failures receive no matrix credit.

The Plan 1 regression handler reads the complete report produced by the preceding
`reference:verify -- --plan 1` command. Source, build and runtime identities must
match, all 308 instances must carry passing assertions, the 305 unaffected record
definitions must match the frozen archive, and the toolkit/package observations
must show eleven owners and eight entries. It never starts another regression
run. A newer failure for the same inputs blocks an older pass.

The old 308-instance archive describes the Plan 1 build and cannot establish
this checkpoint's regression result. A current full report is still missing.
The unfiltered Plan 2 gate remains mandatory and failing. macOS process evidence
and all resident budgets also remain open.
