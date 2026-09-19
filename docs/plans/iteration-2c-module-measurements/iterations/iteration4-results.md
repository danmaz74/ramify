# Iteration 4 results: Measure CLI, toolkit evidence and completion

**Date:** 2026-09-19. **Mode:** direct work in `/ramify`; no commit was made.
**Outcome:** Plan 2C is implemented. `ramify measure` consumes the bounded
daemon document, the complete MM01–MM18 matrix has executable evidence, and
the fixed architect metrics policy is **`measure`**.

## Delivered command

`ramify measure [--root <dir>] [--format json]` selects the project with the
same discovery request as the other resident commands, requires the daemon's
advertised `measure` capability before opening a context, and sends one
synchronized whole-project request. JSON writes `value.document` plus one
newline. Human output is a short table with exact and subtree rows and separate
production source/resource, test source/resource, documentation and ordinary/
tests view-byte columns.

Cold, pending, deadline, superseded and unavailable outcomes use the
materialize-style reasons and exit 2. An invalid project exits 1. Interrupt
exits 130. A service or transport `resource-unavailable` response remains a
non-success diagnostic; no partial `ramify.measure/1` value is printed. The
command has no selector, batch fallback, publication, filesystem walk or path
attribution implementation.

## Acceptance evidence

| ID | Evidence | Result |
| --- | --- | --- |
| MM01 | `module-measurements.test.ts`, `modularity.test.ts` | Existing exact/subtree source/resource counts remain unchanged in both filters. |
| MM02 | `module-measurements.test.ts` | Root README/description bytes, missing README and documentation under `src/` are distinct. |
| MM03 | `module-measurements.test.ts` | Testing-classified ordinary files, resource-only, empty and production owners reconstruct under the documented rule. |
| MM04 | `module-measurements-session.test.ts` direct and worker suites | Ordered inventory plus revision-bound documentation records; exact ownership does not absorb descendants. |
| MM05 | `architect-render.test.ts` and reviewed goldens | Measured exact/subtree metrics and key order; no file list in the architect view. |
| MM06 | session, architect-render and daemon service tests | Invalid inventory and API-view failure remain explicit unavailable states; unchanged publication writes zero bytes. |
| MM07 | `measurements.test.ts`, `api-view-documents.test.ts`, service tests | In-memory API-view bytes equal publication encoding; combined publication reuses bounded rendering without widening selection. |
| MM08 | `ipc.test.ts` actual transport | Same-revision surface equality and synchronized freshness; cold/deadline/cancellation/supersession keep their outcomes. |
| MM09 | validation, codec, IPC and CLI capability tests | `measure` is negotiated and an older daemon is refused before context open. |
| MM10 | `measure-command.test.ts`; toolkit document | CLI prints `ramify.measure/1` exactly; listed, outside and unobserved paths retain their separate authority. |
| MM11 | [`toolkit-consistency.json`](../evidence/toolkit-consistency.json) | All 15 exact owners sum to the root subtree; all 469 file byte counts match disk; records reconstruct every inventory bucket. |
| MM12 | [`plan2c-measurements.json`](../evidence/plan2c-measurements.json) | Latency, memory, architect budgets and hit cost recorded; fixed policy `measure`. |
| MM13 | `npm run check:self` and declaration review | Self-check passes; the new public relays are only measurement vocabulary and the retained-session operation. |
| MM14 | `modularity-candidate.test.ts` | Identity/split/merge and resource reassignment retain root totals; candidate documentation is unavailable. |
| MM15 | `api-view-documents.test.ts` | Exact/over area and invocation limits, escaped/multibyte output, batching and interrupted recovery. |
| MM16 | service and IPC policy tests | Fixed omit witness remains deterministic and distinct from the delivered measure policy; combined API publication and failure reasons hold. |
| MM17 | direct service and actual IPC tests | Exact escaped envelope boundary, late refusal, cancellation/deadline and recovery without truncation. |
| MM18 | dedicated CLI fixture in `measure-command.test.ts` | Generated catalogs/transients at several depths, similar names, dependencies, output, independent scope, source symlink, outside file and absent-then-inventoried source all follow the published rule. |

