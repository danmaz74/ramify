# Scope, compiler integration and operational limits

**Status:** Iteration 1 review draft, inspected 2026-09-09. Configuration and
size observations below describe this checkout. Proposed limits are initial
acceptance targets, not measured checker performance or approval of this
package. No checker exists at this iteration.

The [CLI invocation contract](../../architecture/cli-invocation.spec.md) remains
the authority for project/root selection, compiler-configuration discovery,
outside-source warnings, output order and exits. This document selects concrete
implementation inputs and limits; it adds no invocation flags or exclusion
policy. [contracts.md](contracts.md) owns the exact TypeScript contracts and
[owners.md](owners.md) owns their exposure/activation stages.

## Exact project configurations

The two checker targets are the toolkit root `.` and
`examples/collection-review`. Both use the `tsconfig.json` selected by the CLI
contract. These are independent projects; the checker never merges the example,
site or harness compiler programs into the toolkit program.

| Target / file | Current inspected configuration | Reviewed final configuration |
| --- | --- | --- |
| Toolkit `tsconfig.json` | ES2022; ES2022/DOM/DOM.Iterable libraries; NodeNext module and resolution; react-jsx; strict; declarations; `rootDir: "src"`; `outDir: "dist"`; `types: []`; includes `src/**/*`. | Whole-project editor/check input: retain language/resolution options; `rootDir: "."`, `types: ["node"]`, `noEmit: true`; include `src/**/*` and `subs/**/src/**/*`. Explicitly exclude `node_modules`, `dist`, `site`, `examples`, `scripts` and `.reference-work`. Node ambient types enable Node owners and tests; they do not change module tags. |
| Toolkit `tsconfig.scripts.json` | Extends root; `noEmit: true`, declarations off, `rootDir: "."`, Node types; includes `src/**/*`, `scripts/**/*`. | Independent tooling check: includes `src/**/*`, `subs/**/src/**/*`, `scripts/**/*` and `vitest.config.ts`; overrides inherited exclusion of `scripts`; retains no emit. Includes probe scripts and the public source entries used to bootstrap a clean build. |
| Toolkit `tsconfig.build.json` (new, iteration 2) | Absent. `npm run build` currently runs `tsc` using the root configuration. | Extends root; `noEmit: false`, `declaration: true`, `rootDir: "."`, `outDir: "dist"`, no incremental state. Iterations 2–7 emit the complete legacy-plus-nested source selection. Iteration 8 consumes it through the generated explicit `files` configuration described below; root `include` then no longer chooses production emission. |
| Toolkit `tsconfig.portable.json` (new, iteration 2) | Absent. The current `types: []` restriction applies to all old source. | Extends root with `types: []`, `noEmit: true`. Iterations 2–7 include legacy `src/model/**/*`, `src/viz/**/*` plus implemented portable owner source. Iteration 8 drops the removed legacy patterns, retaining ordinary model, descriptions and layout entry/source files and excluding all nested `src/tests/`. Checks the portable closure independently of Node whole-project configuration; the model/descriptions/layout entries must not pull Node or UI implementation through a relay. |
| Example `examples/collection-review/tsconfig.json` | ES2022; ES2022/DOM/DOM.Iterable; ESNext module; bundler resolution; react-jsx; strict; isolatedModules; noEmit; skipLibCheck; case consistency; types node and vite/client; `@features/*` maps to `./subs/workspace/subs/*`; includes `src`, `subs/**/src`, `vite.config.ts`, `vitest.config.ts`. | Retain these semantics and selection. `verbatimModuleSyntax` stays off, enabling compiler-valid unmarked pure-type binding fixtures. No checker-specific exclusions or alternate compiler configuration. |

In iteration 2, switch the interim build command to
`tsc -p tsconfig.build.json` when the root becomes `noEmit`; do not leave
`npm run build` pointing at a non-emitting configuration until iteration 8.
The interim output intentionally includes complete legacy and implemented
nested source, including tests. It makes no production-exclusion claim. Its
`rootDir: "."` changes the temporary combined main to `dist/src/index.js`;
update that package path at the same stage. Add the portable configuration to
the independent type-check commands in iteration 2. Iteration 8 replaces the
build command with real inventory selection and removes the combined entry.

