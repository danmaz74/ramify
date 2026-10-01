# Plan 2E: Self-sufficient diagnostics

**Status:** draft, awaiting contract review. Nothing here is implemented.

Every error, warning, analysis limit and not-checked reply of `ramify check`
states, in its own text, what was done, where, which rule it fails and what
the project already declares about it. A consumer relays that text verbatim.
No consumer keeps a table that turns a code into a sentence.

## Why

The intended reader of a diagnostic is an agent that has just made an edit
and reads the hook's reply inside a tool result. It has no second chance to
ask what a code means. Today it receives this, and nothing else:

```text
Error [new] [not-visible] subs/workspace/subs/reviews/src/mcp.ts:12:3: collection-review:interfaces/protocol.ts#ToolResult: not-visible
```

The text is a key. The facts that explain it exist, in `importer`,
`original` and an unlabelled `related` list, and the hook's human form drops
all three. A real engineer session given this reply kept the violating import
until the gate failed. The consuming harness then rebuilt a sentence per code
from the structured fields. That table is the defect this plan removes: it
duplicates the model's vocabulary outside the model, and every new code
reaches the agent as a bare key until someone extends the table.

`ramify explain` remains the place for questions asked on demand
([inspection successor](../iteration-3-inspection-successor/main-plan.md)).
This plan concerns only what `ramify check` says unasked, about a violation
it has already found.

## Runnable outcome

An agent edits a file, the hook runs `ramify check --changed <file>`, and the
reply reads:

```text
Error [new] [not-visible] subs/workspace/subs/reviews/src/mcp.ts:12:3:
  This file imports `ToolResult` from `src/interfaces/protocol.ts`. Module `collection-review` owns `ToolResult` and does not expose it to module `collection-review/workspace/reviews`, so the import is denied. A type-only import needs the same exposure.
  Importer: collection-review/workspace/reviews (ordinary source; tags: dispatch)
  Original: `ToolResult`, declared at src/interfaces/protocol.ts:64:1, owned by collection-review
  Exposures of the original: none
  The importer receives from that file: InvocationContext, McpToolContribution, ProtocolFacilities, ToolInvocation
  Proposed declaration (not an existing permission): add `ToolResult` to the `expose-src` statement at module.ramify:9, which exposes that file to descendants
```

The JSON document carries the same content in fields, and the consumer needs
no knowledge of `not-visible` to relay it.

The completion boundary is finite: every code in the four diagnostic
envelopes has a catalogue entry, a constructed message that satisfies the
contract below, and a pinned example.

## What exists

Verified in source on 2026-09-21. Paths are relative to the toolkit root.

- **Four envelopes.** `AnalysisDiagnostic`
  (`subs/analysis/src/interfaces/analysis.ts:58-71`) for errors;
  `OutsideSourceWarning`
  (`subs/analysis/subs/project/src/interfaces/project.ts:60-65`), which has no
  `message` and no `location`; `SourceLimit`
  (`subs/analysis/subs/typescript/src/interfaces/source.ts:89-100`), which has
  no `importer` and no `original`; and `CheckDocument.reason`
  (`subs/cli/src/interfaces/cli.ts:43`), a bare enum.
- **Import denials have one template for four codes**, at
  `subs/analysis/src/evaluate-accesses.ts:57-63`:
  `owner:file#binding: reason (tags) via blockers`. The model's
  `explainImport` returns structured evidence and no prose
  (`subs/analysis/subs/model/src/decisions.ts:145-158`).
- **`related` is a flat, unlabelled location list.** For `not-visible` it
  mixes the original's declaration, tag evidence, exposure hops, ineffective
  exposures and every exposure of the original.
- **Five layout codes share one message**, `Invalid module boundary: <code>`
  (`subs/analysis/subs/project/src/inventory.ts:96`,
  `resolve-root.ts:107`).
- **The only warning has no text.** `formatHuman` invents its sentence
  (`subs/cli/src/format.ts:65`).
