# Iteration 4 results: TypeScript symbol details

**Status:** complete. **Plan:** [Plan 2A](../main-plan.md). **Iteration:**
[iteration4.md](iteration4.md). **Owner:** `analysis/typescript` only.

## Summary

Added the bounded, body-free TypeScript symbol-detail provider the contract
review froze in iteration 1: `SymbolDetailLimits`, `SymbolDetailRequest`,
`SymbolDetail` in `interfaces/source.ts`; the pure, synchronous
`describeSymbolDetails` compiler-project operation in a new
`symbol-details.ts`; and `RetainedSourceAnalysis.details(...)`, implemented
directly on the retained adapter (`RetainedSourceState`) in
`retained-source-analysis.ts`. The adapter resolves a requested defining-file
export to the same canonical original the catalog computes (rejecting a
forwarding or Ramify alias with `identity-mismatch`), renders a body-free
signature per declaration kind (function/overloads, class, interface,
type-alias, enum, variable, named default export), extracts and normalizes
the first documentation paragraph, and enforces the frozen
signature/documentation/overload/result-byte bounds with `truncated` markers
or a stable `unavailable` reason. Only the owned `module.ramify` exposure line
was added; no other module's declarations were touched.

## Files changed

**`analysis/typescript`** (owned):
- `subs/analysis/subs/typescript/src/symbol-details.ts` (new) — exports
  `describeSymbolDetails(project, inputs, requests, limits, signal?)`.
- `subs/analysis/subs/typescript/src/interfaces/source.ts` — added
  `SymbolDetailLimits`, `SymbolDetailRequest`, `SymbolDetail`, and
  `RetainedSourceAnalysis.details(...)`.
- `subs/analysis/subs/typescript/src/retained-source-analysis.ts` — added
  `RetainedSourceState.details(...)`, calling `describeSymbolDetails` against
  the adapter's own live `Project` inside the existing `#guarded(...)` wrapper.
- `subs/analysis/subs/typescript/module.ramify` — added
  `expose-src describeSymbolDetails from "symbol-details.ts" to parent`.
- `subs/analysis/subs/typescript/src/tests/symbol-details.test.ts` (new, 21
  tests) — direct unit tests of `describeSymbolDetails` over a real,
  independently opened `typescript/unstable/sync` `Project` (the same pattern
  `descriptions.test.ts` already uses), covering all eight matrix leaves.
- `subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts`
  — added a `describe('symbol details', ...)` block (5 tests) covering the
  retained adapter's wiring: hot-path description, `releaseCompiler()`
  unavailability and recovery after the next `update()`, server-loss
  (`SIGKILL`) isolation to `read-failure`, disposal, and cancellation.

**Authorized minimal stub outside this owner** (per the coordinator's
explicit permission for trivial `subs/analysis/src/**` test doubles):
- `subs/analysis/src/tests/session-test-fixture.ts:110` — added
  `details: adapter.details.bind(adapter)` to `instrumentCompiler`'s
  pass-through proxy object, which structurally implements
  `RetainedSourceAnalysis` and would otherwise fail `tsc` with "Property
  'details' is missing" (the type-check first surfaced this). One line, a
  direct bind matching the existing `catalog`/`releaseCompiler` style; no
  behavior change to the real adapter.

**Documentation:** `docs/plans/iteration-2a-materialized-api-view/owners.md`
— added a dated "Revision (iteration 4)" note (see "Contract deviations").

No file under `analysis/model`, `analysis/project`, `analysis` (root),
`daemon`, `daemon/contexts`, `cli`, `subs/analysis/module.ramify`,
`/ramify/module.ramify` or any parallel iteration's scope was touched.

## Matrix leaves executed (I2A-04, all eight)

