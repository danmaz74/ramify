# Fast-check probes

## Plan 5 iteration 1

The five P5 probes below are executable, repeated measurements with JSON
archives. They are contract-review evidence, not I5 acceptance instances.
The historical throwaway probes and their original observations follow this
section unchanged. No spike TypeScript source or engine patch is installed.

Run from the toolkit root after `npm run worktree:prepare` and `npm run build`:

```sh
mkdir -p .reference-work
npx tsx scripts/measurements/materialize.ts .reference-work/P5-S100 S100
npx tsx scripts/measurements/materialize.ts .reference-work/P5-S1000 S1000
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
node dist/src/cli-entry.js check --root examples/collection-review --batch --format json > /tmp/reference.json
node dist/src/cli-entry.js check --root . --batch --format json > /tmp/toolkit.json
node scripts/probes/fast-check/snapshot-update-costs.mjs /tmp/reference.json
node scripts/probes/fast-check/description-closure.mjs /tmp/reference.json /tmp/toolkit.json
node scripts/probes/fast-check/interpreter-setup.mjs
node scripts/probes/fast-check/worker-session.mjs
node scripts/probes/fast-check/observed-reads.mjs /tmp/reference.json
node scripts/probes/fast-check/review-package.mjs
node dist/src/cli-entry.js daemon stop
rmdir "$RAMIFY_ENDPOINT_DIR"
```

Materialization requires a new destination; reuse existing fixtures on repeat
runs. Each probe accepts project roots or saved batch reports. Optional positional
arguments are R/S100/S1000 for P5-1, R/T/S100/S1000 for P5-2, S1000 for P5-3
and P5-4, and R/S100 for P5-5. Defaults use the materialized paths above.
Do not run performance probes concurrently. Each owns and disposes its compiler
and capture; edits in P5-1 are virtual. No reference or toolkit source is edited.

| Probe | Repetitions and boundary | JSON under `scripts/probes/results/` |
| --- | --- | --- |
| P5-1 `snapshot-update-costs.mjs` | Five samples per edit class and fixture; unreferenced and imported created-file controls; snapshot update plus old-snapshot disposal. | `snapshot-update-costs.json` |
| P5-2 `description-closure.mjs` | One AST/resolution scan and three reverse-closure traversals per fixture; explicit forwarding edges only. | `description-closure.json` |
| P5-3 `interpreter-setup.mjs` | Twenty paired one-file calls; in-memory load hook adds only-filtering and hoists setup; output equality asserted. | `interpreter-setup.json` |
| P5-4 `worker-session.mjs` | Three worker opens, five report-sized clones each, three forced heap failures; preflight detects inherited heap overrides and relaunches without the flag. Linux `/proc` supplies compiler RSS. | `worker-session.json` |
| P5-5 `observed-reads.mjs` | Three independent completed batch captures versus direct-callback replay, alone and merged with acquisition; role counts, canonical observation hashes, input IDs, per-trial equality and all exact differences; full lists in hashed ignored detail files. | `observed-reads.json` |

`p5-common.mjs` contains probe-only acquisition, the direct filesystem compiler
adapter, metadata, hashing and archive helpers. `review-package.mjs` validates
103 unique IDs, matrix membership and counts, expands unchanged declaration
abbreviations from real files, parses eleven declarations and checks six added
lines, one removed line and five revised relays. It executes no harness case.
The `.mjs` files are selected by `tsconfig.scripts.json` through inherited
`allowJs`; JavaScript semantic checking is not enabled, so Node syntax checks
and actual executions complement `npm run type-check`.

See the [Plan 5 probe record](../../../docs/plans/iteration-5-fast-incremental-checks/probes.md)
for versions, fixture identities, numbers, limits and the review decisions.

Compact archives retain P5-2 median/p90/p99/max, histograms, edge counts and
50 largest closures per fixture; P5-4 tick count/median/p95/p99/max and histogram
buckets replace raw tick samples. Percentiles use nearest rank. P5-5 tables group
changed fields and role pairs, naming each exact path and both field values; missing
and extra entries are complete. Unlisted fields are equal, with no sampled
differences. P5-5 uses compact JSON whitespace to keep the archive small.
Full P5-2 per-file closures and P5-5 observation/difference lists are written to
`.reference-work/probe-details/{description-closure,observed-reads}/`; each
archive records detail paths and SHA-256 byte hashes. Canonical observations
use UTF-8 path/role sorting and JSON fields `path`, `role`, `sha256`, `bytes`.
Confirm exclusion with `git check-ignore .reference-work/probe-details/`.
The worker command inherits `NODE_OPTIONS=--max-old-space-size=8192` for its
preflight, then relaunches without that override for all three cold sessions
and all three 16/4 MiB heap-limit trials.

## Probe and archive SHA-256

Hashes cover exact file bytes, including trailing newlines. P5-2/P5-4/P5-5
archives below are the compact reruns; P5-1/P5-3 remain the earlier evidence.