`forceConsistentCasingInFileNames` and `skipLibCheck` remain enabled in both
projects. Neither target currently uses project references or `extends` in
its whole-project config. Preserve every future influencing `extends` input
when present; do not pretend that the current absence is an engine limitation.
The CLI contract already specifies the unavailable outcome for a solution-style
references-only configuration.

The example's `vite.config.ts` and `vitest.config.ts` are exactly two
compiler-selected files outside module source. They produce two individual
root-file warnings, without ownership or testing profiles, and do not fail the
check. The example's `package.json` affects ESM/package interpretation and is an
input dependency; it is not a compiler-selected source warning. Its Cucumber
configuration remains its own executable test-tool configuration; checking
reads relevant bytes and never executes that script or the application.

| Independent scope | Exact files and responsibilities |
| --- | --- |
| Site | `site/tsconfig.json` extends `@docusaurus/tsconfig`; current `baseUrl` is `.` and excludes `.docusaurus`, `build`. `site/docusaurus.config.ts` and `site/package.json` control its build. Iteration 8 adds exact presentation/model/layout paths and matching webpack aliases from move-map.md. Docusaurus configuration executes only in site builds. |
| Harness | `scripts/reference-harness/tsconfig.json` is strict ES2022/NodeNext, Node ambient types, noEmit, includes its `**/*.ts`; `scripts/reference-harness/vitest.config.ts` owns inventory/gate test execution. |
| Toolkit tests | `vitest.config.ts` currently selects `src/**/*.test.ts`; iteration 2 stages new owner test discovery, iteration 8 removes the legacy-only pattern. Select all owned tests, including `.test.ts`/`.test.tsx` in testing owners' ordinary `src/`, while excluding the separately configured site/example/harness. Cucumber scenario discovery remains separate. |
| Example builds/tests | `examples/collection-review/vite.config.ts`, `vitest.config.ts` and `cucumber.js` remain independent execution configurations. The Vite root is `subs/workspace/src`, and output stays at example `dist/`. |

Whole-project source inventory always adds every owned file regardless of
compiler `include`/`exclude`; resource files such as CSS are inventoried even
when a shared declaration shim supplies the compiler's export description.
The above toolkit exclusions select no outside-module source in the independent
projects. They do not establish a general checker exclusion mechanism.

## Compiler integration selected by the probes

Use the installed **TypeScript 7.0.2** package's exported
`typescript/unstable/sync` API **inside a supervised, finite helper process**,
pinned to exact version `7.0.2` for the adapter implementation. The package-root
export does not expose the historical
`createProgram`/`createCompilerHost` API. Do not design against those absent
interfaces or silently install a second, older compiler. The executable probes
and their observed API behavior are in [probes.md](probes.md).

The selected operations are `API.parseConfigFile`, `API.updateSnapshot` with
`openProjects`, project/program source-file lookup, checker
`getSymbolAtLocation`, `getAliasedSymbol`, `getExportsOfModule`, `SymbolFlags`
value/type classification, and `NodeHandle.resolve` for declaration/source
locations. The exact imports and signatures in the runnable probe are the
binding compatibility evidence; iteration 6 wraps them behind Ramify's plain
source-catalog contract. Pinning is necessary because the API is explicitly
unstable. Review a changed dependency/API before changing the adapter.

At the first implementation use in iteration 5, move TypeScript from a ranged
development dependency to an exact runtime dependency `"typescript": "7.0.2"`;
the installed library must supply configuration/compiler analysis without relying
on an enclosing checkout's dev dependencies. This document and its probes change
no dependency manifest in iteration 1.

The sync API runs a native child over stdio and can block its calling JavaScript
thread during a native request. The async API probe established responsiveness,
but its close operation can await native snapshot release and supplies no hard
abort/child-exit guarantee. Select a one-shot supervised helper so the caller's
event loop and cancellation/deadline handling remain responsive.

