# Resident verification readiness

Plan 2's real service, retained analysis, context manager, client and daemon
entry are implemented. Workflow publication alone does not establish acceptance:
the current build must pass the complete matrix and resource/platform checks.

| Command | Behavior |
| --- | --- |
| `ramify check [--root <dir>] [--format json]` | Synchronized resident check; human output identifies the daemon, context and revision. |
| `ramify check --batch [...]` | Independent disposable analysis, with the unchanged `ramify.analysis/1` JSON report. |
| `ramify watch [...]` | Streams revisions fetched by exact id; SIGINT releases the subscription and exits 130. |
| `ramify daemon status`, `ramify daemon stop` | Status and explicit stop without starting a daemon. |
| `ramify --help`, `ramify --version` | Available without starting an engine or daemon. |
| `npm run check:self`, `npm run check:reference` | Ordinary resident checks; own the endpoint directory in scripted verification. |

`ramify.ts/client` exposes the lightweight connector. MCP, overlay, inspection
and explorer capabilities remain outside this plan.

## Endpoint ownership during verification

Every scripted resident run must own its endpoint directory. Use a short path
under the system temporary directory, with permissions `0700`, to keep Unix
socket paths within platform limits. Never use the developer's ordinary daemon
group for a harness run. For a disposable shell verification:

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
with process cleanup. Failed or missing executions receive no matrix credit.

The Plan 1 regression handler reads the complete report produced by the preceding
`reference:verify -- --plan 1` command. Source, build and runtime identities must
match, all 308 instances must carry passing assertions, the 305 unaffected record
definitions must match the frozen archive, and the toolkit/package observations
must show eleven owners and eight entries. It never starts another regression
run. A newer failure for the same inputs blocks an older pass.

The old 308-instance archive describes the Plan 1 build and cannot establish
the current build's regression result. Run the unfiltered Plan 1 gate first,
then Plan 2 without changing source or build inputs. Preserve the raw resource
measurements and Linux/macOS process evidence separately; a Linux matrix pass
alone does not establish macOS acceptance.