- **The hook form is the least informative.** `formatChangedHuman`
  (`subs/cli/src/format.ts:8-17`) prints code, location and `message`, and
  drops `Importer:`, `Original:` and `Related:`. A not-checked reply keeps the
  reason enum and discards the daemon's `Unavailable.message`
  (`subs/cli/src/changed-command.ts:45-54`), which is informative, for example
  `The revision captured no input for <file>`.
- **The message is an input to finding identity.** `validation:`,
  `inventory:` and `source-diagnostic/1:` ids hash the message
  (`subs/analysis/src/report-data.ts:9-11`, `inventory.ts:15-17`,
  `evaluate-accesses.ts:34-37`), as do the coverage ids
  (`subs/analysis/subs/typescript/src/catalog.ts:198`, `accesses.ts:166-167`).
  The daemon's `new` and `removed` marks compare those ids
  (`subs/daemon/subs/contexts/src/context-manager.ts:396`).
- **Nothing declares `message` stable**, and no test pins a denial's text.
  About fifteen to twenty assertions check a substring or a prefix, mostly in
  `scripts/reference-harness/`.
- **Nine owners construct messages**: `analysis`, `analysis/model`,
  `analysis/descriptions`, `analysis/project`, `analysis/typescript`, `cli`,
  `daemon`, `daemon/contexts` and the root. About 250 literal sites.
- **Unreachable codes:** `invalid-layout` and `compiled-source` are declared
  and never constructed; `invalid-encoding` exists only inside a
  pre-formatted `ProjectIssue` string.
- **Existing obligations this plan fulfils rather than adds:**
  `docs/architecture/daemon.md:711-715` already requires "location,
  importer/area, original owner and binding/resource, source-origin evidence,
  relevant exposure declarations and the failed rule";
  `docs/model/typescript-source-interpretation.spec.md:420-443`
  requires a denial to "identify the source/resource or symbol and rule" and
  an unverifiable construct to say "what could not be established";
  `docs/model/module-description.spec.md:897-899` requires the
  description file, location and failed reference or rule.

## Decisions for contract review

| ID | Decision | Recommendation |
| --- | --- | --- |
| RD-1 | Does a check finding carry a **proposed declaration**? The model documents say a proposal is never a permission, and the inspection successor keeps proposal text out of generated files for that reason. | Yes, for the denial and exposure codes where exactly one declaration change on an existing statement would satisfy the rule, in a separate `proposal` field and under the fixed label `Proposed declaration (not an existing permission)`. A finding is read once, at the moment of the violation, and is not a generated file that persists. Where more than one change is needed, the field is `null` and `details` states which hops are missing. |
| RD-2 | **Finding identity** without the message. | Hash a canonical structured key per family: code, location, importer area, original identity, unsatisfied tags, blocking origins, and for description and layout issues the statement span and the named token. It discriminates exactly what today's message does. One upgrade makes every retained finding `new` once; retained state does not outlive a daemon version, so no migration is written. |
| RD-3 | **Schema versioning.** The changes add fields and change text. | Keep `ramify.analysis/1` and `ramify.check/1`: every addition is a new optional-free field with a defined empty value (`details: []`, `proposal: null`, `related[].role`), and `message` was never declared stable. State both facts in the CLI invocation contract. |
| RD-4 | **How wording is pinned.** | One catalogue, `docs/architecture/diagnostic-messages.spec.md`, lists every code with its template and one full example. Each owner has a catalogue test that constructs the example and compares the complete text. A script fails when a code of any union has no catalogue entry. Rewording is then a reviewed diff in one document and one test. |
| RD-5 | **Unreachable codes.** | Remove `invalid-layout` and `compiled-source` from their unions, and construct `invalid-encoding` as a real `DescriptionIssue`. A code nothing produces cannot have a verified message. |
| RD-6 | **The companion-exposure error** decided on 2026-09-21 (a symbol exposed without the named types its signature mentions). | Out of scope here; it is a model change with its own plan. It is this contract's first new consumer: its plan cites this contract and adds a catalogue entry. |