| ID | Evidence | Result |
| --- | --- | --- |
| `I2A-04:declaration-kinds` | `symbol-details.test.ts`: "renders a body-free overloaded function signature...", "renders a body-free class...", "renders interface, type-alias and enum declarations...", "renders a variable as const name: Type...", "renders a named default export..." | Passed: exact signatures asserted for function, class, interface, type-alias, enum, variable and named default export |
| `I2A-04:overloads` | `symbol-details.test.ts`: "renders a body-free overloaded function signature..." (2 retained), "marks overloads truncated..." (`maxOverloads: 1`) | Passed: overloads retained in `getSignaturesOfType`'s declaration order, implementation signature absent, bound truncation marks `truncated: ['overloads']` and keeps the first overload |
| `I2A-04:first-documentation-paragraph` | `symbol-details.test.ts`: "renders a body-free overloaded function signature..." (second paragraph excluded), "normalizes irregular internal whitespace..." | Passed: only the first paragraph is retained; internal tabs/newlines/runs of spaces collapse to single spaces |
| `I2A-04:no-documentation` | `symbol-details.test.ts`: "omits the documentation field entirely..." | Passed: `documentation` key absent (`not.toHaveProperty`), never an empty string |
| `I2A-04:byte-truncation` | `symbol-details.test.ts`: "keeps a full-budget multibyte documentation paragraph undisturbed", "truncates multibyte documentation on a byte boundary without a replacement character", "marks the signature truncated at a byte-safe boundary..." | Passed: a 40-byte-bounded truncation of a Japanese paragraph produces no `U+FFFD` and stays ≤ 40 UTF-8 bytes; a 6-byte signature bound truncates cleanly |
| `I2A-04:identity-and-alias` | `symbol-details.test.ts`: "returns unavailable/identity-mismatch...", "never resolves a forwarding-alias export name against the defining file..." | Passed: a request whose claimed `binding` disagrees with the resolved declaration is `identity-mismatch`; a forwarding file's export name is not found in the defining file's own export table (`missing-export`), so it cannot redirect the lookup |
| `I2A-04:isolated-unavailable` | `symbol-details.test.ts`: "returns unavailable/missing-export... isolated from other requests", "returns unavailable/unsupported-declaration for a namespace export", "returns unavailable/unsupported-declaration for a resource-kind original..." | Passed: each isolated failure returns one `unavailable` entry with a stable reason; a later valid request in the same batch still resolves |
| `I2A-04:protocol-lifecycle` | `symbol-details.test.ts`: "rejects the whole call when the total encoded result exceeds maxResultBytes", "rejects the whole call for a structurally invalid request...", "rejects an already-cancelled call with no result", "rejects when the supplied limits are not positive safe integers"; `retained-source-analysis.test.ts`'s `symbol details` block: `releaseCompiler()`/server-loss (`SIGKILL` + `gone(pid)`)/disposal/cancellation | Passed: malformed/oversized/cancelled requests throw before returning any array (no prefix); a killed compiler server discards the compiler and rejects `read-failure`; disposal rejects `disposed`; no helper/compiler process is left behind (`gone(pid)` true in the server-loss case, reusing the file's existing PID-liveness helper) |

## Commands run

