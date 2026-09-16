# Iteration 1 results: Contract review and scale probes

**Status:** complete. **Plan:** [Plan 2A](../main-plan.md). **Iteration:**
[iteration1.md](iteration1.md).

## Summary

Bound Plan 2A to current Plan 5 provider shapes, ran three checked-in
deterministic probes against R (`examples/collection-review`), T (this
toolkit), S100, S500 and S1000, froze every numeric contract limit with
evidence, replaced owners.md's proposed declaration snippets with reviewed
exact lines (all five confirmed correct, plus eight required cross-subtree
relay additions identified and specified), fixed the generated-name
predicate precisely, reconciled the subcases count (confirmed 104, no
correction needed), and recorded the current `reference:verify --plan`
discriminator for iteration 2. No production owner (`subs/**`, `src/**`) was
touched.

## Matrix leaves executed (I2A-01, all four)

| ID | Evidence | Result |
| --- | --- | --- |
| `I2A-01:provider-handoff` | This file, [Provider handoff](#provider-handoff) below, cross-checked against source at commit `71643d522eb053336e4c01fcf9836ec52b58fbad` | Passed: every claim in main-plan.md's "Verified starting point" confirmed against current source; two load-bearing nuances added (see [main-plan.md's revision](../main-plan.md#verified-starting-point)) |
| `I2A-01:scale-baseline` | `scripts/probes/results/plan2a/scale-baseline.json` | Passed: real available-entry/file/byte counts for R, T; real inventory-scale counts for S100/S500/S1000 (zero available entries, confirmed as a real generator property, not a probe defect); S1000 predecessor-refusal note recorded without re-executing Plan 5's retained-session gate |
| `I2A-01:format-token-probe` | `scripts/probes/results/plan2a/token-format.json` | Passed: compact-vs-verbose byte/heuristic-token comparison recorded for R and T with the named omission set retained; no tokenizer package is installed, so byte counts are exact and both token figures are clearly labeled approximations |
| `I2A-01:limits-frozen` | [contracts.md's frozen-limits table](../contracts.md#revision-iteration-1-2026-09-15) | Passed: every detail/area/invocation/staging/deadline limit is a positive finite number with a linked raw-observation path; no unresolved semantic choice (generated-name predicate, `maxInvocationBytes` ambiguity) remains open |

## Frozen numeric limits

Every detail/area/invocation/staging/deadline limit is frozen in
[contracts.md's revision table](../contracts.md#revision-iteration-1-2026-09-15).
The per-kind evidence backing `maxSignatureBytes`/`maxDocumentationBytes`/
`maxOverloads` is in [TypeScript symbol-detail feasibility](#typescript-symbol-detail-feasibility)
below; the per-area/invocation byte evidence is in [Scale baseline](#scale-baseline)
below; the reused (not new) `deadlineMs` ceiling is
`subs/daemon/src/validation.ts:90`. No candidate needed to change: every
measured real figure sits far under its bound, and the one open item
(`maxInvocationBytes`) was a documentation gap in main-plan.md's original
candidate list, not a numeric disagreement, resolved by clarification.

## Provider handoff

Rechecked commit: `71643d522eb053336e4c01fcf9836ec52b58fbad` (`git log --oneline -1`:
`71643d5 chore(deps): sync the lockfile's bin entry with package.json`) — same
commit main-plan.md's original "Verified starting point" recorded; nothing
drifted between planning and iteration 1.

### `RetainedSession` (`subs/analysis/src/interfaces/session.ts:93-105`)

```ts
export interface RetainedSession {
  readonly current: SessionRevision | null;
  update(changes: readonly SessionChange[], control?: RunControl,
    invocation?: Pick<AnalysisInputs, 'project' | 'capabilities'>): Promise<SessionUpdate>;
  sweep(control?: RunControl): Promise<SessionUpdate | { readonly status: 'unchanged'; readonly timings?: OperationTimings }>;
  verify(control?: RunControl): Promise<VerifyOutcome>;
  report(control?: RunControl, sequence?: number): Promise<AnalysisReport | null>;
  releaseRevision(sequence: number): Promise<void>;
  status(): SessionStatus;
  releaseCompiler(): Promise<void>;
  dispose(): Promise<void>;
}
```

Eight methods, not the six main-plan.md's prose named (update, sweep, verify,
report, compiler release, disposal): `releaseRevision` and `status` also
exist and are load-bearing for `apiView`'s revision-bound query design.
Factory: `openRetainedSession(inputs: SessionInputs): Promise<SessionOpen>`.

### `SessionFacts` (`subs/analysis/src/session-facts.ts:52-68`)

```ts
export interface SessionFacts {
  readonly registry: ResolvedTagRegistry;
  readonly invalid: InvalidAcquisition | null;
  readonly inventory: ProjectInventory | null;
  readonly areas: readonly SourceArea[];
  readonly areaIssues: readonly AnalysisDiagnostic[];
  readonly files: Readonly<Record<string, FileFacts>>;
  readonly catalog: SourceCatalog;
  readonly linked: LinkedDescriptions | null;
  readonly linkIssues: readonly AnalysisDiagnostic[];
  readonly model: Model | null;
  readonly decisions: Readonly<Record<string, AccessDecision>>;
  readonly indexes: FactIndexes;
}
```

Matches main-plan.md's "inventory, source areas, catalog, linked model,
per-file access facts, decisions and indexes" field-for-field. `FileFacts`
(per-file access facts) at `session-facts.ts:17-24`; `FactIndexes` (importers,
selectors, owners, contributors) at `session-facts.ts:30-43`.

### `daemon/contexts` vocabulary (`subs/daemon/subs/contexts/src/interfaces/contexts.ts`)

`ContextToken` (`:10-13`), `LeaseId = string` (`:9`), `RevisionId = string`
(`:8`). `Freshness` (`:112-114`):
`{ mode: 'published'; wait; revision? } | { mode: 'synchronized'; expect: readonly ExpectedContent[] }`
— the `'synchronized'` mode carries **only** `expect`, no deadline field
itself (a nuance worth stating precisely since Plan 2A's `ApiViewRequest` and
`MaterializeParams` both carry `deadlineMs` as a sibling field, not inside
`Freshness`, exactly mirroring `CheckRequest`/`CheckParams`'s existing
pattern). `ContextManager` operations (`:228-237`): `open`, `status`, `list`,
`check`, `subscribe`, `release`, `dispose`. `RunControl = { signal?: AbortSignal }`
(`subs/analysis/src/interfaces/analysis.ts:13`).

### Daemon service (`src/interfaces/service.ts:70-79`, `subs/daemon/src/validation.ts:4-6`)

`RamifyService` has exactly 8 operations: `openContext, contextStatus, check,
subscribe, unsubscribe, closeContext, daemonStatus, stopDaemon`
(`ServiceOperation`/`ServiceCapability` unions at `service.ts:6-8`,
independently confirmed by the runtime validator's identical 8-name allow-list).
Codec: `subs/daemon/src/codec.ts` (length-prefixed JSON framing). Validation:
`subs/daemon/src/validation.ts` (shape guards, including the deadline ceiling
below).

### CLI lightweight-import-closure claim: confirmed

`subs/cli/src/index.ts` exports only `runCli` + types. `subs/daemon/src/client-entry.ts`
exports only `connectDaemon`, endpoint/record helpers, codec functions and
types. Every session/analysis/context type reference inside
`check-command.ts`/`watch-command.ts`/`daemon-command.ts` is `import type`
(erased at build), and the reference test
`I5-14:package-entries-unchanged` (`scripts/reference-harness/plan5-completion-cases.ts:136-160`)
already traces real `import()` calls of `ramify.ts/cli`/`ramify.ts/client`
from an installed package and asserts the resulting closure loads no
session/worker/compiler module and starts no process/socket.

### Plan 5 closure: the 96 MiB S1000 retained-session refusal

`docs/plans/done/iteration-5-fast-incremental-checks/scope.md:326,330` fixes
`SessionLimits.maxRetainedFactBytes` at 96 MiB.
`docs/plans/done/iteration-5-fast-incremental-checks/iterations/iteration13-results.md`
records the refusal at line ~258 ("the S1000 cold check exited 2 with
'resource-limit: maxRetainedFactBytes limit 100663296 exceeded (observed
167266182)'") and restates it in "Known limits" at lines ~587-588. This
limit belongs to `RetainedSession`, not the disposable batch
`AnalysisSession` this iteration's scale probe used — see
[S1000 predecessor refusal](#s1000-predecessor-refusal) below for the
empirical confirmation that the two paths behave differently.

### Retained compiler adapter (`subs/analysis/subs/typescript/src/interfaces/source.ts:170-182`)

```ts
export interface RetainedSourceAnalysis {
  readonly hot: boolean;
  update(changes: SourceChangeSet, signal?: AbortSignal): Promise<{ snapshot: number; elapsedMs: number; reach?: MembershipReach }>;
  describe(files: readonly string[], signal?: AbortSignal): Promise<{ descriptions: readonly FileDescription[]; delta: CatalogDelta }>;
  catalog(): SourceCatalog;
  interpreter(): AccessInterpreter;
  releaseCompiler(): Promise<void>;
  dispose(): Promise<void>;
}
```

Confirms: `update` and `describe` (file exports) exist; there is no bounded
symbol-signature or documentation-extraction operation anywhere in this
interface. `catalog.ts` (same owner) already resolves exports to real
`Symbol`s and follows aliases/declarations (`catalog.ts:426-530`), but never
builds a `Signature`, calls `typeToTypeNode`, or reads a documentation
comment — exactly the gap the TypeScript feasibility probe below fills in.

## TypeScript symbol-detail feasibility

Probe: `scripts/probes/plan2a/typescript-detail-feasibility.ts`. Fixture:
`scripts/probes/fixtures/plan2a-symbol-details/` (function with two overloads,
class, interface, type alias, `const`, enum, default export, undocumented
export, a long multibyte-Unicode JSDoc paragraph, a namespace export, a
missing-name request, and a forwarding re-export). Raw evidence:
`scripts/probes/results/plan2a/typescript-detail-feasibility.json`.

Same TypeScript dependency and API the toolkit's own retained adapter uses:
`typescript` **7.0.2**, consumed through `typescript/unstable/sync` (a
client/server channel to a native compiler process, confirmed via
`node_modules/typescript/dist/api/sync/api.d.ts`; `subs/analysis/subs/typescript/src/catalog.ts`
already uses this exact entry point to resolve exports to `Symbol`s). This is
**not** classic `typescript`'s `ts.createProgram`/`ts.TypeChecker` API.

Concrete, source-verified findings:

- **Signature extraction is feasible.** `checker.signatureToSignatureDeclaration(signature, SyntaxKind.CallSignature)`
  + `emitter.printNode(node)` renders a real, body-free call signature "for
  free" (a synthetic call-signature node never carries a body). Real sample:
  `function add(a: number, b: number): number;` (43 bytes).
- **Overload retention is feasible.** `checker.getSignaturesOfType(type,
  SignatureKind.Call)` returned exactly the 2 real overloads of the fixture's
  `add` function, excluding its implementation signature, in declaration
  order. Truncating to `maxOverloads: 1` correctly marked the entry
  `truncated: ['overloads']` while keeping the first overload.
- **First-JSDoc-paragraph extraction is feasible and simpler than classic
  TS.** `checker.getDocumentationCommentOfSymbol(symbol)` already returns a
  plain joined string (TS7 needs no `ts.displayPartsToString` equivalent).
  First-paragraph splitting is ordinary string logic on the first blank line;
  real samples ranged 37-231 bytes, including a 231-byte Japanese paragraph
  that survived a full-budget (512-byte) pass undisturbed.
- **UTF-8 byte-safe truncation is a confirmed, net-new gap.** No helper for
  this exists anywhere in `subs/` (grepped for byte-truncation, `codePoint`,
  slicing helpers under `subs/analysis` and `subs/daemon`; only JSON-wire
  size accounting and unrelated log-file truncation exist). This probe wrote
  and exercised one (`decoder.decode` with `fatal: true`, backing off one
  byte at a time): truncating the 231-byte Japanese paragraph to a 40-byte
  test bound produced a clean 39-byte prefix (13 complete 3-byte characters)
  with no split code point and no `U+FFFD` replacement character on
  re-decode — verified programmatically (`unicodeRoundTrip.decodesWithoutReplacementCharacter: true`
  in the archived JSON).
- **Declaration-kind coverage, per kind, real and measured:**
  - **Function** (incl. default export): body-free via the signature path
    above.
  - **Interface, type alias, enum**: body-free "for free" when the *real*
    declaration node is printed directly via `emitter.printNode`, because
    interface members, type aliases and enum member lists carry no
    implementation bodies in TypeScript syntax. Real samples: `export
    interface Shape {\n    readonly kind: string;\n    area(): number;\n}`
    (73 bytes); `export type Id = string | number;` (33 bytes); a 3-member
    enum (50 bytes).
  - **Class**: printing the real `ClassDeclaration` node is **not**
    body-free — it includes every method/constructor body (measured: 116
    bytes for a 2-member class, would grow unbounded with real
    implementation). **Confirmed gap:** no synthetic, body-free class
    rendering exists; iteration 4 needs new code (e.g. printing each member
    signature individually) and no `ts.factory`-equivalent synthetic-node
    construction API was confirmed present in `typescript/unstable/sync`.
  - **Variable (`const`)**: printing the real `VariableDeclaration` node
    includes its initializer. This probe demonstrates a body-free
    alternative: `checker.getTypeOfSymbol(symbol)` + `checker.typeToTypeNode(type)`
    + `emitter.printNode` reconstructed `const total: number` (20 bytes)
    without the `= 42` initializer. Noted as one workable alternative, not
    the only possible design.
- **Identity/alias resolution is feasible and already correct.**
  `checker.getAliasedSymbol(symbol)` on a forwarding re-export
  (`forwardedTotal` from a `forward.ts` barrel) resolved back to
  `src/originals.ts`, never `src/forward.ts` — confirmed via
  `aliasCheck.resolvedToDefiningFile: true` in the archived JSON, matching
  the catalog's existing forwarding-identity rule.
- **Isolated failures are demonstrated, not merely asserted.** A
  missing-export request (`doesNotExist`) returned `unavailable`/
  `missing-export` without throwing, and a namespace export (`Grouped`)
  returned `unavailable`/`unsupported-declaration`; a subsequent, unrelated
  valid request (`add`) in the same batch still returned `described` —
  `isolationCheck.missingExportDidNotAbort: true`,
  `isolationCheck.laterValidRequestStillDescribed: true`. `compiler-failure`
  could not be independently forced (it requires a genuine checker-internal
  fault); isolation is demonstrated via the two cases above, which exercise
  the same per-request isolation contract.

**Net-new code required for iteration 4** (nothing below exists in `subs/`
today): a byte-safe UTF-8 truncation helper; a declaration-kind dispatcher
choosing between the signature path, the direct-print path and a
to-be-designed body-free class path; first-paragraph JSDoc splitting/
normalization; and — separately, per the "warm rehydration" decision — a
compiler-reconstruction path from a retained observer's captured input view,
which does not exist yet either (grepped `retained-source-analysis.ts` and
`subs/analysis/src/session-*.ts` for "warm"/"rehydrate"/"captured"; only the
existing warm-compiler-server lifecycle and general observed-input capture
exist, not a captured-view-to-fresh-compiler reconstruction). The existing
`synthetic.ts` virtual-input pattern (already used by `compiler-helper.ts`
and `RetainedSourceState`) is the closest structural precedent to build that
on.

## Scale baseline

Probe: `scripts/probes/plan2a/scale-baseline.ts`. Raw evidence:
`scripts/probes/results/plan2a/scale-baseline.json`.

Method: real availability, computed by calling the actual, already-public
`explainImport(model, question)` decision engine from `ramify.ts/model` once
per (consuming source area, foreign original, request) triple for R and T —
not a reimplemented approximation of its rules, satisfying contracts.md's
shared-helper requirement even though `listAvailableOriginals` itself is
iteration 3's deliverable. Byte figures are a **raw-declaration-span proxy**
(the literal source bytes between each original's first declaration's
`start`/`end`, plus a small constant Markdown-overhead estimate) — a
deliberate over-estimate of a future bounded, body-free signature, clearly
distinct from the real per-kind measurements in the TypeScript feasibility
probe above.

| Fixture | Owners | Source files | Originals | Exposures | Ordinary available entries | Test available entries | Duplicated (ordinary ⊆ test) | Elapsed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| R | 15 | 54 | 89 | 79 | 267 | 290 | 267 | 3.47 s |
| T | 11 | 284 | 808 | 601 | 1591 | 1635 | 1591 | 14.78 s |
| S100 | 100 | 1100 | 1100 | 0 | 0 | 0 | — | 5.92 s |
| S500 | 500 | 5500 | 5500 | 0 | 0 | 0 | — | 57.78 s |
| S1000 | 1000 | 11000 | 11000 | 0 | 0 | 0 | — | 100.67 s |

Every ordinary-available entry in both R and T also appears in that module's
test-area projection (`duplicatedAcrossAreas` equals `ordinaryEntries`
exactly in both), with tests additionally gaining 23 (R) and 44 (T)
test-only entries — a real, direct confirmation of the specification's
"testing view repeats ordinary entries" rule, ahead of iteration 3/5
implementing it.

Real per-module raw-span-proxy byte totals (not the future bounded
rendering): R sums to 40,707 bytes ordinary / 54,139 bytes tests across 15
modules (largest single module: `collection-review/workspace`, 4,912 bytes,
27 entries); T sums to 777,727 / 831,539 bytes across 11 modules (largest:
`ramify/daemon`, 118,775 bytes ordinary / 130,221 bytes tests, 167 entries).
All of these are 2-3 orders of magnitude under the frozen 32 MiB
`maxAreaBytes` bound even before accounting for the real bounded rendering
being materially smaller than this raw-span proxy.

### S1000 predecessor refusal

Plan 5's `RetainedSession` is known to refuse S1000 at its 96 MiB
`maxRetainedFactBytes` limit (159.5 MiB observed;
[cited above](#plan-5-closure-the-96-mib-s1000-retained-session-refusal)).
This probe used the **disposable batch** `AnalysisSession`
(`createAnalysisSession`/`analyze`), not `RetainedSession`, per the brief's
"a static batch-model probe may still work" guidance. It completed real,
successful batch analysis of S1000 (1000 owners, 11,000 source files) in
100.67 seconds real elapsed time, confirming empirically that the two paths
behave differently: the batch path retains nothing across calls and so does
not accumulate the retained-fact budget that trips `RetainedSession`. This
is not a claim that Plan 5's S1000 retained-session limitation is resolved —
it remains an explicit, unchanged predecessor limitation — only that this
iteration's disposable-batch scale probe is unaffected by it. One
operational note: the probe's 90-second `AbortSignal` guard for S1000 did not
preempt the run before it finished at 100.67s, i.e. the disposable batch
path's cancellation does not necessarily interrupt promptly mid-analysis;
this is worth a look during iteration 5/9's deadline-bound work but is not a
Plan 2A regression since no production deadline enforcement exists yet.

## Format/token probe

Probe: `scripts/probes/plan2a/token-format.ts`. Raw evidence:
`scripts/probes/results/plan2a/token-format.json`.

No tokenizer package (`tiktoken`/`gpt-tokenizer`/`js-tiktoken`) is declared
in `package.json` or present in `node_modules` (confirmed by search across
`dependencies`, `devDependencies` and a `node_modules` listing). Per the
brief, byte counts below are exact; two clearly-labeled **approximations**
(not a real tokenizer) are also recorded: a bytes/4 rule-of-thumb
(`approxTokensBytesOverFour`) and a punctuation/whitespace boundary split
count (`approxTokensBoundarySplit`).

Compared the specification's exact compact Markdown template against a
deliberately verbose JSON record naming every field the specification's
omission rules forbid (`availability`, `provider`, `definingPath`,
`originalId`, `tags`, `exposurePath`, `availabilityReason`, `exposureAlias`,
`generatedAt`) — a contrast baseline, not a proposed alternative format —
over 40 real available entries per fixture (same `explainImport`-derived
availability and raw-span-proxy signature text as the scale probe):

| Fixture | Compact bytes | Verbose bytes | Overhead ratio (verbose/compact) | Compact ≈tokens (bytes/4) | Verbose ≈tokens (bytes/4) |
| --- | ---: | ---: | ---: | ---: | ---: |
| R | 12,508 | 34,169 | 2.73× | 3,127 | 8,543 |
| T | 18,580 | 36,695 | 1.97× | 4,645 | 9,174 |

The compact format is roughly 2-2.7× smaller than the verbose contrast
baseline on real project entries, confirming the specification's omission
rules produce a materially more compact agent-facing document, independent
of exactly which tokenizer an agent's model uses.

## Generated-name predicate (fixed precisely)

[scope.md's revision](../scope.md#generated-output-isolation) fixes the
predicate as a closed three-form enumeration: the exact segment `.ramify`;
`.ramify.tmp-<request-id>` (regex `^\.ramify\.tmp-[A-Za-z0-9_-]+$`);
`.ramify.old-<request-id>` (regex `^\.ramify\.old-[A-Za-z0-9-]+$`). Any other
segment, explicitly including `.ramify-other`, is ordinary input and never
reserved — resolving `I2A-02:transient-names-excluded`'s open question so
iteration 2 implements it without choosing.

## Harness `reference:verify --plan` discriminator (for iteration 2)

`scripts/reference-harness/verify.ts`:

- `VerifyOptions.planNumber?: 2 | 5` (`:16`) — plan 1 is the implicit/default
  case and is never carried as a literal.
- `parseVerifyArguments` (`:22-53`): `if (plan !== '1' && plan !== '2' &&
  plan !== '5') throw new Error('Specify --plan 1, --plan 2 or --plan 5')`
  (`:49`), plus plan-specific iteration upper bounds (`:50-51`) and the
  ternary that builds `planNumber` (`:52`).
- Three call sites in `main()` key off `options.planNumber` with a repeated
  3-way ternary chain, not a switch: selecting `records` (`plan5Instances`/
  `plan2Instances`/`plan1Instances`, `:82`), building the report
  (`readReviewedPlan5()`/`readReviewedPlan2()`/`readReviewedPlan()` and
  `plan5Runtime`/`plan2Runtime`/`referenceRuntime`, `:89-91`), and selecting
  `workRoot` (`.reference-work` for plan 5 vs.
  `examples/collection-review/.reference-work` otherwise, same lines).
- `scripts/reference-harness/plan.ts` defines `readReviewedPlan`,
  `readReviewedPlan2`, `readReviewedPlan5` as three independent, structurally
  similar functions (Plan 1 at `:45-89`, Plan 2 at `:179-242`, Plan 5 at
  `:259-305`) — there is no shared generic loader to extend.
- `--iteration <n>` is a simple bounded-integer flag (`:40-43`,
  `/^(?:[1-9]|1[0-5])$/`), with plan-specific overrides (`:50-51`), threaded
  into `verifyInstances(...)` for per-plan filtering.

**For iteration 2:** `planNumber` is currently typed `2 | 5` (a number
literal union), so a `'2a'` designation cannot reuse that field as-is; it
needs either a widened/string-keyed variant or a parallel flag. Adding `2a`
support requires: widening the type at `verify.ts:16`, a fourth arm at each
of the four call sites listed above (`:49-52`, `:82`, `:89-91`), a new
`readReviewedPlan2a()` in `plan.ts` (no `plan2a-instances.ts`/`*Runtime`
exists yet — confirmed absent by search), and a `plan2aInstances`/
`plan2aRuntime` pair mirroring the Plan 2/5 precedent. None of this was
implemented in iteration 1 (out of this iteration's owner scope); this
section is the handoff.

## Declaration review (owners.md)

See [owners.md's revision](../owners.md#declaration-review) for the full
detail. Summary: all five previously proposed `expose-src` lines are
confirmed correct against the current `module.ramify` files at commit
`71643d5` and the format specification's tag-default/wildcard rules; no
correction was needed. Eight additional named-list relay additions (not
proposed before this iteration) were identified and specified exactly,
because `analysis`'s and the root's relays of `project`/`typescript`/
`model`/`daemon`-owned types are named lists, not wildcards, so a new type
does not automatically reach a sibling subtree the way it automatically
reaches a direct parent.

## Subcases reconciliation

Counted `docs/plans/iteration-2a-materialized-api-view/subcases.md`'s
"Required leaves" table programmatically
(`grep -oE '^\| I2A-[0-9]+:[a-zA-Z0-9-]+' subcases.md | sort -u | wc -l`):
**104**, with zero duplicate IDs, matching main-plan.md's and
iteration2.md's stated 104 exactly. No ID or count correction was necessary;
recorded as a verification note in
[subcases.md's revision](../subcases.md).

## Files changed

Plan 2A documents (all within `docs/plans/iteration-2a-materialized-api-view/`
and `docs/plans/done/` read-only references; no production owner touched):

- `main-plan.md` — "Verified starting point" and "Contract limits and probes"
  revision notes.
- `contracts.md` — frozen numeric-limits summary table plus inline
  frozen-value annotations in the TypeScript detail, renderer/publisher and
  root-service sections.
- `owners.md` — "Declaration review" section replaced with exact reviewed
  lines, verdicts and the eight cross-subtree relay additions.
- `scope.md` — "Generated-output isolation" section gained the precise
  three-form generated-name predicate.
- `subcases.md` — reconciliation/verification note.
- `iterations/iteration1-results.md` — this file.

Checked-in probes and fixtures (new):

- `scripts/probes/plan2a/scale-baseline.ts`
- `scripts/probes/plan2a/typescript-detail-feasibility.ts`
- `scripts/probes/plan2a/token-format.ts`
- `scripts/probes/fixtures/plan2a-symbol-details/tsconfig.json`,
  `src/originals.ts`, `src/forward.ts`
- `scripts/probes/results/plan2a/scale-baseline.json`,
  `typescript-detail-feasibility.json`, `token-format.json` (raw archived
  evidence, following the existing `scripts/probes/results/<probe>.json`
  convention via the shared `archive()` helper in `resident-probe.ts`, with
  a `plan2a/` subdirectory created once to hold this plan's three probes
  together — the pre-existing `fast-check/` subdirectory precedent keeps its
  own results flat in the shared `results/` directory, so this plan
  deliberately keeps its own three nested for discoverability; documented
  here as the chosen convention per the brief's "pick one, document it").

## Commands run

| Command | Result |
| --- | --- |
| `npx tsc -p tsconfig.scripts.json --noEmit` | Pass (0 errors), both before and after adding the three probes |
| `npx tsx scripts/probes/plan2a/scale-baseline.ts` | Pass, archived `scripts/probes/results/plan2a/scale-baseline.json` |
| `npx tsx scripts/probes/plan2a/typescript-detail-feasibility.ts` | Pass, archived `scripts/probes/results/plan2a/typescript-detail-feasibility.json` |
| `npx tsx scripts/probes/plan2a/token-format.ts` | Pass, archived `scripts/probes/results/plan2a/token-format.json` |
| `npm run type-check` | See below |
| Markdown link check over the plan directory | See below |

## Contract deviations

None required a semantic change from the proposed contracts; every deviation
below is a clarification or a previously-unstated addition, not a reversal:

1. `maxInvocationBytes` (`ApiViewQuery`, `ApiViewPublishLimits`) was implicit
   in main-plan.md's candidate list (which named only "per area" and "per
   invocation [staged]"). Frozen at the same 256 MiB as `maxStagedBytes`,
   recorded as a clarification in contracts.md's revision note.
2. The generated-name predicate's `.ramify-other` near-miss, left open in
   subcases.md's `I2A-02:transient-names-excluded` wording, is now fixed as
   ordinary (never reserved) in scope.md.
3. Eight `module.ramify` named-list relay additions (listed in owners.md)
   are new content, not present in the original owners.md draft, required
   because `analysis`'s and root's relays of foreign-owned types are named
   lists rather than wildcards.

## Remaining limits

- `maxAreaBytes`/`maxInvocationBytes`/`maxStagedBytes` have ample headroom on
  every real (R, T) and inventory-scale (S100/S500/S1000) fixture measured,
  but none of these fixtures stresses the bound *at* its boundary, because
  S100/S500/S1000 have zero exposures and R/T's real totals are far below
  the bound. Iterations 5 and 9 need purpose-built (`F`) fixtures with real
  exposures sized to approach 32 MiB/256 MiB for `I2A-05:projection-bound`
  and `I2A-12:limit-preservation`.
- Body-free class rendering has no confirmed API path; iteration 4 must
  design one (candidate: per-member signature printing) since no
  `ts.factory`-equivalent synthetic-node construction was found in
  `typescript/unstable/sync`.
- The disposable batch path's `AbortSignal` did not preempt the S1000 run
  before natural completion (90s guard, 100.67s actual); worth reviewing
  during iteration 5/9's deadline-bound design, not a Plan 2A regression.
- S1000's retained-session refusal (Plan 5, 96 MiB `maxRetainedFactBytes`)
  remains unresolved and unchanged; this iteration's disposable-batch S1000
  success does not touch or waive it.

## Required follow-up for other owners

None: this iteration touched only Plan 2A documents and checked-in probe
scripts, as scoped. The eight `module.ramify` relay additions in owners.md
are handoff content for iteration 8 (daemon service/CLI) and iteration 5
(projection), not edits this iteration was authorized to make.

## Handoff to iterations 2-4

- Frozen contracts: [contracts.md](../contracts.md).
- Reviewed declarations and relay paths: [owners.md](../owners.md).
- Fixed generated-name predicate: [scope.md](../scope.md#generated-output-isolation)
  (iteration 2).
- TypeScript feasibility findings, including the class-rendering gap and the
  UTF-8 truncation gap: [above](#typescript-symbol-detail-feasibility)
  (iteration 4).
- Real availability/duplication numbers for R and T:
  [above](#scale-baseline) (iterations 3, 5).
- Harness discriminator mechanics for adding `2a`:
  [above](#harness-referenceverify---plan-discriminator-for-iteration-2)
  (iteration 2).
- Raw probe JSON: `scripts/probes/results/plan2a/*.json`.