## Contract

### What every diagnostic message must do

The rules are normative and live in the new
`docs/architecture/diagnostic-messages.spec.md`.

1. **Self-sufficient.** The message states the act, the place in words where
   the location alone does not explain it, the rule that fails, and the
   declared fact that makes it fail. A reader who knows Ramify's model and
   has never seen the code can act on it.
2. **The model's vocabulary only.** A module exposes a symbol to its parent
   or to its descendants, and the other side receives it. Tags are named with
   their kind. The message never names a consumer's workflow, role or tool.
3. **Names, not keys.** A module is named by its declared path, a file by its
   project-relative path, a symbol in backticks. The internal
   `owner:file#binding` form never appears in text.
4. **Fact before consequence.** First what is, then what follows: "does not
   expose it to …, so the import is denied".
5. **A limit is never worded as a denial.** An analysis limit says what could
   not be established and that the construct was not verified.
6. **Not-checked says what was not verified and why**, and that it is not a
   pass.
7. **Bounded.** `message` is at most 400 characters and one paragraph. Lists
   belong in `details`, each line at most 300 characters, at most 8 lines,
   a name list cut at 20 names with the remaining count stated.
8. **Deterministic.** The same revision produces the same bytes. Lists are
   sorted.
9. **No proposal in `message` or `details`.** A proposal appears only in
   `proposal`, under its fixed label.

### Envelope changes

```ts
// AnalysisDiagnostic, additions
readonly details: readonly string[];          // labelled lines, [] when none
readonly proposal: string | null;             // RD-1
readonly related: readonly RelatedLocation[]; // was SourceLocation[]

interface RelatedLocation extends SourceLocation {
  readonly role:
    | 'original-declaration' | 'exposure' | 'ineffective-exposure'
    | 'tag-evidence' | 'blocking-origin' | 'statement' | 'coverage-note';
}

// OutsideSourceWarning, additions
readonly message: string;

// SourceLimit, additions
readonly details: readonly string[];

// CheckDocument, additions
readonly reasonMessage: string | null; // the provider's explanation of `reason`
```

`ramify.cli/1` invocation failures keep `{ category, code, message }`; their
messages follow the same rules.

### Rendering

Both human forms print the same block per finding, and the hook form no
longer drops lines: the header, the `message`, then `Importer:`, `Original:`,
each `details` line, each `related` location with its role, and the
`proposal` under its label. A not-checked reply prints
`Not checked (<reason>): <reasonMessage>` followed by a fixed sentence that
nothing was verified. The reference harness's renderer
(`scripts/reference-harness/report.ts`) prints the same block.

### The denial family

| Code | Message states | `details` |
| --- | --- | --- |
| `not-visible` | importer file, symbol, provider file, owning module, that the owner does not expose it to the importing module, that a type-only import needs the same exposure | exposures of the original with their destinations and why each does not reach the importer, or `none`; what the importer receives from that file |
| `required-importer-tag` | the same identification; the tag the symbol carries, that it is a required-importer tag, the importing area's own tags, that a type-only import needs it too | where the tag is assigned |
| `required-symbol-tag` | the importing area's tag, that it is a required-symbol tag, that the symbol lacks it, that a type-only import is not restricted by this rule | where the importing area gets the tag |
| `testing-origin` | that ordinary source reaches testing source, through which files, and that this holds for same-owner and type-only imports | the blocking origins in order |
| `missing-export` | the file or child, the name, whether the description is complete or not established; the two producers use one wording | the exported names nearest to the requested one, at most five |

The remaining families (description syntax, exposure linking, registry and
model, layout and acquisition, the warning, analysis limits, not-checked and
service failures) are specified per code in the catalogue, written in
iteration 1 and filled by each owner's iteration.

### Specifications changed

- New: `docs/architecture/diagnostic-messages.spec.md`.
- `docs/architecture/cli-invocation.spec.md`: the output section states that
  `message` text is not a stable interface and that consumers relay it; the
  hook form's block; `reasonMessage`.
