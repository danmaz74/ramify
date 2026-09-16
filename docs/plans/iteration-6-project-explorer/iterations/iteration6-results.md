# Iteration 6 results: `ramify explore`

**Status:** complete. **Plan:** [Plan 6](../main-plan.md). **Iteration:**
[iteration6.md](iteration6.md).

## Summary

Implemented the terminating `ramify explore [--root <dir>]` workflow. The
command uses the resident connector and the same project request as the other
resident commands, opens one daemon context, starts or reuses the separately
hosted explorer process, hands its local URL to the platform browser opener and
exits. It has no batch fallback.

The CLI receives the explorer launcher and browser opener as controlled ports.
Root assembly supplies lazy production implementations, so help, version and
ordinary CLI commands do not import the explorer launcher, Express, React or
the browser bundle. Linux uses `xdg-open` and macOS uses `open`; success means
the opener process accepted the request, not that the CLI owns the browser.

## Process discovery and local URL

The explorer process uses the daemon-selected private endpoint directory and
build key. Discovery validates the frozen record shape, owner/mode, live pid,
version, build key, protocol and exact readiness response. A per-build lock
coordinates first launch. The launcher waits for bounded readiness, reuses a
compatible process, refuses a live incompatible process and terminates only a
child it started when startup or browser handoff fails.

The independent process entry connects to an already running compatible daemon
with `start: 'never'`, then supplies that connection to Iteration 5's HTTP
process and production assets. It neither loads an analyzer nor starts a daemon
or batch substitute. A missing daemon therefore fails before an explorer
record or listener is published.

The browser URL is exactly
`<origin>/explore/<encoded-context>/<encoded-generation>`. Both path members are
daemon-issued opaque identities encoded with `encodeURIComponent`; the project
root, configuration and report data never appear in the URL.

## Acceptance evidence

| Row | Witness | Result |
| --- | --- | --- |
| EX27 | CLI grammar/help, explicit and discovered root forwarding, real first launch, readiness, compatible reuse, opaque URL construction, controlled opener handoff and terminating installed commands | Passed. |
| EX28 | Injected daemon refusal invokes neither launcher nor batch; the real explorer entry against an endpoint with no daemon exits nonzero, creates no explorer record, spawns no process and loads no session/compiler analyzer | Passed. |

The launcher tests also cover an owned child that never becomes ready and prove
that the failure path terminates it. The CLI opener-failure test proves that an
owned ready process is cleaned up while a successful handoff remains running.

## Verification

| Check | Result |
| --- | --- |
| `npm test -- subs/cli/src/tests/arguments.test.ts subs/cli/src/tests/explore-command.test.ts subs/service-api/src/tests/web-process.test.ts subs/service-api/src/tests/web-launcher.test.ts src/tests/explorer-process.test.ts src/tests/entry-boundaries.test.ts` | Passed: 6 files, 117 tests. This includes ordinary-entry import boundaries. |
| `npm run type-check` | Passed all toolkit, portable, script and reference-harness compiler configurations. |
| `npm run build` | Passed production selection/compilation and the Vite explorer build. Vite retained Iteration 5's advisory 646.65 kB minified chunk warning. |
| isolated `npm run check:self` followed by owned daemon stop | Passed all 15 owners: 338 source files, 9 resources, complete coverage and zero findings. |
| installed `dist/src/ramify explore` and `dist/src/ramify explore --root examples/collection-review` with a controlled `xdg-open` | Passed. Both returned exit 0 and different encoded contexts on the same origin, pid and instance, proving compatible reuse. The owned explorer and daemon were then stopped. |

The first self-check exposed one missing type-only parent exposure for
`ExplorerWebProcess`. The declaration was corrected, the production build was
regenerated, and the isolated self-check above is the passing rerun.

## Handoff

Iteration 7 receives both installed commands and the real daemon/web process
workflow. Real-browser interaction acceptance, projection/resource
measurements, ten-refresh observations and the final source-reuse report remain
Iteration 7 work and were not performed here.