The full machine document, including every per-owner exact and subtree value,
is [`toolkit-measure.json`](../evidence/toolkit-measure.json). Compact notation
below is `source files/source bytes/resource files/resource bytes` for P and T,
`files/bytes` for D and `ordinary bytes/tests bytes` for V.

| Owner | Exact P; T; D; V | Subtree P; T; D; V |
| --- | --- | --- |
| `ramify` | 18/57636/1/648; 26/178599/1/0; 2/21254; 101554/102271 | 225/1955966/4/23492; 199/2565586/11/74595; 30/82845; 1163188/1067344 |
| `ramify/analysis` | 47/442322/0/0; 37/598662/3/47695; 2/11512; 48886/49590 | 95/894565/0/0; 83/1132549/6/47695; 10/35068; 285941/291165 |
| `ramify/analysis/descriptions` | 5/33285/0/0; 4/53636/1/0; 2/2888; 61074/62629 | same |
| `ramify/analysis/model` | 9/41913/0/0; 11/93362/1/0; 2/3803; 58548/60103 | same |
| `ramify/analysis/project` | 15/112654/0/0; 11/113464/1/0; 2/5266; 57722/58427 | same |
| `ramify/analysis/typescript` | 19/264391/0/0; 20/273425/0/0; 2/11599; 59711/60416 | same |
| `ramify/cli` | 14/76282/0/0; 9/85773/1/0; 2/4968; 93569/95249 | same |
| `ramify/daemon` | 24/230227/0/0; 27/296176/0/0; 2/6285; 92061/93741 | 30/352077/0/0; 43/509016/0/0; 4/9995; 146816/148494 |
| `ramify/daemon/contexts` | 6/121850/0/0; 16/212840/0/0; 2/3710; 54755/54753 | same |
| `ramify/explorer` | 8/35074/1/149; 6/55110/0/0; 2/978; 111012/117173 | same |
| `ramify/integration-tests` | 0/0/0/0; 3/194504/0/0; 2/159; 117649/0 | same |
| `ramify/presentation` | 26/267764/0/0; 12/129776/1/0; 2/4342; 88948/90503 | 50/454560/2/22695; 21/313934/3/26900; 6/8977; 224137/228802 |
| `ramify/presentation/layout` | 11/37835/0/0; 2/11398/1/0; 2/2124; 64909/66464 | same |
| `ramify/presentation/project-view` | 13/148961/2/22695; 7/172760/1/26900; 2/2511; 70280/71835 | same |
| `ramify/service-api` | 10/85772/0/0; 8/96101/0/0; 2/1446; 82510/84190 | same |

## Toolkit measurement and policy

The Linux run used Node v22.23.2 on 12 logical CPUs. It measured 15 modules,
469 files and no compiler-selected outside-module file in the toolkit. Exact
owner sums and the root subtree were:

- production: 225 source files / 1,955,966 bytes and 4 resources / 23,492 bytes;
- tests: 199 source files / 2,565,586 bytes and 11 resources / 74,595 bytes;
- documentation: 30 files / 82,845 bytes;
- API views: 1,163,188 ordinary bytes and 1,067,344 tests bytes.

The first `measure` after daemon startup took 8.73 s; the warm repeat took
1.71 s. The architect session query took 0.68–0.83 s hot and 1.72 s after
compiler release. Architect materialization took 17.15 s, produced 62 files and
844,838 bytes, and its unchanged repeat took 2.51 s and wrote zero bytes. Peak
sampled RSS during measure response work was 99,119,104 bytes for the daemon
and 856,485,888 bytes combined across daemon/worker/compiler; the architect
phase peaked at 186,978,304 and 1,070,448,640 bytes respectively.

These values hold the 15 s architect session-query, 90 s whole-command, 8 MiB
view and zero-byte repeat budgets, so the delivered fixed policy is `measure`.
The 32 MiB area, 256 MiB all-area, 64 MiB architect and negotiated response
ceilings remain enforced and were not increased.

Refreshed hit costs are: `revision` 197 lines/121,230 bytes; `project` 559/
331,756; `session` 222/130,964; `publish` 118/85,496; `watch` 40/23,517; and
`create` 207/152,329. Five terms still exceed Plan 2B's deferred 200-line/
64 KiB evidence thresholds. This report does not relabel those thresholds as
passing gates.

