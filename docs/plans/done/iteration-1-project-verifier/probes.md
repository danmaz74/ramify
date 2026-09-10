# Compiler and input probes

Status: iteration 1 implementation-choice evidence for architecture review.
These programs inspect the installed compiler and fixture bytes. They implement
no Ramify checker, execute no I1 matrix instance and establish no permission
or source-coverage result. The contract package still requires review before
iteration 3.

## Reproduce

From the package root after `npm run worktree:prepare`:

```sh
npx tsc -p tsconfig.scripts.json
npx tsx scripts/probes/compiler-api.ts
npx tsx scripts/probes/reference-resolution.ts
npx tsx scripts/probes/config-input-view.ts
npx tsx scripts/probes/compiler-lifecycle.ts
npx tsx scripts/probes/async-api-feasibility.ts
npx tsx scripts/probes/supervised-compiler.ts
npx tsx scripts/probes/fixture-sizes.ts
```

Each command ran successfully on Node `v22.23.2`, installed TypeScript `7.0.2`,
Linux x64. The example's installed compiler is also `7.0.2`; the example is
opened with its actual `tsconfig.json` and installed dependencies. The native
compiler API runs without importing application entry points. Every API
client is closed in `finally`; opened snapshots are disposed first. A failed
assertion makes the probe command fail. No Vitest or Cucumber regression suite
was run by these probes.

Portable stdout captures are retained in
[`scripts/probes/results/`](../../../../scripts/probes/results/):

| Command | Raw result | Assertion/result |
| --- | --- | --- |
| `compiler-api.ts` | [compiler-api.json](../../../../scripts/probes/results/compiler-api.json) | Zero compiler diagnostics; originals, alias identity, value/type flags, module targets and export selections asserted. |
| `reference-resolution.ts` | [reference-resolution.json](../../../../scripts/probes/results/reference-resolution.json) | Zero compiler diagnostics; actual AppRouter original, both physical CSS resources and all 17 vocabulary exports asserted. |
| `config-input-view.ts` | [config-input-view.json](../../../../scripts/probes/results/config-input-view.json) | Captured configuration inheritance and file selection with no project/snapshot and no disk fallback. |
| `compiler-lifecycle.ts` | [compiler-lifecycle.json](../../../../scripts/probes/results/compiler-lifecycle.json) | Explicit disposal and a controlled early failure both close the client, dispose the snapshot and reject further use. |
| `async-api-feasibility.ts` | [async-api-feasibility.json](../../../../scripts/probes/results/async-api-feasibility.json) | Async calls preserve event-loop responsiveness and ordinary exports; closing with no active snapshot rejects a pending config request. This does not establish bounded termination. |
| `supervised-compiler.ts` | [supervised-compiler.json](../../../../scripts/probes/results/supervised-compiler.json) | Parent-owned captured reads cross a private synchronous pipe bridge; the responsive parent terminates a deliberately stalled helper and its observed native descendant as one process group. |
| `fixture-sizes.ts` | [fixture-sizes.json](../../../../scripts/probes/results/fixture-sizes.json) | Reference sizes and deterministic 100-owner byte inventory only; no performance or semantic result. |

The captures contain root-relative paths, public binding names and locations;
they omit compiler handle IDs and machine-specific paths. Regenerate a capture
by redirecting that command's stdout to its corresponding JSON file. The
fixture byte digest covers sorted path/content pairs, not filesystem timestamps.

## Compiler integration selected

Select the installed native TypeScript **7.0.2** package and its exported
`typescript/unstable/sync` and `typescript/unstable/ast` interfaces **inside a
supervised, one-shot compiler helper**. Keep the package and native platform companion at
the exact same version; the compiler dependency becomes an exact runtime
dependency at its first use by project configuration acquisition in iteration 5;
the source adapter in iteration 6 uses that same package/version. Iteration 1
does not alter the package manifest or introduce a second compiler.

The package's root export supplies only `version` and `versionMajorMinor`.
There is **no** root `createProgram`, `createCompilerHost` or
`resolveModuleName` API in this installation. An implementation importing those
historical APIs would be incompatible. These conclusions come from the
installed package's `exports`, declaration files and executed probes, not an
assumption about an older release.

The exported API is explicitly unstable. Pinning is deliberate: dependency
updates must rerun these probes and the implemented source-form fixtures before
changing the frozen integration. No fallback to an older compiler with different
configured semantics is selected.

