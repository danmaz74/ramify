# Research: cross-module interfaces for a ramify-agent dashboard

Written 2026-09-24 against ramify-agent at `7d6af7f` and the toolkit in the same
checkout. It builds on
[inventory-model.md](inventory-model.md)
("the inventory"; §1.8, §1.10–1.12, §1.20, §1.21) and does not repeat it.

Path conventions:

- `T/` is the toolkit root, `/ramify/`.
- `A/` is `/ramify/ramify-agent/`.
- `H/` is `A/subs/harness/`.
- `P/` is `H/src/interfaces/protocol/`.
- `RUN/` is the example run,
  `/tmp/ramify-agent-loop-trial-XJHJla/collection-review/plans/status-badge-tone/.harness/jobs/20260923T164537Z-dbf0c2/`.
- `PRJ/` is its project, `/tmp/ramify-agent-loop-trial-XJHJla/collection-review/`.

Both were read only.

---

## 0. Summary

- "Interface" has four concrete meanings here. Only two of them have records:
  1. **Ramify's exposure surface**: exposed originals, with their exposure hops,
     tags, reach and signature companions. Ramify records it completely.
  2. **Interface files**: `src/interfaces/*.ts` and `expose-src *` wildcard
     contracts. These are a path convention on (1).
  3. **Seams**: the glossary's "must agree on an interface". A seam has no
     record of its own.
  4. **Harness contracts** (`ct-NNN`). The harness records them, but they
     link to (1) only by file path and export-name strings.
- The richest interface record is the full `ramify.analysis/1` JSON with
  `snapshot.model`. It holds every exposure hop with its alias names, every
  original's tags and companions, and every import decision with its exposure
  paths. The harness already stores it:
  - in every gate's `NN-ramify-check.log`;
  - in every complete post-write check, `invocations/<inv>/hooks/NNN.json`.

  The protocol exposes neither usably. The gate view has an 8 KiB tail. The
  session `files` endpoint cuts a body at 1 MiB, and the example's files are
  1.8 MB of JSON.
- The harness reads almost nothing of the interface evidence itself:
  - from the architect view: module entries and `{module, name, binding, as,
    file}` of each symbol record (`H/subs/evidence/src/views.ts:90-97,129`);
  - from API views: headings and `[type-only]` markers
    (`views.ts:172-211`).

  The module tree it publishes is `{module, dir, parent}` only, with no tags
  (`P/evidence.ts:77-81`).
- A capability links to symbols only through agent-written `citations`
  (`{module, file?, symbol?, note?}`). None of them is exposed through the
  protocol. A contract links capability → interface file → export names →
  exposure declaration text. The harness verifies that the paths exist; it
  never checks the names or the declaration text against source or against
  Ramify's model.
- In the example run, no session opened a foreign API-view entry
  (`external/*.md`). The local architect guessed two view paths and got ENOENT.
  The engineer changed an exposed interface, `StatusBadgeProps`, compatibly.
  Nothing in the run records that an exposed signature changed:
  - the hook revision path read `unchanged-surface`;
  - the gate models differ only in declaration spans.

---

## 1. What "cross-module interface" can mean, and what is displayable

### 1a. Ramify's module surface

#### The model concepts

| Concept | Definition | Where the concrete form is defined |
|---|---|---|
| Exposure | A module exposes a visible symbol to `parent` or to `descendants`. Re-exposing is the same operation. | `T/docs/model/glossary.md:181-197` |
| Owned exposure | `expose-src` (relative to `src/`) and `expose-test` (relative to `src/tests/`). | `T/docs/model/module-description.principles.md:458-551` |
| Child re-exposure | `expose-sub` names a direct child, and `*` forwards that child's effective to-parent contract. | same, `:609-660` |
| Interface directory | `src/interfaces/`: ordinary source with no automatic exposure. `expose-src * from "interfaces/x.ts"` selects every export of that one file. | glossary `:70-80`; principles `:272-286`, `:553-607` |
| Signature companion | A project original named by a symbol's declared signature. Every exposure must make it visible wherever it makes the symbol visible, and each companion's required-importer tags must also be tags of the symbol. | glossary `:199-202`; `T/CLAUDE.md` |
| Tags | Two fixed kinds, required-importer and required-symbol, from one registry. | glossary `:228-267` |
| Reach and availability | Reach is where a symbol is visible, decided by exposure alone. Availability is judged per importing source area by tag rules, with a value/type-only split. | glossary `:169-179`, `:319-350` |

#### What the toolkit publishes that ramify-agent can read