- `npx vitest run subs/analysis/subs/typescript/src/tests/symbol-details.test.ts` — 21 passed.
- `npx vitest run subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts subs/analysis/subs/typescript/src/tests/symbol-details.test.ts` — 39 passed.
- `npx vitest run subs/analysis/subs/typescript/src/tests/` (whole owner suite, 15 files) — 178 passed. ("context canceled" lines are benign log noise from other files' server-kill scenarios, not failures.)
- `npm run type-check` — clean for every file this iteration touched
  (`subs/analysis/subs/typescript/**`, `subs/analysis/src/tests/session-test-fixture.ts`).
  Remaining errors are all in `scripts/reference-harness/{plan2a-isolation-cases.ts,runner.ts}`
  — parallel-owner work-in-progress (iterations 2/9's harness scope), not
  caused by this iteration; see "Parallel-owner type errors" below.
- `npx tsx scripts/reference-harness/verify.ts --plan 2a --iteration 4` — not
  executed as a pass/fail gate: at the time this iteration ran, `verify.ts`'s
  own `--plan 2a` support (`plan2a-runtime.ts`) did not yet exist
  (`ERR_MODULE_NOT_FOUND`), per the brief's "once it exists" caveat. Later in
  the session a parallel agent added `plan2a-runtime.ts` and related harness
  files; running this gate is outside this iteration's owner scope and is
  left to the coordinator/later iterations.
- `npm run build`, `npm test`, `npm run reference:report`, `npm run check:self` — not run (out of this iteration's scope per the brief's hard rules).

## Rendering rules (for iteration 6's Markdown renderer)

Documented precisely here since iteration 6 consumes `SymbolDetail.signature`
verbatim:

- **Naming.** The rendered identifier (function name, `const` name, or a
  substituted interface/enum/type-alias/class name) is always the request's
  `exportName` — the catalog's defining-file export table key — never the
  declaration's own identifier when the two differ. This only differs for a
  named default export: `export default function defaultGreeter(...)` has
  catalog binding `defaultGreeter` (used for identity, not display) but
  renders as `function default(...)`, since `exportName` is `'default'`.
  No `export`/`export default` keyword is ever emitted.
- **Function** (including overloads): each retained call signature via
  `checker.signatureToSignatureDeclaration(signature, CallSignature)` +
  `printNode`, prefixed `function <exportName>`, one per line, in
  `getSignaturesOfType`'s declaration order (already excludes the
  implementation signature).
- **Class**: `class <exportName> { ... }`, single line, space-separated
  members. Constructor overloads come from the static side's construct
  signatures (`getSignaturesOfType(Construct)` on `getTypeOfSymbol`),
  rendered via `ConstructSignature` and reshaped from `new (params): Return;`
  into `constructor(params);`. Instance members come from
  `getPropertiesOfType(getDeclaredTypeOfSymbol(...))` — already flattening
  inherited members — filtered to omit a member whose name starts with `#`
  or whose first declaration carries `private`/`protected`, then sorted by
  name in byte order. A callable member renders each call signature via
  `MethodSignature`; a data member renders `name: Type;` via
  `typeToTypeNode`. **Static members and `extends`/`implements` heritage are
  never rendered** — a documented simplification, not a bug.
- **Interface / type-alias / enum**: the real declaration node printed
  directly (body-free by TypeScript syntax for these three kinds), with only
  the leading `export`/`export default` keyword stripped.
- **Variable**: `const <exportName>: <Type>` via `getTypeOfSymbol` +
  `typeToTypeNode`, never the initializer, and always the `const` keyword
  regardless of the source's own `let`/`var`/`const`. **Known
  simplification**: an unannotated literal initializer renders its narrow
  literal type (`export const value = 1;` → `const value: 1`), not
  TypeScript's own `.d.ts`-emission-style widened `number` — `getWidenedType`
  did not change this in a direct check against the real checker (see
  "Remaining limits"). An explicit annotation or `as const` is unaffected.
- **Unsupported kinds**: anything other than the six kinds above —
  including an arrow-function or function-expression default export
  (`export default (x) => ...`), a `ClassExpression` default export, and a
  namespace/module declaration — is `unsupported-declaration`. Only the
  kinds the iteration's verification names (functions/classes/interfaces/
  types/variables/enums) were implemented and tested.
- **Documentation**: `checker.getDocumentationCommentOfSymbol(target)`, split
  on the first blank line, internal whitespace runs collapsed to one space,
  `undefined` when empty (never an empty-string placeholder).
- **Byte truncation**: a shared `truncateUtf8` helper backs off one byte at a
  time from `Buffer.from(text, 'utf8')` until `TextDecoder({fatal:true})`
  decodes cleanly — never splits a multi-byte code point, never emits
  `U+FFFD`.

## Contract deviations