| Probe basename | Script SHA-256 | Archive SHA-256 |
| --- | --- | --- |
| snapshot-update-costs | `2d9e1948e18ef62ca7b54234d4e4b4cdbdaa1f43d74bd0609ef584b85a63306a` | `459fa44f244928a7b33cb5f2f7faf48d0261eca68b972c294915dd927b063dce` |
| description-closure | `863a1fcb3a957face57648785ef79c15dac37facf062892a33ddb6eb3337a094` | `962135c3e000f21ba1be0785c83fe9817aa6dad038cc2f90133e2d767db2d418` |
| interpreter-setup | `6de96a3291ea9de19b5b5379572ade00d0b3a46933b251195173f3a01dbab86b` | `0a153606d4c70b1e60bdcf22d39d300dc466785d1eabdfc3e3a586d1e8434602` |
| worker-session | `d46e50f3e2df33f724d5562384fb6cbe83ad6a96f6b6f8727609898add445ee2` | `bf4bc92fa93e1b59da22bbf841db46ae072775f96915e4e1011dba91883c8641` |
| observed-reads | `8cd1f6edf65377d62547cdaf9d6151641b0035755bfb218bf1b23fb6aa9446c2` | `c120a86865a9faac5f1233f340bb4b3ea618b5232c2758d5dd0a899884bf7350` |

Shared `p5-common.mjs`: `bddbe40e5d0e581a84daa10bd4141faa7f8946081ded5fc3feb37d6a2bf89fdd`.

## Historical throwaway probes

Throwaway measurements behind the
[retained-session proposal](../../../docs/analysis/fast-incremental-checks-retained-session.md).
They are design evidence, not acceptance evidence: one machine, no repeated
samples, no archived raw results. They are unrelated to the batch
`scripts/measurements/` recipe and its reviewed budgets.

Every probe reads the built toolkit and the installed TypeScript 7.0.2, so
run `npm run build` first. Three of them start from a batch report of the
project they measure:

```sh
node dist/src/cli-entry.js check --root examples/collection-review --format json > /tmp/reference.json
node dist/src/cli-entry.js check --root . --format json > /tmp/toolkit.json
```

| Probe | Measures | Invocation |
| --- | --- | --- |
| `stage-timing.mjs` | Wall time of each Plan 1 stage, run in one process with the batch functions and generous limits | `node scripts/probes/fast-check/stage-timing.mjs [project root]` |
| `warm-compiler-stages.mjs` | The real `buildCatalog` and `collectAccesses` on a warm TypeScript server, before and after a one-file edit applied through the virtual filesystem, plus server and client RSS | `node scripts/probes/fast-check/warm-compiler-stages.mjs /tmp/reference.json` |
| `warm-compiler-cycles.mjs` | Snapshot update cost and server RSS across 40 edit/revert cycles, a created and a deleted owned file with the configuration change, and retention of undisposed snapshots | `node scripts/probes/fast-check/warm-compiler-cycles.mjs /tmp/reference.json` |
| `decide-timing.mjs` | The decide stage and `explainImport` per selection from a saved report, with import fan-in per target file | `node scripts/probes/fast-check/decide-timing.mjs /tmp/reference.json` |
| `worker-thread.mjs` | Whether the blocking compiler client runs inside a worker thread while the main thread stays responsive | `node scripts/probes/fast-check/worker-thread.mjs <root> <root>/tsconfig.json` |

The edits are never written to disk: the compiler reads the modified content
through the API's filesystem callbacks, and the synthetic configuration and
resource witness are virtual files, mirroring the supervised helper. The
warm-compiler probes therefore measure the compiler and the extraction code,
not Ramify's capture, sealing or helper transport.

## Observations recorded on 2026-09-11

Linux x64, Node v22.23.2, TypeScript 7.0.2. Reference project: 15 owners,
54 source files, 816 program files. Toolkit: 9 owners, 144 source files, 445
program files. Two runs each for the stage timings; single runs otherwise.

| Measurement | Reference | Toolkit |
| --- | ---: | ---: |
| Acquisition | 190–230 ms | 760 ms |
| Compiler helper spawn and program creation | 2,343–2,549 ms | 1,553 ms |
| Catalog | 214–252 ms | 491 ms |
| Link and model | 25–31 ms | 84 ms |
| Access interpretation | 658–707 ms | 2,863 ms |
| Compiler disposal | 68–75 ms | 76 ms |
| Decide | 72–74 ms | 1,514 ms |
| Seal | 373–406 ms | 379 ms |
| `ramify check --format json` wall time | 3.6–4.0 s | 7.7 s |
| `ramify --version` wall time | 30–40 ms | same |
| Warm server: spawn and initial snapshot | 128–236 ms | 113–168 ms |
| Warm server: `updateSnapshot`, one changed file | 1.5 ms | 1.5 ms |
| Warm server: created / deleted owned file with configuration change | 74 / 68 ms | 32 / 31 ms |
| Warm server: whole-project `buildCatalog` | 38–50 ms | 181–184 ms |
| Warm server: whole-project `collectAccesses` | 408–461 ms | 2,588–2,701 ms |
| Whole-project decide from the saved report | 75 ms, 0.35 ms per selection | 1,468 ms, 1.07 ms per selection |
| Most imported file, accesses targeting it | 56 | 127 |
| Server RSS after 40 light edit cycles with disposal | 128 → 149 MiB | 126 → 155 MiB |
| Server RSS after two whole-project re-extractions | 221 → 310 MiB | 258 → 417 MiB |
| Server RSS with ten undisposed snapshots, then disposed | 166 → 167 MiB | 175 → 175 MiB |
| Worker thread: 0.6 s blocking extraction | main thread kept 125 of 129 possible 5 ms ticks | not run |
