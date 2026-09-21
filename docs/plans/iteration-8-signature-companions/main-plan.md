# Plan 8: Signature companions

**Date:** 2026-09-21. **Status:** implemented on 2026-09-21 on branch
`feat/plan8-signature-companions`, not merged to `main`; the user settled its
contract decisions RD-1 to RD-7 on 2026-09-21. The
[completion report](iterations/iteration5-results.md) records SC01 to SC27 and
three measured budgets it did not meet, SC23's X100 deleted row, SC24's
description stage and SC25's `factBytes`, with proposals for decision. This plan adds one enforced rule to the model: a module that
exposes a symbol must also make the project symbols named in that symbol's
declared signature type-available wherever the exposure makes the symbol
visible. Ramify reports the missing exposure; it never supplies it. The plan
follows [Plan 1](../done/iteration-1-project-verifier/main-plan.md) and
[Plan 5](../iteration-5-fast-incremental-checks/main-plan.md), both
implemented, and changes the model documents, which the user authorized on
2026-09-21.

## Decisions already made

The user decided these on 2026-09-21. They are inputs, not review items.

- **Error, not implicit exposure.** Exposing a symbol without a companion is
  a failing finding. Ramify adds no exposure on the owner's behalf, so
  `module.ramify` remains the complete statement of a module's contract.
- **Type-availability, not only reach.** A companion must be visible wherever
  the symbol is visible, and importable there by type.
- **Re-exposure is covered.** Every exposure step is verified, and the finding
  belongs to the first step that carries the symbol beyond its companion.
- **References counted:** parameter types, return types, type-parameter
  constraints and defaults, and the members and heritage of exposed
  interfaces and classes. External-package and library types are excluded.
- **No escape hatch.** There is no opt-out syntax, severity setting or
  per-symbol waiver.

## Runnable outcome

After this plan, in a project where `orders` declares
`expose-src placeOrder from "place-order.ts" to parent` and `placeOrder`'s
declared signature names the owned, unexposed type `Order`:

```text
$ ramify check
subs/orders/module.ramify:4:12 exposed-without-companion
  `placeOrder` is exposed to parent without `Order`, which its signature names
  (subs/orders/src/place-order.ts:7:38).
  Expose `Order` to parent, or remove it from the signature.
```

The check exits 1. `ramify check --changed subs/orders/src/place-order.ts`
reports the same finding as new after an edit that adds `Order` to the
signature, and reports it as removed after `Order` is exposed. Every import
decision of the project is still evaluated and reported in the same run.

## What exists

Verified against source on 2026-09-21, branch `ramify-agent` at `2395497`.
Recheck at iteration 1.

- The model rejects implicit exposure in writing:
  [module-description.principles.md](../../model/module-description.principles.md)
  says a wildcard does not expose "types merely referenced by a selected
  binding's signature", and [daemon.md](../../architecture/daemon.md) says
  "there is no automatic signature-type exposure". Plans 1 to 3 keep a
  hand-maintained "Foreign signature types" table for the same obligation.
  This plan enforces that obligation; it reverses nothing.
- The check path holds no signature information. `CatalogOriginal`
  (`subs/analysis/subs/typescript/src/interfaces/source.ts`) is
  `{ id, origin, declarations, hasValue, hasType }`. Type computation exists
  only in `symbol-details.ts`, `export-shapes.ts` and the behavior
  classifiers, which no check calls.
- `CatalogBuilder.export()` (`catalog.ts:605-654`) holds the resolved
  declaration nodes of each exported original when it records
  `declarations`. The source file is already fetched and cached, so a walk of
  those nodes costs no compiler round trip.
- Every checker call is a blocking cross-process round trip to the native
  compiler, about 0.14 to 0.23 ms each. `namespace-uses.ts:38` already uses
  the batched `checker.getSymbolAtLocation(nodes[])`, one round trip for any
  number of identifiers, after the retained-session analysis measured
  per-identifier queries at 8 to 18 ms per file.