- **`owners.md`'s planned file list named `compiler-helper.ts`, `bridge.ts`
  and `wire.ts` as needing extension; none required a functional change.**
  Added a dated "Revision (iteration 4, 2026-09-15)" note directly in
  `owners.md` under `analysis/typescript` explaining why: contracts.md's
  "TypeScript detail provider" extends only `RetainedSourceAnalysis`, whose
  concrete adapter (`RetainedSourceState`) already runs its
  `typescript/unstable/sync` `API`/`Project` directly in-process — it has no
  child `compiler-helper.ts` process of its own. Only the separate disposable
  batch path (`createSourceAnalysis`/`CompilerBridge`, which spawns
  `compiler-helper.ts`) uses that child-process wire protocol, and this
  iteration's contract does not extend `SourceAnalysis`. `symbol-details.ts`
  does reuse `wire.ts`'s existing `SourceFailure`, `encode` and `freezeData`
  (satisfying "the existing bounded `SourceFailure`" and "extend the existing
  framing" from the coordinator's notes) without adding an IPC command
  neither adapter needs, keeping "no new process or cache" literally true.

No other deviation from `contracts.md`, `scope.md` or `owners.md` was needed;
`SymbolDetailLimits`/`SymbolDetailRequest`/`SymbolDetail` and
`RetainedSourceAnalysis.details` match contracts.md's frozen shapes verbatim,
and the frozen limits (`maxSignatureBytes: 2048`, `maxDocumentationBytes: 512`,
`maxOverloads: 8`, `maxResultBytes: 32 MiB`) are validated, not redeclared, by
`describeSymbolDetails` (it accepts whatever `SymbolDetailLimits` its caller
passes and rejects a non-positive-safe-integer value).

## Remaining limits

- **Class rendering omits static members and heritage clauses**
  (`extends`/`implements`). The flattened instance-member surface (which
  already includes inherited public members via `getDeclaredTypeOfSymbol`)
  is rendered instead; documented in `symbol-details.ts`'s `renderClass`
  doc comment and above.
- **Class property modifiers are not reproduced.** A `readonly` or optional
  (`?`) instance property renders as `name: Type;` — the modifier itself is
  dropped, only the type is shown.
- **An unannotated `const` with a literal initializer renders its literal
  type**, not TypeScript's own declaration-emission-style widened primitive
  type (see "Rendering rules" above). A real check with
  `checker.getWidenedType(declaredType)` did not change the result for
  `export const value = 1;` (still renders `1`, not `number`); the unstable
  sync API's widening does not reproduce classic TypeScript's separate
  declaration-emit widening pass, and pursuing that further was judged out
  of this iteration's time budget. Explicitly annotated and `as const`
  exports are unaffected.
- **Only six declaration kinds render a signature**: function (incl. named
  default export and overloads), class, interface, type-alias, enum,
  variable. An arrow-function/function-expression default export, a
  class-expression default export, and any other declaration kind are
  `unsupported-declaration`. The iteration 1 probe's fixture and this
  iteration's own fixture never exercised these forms; the verification
  section only requires the six kinds above.
- **`compiler-failure` remains empirically undemonstrated** (as iteration 1's
  probe also noted): it requires a genuine checker-internal fault that
  neither probe nor this iteration's tests could force. It is reachable in
  code (an unknown-symbol alias target, or a symbol whose declarations all
  fail to resolve via `NodeHandle.resolve`) and is exercised indirectly by
  the `checker.isUnknownSymbol`/empty-declarations guards, but no test
  directly triggers it.
- **`describeOne`'s identity check assumes `original.kind === 'code'`** for
  everything except the immediate resource-kind short-circuit; a resource
  original always returns `unsupported-declaration` without inspecting the
  compiler, since a resource's effective declaration (from `catalog.ts`'s
  synthesized witness module) is not something `describeSymbolDetails` can
  usefully render body-free `.ts`-flavored signatures for. This was a
  deliberate scope decision, not left ambiguous by the contract.

## Required follow-up (other owners)

None beyond the already-applied, authorized `session-test-fixture.ts` stub
listed under "Files changed." No other structural implementation of
`RetainedSourceAnalysis` was found outside `analysis/typescript`: a repo-wide
search for `RetainedSourceAnalysis` found only type references and the real
`createRetainedSourceAnalysis` factory (`subs/analysis/src/session-revision.ts`,
`scripts/reference-harness/plan5-compiler-cases.ts`), plus the reference
harness's read-only declaration-line assertion
(`scripts/reference-harness/plan5-completion-cases.ts:30`, unaffected since
this iteration added a new line rather than changing the existing
`createRetainedSourceAnalysis` line).

## Parallel-owner type errors (not mine to fix)

At the time this iteration's `npm run type-check` ran, `scripts/reference-harness/`
had these errors, all in files owned by iterations 2/3/9's parallel harness
work, none touching `analysis/typescript`:

- `scripts/reference-harness/plan2a-isolation-cases.ts:125,192,200` —
  `Property 'issues' does not exist on type 'ProjectInventory'` and
  `Property 'view' does not exist on type 'ProjectInputView'`.
- `scripts/reference-harness/runner.ts:83` — a family-instance map missing
  entries for several I2A families.
