# Code-derived capability discovery for project architecture

**Date:** 2026-09-17. **Status:** analysis and proposal; no new generated
view, automatic publication or capability-placement policy is implemented by
this document.

## Purpose

Make the same architecture evidence useful to a human architect and to an
agent planning a feature. The architect should be able to answer four distinct
questions:

1. Which behavior that the feature needs already exists?
2. Which module owns that behavior, and which modules re-expose it?
3. Can the intended consumer module use it now?
4. If the behavior does not exist, which existing module should own it, or is
   a new module justified?

The evidence should be derived from code, module declarations and their normal
documentation. Ramify should not introduce a separately maintained capability
catalog or require authors to assign capability identifiers. Symbol names,
bounded signatures and source comments are the primary search material; module
purpose prose and modularity evidence provide the architectural context.

## Recommendation

Use three complementary views of one revision rather than describing all three
as a capability catalog:

- a **provider view** arranged by module, containing behavior-capable symbols
  implemented by the module, behavior-capable symbols it re-exposes, and
  behavior-capable exports that remain internal to the module boundary;
- the implemented **consumer availability view** beneath a particular module's
  `src/.ramify/`, which is the authoritative generated answer to whether a
  foreign original is available to that source area; and
- the **observed dependency view** proposed by Plan 6D, which reports which
  originals consumers actually reference behaviorally or non-behaviorally and
  whether the diagram attributes the link to the imported module or original
  owner.

The provider view should remain named after its evidence, such as the draft
`.exported_symbols/` view, rather than `.capabilities/`. Ramify can identify
behavior-capable entry points; it cannot prove from a name and type alone that
one symbol constitutes the domain capability an architect has in mind.

The generated filesystem view is an **agent interface**, not a human report.
Human architects should use the interactive diagrams and detail panel. The
agent view should optimize deterministic `glob`, `rg` and JSON parsing: stable
paths, one self-contained record per searchable line, explicit fields and no
generated narrative. Both surfaces consume the same revision-bound facts, but
they render them for different users.

For the first release, make behavior-capable symbols the primary searchable
files and segregate type/data exports into a secondary file. Do not discard the
secondary symbols completely: feature work often needs a request type, port,
schema or constant after the behavior has been found, and those symbols also
matter to the non-behavioral dependency view.

Keep publication explicit:

```sh
ramify materialize --view exported-symbols --all --root <project>
```

The daemon should own the revision-bound projection and transactional
publication, as it does for the implemented API view. An ordinary check, watch
update or post-write hook should not run symbol-detail or behavior analysis and
should not write generated files. Agent instructions should require a refresh
before architecture work and require the generated revision to match the
revision used for dependency or modularity evidence.

## A necessary vocabulary distinction

The proposal needs two different uses of “behavioral”:

| Term | Unit | Meaning |
| --- | --- | --- |
| Behavior-capable symbol | One exported original | Static shape says the value can be called, constructed or provides an application-declared callable first-level member. No consumer use is required. |
| Behavioral dependency | One distinct consumer module/original pair | A real consumer reference uses that original as a call, construction or callable reference. Imported but unreferenced symbols are absent. |

The first describes potential supply. The second describes observed demand.
A function may be behavior-capable and unused. A class may be used only as a
type and therefore create a non-behavioral dependency in that consumer. A
numeric constant is not behavior-capable, but a real reference to it still
creates a non-behavioral dependency.

“Implemented by module” also needs a deliberately modest meaning: the
original's defining file is owned by that module and the original has a runtime
value with a behavior-capable static shape. This is strong source evidence, not
a semantic proof. A module-owned adapter value may implement an interface whose
domain concept belongs elsewhere; a factory may provide several capabilities;
and one class may expose several operations through its methods.

## What Ramify already has