- `Model` is three flat arrays. No per-module visible set or per-symbol reach
  set is retained. The per-module to-parent sets are computed twice per link,
  in `link.ts:73` and `model.ts:191-207`, and discarded. `visibilityFor`
  (`decisions.ts:53-98`) searches exposure paths per query with no memo.
- Every `Exposure` retains its statement's `SourceLocation` as `evidence`, and
  every `ExpandedSelection` its `statement`. A finding can be anchored at an
  exposure statement without new plumbing.
- A `LinkIssue` sets the revision's execution to `invalid` and skips the
  access and decide stages (`session-facts.ts:254-257`). A companion finding
  must therefore not be a link issue.
- `surface()` (`descriptions.ts:59-78`) compares a file's export description
  by value with positions stripped, and feeds `delta.changed`.
  `originalSurface()` (`session-revision.ts:263-264`) is an explicit field
  allowlist.
- `ramify check --changed` returns the whole revision's findings, each marked
  `new` against the baseline (`context-manager.ts:393-397`). A finding
  anchored in `module.ramify` and caused by a source edit needs no attribution
  to the changed path.
- Retained facts: reference example 1.25 MiB, S100 7.98 MiB, toolkit
  18.9 MiB, against `maxRetainedFactBytes` of 96 MiB summed over up to eight
  retained versions. S1000 is already refused at 159.5 MiB.
- **The synthetic fixtures declare no exposure.** `synthetic-owners.ts`
  writes a header-only `module.ramify`, so S100 and S1000 would exercise the
  collection of companion facts and none of the rule.
- Hook medians after the structural-edit plan: 14 of 14 rows within 2 s, with
  the S100 configuration row at 1,843 ms.

## The rule

A **signature companion** of an original symbol `S` is a project-owned
original `T`, other than `S`, that `S`'s declared signature names.

For every effective exposure step, module `M` exposing `S` through channel
`c`, and every companion `T` of `S`:

1. **Visibility.** `T` must be visible in every module that the step makes
   `S` visible in: `M`'s parent for `to parent`, every proper descendant of
   `M` for `to descendants`.
2. **Tags.** Every required-importer tag of `T` must be a tag of `S`.

Together these make `T` type-available to every source area that may import
`S` through that step. The two tag kinds act in opposite directions, and the
rule states both:

- A required-importer tag restricts. `T` must not be more restricted than
  `S`, which is condition 2.
- A required-symbol tag adds availability, and only to value imports. A
  type-only import is exempt from it, so required-symbol tags are not
  compared in either direction.

A companion that a caller must use as a value is the known consequence: a
`browser` function whose parameter is an enum without `browser` passes this
rule, and a browser importer's value import of the enum is then denied by the
existing import rule, which names the missing tag. The finding appears at the
importer, not at the owner's exposure statement.

Testing-origin companions need no separate clause: a binding defined in
testing source carries `testing`, and condition 2 then requires `S` to carry
it.

The rule is one level deep. `T` is thereby exposed, so the same rule applies
to `T`'s own signature; transitive coverage follows by induction and the
engine computes no closure.

**Reporting site.** Condition 1 is reported at step `(M, c)` only when `T` is
visible in `M`. When it is not, an earlier step delivered `S` to `M` without
`T` and carries the finding; `T` is always visible in `S`'s owner, whose
source names it. One missing exposure therefore yields one finding, not one
per hop above it. Condition 2 does not depend on the step; it is reported
once per `(S, T)` at each of the owner's exposure statements of `S`.

**A violation leaves the model valid.** The exposure stays effective and
import decisions are unchanged. The finding fails the check, as a denied
import does.

### What a declared signature names

Harvested from the declarations of the original, syntactically, with
identifiers resolved to their original bindings through forwarding aliases:

| Original | Positions harvested |
| --- | --- |
| Function, including every overload | Type parameters' constraints and defaults, parameter types, return type |
| Class | Type parameters, `extends` and `implements` clauses, constructor parameters including those declared as `private` parameter properties, and the declared types of every public or protected member: properties, methods, a getter's return type and a setter's parameter type. `private` and `#`-named members are not entered |
| Interface, including merged declarations | Type parameters, `extends`, every member |
| Type alias | Type parameters and the aliased type |
| Variable or constant | Its type annotation; when absent, the type parameters' constraints and defaults, parameter types and return type of a directly assigned arrow function or function expression |
| Enum, namespace, resource binding | None |

An explicit variable or property type annotation defines its contract. When
it is absent, a directly assigned arrow function or function expression
supplies the syntactic signature instead; parentheses around that initializer
are ignored. This also applies to public and protected class properties.
Only the callable's signature is harvested: its body and parameter default
expressions are not entered. Other initializers are not followed, including
calls, identifier aliases and object literals. With an explicit variable or
property annotation, the initializer is not harvested.

Type references, `typeof` queries, `import("…").T` types and qualified names
all count. A reference resolving to an external package, a library file, a
type parameter or `S` itself is not a companion.

A position with no annotation where TypeScript would infer a type, such as a
function without a return type or a constant initialized from a call,
sets the original's `inferred` fact. A reference that does not resolve to one
original, or resolves to a project file outside every module, is counted in
`unresolved`. Both facts are recorded for every exported original. The
nonblocking coverage notes `signature-inferred` and `signature-unresolved` are
reported once per original, and only for an original with an effective
exposure, since an unexposed symbol's signature is no contract. Neither is
ever reported as satisfied. Inferred types are not computed: that needs
type-level checker work the check path excludes, and the explicit annotation
is the owner's statement of its contract.

A fully annotated arrow function or function expression does not set
`inferred` merely because the enclosing variable or property has no type
annotation. A missing parameter or return annotation on that callable does
set it; all explicit annotations are still harvested and enforced. For
example, `export const placeOrder = (order: Order): void => {}` requires
`Order` wherever `placeOrder` is exposed, just as a function declaration does.

## Contract decisions

The user settled each of these on 2026-09-21, one at a time, with the
alternatives stated. They are inputs to implementation.

1. **RD-1: the finding is a decide-stage diagnostic on a valid model**, code
   `exposed-without-companion`, category `exposure`, located at the exposure
   statement, with the naming position in the signature as related location.
   Its message names the reason, `not-visible` or `requires-tag`, and the
   statement to write. Rejected: an invalid description, which would suppress
   every import decision of the project on the first violation.
2. **RD-2: companion facts are recorded for every exported original, exposed
   or not.** A `module.ramify` edit then needs no compiler work, which keeps
   the `description` path compiler-free. The two coverage notes are reported
   only for exposed originals. Rejected: facts for exposed originals only.
3. **RD-3: the tag condition is the subset test on required-importer tags,
   independent of which source areas exist in reach; required-symbol tags are
   not compared.** It can reject a project whose current importers all happen
   to carry the extra tag; the verdict is stable when a module is added, and
   is decided per `(S, T)` without visiting importers. Rejected: testing the
   actual importers; comparing required-symbol tags in the reverse direction
   for enum companions, or for every companion with a value binding.
4. **RD-4: public and protected members count; `private` and `#` members do
   not.** A constructor parameter declared as a `private` parameter property
   counts, because callers must satisfy the constructor. Accessors count as
   properties do.
5. **RD-5: facts live on the original, as `companions` of `CatalogOriginal`
   and `Original`**, because forwarding aliases share one signature.
   `originalSurface()` gains the compared fields explicitly, and the compared
   part carries no position. SC27 verifies that an entry is recomputed when
   another file changes which original a named identifier resolves to.
6. **RD-6: enforcement is delivered with the toolkit and the reference
   example already conforming.** Iteration 4 remediates both. `ramify-agent/`
   and other consumers see new findings when they adopt the build; that is
   the intended effect and is recorded in the handoff, not remediated here.
   Rejected: a report-only first delivery, which is a severity setting. The
   branch fails `check:self` between iterations 3 and 4 and is not merged
   there.