Within that helper, `new API({ cwd, fs })` starts a finite native compiler child
using stdin/stdout pipes. The parent owns the helper's process group, captured
input view, abort state and deadlines. This is an implementation dependency of one analysis invocation;
it is not a Ramify daemon, TCP/Unix listener, MCP server or web service. The
ordinary CLI entry and help/version paths must not construct this API. Native
compiler memory and child lifetime belong in the batch limits and disposal
measurements, including failure and cancellation paths. The synchronous probe
does not establish cancellation responsiveness or the final session's memory
behavior. Those remain implementation obligations in iterations 12 and 15.

The focused lifecycle probe separately verifies explicit snapshot disposal,
idempotent disposal, and automatic disposal of an outstanding snapshot when a
controlled failure reaches `API.close()` in `finally`. A disposed snapshot
rejects lookup, a closed client rejects a subsequent compiler request, and a
repeated close succeeds. These are native API lifecycle observations, not the
Ramify session's later cancellation, listener, report-retention or memory tests.

### Why the helper owns the synchronous API

`async-api-feasibility.ts` confirms that `typescript/unstable/async` returns
the same five interface exports and keeps the JavaScript event loop responsive.
Ordinary close disposes its snapshot. Closing during an actual native
configuration-read callback rejects the pending parse request when no snapshot
exists. This exploratory probe itself runs in a supervised process group with
a ten-second ceiling, so a changed compiler cannot hang the probe indefinitely.

The installed async implementation still cannot be the lifetime authority:

- `API.close()` awaits each active `Snapshot.dispose()`, which sends and awaits
  a native `release` request before closing the transport. A stalled native
  release can therefore stall close.
- Public requests accept no `AbortSignal` or deadline, and expose no public
  native process handle for a forced stop.
- The underlying client's `close()` disposes JSON-RPC and ends native stdin;
  it does not await child exit or force termination. It also does not impose
  a permanent disposed guard. Ramify must reject operations after disposal
  and discard late replies itself.
- `FileSystem` callbacks are synchronous on both entries. Returning a Promise
  from `readFile` would not make a valid async captured-input bridge: the
  installed callback handler wraps the immediate return as file content.

These observations come from `dist/api/async/{api,client}.js` and the exported
`FileSystem` declaration in the exact installed package. Async improves native
request responsiveness but does not repair bounded cleanup. The selected
boundary therefore keeps the already-probed synchronous API in a killable helper,
without a worker pool or moving the analysis engine into another owner.

### Captured-input bridge and supervision feasibility

The [supervised helper fixture](../../../../scripts/probes/fixtures/supervised-compiler-child.ts)
has one reader for inherited stdin and one framed writer for stdout. A native
filesystem callback writes `{ id, method, path }`, synchronously reads the
matching response, and returns its ordinary synchronous value. It never reads
project/configuration/dependency files itself. The supervising parent handles
those requests through **the same parent-owned input view** supplied to the
source adapter: `readFile`, `fileExists`, `directoryExists`, `readDirectory` and
`realPath`. There is no second capture or native disk fallback. This private
transport need not change the public `ProjectInputView` or source-fact types.

The feasibility probe substitutes one memoized first-observation map for the
future real `ProjectInputView`. It exercises 158 influencing observations for
the small compiler fixture, successfully selects its five sources and checks
the same export names. The parent event loop continues to tick while its child
blocks for native requests and callback replies. This is transport feasibility,
not an implementation of acquisition retries or `seal()`.

For the failure case, the parent deliberately withholds an actual source-read
reply while the helper and native compiler are waiting. It observes the native
`tsc` descendant in the helper's POSIX process group, then sends `SIGKILL` to
that owned group after 100 ms. The helper exits with that signal, the native
process is absent or a terminated zombie, and no result arrives. **Absent or
zombie establishes termination and no live compiler work; it does not establish
reaping, zero process-table entries or the final session's resource-completion
gate.** Normal child exit/reaping and the full failure/disposal lifecycle remain
required real-session evidence in iterations 12 and 15.

The parent derives the process-group ID from its own `ChildProcess` handle,
uses no listener or persistent service, and clears timers and closes its streams
on every completion/failure path. A ten-second outer bound protects the probe
itself. The fixture's reply frame is capped at 8 MiB; the final helper must use
[scope.md](scope.md)'s reviewed frame/chunk/result limits and reject malformed,
oversized or late frames. The probe is not a reusable IPC implementation.

This gives the existing contract obligations a concrete execution boundary:
I5 config-only acquisition uses a short-lived supervised helper with its
current view; I6 `SourceAnalysis` owns a helper for its catalog/access lifetime.
Cancellation/deadline makes the parent state terminal, stops sending commands,
attempts bounded normal close, then terminates the owned helper/native group
if necessary. `dispose()` resolves only after the owning adapter's cleanup
obligations complete, and no late native response can become a successful report.