The parent starts the helper as an owned POSIX process-group leader, supervises
its native child, admits one acquisition/source-analysis run and awaits cleanup.
That run may make sequential native queries for its catalog and access stages;
the helper is never reused for a second batch invocation.
Completion attempts graceful API/stream closure; cancellation or expiry makes
the result terminal, then terminates the owned group if graceful closure cannot
finish within the disposal deadline. Escalate from SIGTERM to SIGKILL within
that deadline and never accept a subsequent success message. The private
helper entry for configuration parsing is
`subs/analysis/subs/project/src/configuration-helper.ts` (iteration 5); source
extraction uses `subs/analysis/subs/typescript/src/compiler-helper.ts`
(iteration 6). Each owner keeps its small launcher/protocol adaptation private.
No new shared owner, public exposure, daemon, listener, worker pool or alternate
checker is introduced. No entire analysis session moves into the helper:
model decisions, report composition and the project input view remain in their
existing owners.

The supervision probe establishes an actual native process group, parent-served
file callbacks, parent responsiveness and forced termination on a stalled callback.
Its absent-or-zombie native-process check proves termination, **not reaping**.
Production graceful exit, bounded fallback cleanup, reaping and repeated-session
lifetime evidence remain iteration 12/15 obligations. Compiler objects, handles
and caches never enter public results.

Project acquisition needs the compiler's configuration selection in iteration 5,
before the iteration 6 catalog exists. Its configuration-only helper invokes
the same package to extract plain options, selected filenames and configuration
dependencies. It creates no program/checker and imports no later source-catalog
implementation. Model validation is also absent from acquisition: raw
`ProjectInventory` records declared names, unvalidated header tags and areas;
analysis resolves those to model `SourceArea` profiles when composing inventory
in iteration 8. Thus iteration 5 retains its reviewed prerequisites 2 and 4.

### One captured input view

All discovery, description/README reads, exact-path checks, config parsing,
resource-existence checks and compiler reads use the acquisition's captured
view. Capture bytes, directory-entry observations, POSIX file kind, canonical
path and content identity for influencing inputs. Include selected configuration
and `extends` chains, package manifests used in resolution, compiler libraries,
dependency declarations and every observed existence/nonexistence used to resolve
an import. File content identity includes bytes, not just size/mtime.

Do not claim coherent input merely by overlaying owned `.ts` files onto a
compiler that can still read changing configuration or dependency files from
disk. Freeze the probed host form:

```ts
new API({
  cwd: selectedRoot,
  fs: { readFile, fileExists, directoryExists, getAccessibleEntries, realpath },
});
```

Every callback reads the same **parent-owned** `ProjectInputView` through the
single-flight stdin/stdout bridge. The view's methods return promises so the
parent can await first filesystem observations without blocking its event loop;
only the helper's synchronous native callback waits for that response. The probe's
memoized synchronous parent fixture is feasibility evidence, not a requirement
to make runtime disk acquisition synchronous. The helper never independently
reacquires project bytes from disk. The API's `readFile` callback
returns captured text or **`null`** for an absent file, never `undefined`, which
permits a live-filesystem fallback. Existence returns captured booleans, absent
directory enumeration returns `{ files: [], directories: [] }`, and `realpath`
uses captured POSIX facts. For a captured absent path, the wrapper returns the
normalized requested path while retaining its absence observation; it never
returns `undefined` to allow a native disk fallback. Read/canonicalization errors
produce incomplete acquisition, not a guessed existing file. The wrapper adapts the view's plain directory paths
to the API's entry-list shape. First observations may capture influencing
dependency/configuration bytes while the view is open; subsequent reads reuse
them. Reads introduced after sealing fail explicitly. No fallback to live disk
or second materialized filesystem implementation is selected.

Private bridge frames have a hard **1 MiB encoded byte limit**. Split larger
captured reads into sequential bounded chunks, enforcing the 8 MiB original-file
limit and aggregate captured/in-flight byte limits before allocation. Admit one
request/response operation at a time, with no unbounded callback queue; all native
requests, helper responses and buffered result chunks count toward the invocation
deadline and budgets. Probe frames use an 8 MiB ceiling for their small fixture;
production 1 MiB chunk framing remains an implementation obligation.