7. **RD-7: no closure, no reverse index, no cross-revision verdict cache.**
   The full pass is measured against SC24's budget, and the reverse index is
   proposed, not built, only if that budget is exceeded. SC23 to SC25's
   numeric budgets are accepted as written.

## Retained dependency information: evaluation

The user asked whether dependency information constructed ahead of a check
and kept in memory would make these checks faster. Three structures were
considered against the measured cost structure.

| Structure | Verdict | Reason |
| --- | --- | --- |
| Per-original companion facts, retained in `SessionFacts` | **Adopt** | They are the rule's input, and the only part that needs the compiler. Retained, a body edit recomputes one file's facts in a walk of an already cached AST plus one batched symbol query; a `module.ramify` edit recomputes none. Without retention, every check would re-walk every exposing file. |
| Exposure index: per module, the sets of originals exposed to parent and to descendants, plus per original the modules that receive it from a child | **Adopt, derived per model, not retained across revisions** | Both link and model building already compute the to-parent sets and discard them. Kept beside the existing `WeakMap<Model, DecisionIndex>`, a visibility test becomes a walk of the importer's ancestors with set lookups, not a path search. The rule needs about one test per exposure step and companion: a few thousand on the toolkit. The index is derived for each replacement model, including one produced by a position patch without relinking, so it has no invalidation of its own and is not counted in `factBytes`. |
| Reverse index from a companion to the symbols naming it, and a cross-revision cache of companion verdicts | **Reject for now** | Link and model are whole-project work on every path that relinks, at 87 to 98 ms on S100. A full companion pass over an indexed model is expected in low single-digit milliseconds. Incremental bookkeeping would save less than it costs to keep correct across six revision paths, and the roadmap admits a cache only after a measurement shows the need. SC24 measures the pass; the structure is reconsidered only if it exceeds its budget. |

Two consequences shape the contract:

- **Per-symbol reach sets are not expanded.** One exposure to descendants at
  the root of S1000 would put a thousand modules in the set of every such
  original. The index stores exposure by exposing module; "visible in every
  proper descendant of `M`" is first answered by `M`'s and its ancestors'
  to-descendants sets, and falls back to visiting descendants only when that
  fails.
- **Memory.** Companion facts are lists of original keys. Estimated at three
  references of about 150 bytes for each of the toolkit's roughly 1,000
  exported originals, they add about 0.5 MiB to 18.9 MiB, and history
  multiplies that by up to eight. SC25 bounds the growth at 5 percent.
  Rendered signature text is never retained.

Companion facts make a file `changed`, not `moved`, when the set of named
originals changes, which sends that edit down the `source` path with its
importer re-interpretation. Such edits are rarer than body edits, and SC23
measures the row. Skipping importer re-interpretation for a change confined
to companion facts is a possible later optimization and is not planned.

`visibilityFor` and `listAvailableOriginals` could use the same index. This
plan does not change them; the index and its measured effect are handed to
the inspection successor and Plan 7.

## Contract

### Facts

```ts
// subs/analysis/subs/model/src/interfaces/model.ts
export interface SignatureCompanions {
  readonly named: readonly OriginalId[];          // distinct, in originalKey byte order
  readonly evidence: readonly SourceLocation[];   // first naming position per entry of `named`
  readonly inferred: boolean;                     // some harvested position has no annotation
  readonly unresolved: number;                    // references with no single project original
}
export interface Original {
  // existing fields
  readonly companions: SignatureCompanions;
}
```

`typescript`'s `CatalogOriginal` gains the same field; it already takes
`OriginalId` and `SourceLocation` from `model`'s interface file.