**A. `ramify check --format json` (`ramify.analysis/1`).**

This is the only complete interface record. The harness runs it as
`check --batch --root … --format json` (`H/subs/evidence/src/ramify-cli.ts:106-112`)
at every gate and in complete post-write checks. The schema is at
`T/subs/analysis/src/interfaces/analysis.ts:120-137` and
`T/subs/analysis/subs/model/src/interfaces/model.ts`.

| Record | Key fields | Where (model.ts) |
|---|---|---|
| `snapshot.model.registry` | `id`, `isDefault`, `definitions[{name, kind: required-importer\|required-symbol, description?}]` | `:4-13` |
| `snapshot.model.modules[]` | `id` (declared-name path), `name`, `parent`, `headerTags`, `areas[{owner, kind: ordinary\|tests, root, profile}]` | `:31-43` |
| `snapshot.model.originals[]` | See below. | `:44-73` |
| `snapshot.model.exposures[]` | One per hop: `module` (the exposer), `original`, `names` (alias names at that hop), `destinations`, `evidence` (the statement's location in `module.ramify`), `provider` (the child it came from; `null` for owned), `effective`. | `:74-83` |
| `snapshot.results[].decisions[]` | `status: allowed\|denied`, `reason: same-owner\|exposed\|symbol-free\|testing-origin\|not-visible\|required-importer-tag\|required-symbol-tag`, `question{importer{file, area}, target, forwarding, selection{original, request: value\|type-only}}`, `visibility{visible, paths[[ExposureHop{module, destination, evidence}]], ineffective}`, `requirements[{tag, kind, satisfied}]` | `:96-134` |
| `diagnostics[]` | `code` (includes `exposed-without-companion`), `category: exposure\|import\|…`, `location`, `related`, `importer`, `original` | `analysis.ts:53-71`; the companion finding is specified at `T/docs/architecture/cli-invocation.spec.md:154-162` |
| `coverage[]` | Includes `signature-inferred` and `signature-unresolved` per exposed original. | cli spec `:158-162` |
| `CompanionViolation` | `module`, `original`, `companion`, `destination`, `reason: not-visible\|requires-tag`, `tags`, `statement` | `model.ts:140-152` |

The fields of an original:

- `id{kind: code|resource, owner, file, binding}`. `file` is relative to the
  owner's `src/`.
- `origin{file (project-relative), area}`.
- `declarations[]`: locations with `start`, `end`, `line` and `column`.
- `hasValue`, `hasType`.
- `tags`, `tagEvidence`.
- `companions{named[OriginalId], evidence[], inferred, unresolved}`.

There is no reverse index from a companion to the symbols that name it
(`T/docs/architecture/daemon.md:603-621`).

**B. The bounded hook check, `ramify check --changed … --format json`
(`ramify.check/1`).**

The harness runs it after each write (`ramify-cli.ts:117-126`). Its fields:

- `revision{id, sequence, path}`, where `path` is `unchanged-surface`,
  `source`, `description`, `metadata`, `membership` or `broad`;
- `since`, `changed[{path, sha256, covered}]`, `outcome`, `reason`;
- `findings`, `removed`, `coverage`;
- `checked{path, files, accesses, modelRebuilt}`, `timings`, `exitCode`.

Example: `RUN/invocations/inv-0003/hooks/001.json`. `revision.path` says
whether a write changed the export description or the access facts
(`T/docs/architecture/daemon.md:623-634`). It does **not** say whether a
signature changed. See §3.4.

**C. The architect view, `.ramify-architect/`**
(`T/docs/architecture/architect-view.spec.md`).

| File | Interface-relevant fields |
|---|---|
| `_meta.json` (`:459-481`) | `schema`, `revision`, `input`, `modules`, `dependencies`, `dependencyScope`, `testReferences`, `metrics`, and exceptional counts (`unknownShapes`, `cut`, `detailsUnavailable`, `coverage`, …) |
| `module.json` (`:175-270`) | `module`, `dir`, `parent`, `children`, `tags` (header), `areas`, `purpose{state, path, text}`, `symbols{exposed, internal, supporting, unknown}`, `uses[]`/`usedBy[]` `{module, behavioral, nonBehavioral, unknown?}` (actual cross-module use, counted in distinct originals), `metrics.contextSize{exact, subtree}` (Plan 2C, including `views.ordinaryBytes` and `testsBytes`), `revision` |
| `behavior.jsonl` (`:272-311`) | Per behavior-capable original: `module`, `name`, `binding?`, `as?` (**the owner's** exposure aliases only), `role: exposed\|internal`, `shape`, `to`, `tags`, `reexposed[{by, to}]` (nearest first, **without the alias used at that hop**), `behavioral[]`/`nonBehavioral[]`/`unclassified[]` consumer modules (at most 12 each, `…More`), `sig` (at most 240 B, `cut`), `doc`, `detail`, `file` |
| `supporting.jsonl` (`:313-327`) | The same fields with `kind: interface\|type\|enum\|namespace\|value\|resource` and `value?` in place of `shape`. Contract vocabulary (types, schemas) lives here. |
| `tests.jsonl` (`:329-387`) | `module`, `file`, `suite[]`, `tests[]`, `exercises[]` (`<owner>#<name>`, behavioral only, at most 12), or `feature` and `scenarios[]` |
| `README.md` (`:135-173`) | A map entry per module, with a headline of its first eight exposed behaviors |

**D. The per-module API view, `<module>/src/.ramify/` and
`src/tests/.ramify/`** (`T/docs/architecture/materialized-api-view.spec.md`).

- `_meta.json`: `{schema: ramify.api-view/1, module, area: ordinary|tests,
  revision, coverage?, detailsUnavailable?, truncated?}` (`:202-225`).
- `external/<defining-file>.md`: originals owned outside the subtree.
- `children/<defining-file>.md`: originals owned by descendants (`:103-117`).
- One `## \`name\`` heading per importable export, with `[type-only]` when
  only a type import is available, a signature block and one doc paragraph.

It deliberately omits tags, exposure paths, aliases, reasons and original IDs
(`:179-196`). It is the only record of **what one source area may import**, and
it exists only where the harness materialized it: in the example, for
`shared-ui` alone.

**E. `ramify measure --format json` (`ramify.measure/1`).**

The fields are `modules[{id, dir, parent, exact, subtree}]`,
`files[{path, owner, area, kind, bytes}]` and `outsideModuleFiles`
(`architect-view.spec.md:483-538`). The harness stores it in
`measurements/ms-NNNN.json` (`H/subs/evidence/src/measure.ts:53-58`). It sizes
views and holds no interface facts.

**F. Other toolkit surfaces.**

- The package exports `.`, `./analysis`, `./analysis/inventory`, `./model`,
  `./presentation`, `./module-tree(.css)`, `./cli`, `./layout` and `./client`
  (`T/package.json`). Under `A/AGENTS.md:18-22`, ramify-agent may import them
  for types and schemas only, plus a rendered presentation component.
- `ModuleTreeCanvas` takes nodes `{id, name, parent, children, color, width,
  height, emphasis}` and has no edge or exposure layer
  (`T/subs/presentation/subs/project-view/src/ModuleTreeCanvas.tsx:26-56`).
- The modularity report (interface economy, contract breadth,
  `T/docs/architecture/modularity-report.spec.md:213-256`) is library-only
  (`projectModularity`, `T/subs/analysis/src/index.ts:20`). There is no CLI.
- The architect-view diff (`--diff-from`), which would report `sig`, `to`,
  `tags` and `reexposed` changes, is **proposed, not implemented**
  (`T/docs/architecture/architect-view-diff.spec.md:3-5, 219`).

#### Displayability

| Element | Source | Can a dashboard show it today? |
|---|---|---|
| Exposed symbols per module, with kind, sig, doc, tags, `to` | Architect view `behavior`/`supporting` | Yes from disk. Not through the harness protocol. |
| Interface files (`src/interfaces/…`) | Path pattern on `file`; model `origin.file` | Derivable. Neither view marks a wildcard contract. |
| Exposure hops, with aliases at each hop | Check JSON `model.exposures` | On disk in gate and hook logs only (see §4) |
| Reach (visible in) | Check JSON, or derived from `to`, `reexposed` and the tree | Derivable by join |
| Availability per source area (value, type-only, blocked by which tag) | Check JSON with the registry, or API views where materialized | Derivable by join. API views are sparse. |
| Actual consumers (who imports) | `usedBy`, or per-symbol `behavioral`/`nonBehavioral`; check JSON `results` | Yes from disk |
| Signature companions and companion findings | Check JSON `originals[].companions`, `diagnostics` | On disk in logs only |
| Test titles exercising a symbol | `tests.jsonl` `exercises` | Yes from disk |

### 1b. The harness's contracts

A **seam** is the glossary's "place where modules in different branches must
agree on an interface" (`A/docs/glossary.md:74-80`). It has no production
record type. It becomes concrete only when an engineer submits
`contract-needed` and a contract iteration registers an agreement
(`A/docs/harness.principles.md:155-185`).

#### Records

All are immutable, one file per revision, with no status field
(`H/src/contracts/records.ts:8-21`).

| Record | ID | Key fields | Where |
|---|---|---|---|
| Need (engineer `contract-needed`) | none; carried by the event | `capability`, `useCases[]`, `inputs[]`, `outputs[]`, `sideEffects[]`, `constraints[]`, `existingEvidence[]`. It is stated "as behavior and not as an interface". | `H/src/contracts/submission.ts:27-39` |
| Contract `ramify-agent.contract/1` | `ct-NNN` + revision | See below. | `records.ts:64-88`, `contracts/<id>/<rev>.json` |
| Obligation `ramify-agent.provider-obligation/1` | `ob-ct-NNN` + revision | `contract` ref, `capability`, `provider`, `behavior`, `evidence{conformance[], against: real}` | `:91-102` |
| Requirement `ramify-agent.consumer-requirement/1` | `rq-NNN` + revision | `workItem`, `consumer`, `forCapability`, `obligation`, `contractRevision`, `behavior`, `evidence{tests policy, fakeInjections[]}` | `:105-123` |

The contract's fields:

- `capability` (registry ref), `decision` (placement or `null`).
- `authority{kind: provider|consumer|independent, owner, rationale}`.
- `provider`, `behavior`, `mode: fake-backed|access-only`.
- `artifacts`:
  - `interface[{path, exports[], hash}]`;
  - `conformance[{path, hash}]`;
  - `fake[{path, exports[], hash}]`;
  - `exposure[{path, declaration}]`.
- `establishedBy{iteration, gate}`.

#### Where the interface artifacts land

A contract iteration's write scope is:

- the consumer module (its base);
- `<provider>/src/interfaces` (purpose `contract`);
- `<provider>/src/tests` (`conformance`);
- `<provider>/src/fakes` (`fake`);
- every `module.ramify` on the tree path between consumer and provider through
  their lowest common ancestor (`exposure-declaration`).

Sources: `H/src/run/service.ts:3269-3292`, `:5115-5131`.

So a contract interface is, by construction, a Ramify **interface-directory
file** of the provider, and its exposure entries are `module.ramify` lines on
the exposure path. One inconsistency: `authority.kind: independent` (owner at
the common ancestor) or `consumer` can place the agreement outside
`<provider>/src/interfaces`. The scope still names only the provider's
directory, plus the ancestors' `module.ramify` files but not their `src/`.

#### What the harness verifies

- Named paths exist and are project-relative (`submission.ts:122-141`).
- `fake-backed` requires the interface, conformance, fake and fakeInjections.
  `access-only` forbids them and requires `exposure` (`:143-186`).
- The fake-naming rule, read from source (`H/src/contracts/naming.ts`;
  `service.ts:3544`).
- Artifact hashes are captured at the passing gate (`accept.ts:87-90`).

What it never verifies:

- that `interface[].exports` exist in the file;
- that `exposure[].declaration` is the text in that `module.ramify` or is
  effective. It is stored verbatim (`accept.ts:90`).

Exposure correctness comes only from the gate's complete `ramify check`.

#### What is guarded later

Interface, conformance and fake paths are guarded on every later assignment
(`service.ts:2417-2437`). Exposure declarations are **not** guarded, although
the doc comment at `:2418-2420` says they are.

#### Iteration fields that name interfaces

- `externalCapabilities[{capability, owner, role: use|request, contract?}]`
  (`H/src/work/iterations.ts:99-104`).
  - The architect writes `use`; it is validated only against the registry's
    owner (`H/src/work/assignment.ts:288-304`).
  - A contract iteration gets `role: request` (`service.ts:3217`).
  - The engineer sees one line per entry naming the capability and its owner.
    It names no symbol (`H/src/work/engineer.ts:540-546`).
- `scope.extra[].purpose` includes `exposure-declaration`
  (`iterations.ts:33`).
- `evidenceObligations[{obligation?, requirement?, suite[], against: fake|real}]`
  (`:106-111`).
- `revisesContract?`, `requestedBy?`.

#### States and events

The state is derived from events (`H/src/run/log.ts:331-420`):

1. `contract-requested{workItem, iteration, invocation, capability, consumer,
   provider, requestedBy, revises}`;
2. `contract-registered{contract, revision, mode, iteration, obligation,
   requirements[], providerWorkItem}`;
3. `work-item-yielded`;
4. `provider-conformed{obligation, revision, workItem, iteration, gate}`;
5. `work-item-resumed`;
6. `requirement-verified{requirement, revision, workItem, iteration, gate}`,
   the only close.

A revision goes through `evidence-reopened` or `revision-needed`.

Derived states:

| Record | States |
|---|---|
| Contract | requested → registered (revision n) → reopened (n+1) |
| Obligation | open → conformed (per revision) |
| Requirement | open → fake-passing → verified |

#### What the protocol exposes

- Contracts, as `decisions[kind=contract]`:
  `{contract, revision, capability, provider, authority, mode, decision,
  establishedBy}`. **Not `artifacts`, not `behavior`** (`P/runs.ts:529-540`).
- Requirements, per consumer work item:
  `{id, revision, obligation, consumer, forCapability, behavior, verified}`
  (`P/runs.ts:642-650`).
- `waits` and `counts.openRequirements` (`P/runs.ts:245-250`).
- The contract gate's naming `rules[]` (`P/runs.ts:912-916`).

Not exposed: obligations, artifacts, the need, `fakeInjections`,
`externalCapabilities`, `evidenceObligations`, or scope `extra` purposes. The
work-item scope view has `extra[{path, purpose}]`, so `exposure-declaration`
entries are visible there (`P/runs.ts:596-603`).

#### Placement decisions and exposure

A placement outcome is `reuse`, `create`, `extract` or `external`. Its record
has an `owner`, `changesExistingSymbols` and
`evidence{view, citations[], gaps}` (`H/src/architecture/records.ts:82-127`).
**No field names an exposure path or declaration.** The principles price
"exists but is not available" as "the exposure declarations along the path,
proposed by the architect" (`harness.principles.md:271-277`). That proposal
travels as prose (`rationale`, `constraints`, `brief`) or as an `access-only`
contract.

---

## 2. Relationships and how each is derivable

Classes of derivability:

- **R**: recorded as a field.
- **J**: derivable by joining records.
- **X**: only by parsing source, logs or transcripts.
- **—**: not derivable.

"Exposed" means the harness protocol exposes it.

| # | Relationship | Class | How | Exposed? |
|---|---|---|---|---|
| 1 | Interface (original) → owning module | R | `OriginalId.owner`; architect-view record `module` | No |
| 2 | Interface → exposure hops (with aliases) | R | `model.exposures` (`module`, `names`, `destinations`, `provider`, `evidence`). The architect view has `to` and `reexposed[{by, to}]` without hop aliases. | No |
| 3 | Interface → receiving modules (reach) | J | Close over `exposures` and the tree (see §3.3), or over `to`, `reexposed` and `module.json` parents and children | No |
| 4 | Interface → modules that may import it, per area and form | J | Reach + `modules[].areas[].profile` + `registry.kind` + `original.tags`, or `results[].decisions` for the imports that exist. API views give it only for materialized requesters. | No |
| 5 | Interface → modules that do import it | R | Per-symbol `behavioral`/`nonBehavioral` (at most 12); `module.json` `usedBy`; `results[]` | No |
| 6 | Interface → signature companions | R | `originals[].companions.named` (the forward direction only) | No |
| 7 | Module → its interface files | J | `file` or `origin.file` matching `<dir>/src/interfaces/`. Whether a file is a wildcard contract needs X (parse `module.ramify`, or the exposure `evidence` offsets). | No |
| 8 | Capability → symbols | R (agent-asserted) | `citations[{module, file?, symbol?}]` on entries (`analysis/entries.json`), hypotheses, placement decisions and request findings. They are validated against the view's owned-symbol records (`H/src/analysis/submission.ts:357-379`). The registry entry itself names no symbol (`H/src/analysis/records.ts:77-91`). | **No** (no answer carries `citations`) |
| 9 | Capability → contract → interface files and exports | R | `contract.capability` + `artifacts.interface[{path, exports}]` | Contract yes; artifacts no |
| 10 | Contract → exposure declarations | R (agent-stated text) | `artifacts.exposure[{path, declaration}]`. Checking it against the model needs a join with `model.exposures.evidence`. | No |
| 11 | Contract interface → Ramify original | J | `artifact.path` = `origin.file`, and `exports[]` = `OriginalId.binding`. This needs the check JSON. | No |
| 12 | Work item → requirements → obligation → contract → provider work item | R/J | `requirement.obligation`; `contractOfObligation()` (`records.ts:36-37`); `contract-registered.providerWorkItem` | Requirements yes; the obligation ID only; the provider work item by event only |
| 13 | Iteration → external capabilities (→ owner, contract) | R | `assignment.externalCapabilities` | **No** |
| 14 | Iteration → exposure-declaration files in scope | R | `scope.extra[purpose=exposure-declaration]` | Yes (scope view) |
| 15 | Session → API views offered | X | Only in the prompt text ("What you may import" in the transcript's first entry or its blob). `ApiViewEvidence` is built for briefings (`H/src/work/session.ts:55-78`) and is in the protocol vocabulary (`P/jobs.ts:84-97`), but no answer or event carries it. | Transcript only |
| 16 | Session → views and interfaces read | X | Transcript tool-call `action{kind: read\|search, path, pattern, glob}` (`P/transcripts.ts:50-55`); observations `activity.read\|search` (paths) | Transcript yes (per session) |
| 17 | Session → modules read outside scope | R | Observation `excursion{module, firstEntry}`; evaluation `excursions[]` (`P/runs.ts:1078`); transcript `read-reminder` | Yes |
| 18 | Session → interfaces changed | J/X | Mutation paths and lines, then originals whose `origin.file` changed and which have an exposure. A signature change needs a comparison of `declarations` spans across gate logs, or of the source at the two commits. | Paths partly (`lines`); symbols no |
| 19 | Session → interfaces added or removed | J | Diff `model.exposures` and `originals` between the iteration's gate log and the previous accepted gate log | No |
| 20 | Session → exposure findings | R | Hook `findings`, gate check `diagnostics` (`exposed-without-companion`, `not-visible`, …) | Counts only (`hookChecks.findings`); gate outcome and tail |
| 21 | Scenario or test → interface exercised | R | `tests.jsonl` `exercises` (file-level) | No |
| 22 | Placement decision → exposure it requires | — | Not recorded, only prose | — |

---

## 3. The example run (`status-badge-tone`)

### 3.1 The interface landscape

The project has 15 modules. Three have an interface directory:

- `PRJ/src/interfaces/protocol.ts` (root);
- `workspace/contracts/src/interfaces/vocabulary.ts`, exposed with
  `expose-src * … tagged [browser] to parent`
  (`PRJ/subs/workspace/subs/contracts/module.ramify:9`);
- `reviews/core/src/interfaces/port.ts`, exposing `InspectionPort` to
  `parent, descendants` (`…/reviews/subs/core/module.ramify:8`).

The plan touched `workspace/shared-ui`. Its interface is `StatusBadge`
(callable) and `StatusBadgeProps` (interface) from `status-badge.tsx`, not from
`src/interfaces/`: `expose-src … tagged [ui, browser] to parent`
(`PRJ/subs/workspace/subs/shared-ui/module.ramify:10`). The parent re-exposes
it with `expose-sub * from shared-ui to descendants`
(`PRJ/subs/workspace/module.ramify:26`).

The architect view's record for `StatusBadge`
(`PRJ/.ramify-architect/workspace/shared-ui/behavior.jsonl:1`) reads:
`role: exposed`, `to: [parent]`, `tags: [browser, ui]`,
`reexposed: [{by: collection-review/workspace, to: [descendants]}]`,
`behavioral: [catalog/ui, reviews/ui/pure-ui]`. Its `sig` already includes
`tone`: the view is at revision `:12`, after the change.

The alias gap:

- `catalog/module.ramify:13` re-exposes `inspect as inspectRecord`.
- The model records `names: ["inspectRecord"]` at both relaying hops
  (`RUN/gates/ga-0004/03-ramify-check.log`, `model.exposures`).
- `grep inspectRecord .ramify-architect` finds nothing: `reexposed` drops
  per-hop names.

### 3.2 Records the run holds about interfaces

- **Citations.** The entry `render-status-badge-tone` cites
  `{module: shared-ui, file: …/status-badge.tsx, symbol: StatusBadge}`
  (`RUN/analysis/entries.json`). Hypothesis `create-status-badge-tone-rendering`
  cites `StatusBadge` and `StatusBadgeProps`, noting "an optional tone extends
  an existing public symbol" (`RUN/hypotheses/create-status-badge-tone-rendering/1.json`).
  The local decision `ld-wi-001-01` cites `StatusBadge` at view revision `:2`.
  These are the only capability → symbol links, and none reaches the API.
- **Registry.** Both registry entries name only the owner module
  (`RUN/registry/*/1.json`).
- **Outline.** `reuse[{capability: status-badge-wording, owner: shared-ui, role}]`
  names a capability, not a symbol.
- **Assignment `wi-001.i01`** (`RUN/work-items/wi-001/iterations/01/assignment.json`):
  - `externalCapabilities: []`, `extra: []`, `evidenceObligations: []`;
  - `read: [contracts, catalog/ui, reviews/ui/pure-ui]`: the provider of its
    companion `ReviewStatus` and the two consumers of `StatusBadge`;
  - `resolved.view` at revision `:1`.
- **No contracts, obligations, requirements or requests** exist in this run.
  The inventory records that the contract engineer was unexercised in real
  runs.

### 3.3 Reach and availability, derived by join

From `ga-0004`'s `model`, closing over `exposures` and the tree with the
default registry (`browser` is required-symbol; `ui`, `dispatch` and `testing`
are required-importer):

- **Visible** in `workspace` and all its descendants (13 modules).
- **Value-available** in:
  - `workspace` (both areas);
  - `catalog/ui` (both areas);
  - `reviews/ui` (both areas);
  - `reviews/ui/pure-ui` (both areas);
  - `shared-ui` itself, same-owner.
- **Blocked by `ui`** in `catalog`, `catalog/core`, `contracts`, `reviews`,
  `reviews/core` (and its children) and `validation`, in both areas.
- **Actually used** by `catalog/ui` and `pure-ui` only
  (`module.json` `usedBy`; decisions `allowed/exposed` with the path
  `shared-ui→parent, workspace→descendants`).

Nothing in the harness shows this. `/project/modules` gives
`{module, dir, parent}` (`RUN` answer in `api-examples/project_modules.json`).

### 3.4 What sessions read and changed

**`ses-0001` (initial architect)** read the architect view widely:

- `_meta.json`, `README.md`, the root `behavior.jsonl` and `supporting.jsonl`;
- shared-ui's `module.json`, `behavior.jsonl`, `supporting.jsonl` and
  `tests.jsonl`;
- the `module.json` of catalog/ui and pure-ui;
- the behavior files of six other modules, and `contracts/supporting.jsonl`;
- `grep StatusBadge|badge|"cut"|…` over `.ramify-architect`.

It also tried `.ramify-architect/references/*.md` and `report.md`, which gave
ENOENT four times: the skill expects files the view does not have.

**`ses-0002` (local architect):**

- read `shared-ui/module.ramify`;
- listed both `.ramify/` directories and read both `_meta.json`;
- read shared-ui's architect records.

It then tried
`…/src/.ramify/external/subs/contracts/src/interfaces/vocabulary.ts` and
`…/src/tests/.ramify/external/subs/shared-ui/src/status-badge.tsx`, and got
ENOENT for both. The real path is
`external/subs/workspace/subs/contracts/src/interfaces/vocabulary.ts.md`, and a
module's own symbols are never in its view. `grep StatusBadge` over
`src/tests/.ramify` returned "No matches found".

**`ses-0003` (engineer):**

- read `shared-ui/module.ramify`;
- walked `src/tests/.ramify/external/…` with `ls` four levels deep;
- grepped it for `@cucumber|Given|renderToStaticMarkup|expect`;
- read `src/tests/.ramify/_meta.json`.

It **never opened an `external/*.md` entry**. It read
`subs/integration-tests/module.ramify` and the root `README.md`. These were
recorded as excursions `collection-review/integration-tests` and
`collection-review` (`RUN/invocations/inv-0003/observations.jsonl` n=71, 84)
and as two `read-reminder` entries. The reminders were attached to the next
tool call (the edit), not to the read.

**The engineer's change.**

- **Where it wrote.** `status-badge.tsx` (an exposed interface: `tone?` added
  to `StatusBadgeProps`), its test and a new step file. No `module.ramify`
  write.
- **What the write hooks recorded.**
  - After the `status-badge.tsx` edit: revision path `unchanged-surface`
    (`hooks/001.json`), because export names and companions were unchanged.
  - After the step file: `broad` (`003.json`), then `source` (`005.json` and
    `007.json`).
- **What the gate logs show.** Comparing `ga-0001` (readiness,
  `input/1:0615…`) with `ga-0002` (iteration, `input/1:b6e7…`):
  - identical `exposures` (105) and `originals` (103);
  - identical companions (`StatusBadge` → `StatusBadgeProps` →
    `contracts#ReviewStatus`);
  - only the declaration spans differ: `StatusBadge` 1049–1255 → 1188–1436,
    `StatusBadgeProps` 617–696 → 646–783.
- **What a signature diff needs.** The old `sig` text is gone, because the
  architect view is overwritten in place (now `:12`), and the API view in
  shared-ui is still `:2`. A before/after signature diff needs the source at
  `2fe54cc` and `e99fee0` (the run's base and its commit), or the unimplemented
  `--diff-from`.

### 3.5 View revisions seen in one run

| Record | Revision |
|---|---|
| Entry analysis and assignment scope | `:1` |
| Local decision evidence and shared-ui API views | `:2` |
| Hook revisions during `inv-0003` | `:3`–`:10` |
| Architect view on disk (and `/project/modules`) | `:12` |

A dashboard showing "the interface an agent saw" must key on these revisions.
Only `:12` survives.

---

## 4. Gaps: what a dashboard needs about interfaces that is not recorded or not exposed

### Recorded on disk, not exposed through the protocol

1. **The interface model.**
   - `model.exposures`, `originals` (tags, companions, declarations) and
     `results` (import decisions with paths) exist in every gate's
     `NN-ramify-check.log` and every complete hook log.
   - The gate view gives an 8 KiB `tail` and an absolute `path`
     (`P/runs.ts:934-940`).
   - `sessions/:s/files?path=` serves transcript-named files, including hook
     logs, but at most 1 MiB with `truncated` (`P/sessions.ts:303-315`). The
     1.8 MB JSON is therefore unparseable through the API.
   - An interfaces answer, such as per-module exposed originals with reach,
     availability and companions at a revision, would need a new projection.
2. **The architect view's symbol records** (`behavior` and `supporting`, with
   sig, doc, tags, `to`, `reexposed` and consumers) and **module tags and
   areas**. The harness reads them (`H/subs/evidence/src/views.ts:50-97`),
   keeps five fields, and publishes only `{module, dir, parent}`.
3. **Citations**, the capability → symbol links, on entries, hypotheses,
   decisions and request findings. They are not in any answer (inventory §1.5,
   §1.6).
4. **Contract artifacts**: interface paths and exports, fake exports,
   conformance paths, exposure declaration text, hashes, and `behavior`. Also
   obligations, `fakeInjections`, the need-as-behavior, and each iteration's
   `externalCapabilities` and `evidenceObligations`.
5. **API views offered to a session.** They are only in the prompt text.
   `ApiViewEvidence` is defined in the protocol but answered nowhere.
6. **Hook revision paths** (`unchanged-surface`, `source`, …) and hook
   findings by code. Only counts are exposed (`hookChecks`).

### Not recorded at all

7. **Interface history.** Views are overwritten, and `/project/modules` is
   "latest" only. No record keeps the exposed surface (names, sigs, `to`) at a
   gate. Gate logs keep the model, but not signature text or docs.
8. **Signature-change detection.** Neither the hook's `unchanged-surface` nor
   the model distinguishes "signature changed" from "moved". The
   architect-view diff is proposed only.
9. **Per-hop exposure aliases in the views.** `reexposed` has no names, so
   `inspectRecord` is invisible in the architect view.
10. **A seam or planned-interface record.** Hypotheses carry free-text
    `anticipatedConsumers`. No record says "capability X will be consumed by
    module Y through an interface" until a contract exists.
11. **An exposure-change record on placement.** A `reuse` decision for a
    consumer that cannot yet import the symbol records no required exposure
    path or declaration.
12. **Validation of contract artifacts against Ramify.** Export names and
    declaration text are unverified strings. Nothing links a contract to the
    model's `Original` or `Exposure`, or checks that the declaration is
    effective or companion-complete. Only the gate's overall `ramify check`
    covers that.
13. **Which foreign interface entries a session actually used.** Reads are
    per path. API-view Markdown files group entries by defining file, so
    "read `vocabulary.ts.md`" does not identify the symbols. Imports added by
    a session must be derived from the model's `results` before and after.
14. **Exposure declarations are not guarded** after a contract, although the
    code comment says they are (`H/src/run/service.ts:2417-2437`).
15. **API views for the modules that would receive a changed interface.** The
    harness materializes views only for the work item's own module, so a
    dashboard cannot show the receiving side's view.

### Suggestions (cheapest first)

- Project a bounded "interfaces" answer at the current view revision, per
  module:
  - exposed originals with `kind`/`shape`, `sig`, `tags`, `to`, `reexposed`,
    consumers and `file` (marked as interface file or not);
  - module `tags` and `areas` on the tree.
- Expose `citations` on entries, hypotheses and decisions.
- Expose `artifacts` and the obligation on the contract decision, and
  `externalCapabilities` on iterations.
- At each committing gate, extract from the check JSON a compact "surface
  snapshot": exposures with names, hops and destinations; originals with
  tags, companions and declaration hash.
  - Store it as a run record. It gives interface history and before/after
    diffs per iteration without the 1.8 MB log.
  - Adopt the toolkit's `--diff-from` when it is implemented.