- `scripts/reference-harness/verify.ts:9` — `Cannot find module
  './plan2a-runtime.js'` (present at the start of this iteration; a parallel
  agent has since added `plan2a-runtime.ts` and several `plan2a-*-cases.ts`
  files to the working tree, visible in `git status` but not independently
  re-verified here since it is outside this iteration's scope).

## Follow-up: class rendering (coordinator-requested)

A coordinator-requested follow-up (same owner, `analysis/typescript` only)
closed the class-rendering gaps this iteration's "Remaining limits" recorded,
and corrected one of that section's own claims. `symbol-details.ts` and
`symbol-details.test.ts` (5 new exact-output tests, 26 total in the file) were
the only files touched. The updated, exact class-signature rule iteration 6's
renderer should reproduce verbatim:

- **Header.** `[abstract ]class <exportName><TypeParams><Heritage>`. `abstract`
  appears only when the declaration itself carries it. `<TypeParams>` and
  `<Heritage>` are the declaration's own `typeParameters` and
  `heritageClauses` nodes, printed directly (`preserveSourceNewlines: false`,
  trimmed) and omitted when absent — they carry no bodies, so no
  checker-side reconstruction is needed and the text matches the source
  exactly (e.g. `class Shape<T extends Base = Base> extends Base implements
  Labeled`).
- **Constructor.** Unchanged in shape (`constructor(params);`, from the
  static side's construct signatures), but the printed `new <T>(...): R;`
  text now has its leading, class-level type-parameter clause stripped
  (bracket-depth counted, not regex-approximated, so a nested generic
  constraint is not cut short) before extracting `(params)` — that clause is
  already shown once on the header, per above. An abstract class's implicit
  or explicit constructor is unaffected (no `abstract` keyword on the
  constructor line; only the class is `abstract`).
- **Members, in order:** constructor(s) first, then **static** members
  (byte-order sorted), then **instance** members (byte-order sorted,
  already flattening inherited members as before). Statics come from
  `getPropertiesOfType` on the class symbol's own (static-side) type —
  the same type the construct signatures come from — excluding the
  implicit `prototype` property.
- **Omission.** A member is omitted when its name contains `#` (ECMAScript
  private; the checker's symbol name is not simply `#`-prefixed but mangled
  to a form like `__#1@#name`, so the test is a substring check, not
  `startsWith`) or its first declaration carries the `private` modifier. A
  `protected` member is **kept** (this iteration's predecessor incorrectly
  filtered it out alongside `private`) and rendered with a `protected`
  prefix.
- **Per-member modifiers**, emitted in `protected static abstract readonly`
  order (only the applicable ones appear): `protected` from the modifier
  flags; `static`/`abstract` likewise (`static` reflects which collection —
  static or instance — the member came from, not a re-read flag); `readonly`
  from the modifier flags, or synthesized for a getter-only accessor (see
  below); `?` immediately after the member name when its declaration's
  postfix token is `?`.
- **Methods**, including overloads: each call signature of the member's type
  renders as `<modifiers> name(params): Return;`, one per signature, all on
  the same member's line-group (unchanged from before; already handled
  overloads, just re-homed into the shared per-member renderer).
- **Data properties**: `<modifiers> name[?]: Type;`. The type comes from the
  property's own type-annotation node when its declaration has one, printed
  directly — not from `getTypeOfSymbol`, which (without
  `exactOptionalPropertyTypes`) adds a synthetic `| undefined` to an optional
  property's type that the `?` already conveys, even when the property is
  explicitly annotated. An optional property with no annotation at all falls
  back to that checker type (accepted minor limitation: it may show
  `Type | undefined` in that specific, uncommon case).
- **Accessors are rendered as properties, never as `get`/`set` syntax**: a
  getter with no matching setter renders `readonly name: Type;`; a getter
  with a setter, or a setter alone, renders `name: Type;` (writable). This is
  the writability a consumer actually observes, and needs no second,
  accessor-specific shape.

**Correction to this file's own "Remaining limits" (const/let/var
widening).** That section's claim — that `describeSymbolDetails` should but
does not widen an unannotated `const`'s literal initializer type to match
`.d.ts` emission — was itself mistaken about what `.d.ts` emission does.
TypeScript's declaration emission keeps a `const` binding's own narrow
literal type (`const value: 1`, not `number`); only `let`/`var` widen. A
direct check (added as this follow-up's fifth new test) confirms
`checker.getTypeOfSymbol` already matches this without any code change:
`export const x = 'literal'` renders `const x: "literal"`, and an
unannotated `export let x = 'literal'` / `export var x = 'literal'` already
render `const x: string` — the checker itself widens a mutable binding's
fresh literal type during ordinary inference (a later assignment could
change the value), so no extra `getWidenedType` call was needed for that
case either. `renderVariable`'s own doc comment is corrected to match. No
`SymbolDetail` shape, request/response contract, or bound (`maxSignatureBytes`,
`maxDocumentationBytes`, `maxOverloads`, `maxResultBytes`) changed; truncation
still applies at the whole-signature-text byte level exactly as before.

## Handoff

For iteration 5 (complete API-view projection) and iteration 7 (hot/warm
query), from `subs/analysis/subs/typescript/src/`:

- `interfaces/source.ts` exports `SymbolDetailLimits`, `SymbolDetailRequest`,
  `SymbolDetail` (the `'described' | 'truncated' | 'unavailable'` discriminated
  union, exactly as contracts.md specifies) and extends
  `RetainedSourceAnalysis` with
  `details(requests: readonly SymbolDetailRequest[], limits: SymbolDetailLimits, signal?: AbortSignal): Promise<readonly SymbolDetail[]>`.
- `symbol-details.ts` exports the pure operation
  `describeSymbolDetails(project: Project, inputs: { inventory: ProjectInventory; areas: readonly SourceArea[] }, requests: readonly SymbolDetailRequest[], limits: SymbolDetailLimits, signal?: AbortSignal): readonly SymbolDetail[]`
  for anyone needing to call it directly over an already-open compiler
  `Project` (as the new unit tests do); production callers should go through
  `RetainedSourceAnalysis.details(...)` instead.
- Call `analysis.details([...], limits)` only while `analysis.hot` is `true`
  (i.e., after a successful `update()`/cold open and before
  `releaseCompiler()`/`dispose()`); otherwise it rejects `unavailable` (mirrors
  `describe()`/`catalog()`/`interpreter()`). A killed compiler server rejects
  the in-flight call `read-failure` and flips `hot` to `false`; the next
  `update()` reopens it.
- The frozen limits from contracts.md
  (`{ maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8, maxResultBytes: 32 * 1024 * 1024 }`)
  are validated but not hardcoded inside this owner — iteration 5's
  `analysis` owner supplies them (per contracts.md's "Analysis projection"
  `ApiViewQuery.details: SymbolDetailLimits`).
- Request `original` must be the exact `OriginalId` the catalog already
  computed (same `kind`/`owner`/`file`/`binding`) and `exportName` must be
  one of that defining file's own `FileExports.exports[].name` entries whose
  `.original` equals that `OriginalId` — i.e., exactly the join scope.md's
  "Defining names and files" section describes. Passing a forwarding file's
  export name, or a mismatched `original`, yields `unavailable` (never a
  silently wrong signature).
- See "Rendering rules" above for the exact, deterministic per-kind signature
  shape iteration 6's Markdown renderer should reproduce verbatim (no
  reformatting needed — `signature` is already the code-fence body).

## Coordinator integration after iterations 2–4

- The group's cross-subtree relays from [owners.md](../owners.md#cross-subtree-relay-additions-named-lists-only)
  items 1–3 were applied to `subs/analysis/module.ramify` and `module.ramify`
  (`isRamifyGeneratedPath`, `SymbolDetailLimits`, `SymbolDetailRequest`,
  `SymbolDetail`, `AvailableForm`, `AvailableOriginal`, `listAvailableOriginals`).
- `dist/src/ramify check --batch --root .` then reported two `not-visible`
  errors: `symbol-details.ts` imported the unexposed model helpers
  `validOriginalId` and `validText`. Request validation now uses the exposed
  `originalKey`, which rejects a non-canonical identity, plus a local
  export-name text check. A literal NUL byte in the deduplication key was
  replaced by an escape sequence. After the fix, build and `npm run type-check`
  pass, the batch self-check passes (11 owners, 0 errors, 2,752 allowed), and
  `symbol-details.test.ts` (21) and `retained-source-analysis.test.ts` (19) pass.
- Every later iteration runs `dist/src/ramify check --batch --root .` after
  build: TypeScript compiling a cross-owner import does not make it legal.