### Exact API selection

| Need | Public API used and observed result |
| --- | --- |
| Config options and selected root filenames | `API.parseConfigFile(configFileName)` returns `options` and `fileNames`. It works before `updateSnapshot`, including inherited configuration and include/exclude selection. |
| Config-only project acquisition in iteration 5 | A short-lived supervised helper's `API` bridges to the supplied parent view, calls `parseConfigFile`, returns plain options/file facts and closes; it need not create or retain a source-checking project, AST or symbol. |
| Program acquisition in iteration 6 | `API.updateSnapshot({ openProjects: [configFileName] })`, then `Snapshot.getProject(configFileName)` provides `Project.program` and `Project.checker`. |
| Compiler-owned AST | `Program.getSourceFile(path)`, `SourceFile.statements`, `isImportDeclaration`, `isNamedImports`, `isStringLiteral`, and node methods `getText()`, `getStart()`, `getSourceFile()`. |
| Configured source target | `Checker.getSymbolAtLocation(importDeclaration.moduleSpecifier)` returns the accessed source module and its declarations, preserving the forwarding file independently of an imported binding's original. No separate historical resolver is assumed. |
| Binding and alias original | `Checker.getSymbolAtLocation(binding.name)`; for `SymbolFlags.Alias`, `Checker.getAliasedSymbol(symbol)`; reject `Checker.isUnknownSymbol(symbol)`. |
| Immediate forwarding hop | `Checker.getImmediateAliasedSymbol(symbol)` exposes the AppRouter forwarding declaration before its final original. Following final aliases alone would discard this evidence. |
| Declaration identity inputs | `Symbol.declarations`, `NodeHandle.path`, `NodeHandle.resolve(project)`, `Node.getStart()` and `Node.end`. Compiler `Symbol.id` is used only for the probe's same-shim assertion, never as a public identity. |
| Value/type existence | Original `Symbol.flags & SymbolFlags.Value` and `Symbol.flags & SymbolFlags.Type`. Inspect the original after alias resolution and retain all declarations. |
| Written import form | `ImportClause.phaseModifier === SyntaxKind.TypeKeyword`; inline `ImportSpecifier.isTypeOnly`. `ImportClause.isTypeOnly` is not in the installed public type declaration and is deliberately not used. |
| Complete current exports | Source-file module symbol from `Checker.getSymbolAtLocation(sourceFile)`; `Checker.getExportsOfModule(moduleSymbol)`. Enumerate before applying Ramify exposure selection; names include default and aliases. |
| Compiler diagnostics | `Program.getConfigFileParsingDiagnostics()`, `getProgramDiagnostics()`, `getSyntacticDiagnostics()`, `getBindDiagnostics()` and `getSemanticDiagnostics()`. Both source probes assert the combined list is empty. |
| Input callbacks | `APIOptions.fs`: `readFile`, `fileExists`, `directoryExists`, `getAccessibleEntries`, `realpath`; exported helper `typescript/unstable/fs.createVirtualFileSystem` is used only in the virtual configuration probe. |
| Cleanup | `Snapshot.dispose()`, `Snapshot.isDisposed()` and `API.close()`. No compiler object is serialized to stdout. |

The async feasibility probe executes its explicitly recorded subset only. The
runtime choice is the synchronous API inside the supervised helper, with the
parent remaining responsive. These results are not proof that every unexecuted
compiler operation or final session cleanup path works.

## Source, alias and export findings

The small independent fixture is
[`scripts/probes/fixtures/compiler-api/`](../../../../scripts/probes/fixtures/compiler-api/).
Its configuration uses bundler resolution, a `@probe/*` path alias and
`verbatimModuleSyntax: false`, so the unmarked purely type imports are legal.
The repository scripts scope checks the probe and fixture source; the one
fixture-only alias import has a narrow `@ts-ignore` for that scripts scope,
which intentionally has no `@probe` mapping. The independently configured
compiler probe still checks that import, asserts zero diagnostics, and requires
its resolved target and original declaration to match the relative import.

- `./originals.js` resolves to the actual `src/originals.ts`; the `@probe`
  import resolves to that same module and original. The bare alias is application
  source, so spelling cannot establish external scope.
- The unmarked `Shape` interface has type existence and no value existence.
  The unmarked `RuntimeClass` and interface/constant merged `Merged` each have
  both. The merged original retains two declarations. Use the original's flags
  to determine availability; neither unmarked spelling nor subsequent type-only
  usage can turn a runtime original into a purely type original.