`named`, `inferred` and `unresolved` are part of the description surface and
of `originalSurface()`. `evidence` is positional: it is stripped from both
surfaces exactly as `declarations` are, and refreshed by the `moved` path.
Position refresh also regenerates the findings and coverage notes that cite
the original; updating retained facts alone does not refresh those outputs.
Collection gathers every candidate identifier of a file's exported
declarations and resolves them with one batched `getSymbolAtLocation` call
per file.

### Rule

```ts
// subs/analysis/subs/model/src/interfaces/model.ts
export type CompanionReason = 'not-visible' | 'requires-tag';
export interface CompanionViolation {
  readonly module: ModuleId;
  readonly original: OriginalId;
  readonly companion: OriginalId;
  readonly destination: 'parent' | 'descendants';
  readonly reason: CompanionReason;
  readonly tags: readonly TagName[];              // missing from the symbol; empty for not-visible
  readonly statement: SourceLocation;             // the exposure's evidence
}
export function listCompanionViolations(model: Model): readonly CompanionViolation[];
```

`model` owns the rule and the exposure index; it sees plain data only. Tag
comparison reads each definition's kind from the resolved registry and never
a tag's name. Results are ordered by statement location, then original key,
then companion key.

### Finding

`AnalysisCode` gains `exposed-without-companion`; the diagnostic category
union gains `exposure`. `analysis` evaluates the rule in the decide stage of
every revision path that relinks, replaces or patches the model, or whose
`delta.changed` or `delta.moved` is not empty, and in the batch engine.
On a position-only edit, patch the model's declaration and companion
evidence first, then rerun the pass and regenerate its diagnostics and
coverage notes from the current facts. This needs no extra compiler work or
relink. Reuse previous outputs only when both their semantic inputs and
their positional evidence are unchanged. Locations, related locations,
messages and IDs must equal a fresh batch check; IDs follow the existing
diagnostic identity rules and need not remain unchanged when evidence moves.
The CLI needs no change beyond its finding line; SC19
pins the text and JSON forms. Coverage notes `signature-inferred` and
`signature-unresolved` join the existing note codes and stay nonblocking;
`analysis` reports them in the same stage, from the retained facts, for
originals with an effective exposure.

### Documents changed

- [Importability principles](../../model/cross-module-importability.principles.md):
  one section, "Exposure Requires Available Signature Companions", after
  "Type-Only Imports Retain Coupling Restrictions".
- [Glossary](../../model/glossary.md): "Signature companion".
- [Module description principles](../../model/module-description.principles.md):
  the wildcard paragraph keeps its statement and names the rule; the
  validation section gains a third table, conditions that leave the
  description valid and fail a check.
- [Source interpretation principles](../../model/typescript-source-interpretation.principles.md):
  one section stating what a declared signature names and the two analysis
  limits.
- [daemon.md](../../architecture/daemon.md): the companion facts and exposure
  index under the retained session; "there is no automatic signature-type
  exposure" stays.
- `CLAUDE.md` and the site's teaching page for exposure, in iteration 4.

## Exposure

`SignatureCompanions`, `CompanionViolation` and `CompanionReason` join
`model`'s `interfaces/model.ts`, which its wildcard already exposes to its
parent, and `listCompanionViolations` gains a named exposure tagged
`browser`. `typescript` and `analysis` receive them as they receive
`OriginalId` today. The
toolkit is the first project the rule verifies: `npm run check:self` must
pass with every companion of these new names exposed.

## Iterations

| Iteration | Delivers | Owner | Prerequisite |
| ---: | --- | --- | --- |
| [1](iterations/iteration1.md) | Model documents; exposure index and `listCompanionViolations` over plain data | documents, `model` | none |
| [2](iterations/iteration2.md) | Companion facts from declared signatures; surfaces; batch wire; coverage notes | `typescript` | 1 |
| [3](iterations/iteration3.md) | Facts through link into the model; decide-stage finding on every revision path and in batch; CLI forms | `descriptions`, `analysis`, `cli` | 2 |
| [4](iterations/iteration4.md) | Toolkit and reference example conform; site page, `CLAUDE.md`, `daemon.md` | all toolkit owners, example, site | 3 |
| [5](iterations/iteration5.md) | Exposing synthetic fixture; latency, memory and hook evidence; completion report; roadmap | evidence | 4 |