| Evidence | Current source and state | What it answers | What it does not answer |
| --- | --- | --- | --- |
| Module tree, purpose and source ownership | Implemented inventory, descriptions and model | Where code belongs today and what each module says it is for | Whether a symbol represents a useful capability |
| Consumer availability | Implemented [materialized API view](../architecture/materialized-api-view.spec.md) | Which foreign value/type originals are available to one ordinary or testing source area, with signatures and first documentation paragraphs | Same-owner internals, unavailable internal exports, observed use or best placement |
| Export catalog and exposure model | Implemented analysis facts | Every defining-file export, original owner, effective exposure, relay, direction, tags and evidence | A materialized provider-oriented search surface |
| Symbol details | Implemented retained compiler provider | Bounded body-free signature and first documentation paragraph | An explicit static behavior-capable classification |
| Dependency behavior | Implemented as an opt-in batch capability | Whether imported originals are unused, behavioral, non-behavioral or unknown at their real reference sites | Unused but reusable capabilities, or provider inventory |
| Modularity projection and candidate ownership | Implemented batch analysis | Locality, contract breadth, interface economy, stability, cycles, connectedness, change affinity and counterfactual ownership | Literal capability discovery by name/signature |
| Behavioral diagram | [Plan 6D](../plans/iteration-6d-behavioral-dependency-diagram/main-plan.md) is draft | Human exploration of used behavior through imported boundaries or original owners | Provider-side unused/internal capability discovery |
| Exported-symbols view | [Plan 2B](../plans/iteration-2b-generated-views/main-plan.md) is draft | Its proposed shape is already close to the provider view | It currently includes all exports without a behavior-capable classification and carries no modularity/dependency companion data |

The current dependency classifier already contains a useful static rule. It
treats a value as behavior-capable when its type is callable or constructable,
or when one of its application-declared first-level members is callable. It
does not let inherited `Array`, `String`, `Promise` or other library methods
turn ordinary data into behavior. That rule is currently private to
[`behavior-classifier.ts`](../../subs/analysis/subs/typescript/src/behavior-classifier.ts)
and is evaluated at a consumer reference. A provider view needs the same rule
extracted behind a compiler-owned operation that classifies defining-file
exports directly.

The existing symbol-detail representation is already appropriate for search:
functions carry parameters and return types, classes carry constructors and
members, variables carry their inferred type, and the first documentation
paragraph is retained. Method names in a class or object signature are
therefore searchable even without inventing a separate capability record.

## Proposed provider view

Revise Plan 2B's proposed `.exported_symbols/` target rather than creating a
parallel hand-maintained system. It should still mirror the module tree. For
example:

The physical
[Ramify capability-view prototype](../../.exported_symbols/_meta.json) applies
the proposed agent format to the root, `service-api` and
`analysis/typescript` modules from this project. It is an explicitly incomplete
format example, not daemon output.

```text
<project>/.exported_symbols/
├── _meta.json
├── module.json
├── behavior.jsonl
├── supporting.jsonl
├── dependencies.jsonl          # after dependency projection is available
└── analysis/
    ├── module.json
    ├── behavior.jsonl
    ├── supporting.jsonl
    ├── dependencies.jsonl
    └── typescript/
        └── ...
```

Every declared module gets a directory and the same files supported by that
schema. An available record set may be empty; metadata distinguishes a complete
empty set from an unavailable feature. The root module's files live directly
in the generated root, matching Plan 2B's existing tree mapping. A provider-only
schema omits `dependencies.jsonl` and marks dependency records unavailable in
`_meta.json`; the later dependency schema publishes that file for every module.

### Deterministic rendering contract

No LLM or agent participates in publication. The compiler/model projection
produces typed records, and pure renderers produce bytes using:

- fixed schema and key order;
- UTF-8 byte sorting by documented identity fields;
- JSON with a terminal newline and JSONL with exactly one record per line;
- project-relative POSIX paths;
- bounded compiler-rendered signatures;
- the first source documentation paragraph or `null`, never a synthesized
  summary, keyword or recommendation;
- exact rational metric components plus their calculated value; and
- no timestamps, host paths or other volatile values.

Equal revision facts and limits must produce byte-identical trees across
supported platforms. Architectural inferences—whether a symbol satisfies a
feature, whether to expose it, and where new behavior belongs—are agent work,
not generation work.

### `module.json`

This is the structured placement context. It contains:

- module identifier, physical directory, parent, tags and source areas;
- the first purpose paragraph and its source path, or an explicit missing
  marker;
- owned and subtree source-file counts;
- production behavioral and non-behavioral dependencies used;
- behavioral originals owned here and used by other modules;
- behavioral originals external consumers use through this module; and
- coverage state and exact revision/input identity.