Iteration 5 uses this host only with `parseConfigFile`, then closes its helper
and native client. Iteration 6 opens its own host-backed snapshot inside the
source helper. For the compiler program, supply
an in-memory configuration adjacent to the original configuration, extending it
and setting `files` to all inventoried owned compiler-source roots and required
configuration-selected inputs, with `include: []` and `exclude: []`. The
synthetic configuration path is selected against captured absence observations
so it cannot shadow a real file. Call `updateSnapshot({ openProjects: [path] })`
and retrieve its project. Derived config bytes and complete root selection count
toward input identity; reports retain the user's original configuration and
original source paths. No synthetic config is written into the application.

The probe establishes callback-based configuration inheritance and file
selection. Complete program acquisition, forced addition of every owned root,
captured negative dependencies and the changed-input fixture still require
iteration 5/6/12 evidence. An influencing unreadable input is incomplete
acquisition, never an empty successful catalog or an external classification.

After acquisition, compare all captured files and relevant directory observations
with disk, including negative lookup observations. If anything changed during
capture, discard that whole attempt and retry at most twice (three attempts
total). Exhaustion or read failure yields incomplete input, blocked dependent
stages and exit 2. A completed input identity describes the captured bytes;
it does not promise that disk remains unchanged at command exit. A root/scope/
config/registry change produces a different input identity. Keep batch run
identity distinct from that content identity; there is no daemon revision token.

## Versioned analysis report

The JSON wire schema is **`ramify.analysis/1`**. Its exact required fields,
unions and owned types are the `AnalysisReport` definition in contracts.md;
the following table fixes their semantic obligations without inventing a second
schema. JSON has one object on stdout and operational logs only on stderr.

| Field | Required meaning |
| --- | --- |
| `schemaVersion` | Literal `ramify.analysis/1`; an incompatible wire change needs a new version. |
| `runId`, `inputId` | Distinct batch invocation and captured input identity; absent input is explicit before successful acquisition. Never serialize compiler-internal IDs. |
| `request` | `AnalysisInputs`: requested root/cwd, registry, capabilities and limits. `request.project` explicitly records the fixed `scope: "whole-project"` and `configuration: "discover"` policies; no alternative scope or configuration override is offered. |
| `scope` | Effective real root, given/discovered selection, compiler configuration, owned walked roots and compiler-selected outside-module files. Paths in source locations remain relative to this scope. |
| `registry` | Validated definitions and canonical identity, or `null` when validation fails; invalid supplied definitions remain an invalid prerequisite with diagnostics. |
| `capabilities` | Requested, available and executed capability states, separate from coverage. Browser tag matching and a requested browser verifier have different identities. |
| `stages` | Ordered registry, acquisition, parse, catalog, link, access, decide and report records; explicit completed, invalid, blocked, unavailable, failed or not-requested execution. An unrun stage is never inferred complete from zero findings. |
| `outcome` | Object with `execution` (completed, invalid, incomplete or unavailable), `check` (passed, failed or not-run) and `coverage` (complete, partial or not-run). A blocked source stage cannot pass. |
| `snapshot` | Nullable until sufficient acquisition; plain retained inventory, metadata, originals, exports, expanded contracts, accesses, origin paths and decisions. No session/compiler references. |
| `diagnostics` | Located definite violations, invalid inputs and missing exports; stable code/category, importer/source area, accessed file, original owner/binding/resource where known and related declaration evidence. |
| `warnings` | Aggregated compiler-selected outside-module source warnings, with top-level entry and count. They do not include misplaced descriptions. |
| `coverage` | Unsupported/unresolved constructs and compiler problems that prevented an analysis operation, with location and affected capability. Ordinary type errors are omitted. |
| `summary` | Counts of collected scope, exports/accesses/decisions/findings/warnings/coverage plus `complete`. Counts from an incomplete run describe only admitted work. |

Canonical ordering is UTF-8 byte order over root-relative POSIX paths, then
start offset, category/code and original/exposure identity. Use the stage order
declared in contracts.md; sort tag sets by registry name and contract name/original
pairs by decoded name then original ID. Human and JSON consumers format the same
completed report. Timings/run identity are operational metadata; harness semantic
comparisons omit them and preserve diagnostics, provenance and coverage.

The CLI's existing exit contract applies unchanged: 0 only after all required
stages complete without invalid input/definite violations; 1 for definite
violations or invalid input; 2 for unavailable/incomplete invocation or execution;
130 for interruption with no claimed result. Warnings and bounded analysis limits
can accompany exit 0. A resource failure supersedes an otherwise clean prefix.

