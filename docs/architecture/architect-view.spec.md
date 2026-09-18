# Materialized architect view

**Date:** 2026-09-18. **Status:** implemented by
[Plan 2B](../plans/iteration-2b-generated-views/main-plan.md), complete on
2026-09-18, whose contracts refine this specification where it was not yet
concrete; the [review decisions](#review-decisions) are accepted at their
proposed defaults. `ramify materialize --view architect` publishes the view
described below, and the [implementation status](#implementation-status)
records its measured values and the agent trials. Every budget but hit cost
holds. **H1 is falsified on cost:** the toolkit's hit-cost measurement exceeds
the trial thresholds for five of the six terms, and in the trials every core
task was answered correctly from the view on both Claude Code and Codex CLI,
but three core tasks exceeded the per-task hit-cost limit and two the
narrowing limit. The user decided on 2026-09-18 to run the trials despite the
hit cost and to treat it as later performance work. This specification
describes hypothesis H1 of the
[agentic module architect analysis](../analysis/2026-09-18-agentic-module-architect.md): one
generated, searchable directory that gives an architect agent the project's
modules, their behavior-capable symbols, their tests and their observed use,
with no semantic elaboration. It replaces the `.exported_symbols/` and
`docs/modules/` views proposed by the
[Plan 2B draft](../plans/iteration-2b-generated-views/main-plan.md) and takes
over the record shapes proposed in the
[capability-architecture analysis](../analysis/2026-09-17-code-derived-capability-architecture.md).
The hypothesis is tested by the [acceptance evidence](#acceptance-evidence)
and the plan's [agent test cases](../plans/iteration-2b-generated-views/test-cases.md).

## Purpose

An engineering agent works from local data: its own module, its children and
the foreign APIs its module receives. The
[API discovery view](materialized-api-view.spec.md) serves that agent. The
architect agent is the one agent that needs the whole project: which
capabilities exist, who implements them, who may use them, who does use them,
and where a new one belongs. This view serves that agent.

The view is derived documentation. It creates no visibility, availability,
ownership, exposure or dependency. The
[importability principles](../model/cross-module-importability.principles.md)
remain authoritative for those rules, and the
[TypeScript interpretation](../model/typescript-source-interpretation.principles.md)
remains authoritative for original bindings, export names and behavior
classification.

## Hypothesis

**H1.** One directory, stripped of everything that is not an exported
original, a test title or a module description, is enough for an architect
agent using only `Read` and `rg`, provided that:

1. every line `rg` can return from a record file or the map is a
   self-contained record that names its module and its role, so a search
   result is already ranked by what it says, not by which file it came from;
   a line from a `module.json` is identified by its path, which names the
   module;
2. the directory is gitignored, so a project-wide `rg` never sees it and an
   explicit `rg <terms> .ramify-architect/` sees all of it (verified: ripgrep
   skips an ignored directory when walking from the root and searches it when
   the directory is named); and
3. the cost of a hit is bounded by record design, with every text field and
   every list in a record bounded, not by instructions the agent might not
   follow.

H1 does not rely on the agent reading files in a prescribed order. A map file
exists for the questions `rg` cannot answer: placement, and searches whose
terms appear in no name or title.

H1 is falsified, and the split view or a query interface reconsidered, if any
core case of the [trials](#agent-trials) on the toolkit fails, or if the
[hit-cost measurement](#hit-cost) on the reference project or the toolkit
exceeds the trial thresholds because common terms return too many lines.

## Scope

The view contains, for every declared module of one revision:

- the module's identity, tags, source areas, first purpose paragraph and
  documentation paths;
- every exported original the module owns, classified as behavior-capable or
  supporting, with its role, exposure, bounded signature and first
  documentation paragraph;
- the ancestors that re-expose each exposed original, and where to;
- the production modules that reference each original, split by behavioral
  and non-behavioral use, from the same analysis-owned facts and the same
  production source filter as the dependency diagram;
- per-module outgoing and incoming dependency counts; and
- statically extracted test suite, test, feature and scenario titles.

It excludes:

- non-exported code, import statements, call sites and line numbers;
- symbols outside the Ramify application source set;
- same-owner references, which are not dependencies;
- availability to a particular consumer, which the consumer's API view
  answers;
- explanations of how a consumer could be given access, proposed exposure
  declarations and placement suggestions; and
- any synthesized summary, keyword, ranking score or recommendation.

## Location and layout

The view is one directory at the project root:

```text
<root>/.ramify-architect/
├── _meta.json
├── README.md                 # instructions and the module map
├── module.json               # root module
├── behavior.jsonl
├── supporting.jsonl
├── tests.jsonl
├── analysis/
│   ├── module.json
│   ├── behavior.jsonl
│   ├── supporting.jsonl
│   ├── tests.jsonl
│   └── typescript/
│       └── ...
└── service-api/
    └── ...
```

Module directories mirror the declared module tree without the `subs/`
segments, as the Plan 2B draft mapped them. The root module's files live
directly in the view root. Module names match
`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` and contain no dot, so no module directory
collides with a view file. A module with no records of one kind still has that
file, containing nothing but a terminating newline: an empty file is a complete
empty set, and the file's absence is a publication error.

The name `.ramify-architect` is named after the audience, not after a claim:
the view holds behavior-capable symbols, not declared capabilities. The name is
a [review decision](#review-decisions).

## `README.md`

The map is the one file an agent may read before searching. It is named
`README.md` because agents open a directory's README without being told to.
It contains, in this order:

1. a fixed instruction block (the text under
   [agent instructions](#agent-instructions));
2. the revision and input identity of the view; and
3. the module map: one entry per module in tree order, at the module's depth.

A map entry has two or three lines:

```markdown
- **ramify/service-api** [dispatch] — Projects retained analysis reports into the bounded project-explorer service model and hosts a resident, token-free local web server for one project: …
  exposed 5 · internal 9 · supporting 21 · tests 31 · uses 7 · used by 3
  headline: createProjectBinding, createProjectExplorerModel, createExplorerServer, … +2
```

- The first line is the module identifier, its required tags in brackets
  separated by `, ` when any, and its purpose paragraph as `module.json`
  gives it, followed by `…` when cut, or `(no README purpose)`.
- The counts line gives the module's own numbers: its `behavior.jsonl`
  records by role (exposed and internal, `unknown` shapes included), its
  `supporting.jsonl` records, test titles, modules it uses and modules that use
  it. When dependency facts are unavailable the last two read
  `uses ? · used by ?`.
- The headline line lists the first eight exposed `behavior.jsonl` records by
  `name`, in [significance order](#ordering), followed by `, … +N` for the
  rest. It is omitted when the module exposes no behavior.

The instruction block is written as a `text` code fence, and the revision
line reads `Revision <revision> · input <input>`; one blank line follows each.
Map entries are Markdown list items indented two spaces per level below the
root module, whose entry starts at the first column.

The map renders the same facts as the records and adds nothing. A term found
in the map is also found in a record; the duplicate hit is bounded to one
line per module and is labelled by the path `README.md`.

## `module.json`

One pretty-printed JSON document per module, two-space indentation, fixed key
order:

```json
{
  "schema": "ramify.architect-module/1",
  "module": "ramify/service-api",
  "dir": "subs/service-api",
  "parent": "ramify",
  "children": [],
  "tags": ["dispatch"],
  "areas": ["src", "src/tests"],
  "purpose": {
    "state": "present",
    "path": "subs/service-api/README.md",
    "text": "Projects retained analysis reports into …"
  },
  "docs": [],
  "files": { "own": 7, "subtree": 7 },
  "symbols": { "exposed": 5, "internal": 9, "supporting": 21, "unknown": 0 },
  "tests": { "suites": 4, "titles": 31 },
  "uses": [
    { "module": "ramify/daemon", "behavioral": 3, "nonBehavioral": 11 },
    { "module": "ramify/analysis/model", "behavioral": 0, "nonBehavioral": 6 }
  ],
  "usedBy": [
    { "module": "ramify/cli", "behavioral": 2, "nonBehavioral": 0 }
  ],
  "metrics": { "state": "unavailable" },
  "revision": "rev/1:…"
}
```

- `purpose` is `{ "state": "missing" }` when the module has no `README.md`
  first top-level prose paragraph. There is no fallback to another owner's
  prose. `text` is cut at 600 UTF-8 bytes on a character boundary, with
  `"cut": true` beside it when cut; the map shows the same text.
- `docs` lists the module's `src/docs/**` files, project-relative, sorted.
  Their contents are not rendered.
- `files` counts the inventory's source files, TypeScript and JavaScript, in
  the module's own areas, and the same for its subtree.
- `uses` and `usedBy` count distinct originals per module pair, from the
  dependency facts under the production source filter. Unused imports are
  absent. An `unknown` count is present only when nonzero. Both arrays are
  absent, not empty, when `_meta.json` records dependencies as unavailable.
  They are unbounded: `module.json` is read whole, one entry per line, and
  is not a search target.
- `metrics` carries the modularity projection's per-module figures with
  `"state": "measured"` when a delivery includes them, with each ratio as
  numerator, denominator and value. The first delivery may publish
  `"state": "unavailable"` everywhere.
- `symbols` counts the module's `behavior.jsonl` records by role, its
  `supporting.jsonl` records, and, in `unknown`, the behavior records whose
  shape is `unknown`, which the role counts include. `tests` counts its
  `tests.jsonl` records as `suites` and their test and scenario titles as
  `titles`.
- `uses` and `usedBy` entries are ordered by behavioral, then non-behavioral,
  then unknown count, each descending, then by module identifier.
- The root module has `"dir": ""` and `"parent": null`. A present `purpose`
  and each nonempty `uses` or `usedBy` span lines as shown, one entry per
  line; every other array and object is written on one line, with `, `
  between items and a space inside braces.

## `behavior.jsonl`

One line per behavior-capable original the module owns. There is no record for
a relayed original: an original appears once in the project, in its owner's
file, and its record names the ancestors that re-expose it.

```json
{"module":"ramify/service-api","name":"createProjectBinding","role":"exposed","shape":"callable","to":["parent"],"tags":["dispatch"],"reexposed":[{"by":"ramify","to":["descendants"]}],"behavioral":["ramify"],"nonBehavioral":[],"sig":"function createProjectBinding(options: ProjectBindingOptions): ProjectBinding;","doc":"Own one project's daemon connection, context and subscription, and keep them valid.","file":"subs/service-api/src/project-binding.ts"}
```

Fields, in this fixed order:

| Field | Presence | Meaning |
| --- | --- | --- |
| `module` | always | Owning module identifier. |
| `name` | always | Defining-file export name; the byte-least one when the defining file exports the original under several names. |
| `binding` | when `name` is `default` | The original's local binding, when it has one. |
| `as` | when it differs | Exposure names, when the owner exposes the original under other names. At most four; `asMore` counts the rest. |
| `role` | always | `exposed`: the owner exposes it to its parent or descendants. `internal`: exported by a source file, exposed by no module declaration. |
| `shape` | always | `constructable`, `callable`, `member` or `unknown`, by the [classification](#classification) precedence. |
| `to` | `exposed` only | `["parent"]`, `["descendants"]` or both. |
| `tags` | when nonempty | Required tags the importer needs, from the source area's classification. |
| `reexposed` | when nonempty | Each ancestor that re-exposes what it received, and where to, nearest first. |
| `behavioral` | when dependencies are measured | Production modules whose dependency on this original is behavioral: a call, a construction or a callable reference. At most twelve, sorted; `behavioralMore` counts the rest. |
| `nonBehavioral` | when dependencies are measured | Production modules whose dependency is non-behavioral only: type, data or forwarding use. Same bound, `nonBehavioralMore`. |
| `unclassified` | when nonempty | Production modules whose dependency is unknown. Same bound, `unclassifiedMore`. |
| `sig` | when described | Bounded, body-free signature from the compiler. |
| `doc` | when present | First source documentation paragraph, bounded. |
| `cut` | when nonempty | The bounded fields that were cut: `["sig"]`, `["doc"]` or both. A cut overload list counts as `sig`. |
| `detail` | when no signature | Why the compiler gave no signature: `missing-file`, `missing-export`, `identity-mismatch`, `unsupported-declaration` or `compiler-failure`. Counted in `_meta.json`. |
| `file` | always | Project-relative defining file. |

Each consumer module appears in exactly one of the three lists, by the
dependency diagram's classification of the (consumer module, original) unit:
behavioral evidence settles it, otherwise any unknown constituent makes it
unclassified, otherwise it is non-behavioral.

Testing-classified originals carry `testing` in `tags` and are otherwise
recorded like ordinary ones; the API view's testing/ordinary separation is a
consumer concern.

## `supporting.jsonl`

One line per remaining exported original the module owns, with the same
fields except that `shape` is replaced by:

| Field | Meaning |
| --- | --- |
| `kind` | `interface`, `type`, `enum`, `namespace`, `value` or `resource`. A `resource` is a non-code original, such as an imported stylesheet or data file. |
| `value` | `true` when the original has a runtime value; omitted otherwise. |

A class is one record, in `behavior.jsonl`. A supporting original has
`nonBehavioral` and, when nonempty, `unclassified`. `behavioral` is present
here only when the dependency facts classify a consumer's use of it as
behavioral, which the shared classification rule does not produce, so that
such a consumer still appears in exactly one list.

## `tests.jsonl`

One line per suite or feature that has direct tests, holding only those
direct tests, so that every test title appears exactly once and a hit shows
the titles beside it. A suite title is repeated in the `suite` chain of every
record beneath it; that is the price of a self-contained hit:

```json
{"module":"ramify/service-api","file":"subs/service-api/src/tests/project-binding.test.ts","suite":["createProjectBinding","when the daemon restarts"],"tests":["resubscribes to the context","reports the eviction"],"exercises":["ramify/daemon#connectDaemon","ramify/service-api#createProjectBinding"]}
{"module":"ramify/integration-tests","file":"subs/integration-tests/src/features/collection-review.viz.feature","feature":"Collection review","scenarios":["A reviewer approves a collection","A reviewer requests changes"]}
```

- A record's keys are `module`, `file`, then `suite`, `tests`, `exercises`
  and `exercisesMore`, or `feature` and `scenarios`; `feature` is omitted
  when the file has scenarios but no `Feature:` title.
- `exercises` lists the originals the test file references behaviorally, as
  `<owner>#<name>` with the `name` of the original's own record, so that a
  title hit leads to a symbol and one search for the name finds both. It is
  the view's one testing-scope fact. It comes from the same per-file
  behavior facts as the consumer lists, under the testing source filter, and
  includes same-owner originals, since a module's own tests exercise its own
  symbols. Each (test file, original) pair takes the class behavioral if any
  of its references is behavioral, else unknown if any is unknown, else
  non-behavioral; only behavioral pairs are listed, so a file that calls an
  original and also names its type lists it once. Pairs whose class is
  unknown are counted in `_meta.json` as `unclassifiedExercises`, never
  listed. Type and data references are omitted.
- `exercises` is attributed per file: every record of one file carries the
  same list. It holds at most twelve distinct entries in byte order, with
  `exercisesMore` counting the rest, and is `[]` when the file references no
  original behaviorally. An original with no record in the view is left out. It is absent from Gherkin records, and absent from
  every record when `_meta.json` records `"testReferences":"unavailable"`.
  Attribution per suite would need reference locations mapped to suite
  spans and is a later refinement.
- Vitest-style suites are `describe` chains; `it` and `test` are titles.
  Tests outside any suite have `"suite": []`. A suite whose tests all sit in
  nested suites yields no record of its own; a suite with direct tests and a
  nested suite yields one record for each; a suite with neither yields a
  record with `"tests": []`. A record holds at most 40 titles; a longer
  list continues in further records with the same `suite` chain.
- A suite is a call to `describe`, and a test a call to `it` or `test`,
  including their modifier and table forms such as `describe.skip`,
  `it.only` and `test.each(table)`. A file that declares its own binding
  named `describe`, `it` or `test` contributes no calls of that name.
- Gherkin features carry their `Scenario`, `Example` and `Scenario Outline`
  titles, in English keywords only.
- A title that is not a string literal or a template literal without
  substitutions is recorded as `(dynamic)` and counted in `_meta.json`. A
  table title's placeholders, such as `%s`, are kept verbatim. A title
  longer than 240 UTF-8 bytes is cut on a character boundary with a trailing
  `…` and counted in `cut`.
- Test sources are the TypeScript and JavaScript files and `.feature` files
  of every source area whose profile includes `testing`: each module's
  `src/tests/` and the ordinary `src/` of a module tagged `testing`.
  TypeScript and JavaScript titles are read from the revision's compiler
  syntax trees; a file outside the compiler program is counted as
  `testsUnavailable`. A `.feature` file is read only when its bytes still
  match the revision's captured input. Extraction is static and runs
  nothing.

## Ordering

Within a file, records are in this order, each key sorted by UTF-8 byte order:

1. `behavior.jsonl`: `exposed` before `internal`; within a role, by the number
   of `behavioral` modules, including `behavioralMore`, descending, then
   `nonBehavioral` descending, then `name`, then `file`. When dependencies are
   unavailable, by `name`, then `file`.
2. `supporting.jsonl`: `exposed` before `internal`; then `nonBehavioral`
   descending, then `name`, then `file`.
3. `tests.jsonl`: by `file`, then source order of the suite.
4. Arrays inside a record: module identifiers and names sorted; `reexposed`
   nearest ancestor first; `suite` outermost first; `tests` and `scenarios`
   in source order.

Significance is therefore a property of the record, expressed by `role` and
the consumer lists, and only secondarily of position. Ordering by use means a
change in consumers reorders lines; that is acceptable for a gitignored view.

## Record design for hit cost

An `rg` hit returns the whole line. The record shape is chosen so that a
hundred hits cost a few thousand tokens:

- keys are short and fixed; optional fields are omitted, never `null`;
- `sig` is cut at 240 UTF-8 bytes and at four overloads, and `doc` at 280
  bytes, on a character boundary, with the cut recorded in `cut`; full
  signatures remain in the consumer's API view and in the source;
- every list in a record is bounded: consumer lists hold at most twelve
  module identifiers and `as` at most four, each with a `…More` count for
  the rest; `reexposed` is bounded by the module's depth; a test record
  holds at most 40 titles of at most 240 bytes each;
- `file` is last, so a display that truncates long lines loses the least
  searchable text.

A record's length is therefore bounded by a constant independent of project
size, and a map entry by the purpose cut and the headline bound.
`module.json` is the exception: it is pretty-printed for reading, its `uses`
and `usedBy` grow with the project, and a search hit in it is one short line
identified by its path.

The hand-made prototype under `.exported_symbols/` averages 641 characters per
record. The target for this view is a measured mean of at most 300 characters
per behavior record on the toolkit, recorded as evidence, not enforced as a
bound.

## Classification

An exported original is behavior-capable by the compiler's static rule already
used for dependency classification, extracted behind a compiler-owned
operation that classifies defining-file exports directly:

| Original's value type, first matching row | `shape` |
| --- | --- |
| Type with a construct signature, including every class | `constructable` |
| Type with a call signature | `callable` |
| Class, object or namespace value with a declared first-level callable or constructable member | `member` |
| `any`, `unknown`, unsupported resource or compiler failure | `unknown`, in `behavior.jsonl`, counted in `_meta.json` |

The rows are in precedence order: a value with both construct and call
signatures is `constructable`. The three shapes together are exactly the
[behavior-capable symbol](dependency-glossary.md#behavior-capable-symbol) of
the dependency glossary. Everything else exported is supporting. Library-provided members never qualify
a value. Recursion and member inspection follow the existing classifier
exactly so provider and consumer classifications do not drift. Absence from
`behavior.jsonl` is not proof that no behavior exists: `unknown` records and
the coverage counts say how much the rule could not decide.

## Metadata

`_meta.json` is a deterministic single-line JSON document:

```json
{"schema":"ramify.architect-view/1","revision":"rev/1:…","input":"input/1:…","modules":15,"dependencies":"measured","dependencyScope":"production","testReferences":"measured","metrics":"unavailable"}
```

`dependencies` is `measured` or `unavailable`, and `dependencyScope` names
the source filter of the consumer lists, `production` in the first release;
`testReferences` is `measured` or `unavailable` and says whether test records
carry `exercises`; `metrics` is `measured` or `unavailable`. When dependencies
are unavailable, `dependencyReason` names why: `analysis-failed`,
`resource-limit`, `resource-unavailable`, `invalid-current` or `wait-limit`,
and `testReferences` is `unavailable`. Exceptional counts appear only when
nonzero: `unknownShapes`, `cut`, `detailsUnavailable`, `dynamicTitles`,
`testsUnavailable`, `unclassifiedExercises` and `coverage`. `coverage` means
source-analysis limits may have omitted originals. `cut` counts each symbol
with a cut detail once, each cut test, feature or scenario title, and each
cut purpose. Keys appear in the order of the example, with
`dependencyReason` after `dependencies` and `dependencyScope` in both states,
then the exceptional counts in the order listed. Every `module.json` repeats the `revision`.

An agent combines this view with a module's API view only when both name the
same revision. A stale view remains readable and must be described as stale.

## Materialization

```sh
ramify materialize --view architect [--root <dir>]
ramify materialize --view api --view architect [--from <path> | --all] [--root <dir>]
```

`--view` may repeat and accepts `api` and `architect`. Without `--view`, the
command materializes the API view alone, exactly as before. The architect
view is always whole-project; `--from` and `--all` apply to the API view
only. Every target of one invocation is published through one transactional
publisher, with the guarantees the API view already has: one synchronized
valid revision per invocation, staged complete replacement, byte comparison
before writing, `_meta.json` published last, refusal of symbolic links in
the target, and success only when every target is published. An existing
`.ramify-architect` is replaced only when it is recognizably this view: a
directory whose `_meta.json` names the `ramify.architect-view` schema.

Dependency facts come from the analysis-owned facts behind the dependency
diagram, at the same revision and under the same production source filter
the first-release diagram uses: references from `src/tests/` and from
modules tagged `testing` never enter a consumer list, `uses` or `usedBy`.
The testing scope is a separate projection with its own field, `exercises`
in `tests.jsonl`, and is never a union with the production lists. Both come
from the same run of the dependency analyzer over the same per-file behavior
facts, at the same revision. Materialization requests
the facts for the revision it materialized and waits while the analyzer is
busy, up to the analyzer's own deadline. When the context publishes a newer
revision first, the invocation is superseded and publishes nothing. When the
facts are unavailable, or the wait reaches its limit, the view is published
with `"dependencies":"unavailable"`, its reason, no consumer fields and no
`uses`/`usedBy`; it is not refused.

Ordinary `check`, watch updates and changed-file hooks never classify exports,
describe symbols or write this view. Automatic publication is not part of the
first release.

## Generated-output isolation

`.ramify-architect` and its staging siblings `.ramify-architect.tmp-<suffix>`
and `.ramify-architect.old-<suffix>` are reserved names, like `.ramify`: a
path with such a segment anywhere is generated output. Inventory, compiler
selection, capture, observation and watching skip them, so publishing the
view never starts a new revision. The project's `.gitignore` lists `.ramify-architect/`; the reserved
entry protects analysis regardless, and the ignore entry is what keeps the
view out of a project-wide `rg`.

## Agent instructions

The project's `AGENTS.md` must tell the architect agent that the view exists,
is generated, is hidden from ordinary recursive searches and is searched by
naming its path. The view's `README.md` opens with the same block:

```text
This directory is generated by `ramify materialize --view architect`.
It is gitignored and never edited or imported.

Architecture questions are searched here, not in the source:
  rg -n -i '<terms>' .ramify-architect/
Every hit names its module and role: exposed, internal, or a test title.
A test record's exercises names the symbols its test file calls.
For one module, read <module>/module.json, behavior.jsonl and tests.jsonl.
The map below lists every module with its purpose and headline symbols.

Whether module X may import a symbol is answered by X's own
src/.ramify/ view, not by this directory.
If _meta.json records coverage or unknownShapes, absence is not proof.
Refresh a stale view with `ramify materialize --view architect`.
```

No other procedure is prescribed. The block fits in one screen so that it is
read.

## Determinism and bounds

Identical project inputs, registry, compiler configuration, dependency facts
and Ramify version produce byte-identical view contents on every supported
platform. Files use UTF-8, LF and a terminating newline; JSONL has exactly one
record per line; there are no timestamps, host paths or process identifiers.
Two identifiers are the analysis's own, not the view's: the `revision` names
the daemon context's generation, so two daemons' views of the same inputs
differ in that identifier alone, and the `input` identity records the absent
`module.ramify` of each ancestor directory, so copies of one project at
different paths also differ in it. Every other byte is equal.

Bounds a successor plan must measure before freezing, on the reference
project, the toolkit and the S100/S500/S1000 fixtures:

- files, bytes and mean record length per file kind;
- `README.md` bytes, and the largest single `behavior.jsonl`;
- warm materialization latency, with and without dependency facts;
- bytes written for an unchanged repeat; and
- peak retained memory while classifying every export.

A resource limit refuses the whole view and preserves the previous complete
one. No limit silently omits a record.

## Acceptance evidence

### Classification and content

- A function, a constructable class and an object with a callable
  application-declared member appear only in `behavior.jsonl`; a number, a
  string, an enum, an interface and a type alias appear only in
  `supporting.jsonl`; an array's or promise's library methods do not make data
  behavioral.
- An internal behavior-capable export has `"role":"internal"` here and is
  absent from every foreign consumer's API view.
- After a valid exposure change, the same original changes role in place, its
  ownership unchanged, and appears in the consumer's API view.
- An original re-exposed by two ancestors has two `reexposed` entries and one
  record.
- An imported but unreferenced original has empty consumer lists and is still
  present.
- Consumer lists and `uses`/`usedBy` counts agree with the explorer's
  dependency diagram for the same revision under the production filter; a
  reference from a module tagged `testing` or from `src/tests/` enters no
  consumer list, `uses` or `usedBy`.
- A test file that calls an original lists it in `exercises`, including a
  same-owner original; a test that only imports a type does not; a file that
  calls an original and names its type lists it once; the original's own
  consumer lists are unchanged by the test.
- A module without a README purpose paragraph records `"state":"missing"`.
- Test and scenario titles each appear exactly once; a suite with direct
  tests and a nested suite yields one record for each, the nested record
  repeating the outer title in its chain; a dynamic title is `(dynamic)` and
  counted.

### Isolation and determinism

- Identical inputs produce identical check reports, revision sequences and
  session counters with and without interleaved materialization.
- `rg <term>` from the project root returns no line from the view;
  `rg <term> .ramify-architect/` returns every matching line.
- Two materializations from equal facts are byte-identical; Linux and macOS
  agree.

### Hit cost

For a fixed list of terms including `revision`, `project`, `session`,
`publish`, `watch` and `create`, on the reference project and the toolkit,
record the hit count per file kind, the mean and maximum hit line length and
the total bytes returned. The trial thresholds are 200 lines and 64 KB per
term on either corpus; a term over either threshold falsifies H1 as stated
in the [hypothesis](#hypothesis). The measurement from the toolkit source on
2026-09-18 is the baseline: `project` matches 1,077 source lines, 95 export
declarations and 65 test titles.

### Agent trials

Before the successor plan freezes bounds, run eight architect tasks on the
toolkit with an agent restricted to `Read` and `rg`, with the view materialized
and the instruction block in place:

1. four discovery tasks, two whose terms appear in a symbol name and two whose
   terms appear only in a test title or documentation paragraph;
2. two placement tasks for a described capability that does not exist; and
3. two refactoring questions about a module's incoming and outgoing use.

Record, per task: tool calls, hit lines and bytes returned, whether the
correct module and original were found when they exist, whether a placement
or refactoring answer matches its key, and whether `README.md` was opened.
H1 stands only if every core task passes its key, no task needs more than
three narrowing searches, no task reads the source to answer, and no task
returns more than 300 hit lines or 64 KB in total. The
[test cases](../plans/iteration-2b-generated-views/test-cases.md) fix the tasks and their keys. The
trial transcript is evidence for the plan's contract review.

## Implementation status

Plan 2B iteration 8 measured the implementation on 2026-09-18 with the installed
CLI and the real daemon, on isolated copies of the reference project and the
toolkit and on the S100 fixture, each from the project root, and iteration 9
measured it again on the fixed build. The values below are iteration 9's; the raw
values are in [`plan2b-measurements.json`](../plans/iteration-2b-generated-views/evidence/plan2b-measurements.json),
and the [iteration 8 results](../plans/iteration-2b-generated-views/iterations/iteration8-results.md)
record the method.

| Budget | Limit | Measured |
| --- | --- | --- |
| Architect session query, toolkit | 15 s | 0.64–0.81 s hot; 1.70 s after the compiler was released |
| Whole `materialize --view architect`, warm, toolkit, analyzer included | 90 s | 8.64–8.93 s; 14.7 s with a new daemon and context |
| Unchanged repeat | 0 bytes | 0 bytes on all three projects |
| View size, toolkit | 8 MiB | 812,267 bytes, 62 files |
| `maxProjectionBytes` | 64 MiB | 1,206,867 bytes, toolkit |
| `maxArchitectBytes` | 64 MiB | 812,267 bytes, toolkit |
| Dependency wait | 250 ms, 125 s | as configured |
| Hit cost per term | 200 lines, 64 KB | exceeded on the toolkit; see below |
| Mean behavior record, toolkit (evidence) | 300 characters | 402.1 characters, longest 793 |

Hit cost of `rg -n -i <term> .ramify-architect/`, lines and bytes of output:

| Term | Toolkit lines | Toolkit bytes | Reference lines | Reference bytes |
| --- | ---: | ---: | ---: | ---: |
| `revision` | 187 | 114,298 | 54 | 21,860 |
| `project` | 549 | 325,296 | 0 | 0 |
| `session` | 214 | 125,847 | 22 | 9,499 |
| `publish` | 118 | 85,058 | 1 | 682 |
| `watch` | 40 | 23,517 | 0 | 0 |
| `create` | 202 | 148,011 | 37 | 16,469 |

On the toolkit a hit line averages 588–733 bytes, because a record carries its
bounded signature, documentation paragraph and consumer lists; a `tests.jsonl`
record reaches 2,763 characters with forty titles and its `exercises`. Test
records return the most bytes for every term, narrowly ahead of
`supporting.jsonl` for `project`; by lines, `supporting.jsonl` or
`behavior.jsonl` lead for `revision`, `project` and `session`. The reference
project stays within both thresholds for every term.

| Project | Files | Bytes | Records | Mean record, behavior / supporting / tests |
| --- | ---: | ---: | ---: | --- |
| Reference | 62 | 85,337 | 123 | 486.7 / 483.7 / 388.0 characters |
| Toolkit | 62 | 812,267 | 1,595 | 402.1 / 440.6 / 761.2 characters |
| S100 | 402 | 292,872 | 1,100 | 187.8 / 181.8 / no test titles |

The largest toolkit `behavior.jsonl` is `analysis/behavior.jsonl`, 50,571
bytes; the toolkit's `README.md` is 9,295 bytes. Peak combined RSS of the
daemon, its worker and its compiler was 1.07 GiB on the toolkit, 459 MiB on the
reference project and 462 MiB on S100.

Iteration 9 fixed two gaps these runs found; its
[results](../plans/iteration-2b-generated-views/iterations/iteration9-results.md)
record the witnesses:

- **Invocation changes.** When another invocation form reaches a context, such
  as a check from the project root followed by `materialize --root <root>` from
  another directory, the context republishes its revision for that invocation.
  The dependency analyzer now acquires with the request the revision's inputs
  were captured with, the one the context's session was opened with, so the
  materialization measures its dependencies; on the toolkit it took 8.9–9.0 s.
- **Generated directories at session open.** The retained compiler's directory
  listings omit the reserved names, so a resident session opened while views
  exist records none of them and has a batch check's input identity.

Known gap:

- **Platforms.** Byte identity is measured on Linux only; no macOS host was
  available.

### Trial results

Plan 2B iteration 10 ran the [test cases](../plans/iteration-2b-generated-views/test-cases.md)
on 2026-09-18 against the toolkit's view at one revision, in a copy of the
repository without the plan and this specification, once per task and harness:
Claude Code with `claude-opus-5`, restricted to `Read`, `Grep` and single `rg`
commands, and Codex CLI with `gpt-6-astra` in a read-only sandbox. The
[iteration 10 results](../plans/iteration-2b-generated-views/iterations/iteration10-results.md)
record the method, the keys and the evidence; the transcripts and
[scores](../plans/iteration-2b-generated-views/evidence/trials/scoring.md) are
beside the plan.

| Core criterion | Claude Code | Codex CLI |
| --- | --- | --- |
| Every core task passes its key | 8 of 8 | 8 of 8 |
| At most three narrowing searches | failed: D3 and P1, 4 each | held: at most 1 |
| No source read | held | held |
| At most 300 hit lines and 64 KB per task | failed: D2, 306 lines and 100,542 bytes | failed: D2, 349 lines; R1, 78,162 bytes |

The extended set gave Claude Code 5 pass and 1 partial, and Codex CLI 4 pass
and 2 partial, with no source read. H1 is therefore falsified by cost, not by
answers. Three findings bear on the record design:

- **Module-identifier searches.** Searching for a module's identifier returns
  every record of that module, because each line names its module, and every
  consumer list and `exercises` entry naming it: up to 158 lines and 89,431
  bytes in one search. The same answers are in the module's `module.json`.
- **Long lines.** Claude Code's Grep replaces a matching line over 500
  characters with a placeholder: 288 of 611 matched lines in the trials. 593 of
  the toolkit's 1,595 records are longer, 78% of test records among them.
- **Cut signatures.** A cut class signature can hide members, so one agent
  would not answer a negative question.

Hit cost, record length and a query interface or split view are later work:
the user's performance work, and Plans 4 and 7.

## Review decisions

1. **Name.** `.ramify-architect/`, or another audience-named directory.
2. **Internal originals in the same file** as exposed ones, labelled by
   `role`, rather than a separate `internal.jsonl` that path-filtering could
   exclude.
3. **No relayed records**; `reexposed` on the owner's record instead.
4. **Headline bound** of eight names per module in the map.
5. **Cut lengths** of 240 characters for `sig` and 280 for `doc`.
6. **Metrics** optional in the first delivery.
7. **Waiting for dependency facts** during materialization rather than
   publishing without them and refreshing later.
8. **Production-only consumer lists** in the first release, matching the
   diagram's source filter; test references appear only as the separate
   `exercises` field.
9. **List and purpose bounds**: twelve module identifiers per consumer list,
   four exposure names, 600 characters of purpose.
10. **Trial thresholds** of 200 lines and 64 KB per term, and 300 lines and
    64 KB per task.
11. **Test references per file**, behavioral only, twelve entries, rather
    than per suite or including type references.

## Relation to the roadmap

[Plan 2B](../plans/iteration-2b-generated-views/main-plan.md) delivers this
view. It replaces the `.exported_symbols/` and `docs/modules/` views of the
earlier Plan 2B draft and takes only what the architect view needs from that
draft's foundations: a reserved name, a publisher that accepts a project-root
target beside the API view's targets, a `--view` selection and a static
test-title reader. The draft's restorations of Plan 2A's analysis changes,
its general view registry and its re-hosting of the API view are not part of
this delivery; this view's own invariance is verified directly. It consumes
Plan 6D's dependency facts and the compiler's behavior rule. Access
explanations for a consumer/original pair and ranked search over large
projects are not part of this view; they belong to the Plan 4 MCP adapter and
the Plan 7 query work. The [trials](#trial-results) found the view sufficient
for every core answer and insufficient on cost, so their evidence is handed to
those plans.