- Import renaming followed by local forwarding preserves `Shape`'s original
  declaration; forwarding default as `renamedDefault` preserves the original
  default binding. Keep the accessed module separately from that original.
- Export enumeration of `src/interfaces/public.ts` yields exactly `Contract`,
  `default`, `ownAlias`, `ownValue` and `unselectedExport`. `ownAlias` and
  `ownValue` have the same original declaration. The other module's
  `privateExport` remains present in the compiler catalog. This supplies facts
  for a later linker; it does not declare anything exposed.
- The actual reference client accesses `src/interfaces/protocol.ts`, then its
  forwarding alias; the canonical `AppRouter` binding remains in
  `src/assembly.ts`. The actual C1 vocabulary file has 17 exports, each originally
  declared in that file. No reference exposure is changed for this probe.

Export enumeration alone does not certify an expansion as complete when
diagnostics or ambiguous originals exist. The later adapter must retain blocked
or uncertain enumeration; the linker must reject an invalid/foreign wildcard
as a whole. These successful, compiler-valid fixture results establish the
selected APIs, not an implementation of that error policy.

## Resource findings

The two authored CSS-module imports use actual relative resource files:

| File relative to the reference root | Bytes | Effective compiler exports |
| --- | ---: | --- |
| `subs/workspace/subs/catalog/subs/ui/src/catalog-card.module.css` | 525 | `default` |
| `subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.module.css` | 644 | `default` |

Both bindings are runtime values described by **the same compiler symbol** in
`node_modules/vite/client.d.ts`. Neither CSS file appears in the compiler's
source-file set. The reference probe separately checks that both authored
relative paths name physical files and that their paths differ. Therefore
resource identity must combine the independently established resource target
and export binding; a declaration-shim symbol cannot be its identity or owner.
The shim provides the effective name set, including the default export.

This probe does not implement arbitrary loader or alias resolution for resources.
The later inventory/resource adapter must establish targets from captured
project inputs and the configured supported resolution, and preserve an explicit
analysis limit when it cannot. A successful shim match proves neither existence
nor external scope. The probe's fixed relative-file observation must not become
an undocumented general resource resolver.

## Captured configuration inputs

`config-input-view.ts` supplies an entirely virtual `tsconfig.json`, inherited
`base.json` and two source filenames. `parseConfigFile` reads exactly those two
configuration files, returns only `src/selected.ts`, preserves inherited `strict`
and never reads source contents or opens a snapshot. All files remain in memory;
the probe writes no virtual directory.

`readFile` returning `undefined` means **fall back to disk**; returning `null`
means **absent in the supplied view**. The convenience virtual filesystem
returns `undefined` for unknown files, so the probe wraps it and provides empty
directory entries and false existence results as well. The real adapter must
also route influencing dependencies and directory facts through one captured
view. These APIs permit that boundary; they do not themselves detect a change
during acquisition or establish coherent batch identity.

## Workload sizes

The size probe measures the current reference's 15 owner descriptions, their
15 README files, 59 owned source/resource files, and the four explicit
configuration files named in its raw result. Those inputs total **181,115 bytes**;
owned source is **152,358 bytes**. The compiler selects 56 files: 54 TypeScript
source files plus Vite/Vitest configuration. Source inventory also includes CSS,
HTML and the Cucumber feature, independently of compiler selection.

The checked-in `hundredOwnerFiles()` generator supplies root `bench [dispatch]`
and 99 direct children; nine children (`m010` through `m090` by tens) have
`[testing]`. Each owner has a versioned description, README, ten ordinary
TypeScript files, one nested test and a stylesheet. Every TypeScript file is
exactly 1,024 UTF-8 bytes and every CSS file 256 bytes. Source therefore totals
**1,152,000 bytes** across **1,200 files**. There are 100 nested test files; the
nine testing modules add 99 further testing-classified ordinary files, producing
199 source files excluded from production. The size calculation does not invoke
the model; that expected classification remains an independently specified
fixture property.

The generator returns a path/content map without writing it. Iteration 15 can
materialize that same map in an owned temporary directory for the real session
and memory probe. The raw capture retains full-input counts, byte totals and a
SHA-256 of the sorted map. The byte counts ground [scope.md](scope.md)'s initial
finite limits; they are **not** cold-latency, memory, cancellation or repeated
create/check/dispose measurements. Those measurements require the later real
session and must include its native compiler child.