- `docs/architecture/daemon.md`: the compact reply lists the new fields.
- No principles document changes. The model's rules are unchanged; this plan
  makes the tooling meet obligations they already state.

## Exposure

`RelatedLocation` is a new exported type of `analysis`'s interface file and
is exposed wherever `AnalysisDiagnostic` already is, to the same
destinations. Each iteration that touches an interface lists the foreign
signature types its consumers must import.

## Iterations

| # | Owner or capability | Result |
| --- | --- | --- |
| 1 | Contract, catalogue and identity (`analysis` interfaces, the spec) | The spec and the complete catalogue skeleton; the envelope fields with empty values; structured finding identity; the baseline of today's texts; the completeness script |
| 2 | Import denials and `missing-export` (`analysis`, with evidence from `analysis/model`) | The denial family: messages, `details`, labelled `related`, `proposal` |
| 3 | Descriptions (`analysis/descriptions`) | Parse and exposure-linking messages; `invalid-encoding` as a real issue |
| 4 | Project (`analysis/project`) | Layout and acquisition messages; the warning's `message`; `invalid-layout` removed |
| 5 | Model and registry (`analysis/model`) | Registry, tree, original and ungrounded-exposure messages |
| 6 | Analysis limits (`analysis/typescript`) | Every coverage note says what was not established and that it was not verified; `compiled-source` removed |
| 7 | CLI, daemon and completion (`cli`, `daemon`, `daemon/contexts`, root) | Both human forms, `reasonMessage`, service and invocation messages, the harness renderer, acceptance and the completion report |

Iterations 3 to 6 are independent of each other once 1 has landed; 2 depends
on 1; 7 depends on all.

## Acceptance

| ID | Instance | Evidence |
| --- | --- | --- |
| DM-01 | Every code of `AnalysisCode`, `SourceLimit['code']`, the warning code, every not-checked reason and every `CliFailureCode` has a catalogue entry | the completeness script fails on a missing entry and passes |
| DM-02 | Each catalogue example is produced byte for byte by the owner's code | one catalogue test per owner |
| DM-03 | No message contains the `owner:file#binding` form or a bare code as its whole text | a scan over every catalogue example and over the reference project's full report |
| DM-04 | The reference project's intentional denials print the block of the runnable outcome in both human forms | reference-harness cases for the four denial codes and `missing-export` |
| DM-05 | `related[].role` is set on every related location, and `proposal` is present only where one statement change satisfies the rule | unit tests on the denial family, including a two-hop case whose `proposal` is `null` |
| DM-06 | Rewording a message does not change a finding's id; two findings that differ only in a structured fact still differ in id | identity tests per id family |
| DM-07 | A not-checked hook reply prints the provider's explanation | `changed-command` tests for `unobserved-input`, `cold` and `configuration-changed` |
| DM-08 | Bounds hold | a test with 50 exposures and 50 received names yields at most 8 detail lines and cut lists with counts |
| DM-09 | A reader without the catalogue can act | for each denial code, a recorded review in the completion report: the block alone is given to a model with the model glossary, which must restate the violation and name what would have to change; this is evidence gathered once, not a test |

## Completion gate

Iteration 7's exit: DM-01 to DM-08 pass, `npm run check:self` passes, the
reference harness passes with its updated expectations, and the completion
report records DM-09 and the before-and-after texts from the baseline.

## Handoff

- The consuming harness deletes its per-code templates and relays
  `message`, `details` and `proposal`, adding only what Ramify cannot know:
  whether the location is inside the session's write scope, and the session's
  own options.
- The companion-exposure plan (RD-6) adds its code to the catalogue.
- The inspection successor reuses the denial wording for `ramify explain`, so
  one fact has one sentence in both commands.

## Out of scope

- Any change to what is allowed or denied.
- The companion-exposure error itself.
- `ramify explain`, and any proposal that needs more than one declaration
  change.
- Localization, colour and terminal layout.
- Message text in generated views.