## Review dispositions

| Review issue | Delivered decision and evidence |
| --- | --- |
| Candidate ownership regression | Shared arithmetic accepts effective ownership; MM14 preserves candidate reassignment and keeps candidate documentation unavailable. |
| Overclaimed unlisted-path ownership | The document carries the normative generated/listed/outside/excluded/unobserved order. MM10/MM18 apply it independently; provisional facts never become file records. |
| Missing file classification | Complete buckets plus physical area derive ordinary production/testing classification; no duplicate testing flag was added. MM03/MM04 and MM11 cover resource-only and empty owners. |
| Fallback versus equality | Common inventory/documentation fields agree at one revision; view availability is uniform and explicit. Fixed policy is `measure`; MM16 retains the omit witness. |
| Unbounded measurement work | Existing numeric render ceilings, exact escaped response-envelope counting and shared cancellation/deadline control remain mandatory. MM15/MM17 enforce them; MM12 is observation, not a waiver. |

## Verification

Commands were run from `/ramify` against the dirty working tree containing all
four iterations. No full-suite or benchmark-only run substituted for the
plan's focused audit path.

```text
npx vitest run subs/cli/src/tests/arguments.test.ts subs/cli/src/tests/measure-command.test.ts
  146 passed
npm run type-check
  passed
npm run build
  passed; explorer build emitted its existing chunk-size warning
npm run measure:plan2c
  passed; policy measure, zero failures; owned daemon stopped
npx vitest run <14 focused Plan 2C files>
  308 passed
npx vitest run -c scripts/probes/modularity/vitest.config.ts scripts/probes/modularity/markdown.test.ts
  3 passed
npx vitest run src/tests/entry-boundaries.test.ts src/tests/compiled-client.test.ts
  10 passed; CLI entry and compiled-client boundaries preserved
npm run type-check
  passed
npm run build
  passed; explorer build emitted its existing chunk-size warning
RAMIFY_ENDPOINT_DIR=<owned> npm run check:self
  passed: 15 owners, 424 source files, 15 resources, 6297 accesses,
  0 errors, 0 warnings, 0 analysis limits, 0 denied
RAMIFY_ENDPOINT_DIR=<same-owned> dist/src/ramify measure --format json
  exit 0: ramify.measure/1, 15 modules, 469 files, views measured
RAMIFY_ENDPOINT_DIR=<same-owned> dist/src/ramify materialize --view architect
  exit 0: 1642 records, 844838 bytes, dependencies measured
RAMIFY_ENDPOINT_DIR=<same-owned> dist/src/ramify daemon stop --format json
  exit 0: running false; endpoint removed
```

The focused matrix, built command, MM11 receipt, architect publication and
self-check all ran after the documentation and evidence changes. The existing
Vite large-chunk notice is advisory and unrelated to this plan. No required
check failed and no benchmark-only suite was added to the gate.

## Corrected intermediate failures and deviations

- The first focused CLI run had two fixture failures: the attribution helper
  treated the root module directory as `.` instead of the delivered empty
  relative path, and a quick-connection test tried to exercise the wire
  response ceiling through the direct-service override. The helper now uses
  the document's actual root convention, and the CLI test injects the explicit
  service refusal it is responsible for mapping. The direct and actual-wire
  exact-boundary cases remain MM17's daemon tests. The rerun passed 146/146.
- The first evidence run wrote its artifacts between cold and warm queries,
  correctly causing the synchronized daemon to advance its revision. The
  runner now completes and compares both reads before it writes evidence; it
  never equates distinct revision identifiers. Both subsequent runs completed
  with zero failures, and the final artifact is the later run.
- No scope was added. In particular there is no selector, batch behavior,
  publication, path-query API or production reinterpretation of provisional
  paths. No numeric ceiling changed.

## Handoff

Plans 4 and 7 may consume `ramify.measure/1`, the path-attribution rule and the
architect view's measured `metrics`. They inherit the latency, memory and
search-cost observations above. Selectors, batch measurement, an MCP/explorer
surface, arbitrary-path ownership and cross-bucket scoring remain out of scope.