The three dependency roles match the proposed diagram's `Uses`, `Owned
originals used by others` and `Used through this module`. They must retain
their different counting units. This file can omit change affinity initially,
because Git history has separate provenance and is not part of a daemon source
revision. If this provider view is delivered before Plan 6D's daemon-side facts,
omit the three dependency fields and identify them as unavailable in metadata;
never render measured zero as a placeholder. A later schema revision can add
them without changing the symbol files' meaning.

Ratios retain numerator, denominator and value so agents do not need to parse a
formatted percentage. States such as `measured`, `partial` and `unavailable`
remain data, not prose conventions.

### `behavior.jsonl`

Each line is one behavior-capable original in one module role. `role` is one of
`owned-exposed`, `owned-internal` or `relayed`. Each record includes:

- module and original owner;
- defining-file export name;
- effective exposure names, provider module and destinations;
- static behavior shape such as `callable`, `constructable` or
  `callable-member`;
- required tags;
- detail state and truncation fields;
- bounded body-free signature; and
- first source documentation paragraph or `null`.

`owned-exposed` is the best first search surface for an existing implemented
capability, but it does not mean the symbol is available to every module.
`owned-internal` identifies source-file exports without an effective owned
module exposure; it does not recommend exposing them. `relayed` keeps the
foreign original owner and provider module explicit and never presents the
behavior as implemented by the relaying module.

### `supporting.jsonl`

Each line is one remaining exported type or data original in the same three
roles. Records carry `category`, `hasRuntimeValue`, exposure fields, signature
and source documentation. Keeping these in a separate file makes default
capability searches quiet while retaining ports, request/response types,
schemas and constants for follow-up design and non-behavioral analysis.

### `dependencies.jsonl`

When the daemon-side dependency projection exists, each line represents one
used consumer-module/original dependency. Imported but unreferenced bindings do
not appear. A record contains the consumer, canonical original, classification
(`behavioral`, `non-behavioral` or `unknown`), imported boundary modules,
reference/access counts and bounded evidence identifiers. Two imported
boundaries may therefore be listed on one consumer/original record while the
diagram can still draw two imported-boundary links.

The file is partitioned by consumer module because feature planning starts from
the module being changed. Agents can search all files by `originalOwner` for the
reverse view. Aggregate counts in `module.json` and the visualization must be
derived from these same records rather than independently recomputed.

### Example records

```json
{"module":"ramify/service-api","role":"owned-exposed","originalOwner":"ramify/service-api","file":"subs/service-api/src/project-binding.ts","exportName":"createProjectBinding","exposureNames":["createProjectBinding"],"destinations":["parent"],"shape":"callable","signature":"function createProjectBinding(options: ProjectBindingOptions): ProjectBinding;","documentation":"Own one project's daemon connection, context and subscription, and keep them valid."}
```

The physical prototype includes schema/version fields omitted from this compact
example. Do not invent capability IDs, keywords, descriptions or placement
advice beyond source names, signatures, module purpose, existing source
documentation and measured analysis facts.

## Static classification for provider entries

Use the same deliberately approximate rule as dependency behavior, applied to
the exported original's value type:

| Symbol shape | Provider classification |
| --- | --- |
| Function or callable value | Behavior-capable: `callable` |
| Class or other constructable value | Behavior-capable: `constructable` |
| Value with an application-declared callable first-level member | Behavior-capable: `callable-member` |
| Numeric/string/boolean constant, enum value or data object with no callable member | Supporting symbol |
| Interface or type alias, including one with method signatures but no runtime value | Supporting symbol |
| `any`, `unknown`, unsupported resource or compiler failure | Unknown; explicit coverage, never silently supporting or behavioral |

A value with both callable and data aspects is behavior-capable. A type/value
pair such as a class appears once in the behavior file. Library-provided
members do not qualify a value. Limit recursion and member inspection exactly
as the existing classifier does so provider and consumer classifications do not
drift.

This rule is intentionally not watertight. Its purpose is to make high-recall
symbol discovery practical while keeping the final architectural judgment with
the human or agent. The view must report unknown/truncated counts in metadata
so absence is not treated as proof.

## Agent workflow for a new feature

### 1. Describe required behavior

Split the feature into existing and new behavior in ordinary language. Search
with several domain nouns, verbs and important input/output type names rather
than expecting one canonical phrase.

```sh
rg -n -i '<verb|domain noun|type name>' \
  .exported_symbols -g 'behavior.jsonl'