## Production-file selection and clean build

Activate these independent tooling scripts in **iteration 8**:

```json
{
  "production:files": "tsx scripts/production-files.ts",
  "build": "tsx scripts/build-production.ts"
}
```

`npm run production:files -- --root <dir>` reads that explicit project root and
its normal compiler configuration. The command imports
`../subs/analysis/src/inventory-entry.ts` through `tsx` (source modules keep
`.js` import specifiers, so the script's actual import specifier ends in
`inventory-entry.js`). This is the source counterpart of the supported analysis
inventory package entry in contracts.md, available before the full session in
iteration 12. It invokes `acquireInventory(inputs, control)` and consumes the
returned `InventorySnapshot.inventory` plus resolved `SourceArea` profiles.
Discovery/classification live in analysis/project/model; the script supplies no
duplicate filesystem ownership algorithm. Dependencies are installed by the
normal clean checkout preparation; pre-existing `dist/` is never required.

For each owned application file, find its resolved source-area profile. Retain
it exactly when the area's tags do not include the structurally reserved
`testing` tag. This excludes nested `src/tests/` and ordinary `src/` in testing
owners, including their resources/interfaces. It retains ordinary interfaces,
implementation files, declaration inputs and resources in non-testing areas.
Empty owners contribute no files and are not created. Compiler-selected files
outside modules never enter the list. Unknown/invalid profiles or failed
acquisition fail selection instead of producing a successful partial list.