## Acceptance

| ID | Iteration | Case |
| --- | ---: | --- |
| SC01 | 1 | An owned symbol exposed to parent whose companion is owned and unexposed yields one `not-visible` violation at that statement; exposing the companion to parent removes it. |
| SC02 | 1 | Exposed to descendants: a companion exposed to descendants by the module or by an ancestor satisfies the step. A companion owned by one child and exposed only to parent does not, and the violation names `descendants`. |
| SC03 | 1 | Re-exposure: a parent re-exposing a received symbol without its received companion yields the violation at the parent's statement and none at the child's. |
| SC04 | 1 | One missing exposure at the owner yields exactly one violation although two ancestors re-expose the symbol. |
| SC05 | 1 | A wildcard `expose-sub *` step that carries the symbol and its companion together passes; a named selection omitting the companion fails at that statement. |
| SC06 | 1 | A companion visible at the destination by another path passes: owned by the destination, exposed by a sibling child to the same parent, or received from an ancestor. |
| SC07 | 1 | Tags: a `[ui]` companion of an untagged symbol yields `requires-tag` naming `ui` at each owner statement of the symbol; tagging the symbol `ui` removes it. A `browser` companion of an untagged symbol passes. |
| SC08 | 1 | The tag condition depends on kind, never on name: a fixture registry with a renamed required-importer tag and an added required-symbol tag gives the same verdicts. |
| SC09 | 1 | A companion defined in `src/tests/` fails `requires-tag` for a symbol without `testing` and passes for one carrying it. |
| SC10 | 1 | An ineffective exposure, a to-parent exposure at the root and an unexposed symbol yield no violation. A violation never changes any `explainImport` result. |
| SC11 | 2 | Each row of the harvesting table yields exactly its named originals on a fixture file, including overloads, merged interfaces, `typeof`, `import()` types and qualified names, resolved through a forwarding alias to the original. Equivalent function declarations, directly assigned arrows and function expressions (including parenthesized initializers and public/protected callable properties) yield the same named originals from parameter/return types and type-parameter constraints/defaults. An explicit variable/property annotation is authoritative; initializer-only, body-only and parameter-default-only references add no companions. |
| SC12 | 2 | External, library, type-parameter and self references yield no companion. `private` and `#` members yield none; protected members, accessors and a `private` constructor parameter property's type do. |
| SC13 | 2 | A missing return annotation, a constant initialized from a call without an annotation and an unannotated non-callable class property each set `inferred`; an unresolvable reference and a reference to a file outside every module increment `unresolved`. Fully annotated arrow/function-expression signatures do not set `inferred` for an absent enclosing variable/property annotation. Missing parameter or return annotations set it while preserving companions from explicit annotations. Both facts are recorded for unexposed exported originals too. |
| SC14 | 2 | A witness counts compiler requests: collecting companions adds at most one symbol request per described file and no type-level request, including the arrow/function-expression cases. |
| SC15 | 2 | Surfaces: an edit that only moves declarations is `moved` and refreshes `evidence`; an edit that adds a named original without moving any position is `changed`. Retained and batch descriptions are equal by value. |
| SC27 | 2 | A file declares a function whose parameter type is imported through a barrel. Editing only the barrel so that the name forwards a different original recomputes the function's `named` entry in the retained session, equal to a fresh batch description, although the declaring file was not edited. |
| SC16 | 3 | The runnable outcome: the finding's code, category, location, related location and message on the reference-style fixture, in batch and in the retained session, with equal diagnostics. Repeat with an explicitly typed arrow and function expression lacking an enclosing variable annotation: each fails for the unexposed companion and passes after its exposure, without a spurious inference note. A partially annotated callable still fails for an explicit missing companion while reporting its inference note. |
| SC17 | 3 | With one companion violation present, every access is still decided and an unrelated denied import is reported in the same run; the execution is not `invalid`. |
| SC18 | 3 | Revision paths: a signature edit adds the finding on the `source` path; a `module.ramify` edit removes it on the `description` path with zero compiler work; a body edit that leaves signature evidence unchanged preserves diagnostic identity on the `unchanged-surface` path. Inserting a blank line before a violating signature, or moving only its naming position within the declaration, is `moved` and refreshes diagnostics and coverage notes without relinking or extra compiler requests for the companion pass. Compare complete diagnostic and coverage records, including locations, messages and IDs, with a fresh batch check. Membership and broad paths also agree with batch. |
| SC19 | 3 | `ramify check --changed <source file>` marks the finding `new` after the causing edit and lists it under `removed` after the fix; text and JSON forms are pinned; exit codes are 1 and 0. A position-only edit while the violation remains refreshes the displayed signature location in text and JSON and still exits 1; delta identity follows the existing diagnostic rules. |
| SC20 | 3 | The two coverage notes appear in the check's coverage once per original with an effective exposure, never for an unexposed original, never as findings, and never influence the exit code. Exposing an original whose `inferred` fact is set adds its note on the `description` path with zero compiler work. Position-only edits to exposed originals with inferred or unresolved signatures refresh their notes to equal batch, without duplicates or stale evidence. |
| SC21 | 4 | `npm run check:self` and the reference example's check pass with the rule enforced; the results record every exposure statement and signature changed, and no rule, fixture expectation or severity was relaxed to pass. |
| SC22 | 4 | The model documents, `daemon.md`, `CLAUDE.md` and the site page state the delivered rule and follow the writing conventions. |
| SC23 | 5 | On the exposing synthetic fixture at 100 owners, all 14 hook rows stay within the 2 s median, and the configuration row grows by at most 60 ms over its pre-plan value on the same host. |
| SC24 | 5 | The companion pass, measured as its own stage timing, takes at most 5 ms on the reference example and 20 ms on the exposing fixture and on the toolkit; the description stage grows by at most 15 percent on each. |
| SC25 | 5 | `factBytes` grows by at most 5 percent on the reference example, the toolkit and the exposing fixture. The repeated-edit plateau and many-contexts rows of Plan 5 still hold. |
| SC26 | 5 | Plan 1's reference gate, Plan 5's and the structural-edit plan's focused suites pass on the same build. |