```

Results are candidates. Inspect the signature, documentation, module purpose
and original ownership before treating one as the required capability.

### 2. Verify availability to the intended consumer

Search the intended consumer's generated foreign API view for the selected
symbol or its signature vocabulary:

```sh
rg -n -i -C 6 '<symbol-or-type>' src/.ramify/{external,children}
```

Use `src/tests/.ramify/` instead for a testing-source consumer. Presence is the
authoritative generated evidence that at least one allowed import form exists
for that source area. Absence is conclusive only when the view's metadata says
coverage is complete and the provider view does not report the candidate as
unknown.

If an existing capability is not available, the feature plan must include the
boundary work. Depending on ownership and intended consumers, that may be:

- exposing an internal original from its owner;
- re-exposing a child capability through the necessary ancestors;
- selecting the appropriate parent or descendants destination and tags;
- importing an already available original through a cleaner existing façade;
  or
- moving the implementation when its current owner is semantically wrong and
  exposure would create an awkward or overly broad contract.

A proposed exposure is not an existing permission. The implementation plan
must name every declaration change and verify the resulting consumer import.

### 3. Place genuinely new behavior

Prefer an existing module when its purpose and nearby behavior match the new
capability, it already owns or can cleanly receive the required collaborators,
and exposing the result to intended consumers does not create a poor dependency
direction.

Consider moving related behavior or creating a new module when several of the
following hold:

- no existing module purpose describes the behavior without stretching it;
- the behavior has a distinct lifecycle, policy or data authority;
- multiple consumers would otherwise depend on an unrelated module;
- the intended contract is a coherent set of operations rather than one
  generic helper;
- counterfactual ownership reduces cross-boundary behavioral dependencies or
  a type-cycle without merely moving the same coupling elsewhere; or
- co-change and internal connectedness support a stable cluster.

Do not create a module solely for one low-level function, solely to improve one
metric, or because no existing symbol name matched the initial query.

### 4. Check the proposed dependency delta

Use the behavioral diagram's imported-module view to reason about the contract
the consumer will name, and its original-owner view to reason about where the
implementation will live. Include non-behavioral dependencies when evaluating
supporting contracts and type cycles. Then use the modularity projection's
candidate ownership mode before moving files when the change is large enough
to merit a counterfactual comparison.

The agent's feature plan should report, for each required capability:

| Field | Required conclusion |
| --- | --- |
| Requirement | Existing or new |
| Candidate symbol | Exact original and signature, or none found |
| Implementation owner | Current or proposed module |
| Consumer | Module/source area that needs it |
| Availability | Available now, boundary change required, or unknown because coverage is partial |
| Boundary action | None, expose, re-expose, move or create module |
| Dependency effect | Expected imported-module and original-owner behavioral links; relevant supporting links |
| Evidence revision | Matching generated revision/input identity |

## Relationship to the visualization and metrics

The agent filesystem view and human browser should share projections, not
scrape each other's output. The filesystem does not need explanatory prose or
human-oriented formatting; the browser does not need to expose the JSONL
storage shape.

| Architectural question | Primary evidence |
| --- | --- |
| What could this module provide? | Provider symbol view, including unused/internal behavior |
| Can module A use symbol X now? | A's `src/.ramify` or `src/tests/.ramify` availability view |
| What behavior does A actually use? | Behavioral dependency facts and diagram |
| Which boundary does A import through? | Imported-module diagram projection |
| Who implements the used original? | Original-owner diagram projection |
| Is a boundary broad, unstable or cyclic? | Modularity metrics and supporting non-behavioral view |
| Would moving files improve the shape? | Candidate-ownership projection |
| Do files historically move together? | Separately provenanced Git change-affinity evidence |

The materialized `module.json` records should consume the same frozen
dependency facts and metric formulas as the explorer. The browser DTO is not a
source contract and should not be serialized to disk. Render both from an
analysis-owned, revision-bound fact model so labels, counts, units and coverage
cannot diverge.

The materialized provider view adds information the diagram deliberately omits:
unused capabilities and internal exports. Conversely, the diagram adds
information a provider inventory cannot infer: actual consumer references and
the imported boundary selected in source. Neither replaces the other.

## Revision, lifecycle and scale

One architecture materialization should synchronize once and publish every
selected generated view from the same completed revision. Metadata needs at
least:

```json
{"schema":"ramify.exported-symbols/2","revision":"rev/1:...","inputId":"...","modules":15}
```

It should also include nonzero coverage, unknown-detail and truncation counts.
An agent combines provider, availability and dependency evidence only when
their revision/input identities agree. A stale view remains readable but must
be described as stale; publication failure preserves the previous complete
tree.

The recommended lifecycle is:

1. the caller explicitly requests architecture materialization;
2. the daemon obtains one synchronized current revision;
3. the retained compiler describes and classifies requested exports;
4. the dependency projection is requested only when dependency/module
   summaries are part of the selected view;
5. pure renderers build bounded generated targets; and
6. the daemon publishes them transactionally and performs no writes for equal
   bytes.

Automatic publication after every daemon revision is not recommended for the
first release. It would turn every edit into compiler-detail work, optional
behavior analysis and filesystem churn, conflicting with the existing
isolation of checks and hooks. If later measurements justify an automatic
mode, it should be debounced background work that yields to checks, never
changes analysis input identity, and advertises its lag explicitly.

As with the implemented API view, generated final and staging paths must be
excluded from inventory, compiler selection, observation and watching before
the view is added. Resource limits refuse the whole selected view instead of
silently omitting symbols. Measure files, bytes, duplicate signature text,
warm latency and peak retained memory on the reference project, Ramify and the
existing scale fixtures.

## Relationship to existing plans

The closest delivery vehicle is Plan 2B, but it should not be implemented
unchanged:

- revise `exported-symbols` around the provider/internal/relay distinction and
  the static behavior-capable classifier above;
- replace prose-oriented output with deterministic `module.json`,
  `behavior.jsonl` and `supporting.jsonl` agent records while reusing Plan 2A's
  bounded signature/documentation provider;
- decide whether tests and module-doc symlinks remain in the same delivery or
  are split so capability discovery is not delayed by unrelated view work;
- refresh its pre-Plan-2A source inventory and resolve its stated Plan 2A
  completion prerequisite before execution; and
- retain the generic registry and transactional publisher, which are the right
  foundations for later architecture views.

At this review, Plan 2B still says that Plan 2A's completion gate must be
recorded before it starts, while the completion-report file named by the
roadmap is absent from this checkout. That prerequisite record and Plan 2B's
pre-completion source inventory must be reconciled before production work.

Capability supply does **not** depend on Plan 6D's UI and can be delivered
after the compiler-owned static classifier and revised generated view exist.
Adding live dependency records and summaries to `dependencies.jsonl` and
`module.json` depends on Plan 6D's per-access
classification and daemon-side dependency projection, but not on its browser
iterations. Plan 6D should hand off its analysis-owned facts for this consumer.

This suggests the following order:

1. Review and revise Plan 2B around code-derived behavior supply, then resolve
   its prerequisite record and execute the provider view.
2. Implement Plan 6D's compiler, analysis and daemon iterations, preserving
   check/hook isolation.
3. Add dependency/module summaries to the generated architecture evidence from
   the same analysis-owned facts.
4. Update project agent instructions with the two-step search-then-availability
   workflow and matching-revision rule.
5. Validate the workflow with feature-planning fixtures, not only generated
   byte snapshots.

## Acceptance scenarios for the eventual plan

At minimum, a delivery plan should independently verify:

- a function, constructable class and object with a callable application member
  appear only in `behavior.jsonl`;
- a number, string, enum, interface and type alias appear only in
  `supporting.jsonl`;
- a library method on an array/string/promise does not make data behavioral;
- a behavior-capable internal export is discoverable but absent from a foreign
  consumer's availability view;
- after a valid exposure change, the same original appears in that consumer's
  availability view without changing original ownership;
- a relayed symbol is searchable at the façade and names its original owner;
- one original imported through two modules retains one headline dependency and
  two imported-boundary facts;
- an unused imported symbol appears in neither dependency summary nor diagram,
  while remaining discoverable in the provider/availability views;
- partial or unknown classification is explicit and absence is not presented
  as proof;
- provider, availability and dependency outputs from different revisions are
  rejected as one coherent architecture snapshot;
- ordinary checks, watch updates and changed-file hooks perform no additional
  classifier, detail or publication work;
- repeated publication from equal facts is byte-identical without invoking an
  agent or language model; and
- a feature-planning fixture finds an existing internal capability, identifies
  the missing exposure, and proposes the boundary change rather than a duplicate
  implementation.

## Decision

Proceed with a code-derived provider view, but call its entries
**behavior-capable symbols**, not declared capabilities. Keep the current
consumer availability view as the authoritative permission check, and reuse
Plan 6D's observed behavioral facts for dependency and placement context.

Treat the generated tree as an agent-only deterministic data interface. Humans
receive the same facts through the explorer's diagrams and detail panel. No
agent generates, annotates or maintains the files.

This gives an agent enough evidence to reason in capabilities without asking
the project to maintain a second ontology. The remaining semantic judgment—
whether a symbol satisfies the feature and whether its present owner is the
right architectural home—stays explicit in the feature plan.