The deterministic stdout document has this exact wire form (paths shown are
an illustrative tiny fixture, not the reference's full output):

```json
{
  "schemaVersion": "ramify.production-files/1",
  "root": ".",
  "configuration": "tsconfig.json",
  "files": [
    "src/interfaces/api.ts",
    "src/main.ts",
    "src/style.css"
  ]
}
```

`root` is always `.` in this portable document: it names the explicitly selected
root, not the process working directory. `configuration` is relative to that root
and may contain `../` if normal discovery found an ancestor config. `files` is
the complete retained file-path list, with `/` separators, UTF-8 byte ordering,
no duplicates, and a final newline after two-space-indented JSON. No absolute
paths, timestamps, random run IDs or machine-specific dependency inventories are
included. Thus the same source view copied to another directory has the same
selection document. Its paths resolve against the requested root. Logs/errors
use stderr; unsuccessful selection emits no valid-looking list and exits nonzero.

`scripts/build-production.ts` calls the same inventory/selection operation once;
it does not scrape shell output or select a second set with globs. Iteration 8
adds a toolkit-root `.reference-work/` ignore entry; each build owns a unique
`.reference-work/production-<run-id>/` directory. It writes a temporary
configuration there extending the root's `tsconfig.build.json`,
with explicit absolute `files` for selected compiler-supported source/declaration
files, `include: []`, `exclude: []`, explicit original `rootDir` and a temporary
`outDir`. It invokes the pinned compiler CLI for emission, using the same compiler
options. CSS and other retained resources are copied by the build tool to their
corresponding nested output paths; declaration inputs that do not emit are copied
only where needed for the declared package typing surface.

TypeScript follows imports even when an imported file is absent from `files`.
Therefore compiler `exclude` or a `files` list alone is not proof of production
output. The build promotes only JS/declaration/map/resource artifacts whose
source belongs to the reviewed retained list. Its deterministic source-to-output
allowlist excludes all testing areas regardless of what the compiler emitted
into staging. Validate emitted relative runtime dependencies and package entries
against the promoted output; an import of excluded testing output fails the build.
Do not widen the allowlist to make that import resolve. A successful build replaces
only its owned `dist/` output and cleans its temporary directory on all exits.

Set `rootDir: "."` to preserve paths such as `dist/src/cli-entry.js` and
`dist/subs/analysis/src/index.js`. The executable receives its shebang from the
real source entry in iteration 13. No bundler flattens owner paths. Type-check
continues using the complete root configuration and independent scripts check;
test discovery continues covering every owned test. The production command is
an inspectable build input and never narrows `ramify check`.

## Workload measurements and proposed initial limits

The iteration 1 [size probe](../../../scripts/probes/fixture-sizes.ts) records
fixture byte/count measurements only; its
[raw result](../../../scripts/probes/results/fixture-sizes.json) includes the
complete measured content-map identities. On this Linux x64 checkout with
Node v22.23.2 and TypeScript 7.0.2, the
unchanged reference contains:

| Captured category | Files | Bytes | Largest file |
| --- | ---: | ---: | ---: |
| `module.ramify` descriptions | 15 | 9,278 | 1,279 |
| Owner READMEs | 15 | 16,267 | 8,767 |
| All owned source/resources, including tests | 59 | 152,358 | 10,157 |
| TypeScript-family owned files (subset) | 54 | 148,505 | 10,157 |
| CSS resources (subset; two module styles and one ordinary stylesheet) | 3 | 2,140 | 971 |
| `tsconfig.json`, `package.json`, `vite.config.ts`, `vitest.config.ts` | 4 | 3,212 | 944 |

The compiler selects 56 files: the 54 owned TypeScript-family files plus the
two configuration source files. Resources absent from that selection still
belong to the application inventory. The largest owned file is
`subs/workspace/subs/reviews/src/tests/sessions.test.ts`. The probe also defines
a deterministic 100-owner fixture (root plus 99 direct children) with 1,000
TypeScript files outside nested test areas, 100 nested test files and 100 CSS
resources, including nine testing-classified child owners. Its 1,200 owned
source/resource files total **1,152,000 bytes**; all 1,402 measured files total
**1,164,385 bytes**. The nested test areas and testing owners together contain
199 source/resource files excluded from production (100 nested test files plus
108 files in testing owners, with nine overlapping files). Its measured
content-map SHA-256 is
`d5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897`;
the reference measured content-map SHA-256 is
`626a8e7b81df9aae566b585c87b971e11d1e367d9fa4dded746bbd3839a04bff`.
The checked-in [generator](../../../scripts/probes/fixtures/hundred-owners.ts)
returns the exact path/content map so iteration 15 can materialize the same
workload. These measured maps cover authored fixture inputs, not the future
full analysis input identity. These figures exclude
installed dependency bytes; influencing dependency inputs count against the
separate total-input limit when the real captured-view implementation exists.

Limits below are deliberately above both measured authored fixture sizes. They
are finite library defaults, exposed as the single `AnalysisLimits` value in
contracts.md, without a new CLI configuration language. They apply to one
batch/session invocation and are reviewed before iteration 3 implementation.

| Limit | Initial value | Failure treatment |
| --- | ---: | --- |
| Declared owners | 1,000 | Incomplete acquisition, located resource-limit diagnostic. |
| Module depth | 128 parent edges | Incomplete acquisition; use bounded traversal rather than recursive stack overflow. |
| Owned application files/resources | 20,000 | Incomplete acquisition. |
| All captured influencing files | 50,000 | Includes config, declarations, dependency and library reads; incomplete acquisition. |
| Individual captured file | 8 MiB | Reject before decoding/allocating its full report representation. |
| Owned application bytes | 64 MiB | Count original bytes, including resources/tests. |
| All influencing captured/in-flight bytes | 256 MiB | Includes parent/helper transfer copies and overlap during retry; release a discarded attempt before capturing the next. |
| Private helper protocol frame | 1 MiB encoded | Reject oversized frames; transfer larger permitted reads in bounded sequential chunks. |
| Export/original catalog records | 250,000 | Incomplete catalog; no partial wildcard considered valid. |
| Source access occurrences | 250,000 | Incomplete source stage. |
| Selected bindings across source accesses | 1,000,000 | Incomplete source stage; do not omit a whole-namespace/star member. |
| Forwarding depth | 256 steps | Incomplete source stage with located resource-limit evidence; no truncated origin path is allowed. |
| Expanded exposure name/original pairs | 1,000,000 | Incomplete linking; never discard members to manufacture a valid contract. |
| Diagnostic/warning/coverage records combined | 100,000 | Stop the affected stage and retain admitted evidence with an explicit limit result. |
| Serialized result | 32 MiB UTF-8 | Reserve 64 KiB for envelope/control and limit evidence; fail explicitly before exceeding the bounded completed representation. |
| Acquisition attempts | 3 total | Initial attempt plus two whole-view retries; exhaustion is incomplete. |
| Total acquisition time | 30,000 ms across attempts | Incomplete acquisition, not a fresh 30 seconds on every retry. |
| Source operation time (`source.deadlineMs`) | 90,000 ms, also bounded by remaining analyze time | Incomplete source work; cannot extend the total deadline. |
| Total analyze time | 120,000 ms including acquisition | Cancel dependent work and report incomplete timeout. |
| Disposal | 5,000 ms | Close/terminate owned helper/native process group and release view; late callbacks cannot publish success. |
| Analyze calls per session | 1 total | Reject concurrent or repeated invocation explicitly; repeated batch work creates fresh sessions, with no hidden queue. |

Admission to a fact/diagnostic collection happens before the bounded append. On
overflow, stop work, retain the already admitted prefix and report which limit,
configured value and observed next value prevented completion. The report must
say its scope/counts are incomplete; there is no silent truncation or claim of
complete coverage. The JSON formatter calculates serialized size before writing
stdout. If the result cannot fit, retain bounded evidence in an incomplete
resource-limit envelope instead of printing malformed JSON. Timers use elapsed
monotonic time; dependency/native-child work is included in deadlines. Analysis
checks cancellation/deadlines between bounded work batches and yields to its
event loop; counting files alone cannot justify one uninterrupted traversal of
the entire permitted work set.

Performance targets are separate from these hard failure ceilings. They are
proposals pending measurement, not inferred from file sizes:

| Workload | Initial acceptance target for iteration 15 |
| --- | --- |
| Reference, fresh compiled CLI process | Median of five cold checks at most 5 s; peak combined parent/helper/native-compiler RSS at most 512 MiB. |
| Deterministic 100-owner fixture | Median of five cold checks at most 15 s; peak combined parent/helper/native-compiler RSS at most 768 MiB. |
| Repeated create/check/dispose, reference and synthetic separately | 25 cycles after 5 warm-up cycles; post-disposal helper/compiler children, active sessions, open input handles and analysis timers return to zero every cycle. |
| Retained plain reports | Keep all 25 reports; account their serialized bytes explicitly. After disposal, compiler/input retention is zero even while reports survive. |
| Settled repeated-use memory | Across the last 20 cycles, post-GC heap growth beyond retained report bytes is at most 16 MiB and RSS growth is at most 64 MiB, with no increasing child/session counts. Investigate monotonic growth even below these absolute limits. |
| Cancellation | A cooperative cancellation reaches disposed state within 5 s; no successful result follows cancellation. |

Measure at the compiled entry and direct real session using the same recorded
fixture bytes, dependency versions, invocation/config/registry and machine/runtime
metadata. Keep raw cold-duration and sampled peak-memory records separately from
the existing [setup/disposal probe](../../architecture/memory-lifecycle.md#repeatable-setup-measurements).
For parent, helper and native compiler child, record per-process and combined
RSS; parent-only RSS misses the compiler allocation. Summed RSS counts shared mappings more than
once, so it is a conservative process-group bound, not unique physical memory.
Sample peak RSS at 50 ms and record the
sampling limit. Forced GC is a diagnostic measurement method, not production
resource management. Iteration 15 adds the checked-in real-session setup fixture
for `scripts/memory-probe.mjs` and the repeated-use workload. No DA/ML acceptance
case is claimed by these proposed numbers.

## Supported platform consequences

Linux and macOS are the supported targets; Windows fixtures and behavior are
outside this plan. Compare decoded declared paths against actual directory-entry
bytes, without case folding or Unicode normalization. A case mismatch is invalid
on both supported systems, even where the host filesystem resolves it. Path
reports use `/` separators; exact owned exposure references do not perform
TypeScript extension substitution or alias probing.

Use POSIX `lstat`/symlink semantics: the explicitly selected root, description
and any traversed declared source reference must not be symlinks; directory
symlinks are not traversed. Canonicalizing a cwd reached through a symlink for
implicit root selection follows the CLI contract and does not license symlink
declarations. Keep fixtures independent of Linux-only `/proc`, GNU-specific
command flags, and macOS-only case behavior. Measurement tooling must collect
compiler-child lifecycle/peak evidence on both platforms without changing these
path rules.