SC01 to SC10 build models from plain data. SC11 to SC15 and SC27 run the real
compiler on fixture files. SC16 to SC18 run the retained session and the batch engine
through their direct adapters; SC19 and SC23 use the installed executable
against a real daemon. The user accepted the numeric budgets in SC23 to SC25 on
2026-09-21.

## Completion gate

All cases have evidence. The toolkit and the reference example pass with the
rule enforced. The completion report records SC01 to SC27, the measured
timings and bytes beside their pre-plan values, the disposition of RD-1 to
RD-7, and the count of `signature-inferred` notes on the toolkit. The roadmap's
Plan 8 row and brief are advanced to implemented.

## Handoff

- To the inspection successor and Plan 7: the exposure index and its measured
  lookup cost, as a candidate replacement for `visibilityFor`'s path search
  and `listAvailableOriginals`'s enumeration.
- To Plan 2A's view: companion facts identify, per rendered signature, the
  named originals a consumer can import; the view is unchanged here.
- To `ramify-agent` and other consumers: the new finding code, its message
  form and the two coverage notes.
- The `signature-inferred` count, as evidence for or against a later
  checker-backed treatment of inferred signatures.

## Out of scope

Implicit exposure in any form; an opt-out, waiver or severity setting;
computing inferred types; function bodies and runtime dependencies; changing
`visibilityFor`, availability enumeration or any import decision; a fix
command that edits `module.ramify`; changes to either materialized view;
remediation of `ramify-agent/` or any project other than the toolkit and the
reference example; S500, S1000 and macOS measurements.
