# Iteration 1: Verify a real Ramify project

**Date:** 2026-09-07. **Status:** Detailed implementation plan for review.
No checker implementation or passing conformance evidence is established by
this document. This is one delivery iteration and one plan; the numbered work
steps below are tasks within it, not additional delivery iterations.

## Deliverable and completion boundary

Deliver a reusable batch analysis engine and an executable CLI that read the
actual Collection Review application, validate its descriptions, and check
its source imports against the definitive Ramify rules.

From the Ramify package directory, the installed CLI must support:

```sh
ramify check --batch examples/collection-review
ramify check --batch examples/collection-review --format json
```

The first command reports findings for humans; the second returns the same
result as structured data. Both finish and release their analysis resources.
Neither starts a daemon, MCP server or web server.

Completion requires a clean reference check, independently expected negative
and positive variants, verification of Ramify's own migrated source, and
preservation of the existing application, diagrams and website. A loader that
only accepts descriptions, or a model test over a constructed tree, does not
complete this iteration.

The resident daemon remains iteration 2. This engine is its future analysis
implementation. Module inspection, MCP, overlays and the explorer build on the
same identities, facts and decisions in later iterations.

## Authority and supporting documents

| Document | Role |
| --- | --- |
| [Importability principles](../../model/cross-module-importability.principles.md) and [glossary](../../model/glossary.md) | Definitive ownership, visibility, tags, source areas and testing-origin rules. |
| [Module-description principles](../../model/module-description.principles.md) | Definitive layout, version 1 grammar, exact paths, wildcards and README convention. |
| [TypeScript interpretation](../../model/typescript-source-interpretation.principles.md) | Definitive original resolution, resource identity, source forms and coverage policy. |
| [Architecture](../../architecture/README.md) and [daemon design](../../architecture/daemon.md) | Ownership boundaries, reusable engine, coherent inputs and later resident service. |
| [Processes](../../architecture/processes-and-clients.md), [memory](../../architecture/memory-lifecycle.md) and [quick testing](../../architecture/quick-testing.md) | Entry-point separation, resource cleanup and real-service verification. |
| [Tooling roadmap](../tooling-architecture/README.md) | Delivery order across the six iterations. |
| [Reference cases](../reference-project/cases.md), [contract map](../reference-project/contract-map.md) and [harness](../reference-project/harness.md) | Independent expected outcomes, actual exposure witnesses and mutation discipline. |

This plan selects implementation scope and evidence; it does not revise the
model. If a source example conflicts with a principle, diagnose and review the
example. Do not weaken the checker or broaden exposure to manufacture a pass.

## Starting point

The planning inspection on 2026-09-07 established the following from the
current files. Recheck them at implementation start because other work can
continue independently.

- [Collection Review](../../../examples/collection-review/README.md) has fifteen
  owners, each with a description and purpose README. It has real tRPC and MCP
  adapters, React views, two CSS-module resources and owned tests. Its standalone
  `integration-tests [testing, dispatch]` owner keeps the Cucumber scenario and
  support code in ordinary `src/`, reached through root's testing-only exposure.
- Its source uses configured aliases, ESM `.js` substitution, an internal
  forwarding alias for `AppRouter`, type imports, a literal dynamic import
  selecting `ReviewPanel`, an import-type query, CSS imports and a Cucumber
  hook loaded for its side effects.
- [The harness inventory](../../../scripts/reference-harness/cases.ts) contains
  63 families: four available, 56 absent and three deliberately unsupported.
  The available families are D01–D03 and K05. A dry-run inventory was inspected;
  this plan does not claim that their runtime tests were rerun.
- [The report](../../../scripts/reference-harness/report.ts) prints a hand-reviewed
  zero-violation statement and explicitly says source coverage is absent. It
  does not invoke a Ramify source checker or execute source mutations.
- [The evaluator](../../../src/model/) operates on constructed trees and
  predates the complete registry/source-area model. Existing useful algorithms
  and tests are migration inputs, not the specification.
- [The diagrams](../../../src/viz/) and site depend on the old source layout.
  The root barrel currently combines model and UI exports.
- The current toolkit compiler/test configuration targets `src/`. It must be
  deliberately migrated to the nested ownership tree.

## Scope decisions

### Included

1. The complete version 1 description grammar and structural validation.
2. A generic resolved registry, default definitions, source classifications,
   canonical original identities, explicit symbol tags and exposure evaluation.
3. Project acquisition, real compiler-backed source/export resolution,
   interface wildcard expansion and the bounded ESM source forms listed below.
4. Batch checking, explanation evidence in diagnostics, machine-readable
   reports, capability reporting, cancellation and disposal.
5. A reference mutation runner with an explicit iteration-completion command.
6. The toolkit's declared layout, owned tests, necessary diagram/site migration
   and a required batch self-check.
7. Basic module metadata acquisition, including README purpose and missing
   documentation state. This is engine data; interactive inspection is later.

### Scheduled later or outside this checker

| Capability | Treatment in this iteration |
| --- | --- |
| Resident daemon, local IPC, watching, incremental invalidation and retained history | Iteration 2. Review the engine boundary now; no empty daemon/context runtime is needed to pass this plan. |
| Interactive inspection, contract rendering, search and graph aggregation | Iteration 3. Preserve their underlying facts now. |
| Ramify MCP serving | Iteration 4. The example's MCP source is ordinary checker input. |
| Overlays, edits and conflict resolution | Iteration 5. Read-only batch analysis does not edit project source. |
| Explorer, Express/tRPC hosting and extracted visualization | Iteration 6. Existing teaching diagrams continue to work. |
| Registry configuration serialization and a user-facing default-replacement syntax | Remain unspecified. The CLI uses the default registry; the library and tests accept one resolved registry. |
| Vite glob expansion, Jiti target resolution, compiled-entry source mapping and arbitrary loader integrations | No adapter is promised here. Detect relevant unsupported access, preserve known checks and report coverage. |
| Exhaustive namespace/data-flow analysis, CommonJS interpretation and shared-global ownership | Follow the source specification's bounded coverage treatment. |
| Browser-promise verification, cycles, bundling and project-specific API policies | Separate responsibilities. Browser tag matching is included; a browser-closure proof is not. |
| Reference design probes P01–P06 | Remain non-normative and outside this completion gate. |

### Source scope and project selection

The selected root is explicit. Do not search upward for another application or
use the host repository as a fallback. The compiler configuration defaults to
the selected root's `tsconfig.json`; `--project <file>` selects an explicit
alternative, resolved relative to the invocation directory.

The project acquisition contract separates:

- Discovery roots and exclusions.
- Application implementation, owned tests/helpers and resources.
- Compiler configuration, declarations and external resolution dependencies.
- Independent tooling or project scopes.

For the default CLI selection, inventory every owned `src/` and all its nested
test areas; include application resources even when TypeScript describes them
through a shared shim. Validate the rest of the non-excluded discovery tree for
misplaced descriptions and loose source beneath `subs/`. Do not let compiler
`include` or `exclude` silently remove an owned file from checking. If an owned
source file cannot be analyzed with the selected configuration, report that
fact explicitly.

Repository configuration files can be compiler inputs without being application
source. Step 1 must record the exact configuration/tooling files for the two
target projects and the evidence for their scope. Arbitrary application code
outside `src/` cannot be excused as configuration merely because of its name.

Support repeatable `--exclude <relative-path>` for explicitly independent
projects/tooling and generated/dependency paths. These are exact file or
directory exclusions relative to the application root, not per-owner
classification globs. Reject root escape and excluding the selected description
or the entire application. Show all effective exclusions in the report.
Default generated/dependency exclusions and their matching rules must be
enumerated in help and frozen in the step 1 review.

For Ramify's self-check, `examples/`, `site/` and the explicitly independent
`scripts/` tooling scope are separate from toolkit runtime ownership.
Document each exclusion and test that an import back into excluded primary
application source is not silently classified as an external package.

No check creates a missing `src/`, repairs declarations, loads application
entry points or runs a project configuration script. Empty owners are valid
inventory entries; source-directory creation belongs to authoring tools.

## Implementation ownership and migration

The full initial architecture has eleven owners across batch and resident
delivery. Nine have implementation in this iteration; `daemon` and
`daemon/contexts` arrive with iteration 2.

```text
ramify [dispatch]
├── analysis []
│   ├── model [browser]
│   ├── descriptions [browser]
│   ├── project []
│   └── typescript []
├── presentation [ui, browser]
│   └── layout [browser]
└── cli [dispatch]
```

Each edge is physically a `subs/` edge. Each implemented owner gets
`module.ramify`, a purpose `README.md`, `src/`, and owned tests in
`src/tests/`. The root header is `module "ramify" tagged [dispatch]`.

| Owner / physical directory | Work and public contract responsibility |
| --- | --- |
| Root `./` | Assemble the CLI and lazy batch engine. Own the dispatch-facing invocation/result mapping. Keep CLI entry code out of a UI/model barrel. |
| `subs/analysis/` | Compose acquisition, export facts, descriptions and rules into a disposable analysis session and plain-data snapshot/report. Own analysis input identity and stage/capability outcomes. |
| `subs/analysis/subs/model/` | Pure identities, registry validation, source profiles, mandatory tags, visibility, availability and testing-origin decisions. Expose portable operations and vocabulary. |
| `subs/analysis/subs/descriptions/` | Parse the grammar and link descriptions against supplied inventory/export data. No filesystem or compiler runtime dependency. |
| `subs/analysis/subs/project/` | Read and validate paths, inventory ownership/source areas, supply coherent file bytes and extract README metadata. |
| `subs/analysis/subs/typescript/` | Own compiler objects and resolution caches. Return export/original/resource and source-access facts; keep compiler objects inside the adapter. |
| `subs/presentation/` | Existing diagram definitions, presentation-specific model preparation, components and interaction. Consume the current model through legal relays. |
| `subs/presentation/subs/layout/` | Framework-independent geometry and layout vocabulary. Accept neutral inputs rather than importing `ui`-classified parent types. |
| `subs/cli/` | Parse arguments, invoke an injected batch operation, format output and select the process exit code. Own no checking algorithm. |

The future daemon may adapt this analysis session to the already-planned
`AnalysisDriver` port. Neither analysis nor its children import a root
dispatch contract. `model` and `descriptions` remain portable browser
modules; filesystem and compiler functions do not enter their runtime closure.

### Exposure rules for the migration

- Model operations and needed vocabulary travel through analysis, then root,
  then to the declared consumers. Root relays model contracts unchanged.
- Analysis children expose only the contracts analysis needs. Data exchanged
  between siblings travels through analysis assembly or explicit legal relays;
  physical sibling access is not permission.
- New types stay with the owner of their meaning: model decisions, project
  inventory/metadata, TypeScript facts, analysis reports and layout geometry.
  Do not add a general shared-vocabulary owner.
- Root can declaration-relay presentation contracts without importing UI values.
  Remove UI source re-exports from dispatch-only root source.
- Layout defines its neutral inputs itself. Presentation can supply them, but
  layout cannot import a newly owned parent `ui` type.
- Explicitly promise `browser` on exported values required by browser
  consumers. Header placement alone does not assign that promise.
- Interface-file wildcards select only owned originals. Every foreign type a
  consumer must name needs its own legal route, even when mentioned in a
  function signature.
- Root/CLI tests derive `[testing, dispatch]`; portable model/descriptions/layout
  tests derive `[testing]`; presentation tests derive `[testing, ui]`.
  Node ambient types for a test compiler configuration do not change Ramify tags.

### Source move map

Complete the file-by-file map in step 1, using the following assignments.
The map must account for every current source/test/barrel, including removals.

| Current files | Target / required treatment |
| --- | --- |
| `src/model/{tree,tags,availability}.ts` and their tests | Model owner; adapt semantics and canonical identities, preserving independently useful cases. Tests move under its `src/tests/`. |
| `src/model/index.ts` | Replace or narrow to a model-owned entry. A barrel remains optional and does not grant exposure. |
| `src/viz/{geometry,viewport}.ts` and geometry-only helpers | Layout owner, with its own neutral vocabulary and tests. |
| `src/viz/layout*.ts`, `tree-diagram.ts`, `focus-diagram.ts` | Split source-dependent diagram preparation into presentation and geometry computation into layout. Review dependencies before moving whole files. |
| `src/viz/diagram-definition.ts`, `model-access.ts`, `validate.ts`, `diagrams/*`, React components and theme | Presentation owner; adapt teaching fixtures and model access to the definitive evaluator. Move tests to the owner of the behavior they assert. |
| `src/viz/index.ts` | Replace with selected presentation/layout package surfaces and legal original-owner exposure. No automatic foreign wildcard claims. |
| `src/index.ts` | Replace the combined application barrel with separate declared entry files and package exports. Update internal consumers explicitly. |
| `scripts/emit-diagrams.ts` and reference harness | Keep an explicitly independent build/test-tool scope using supported package surfaces. Do not disguise runtime implementation as tooling. |
| Site alias, TypeScript paths and page imports | Point to the migrated presentation/model surfaces. Keep compiler/Node assembly out of the browser bundle. |

Separate package entries must cover the CLI executable, reusable analysis and
portable model/presentation consumption. Package exports target the relevant
owner's files; they need not re-export every value through root source.
Because this is a private pre-release package, update repository consumers
instead of retaining an incompatible combined entry merely for its old name.

## Analysis path and contract review

### Required data flow

```text
CLI arguments
  -> injected batch operation / root assembly
  -> disposable analysis session
  -> explicit scope + coherent file input view
  -> validated registry + discovered layout + parsed descriptions
  -> compiler-backed complete export/original catalog
  -> owned tags + exact selections + grounded exposure contracts
  -> source access occurrences + testing-origin paths
  -> model decisions + diagnostics + coverage
  -> immutable analysis result
  -> CLI formatter / reference assertions
```

Parse errors can be collected before exports exist. Linking must wait for
source-derived originals and export completeness. Source checking must wait
for valid registry, ownership and linked exposure prerequisites. An invalid
prerequisite produces an explicit invalid result with dependent stages marked
blocked; it cannot produce a partially valid permission graph.

### Proposed contract shapes

Step 1 produces exact TypeScript definitions, signatures and exposure manifests
before implementation. The following requirements constrain those definitions;
names can change together with this plan's contract map.

| Contract | Owner | Required information / behavior |
| --- | --- | --- |
| `ResolvedTagRegistry` | model | Validated names, fixed kinds, optional descriptions and stable registry identity. Immutable within a run. Default construction and validation of caller-supplied definitions use the same rules. |
| `ModuleId`, `SourceArea`, `OriginalId` | model | Declared tree identity, ordinary/testing classification, and distinct code/resource originals. Alias spelling and compiler-internal IDs are not identity authorities. |
| `ProjectInputView`, `ProjectInventory` | project | Explicit real root, application files/resources, discovery exclusions, configuration dependencies, source roots, content identities and reads from the captured view. |
| `ParsedDescription`, `LinkedDescriptions` | descriptions | Source locations, exact references, expanded name/original pairs, destinations, explicit tag assignments and declaration evidence. Invalid state is explicit. |
| `SourceCatalog`, `SourceAccess` | typescript | All relevant exports, including unexposed ones; original declarations; value/type existence; actual accessed target; forwarding-origin path; written form; selected binding form; unresolved/unsupported facts. |
| `ImportDecision` | model | Allowed/denied reason, importer area, original, applicable tags and exposure/origin evidence. Evaluate source-origin restrictions before same-owner exemptions. |
| `AnalysisSnapshot`, `AnalysisReport` | analysis | Input identity, stage execution, capabilities, scope, inventory, expanded contracts, accesses, decisions, compiler diagnostics and coverage. Plain immutable data. |
| `AnalysisSession` | analysis | Analyze supplied disk inputs, support cancellation and release compiler/input state on disposal. Iteration 1 publishes one completed batch result per invocation. |
| `BatchInvocation`, `BatchResult` | root | Dispatch-facing arguments and result mapping over the analysis contract; injected into CLI without leaking dispatch into the engine. |

Keep the initial session factory usable outside the CLI. Accept one resolved
registry and an explicit project/scope configuration. Provide a direct service
binding for tests using the real session. CLI output formatting must consume
the same completed report the harness receives.

Review the installed TypeScript package's supported program, export, alias,
resolution and declaration APIs with small executable probes. Select and
document the compiler integration dependency before building the adapter.
Do not assume that the installed version exposes a particular historical API.
Resolution must reproduce the target project's configured semantics.

### Coherent inputs and later reuse

Use one input view for discovery, descriptions, resource existence, compiler
reads and analysis. Capture file contents and retain content identities for
configuration and other influencing inputs. Detect changes during acquisition;
retry the whole affected acquisition within a finite policy or return an
explicit incomplete result. A batch identity describes captured input bytes,
not a claim to be the latest filesystem state at command exit.

No watcher, retained context generation or historical lookup is implemented in
this iteration. Reserve those identities in the future service design; do not
invent daemon revision tokens for batch runs. Return a batch run/input identity
that cannot be confused with another root, scope, configuration or registry.

Results retain ownership, source references, expanded exposure evidence,
observed accesses and decision provenance. Preserve the accessed file separately
from the original binding's defining file. Those facts support later queries and
visualization without a second analyzer. Optional signatures, metrics and graph
projections can be added later without changing basic check outcomes.

Compiler programs, symbols, AST nodes, file handles and mutable caches must not
escape in result objects. A caller retaining a report must not retain an entire
compiler session through a hidden reference.

## Required interpretation and diagnostic behavior

### Descriptions and model

Implement the complete documented grammar rather than a regex for the reference
files. Preserve token/statement locations. Exercise BOM/CRLF, comments, quoted
reserved names, escaped strings, version checks and rejection of unknown syntax.

Owned source references use exact decoded file paths with the specification's
normalization, containment, exclusions and symlink checks. TypeScript extension
substitution and aliases apply to source imports, not to `expose-src` paths.

Resolve every owned exposure to a canonical original. Defaults and explicit
assignments apply to that original's defining area, including unexposed exports,
resources and new wrappers/type aliases. Forwarding aliases retain their
original identity and tags. Explicit assignments for the same original must
agree and retain required-importer tags.

Expand interface-file and child-contract wildcards from complete current export
facts. Preserve empty expansions, default exports where specified, aliases and
collision rules. Reject foreign originals or incomplete expansion rather than
dropping inconvenient members. Statement order must not change results.

Expose-sub resolution uses direct children's declared names and their effective
upward contracts. Evaluate exposure independently from whether the relay's own
source could import the original.

### Source forms

The required bounded profile includes the following. Each row gets real source
fixtures, not only evaluator inputs.

| Form | Required behavior |
| --- | --- |
| Named/default imports; named forwarding exports; local forwarding aliases | Resolve originals and classify each selection separately. Preserve original/source-area identity through renames. |
| Statement-level and inline `type`; unmarked purely type bindings | Apply type availability correctly. An unmarked class, function or merged runtime binding still requests a value. |
| Static namespace direct members, literal keys, explicit destructuring and qualified types | Check identifiable originals only; adding an unrelated private export cannot broaden the selection. |
| Source star and namespace re-exports, including type-only variants | Check the forwarding file's whole specified selection; distinguish star's default exclusion from namespace export's default inclusion. |
| Literal dynamic import member access, awaited namespace/destructuring and direct `.then` selections | Follow the bounded forms in the source principles. In particular support the reference's `.then(panel => ({ default: panel.ReviewPanel }))`. |
| Import-type expressions and supported JSDoc import types in TypeScript-analyzed source | Recognize AST type position; these are type requests, not dynamic runtime loads. |
| Side-effect and empty imports/re-exports; discarded dynamic imports | No invented symbol exposure requirement. Resolve known targets and apply testing-origin isolation. |
| CSS-module/resource bindings and JSON with a known effective export description | Resource path establishes ownership/identity; the description supplies export names. One shim does not merge distinct resources. |
| External packages and built-ins | Establish external scope from resolution; do not infer it merely from a bare specifier or resolution failure. |
| Unknown keys, namespace escape, nonliteral imports, unsupported macros/loaders and other specified limits | Retain explicit coverage notes, continue known checks, and never convert unknown access to allowed or external. |

A known missing resource in an exposure declaration is invalid input. A source
import whose resource target cannot be established is unverifiable; selecting
a missing name from a known effective export description is a missing-export
error. Keep these outcomes distinct even if a broad shim satisfies TypeScript.

### Reports and exit behavior

The proposed CLI contract is:

| Invocation/result | Behavior |
| --- | --- |
| `check --batch <root>` | Full batch path, all owned source areas, human report. |
| `--format json` | One versioned JSON result on stdout; operational logging on stderr. No banner mixed into JSON. |
| `--project <file>`, repeatable `--exclude <relative-path>` | Explicit compiler setup and scope; effective choices appear in both formats. |
| `--help`, `--version` | Complete without loading the compiler, React, MCP or web stacks. |
| `check <root>` without `--batch` before iteration 2 | Explain that resident checking is unavailable and how to request batch mode; do not silently pretend to connect to a daemon. |
| Unsupported commands or requested capabilities | Explicit unavailable/usage result. No implied inspection, watch, MCP or browser verifier support. |

Agree the exact package entry filenames in step 1. The intended executable is
`dist/src/cli-entry.js`, with a Node shebang and package `bin.ramify`.
The ordinary entry imports CLI handling only; dispatch lazily imports the batch
assembly. The build preserves the nested owner paths.

Use these process outcomes unless contract review identifies a concrete problem:

| Exit | Meaning |
| --- | --- |
| 0 | Requested checking completed; no definite violations or invalid inputs. Explicit nonblocking coverage notes are allowed. |
| 1 | Definite import violations, invalid descriptions/registry/layout, known missing exports, or compiler errors. Compiler findings remain separately identified. |
| 2 | Invalid invocation, required capability unavailable, acquisition/execution failure or resource limit preventing completion. |
| 130 | User interruption; no successful check result is claimed. |

Where execution fails after findings were obtained, retain those findings but
return incomplete execution and exit 2. Never choose exit 0 from a zero-length
diagnostic list without checking stage completion.

The report schema must include a schema version; requested root/configuration/
scope/registry; input identity; requested and executed capabilities; per-stage
execution; validity/check outcomes; source findings; compiler diagnostics;
coverage notes; and summary counts. A blocked source stage is not an allowed
source result. Diagnostics include location, stable reason/category, original
owner/binding or resource where known, importer area, and relevant declaration
locations. Use deterministic ordering and repository-relative locations within
each reported scope; do not serialize compiler cycles or unstable internal IDs.

The human formatter shows failures first and states the completed scope.
The reference gate applies a stricter, explicit capability/fixture requirement
than the ordinary CLI's nonblocking coverage policy.

## Reference acceptance matrix

Every row below is required. Its subcase names are stable executable instance
suffixes, for example `I1-06:remove-hop`. Every listed subcase must be reported
separately; the row is complete only when all its subcases run and assert their
own expected result. Parameterized syntax variants must likewise retain
separate execution records. Exact fixture edits and importer locations are
recorded during step 1 without changing the expectations below.

Use existing source and exposure statement IDs from the reference contract
map. Add fixture files only to isolated copies or small independent programs;
do not contaminate the clean running application with forbidden imports.

| ID | Reference families | Required subcases and independently expected outcome |
| --- | --- | --- |
| I1-01 | L01, O05, D04–D05, R01–R02 | `baseline`: discover exactly the fifteen declared owners, including the standalone testing module, check every owned implementation/test source and resource access, and resolve the authored positive imports. Root receives adapter factories; shared vocabulary reaches its consumers; private exports remain catalogued. |
| I1-02 | L01–L02, L07 | `missing-root`, `invalid-child`, `duplicate-name`, `description-in-src`, `loose-subs-source`, `sibling-tests`, `sibling-interfaces`: each malformed layout is invalid with the responsible path and no guessed ancestor ownership. |
| I1-03 | L03–L04, H01 | `empty-owner`: retain its ID and intended source root without writing files; `grouping-move`: same declared parent/name preserves ID; `rename` and `reparent`: IDs change, with no invented historical migration. |
| I1-04 | L05–L06 | `syntax-valid`: comments, quotes, BOM/CRLF and legal reserved-name forms parse; `syntax-invalid`: bad version/clauses, semicolons and test-profile declarations fail; `exact-path`: no extension/alias probing; `escape`, `symlink-root`, `symlink-description`, `symlink-reference`: reject; `symlink-directory`: do not traverse. |
| I1-05 | L05, E05–E06 | `missing-file`, `missing-export`, `name-collision`, `conflicting-tags`: invalid; `same-original-repeat`: harmless merge; `statement-permutation`: identical semantic result; `named-growth`: an unselected added export stays private. |
| I1-06 | E01–E04, D04 | `remove-hop`: remove W2's catalog-router relay while keeping root's import, and diagnose the missing route; `restore-hop`: same source passes; `relay-only`: browser workspace may relay a server original; `source-forward`: an incompatible workspace value re-export fails. |
| I1-07 | E03, R01–R02 | `deeper-descendant`: a newly declared nested consumer receives the existing downward route; `reverse-task-controller`: task cannot import controller `tick`; `validation-runtime`: outside validator cannot import runtime behavior/types; `parent-private`: parent cannot import child-private helper. |
| I1-08 | E05, T06 | `import-rename`, `exposure-rename`, `same-owner-forward`: original identity/tags unchanged; `same-spelling`: unrelated originals stay distinct; `new-wrapper` and `new-type-alias`: new bindings receive their defining area's tags. |
| I1-09 | E07 | `equivalent-names`: C1 wildcard equals explicit selection of every export; `add-export` and `remove-export`: repeated fresh runs update C1/W1 contracts; `unselected-file`: remains private; `signature-only-type`: not auto-exposed; `empty-file`: valid empty contract; `default`: included. |
| I1-10 | E08 | `nested-interface`, `testing-module-interface`: valid wildcard targets; `implementation`, `tests-interface`, `helpers-interface`, `normalized-outside`, `directory`, `glob`, `test-wildcard`: invalid targets/forms. |
| I1-11 | E09 | `owned-alias` and `resource-alias`: preserve originals; `foreign-forward` and `ambiguous-expansion`: invalidate whole expansion; `required-tag-omission` and `assignment-conflict`: invalid; `cross-selection-collision`: distinguish repeated same original from distinct originals; `literal-star-name`: differs from a wildcard. |
| I1-12 | T01–T02 | `ui-value` and `ui-type`: a core importing visible SU1 originals is denied for missing ui; `dispatch-value` and `dispatch-type`: core/pure UI importing a visible dispatch original is denied; `tag-without-route`: adding a tag does not repair absent exposure. Establish visibility before testing a tag-specific denial. |
| I1-13 | T03 | `browser-value`: foreign unpromised value denied; `explicit-type` and `unmarked-interface`: otherwise authorized imports allowed; `unmarked-class` and `merged-runtime`: value check required; `same-owner`: tag exemption retained after origin check. Use compiler-valid syntax/configuration. |
| I1-14 | T04–T05 | `renamed-kinds`: equivalent decisions with project-defined tag names; `conjunction`: all applicable requirements hold; `unknown`, `duplicate`, `invalid-kind`, `remove-testing`, `rebind-testing`: invalid registry/uses; `two-evaluations`: no registry leakage. Supply the resolved registry through the library API. |
| I1-15 | T05, O01, O04–O05 | `derived-profile`: testing plus header required-importer tags only; `child-profile`: independent of parent; `test-looking-file`: ordinary source outside the special area; `nested-helpers-tests`: no testing classification; `own-private-test`: allowed; `foreign-private-test`: denied. |
| I1-16 | O02–O03, T06 | `foreign-fixture`: declared K2/A4/W3 route allows review tests; `remove-fixture-hop`: denies foreign tests while own tests still pass; `production-value`, `production-type`, `production-side-effect`: own/foreign testing source denied; `testing-barrel` and `production-forwarding-test`: forwarding cannot bypass origin isolation. |
| I1-17 | O06–O07 | `production-tagged-testing`: same-owner ordinary access allowed, foreign production denied; `separate-testing-module`: header controls ordinary source, no parent-private access; `testing-module-browser`: foreign values need browser promises; `nested-tests`: derived profile drops browser. |
| I1-18 | S01, T06 | `js-substitution` and `path-alias`: same resolved originals; `AppRouter-forward`: root original preserved; `named-default`: correct export identity; `source-types`: both type modifiers retain coupling restrictions; `application-alias`: never classified external merely because it is a bare alias. |
| I1-19 | S01–S03 | `namespace-members`, `literal-key`, `destructure`, `qualified-type`: selected originals only; `private-growth`: no broadened selection; `unknown-key` and `escape`: partial coverage; `known-denial-plus-escape`: still fails for the known denial. |
| I1-20 | S02–S03 | `source-star`, `type-star`, `namespace-export`, `type-namespace-export`: correct forwarding checks and default membership; `downstream-selection`: does not narrow a star re-export; `no-declaration`: source forwarding alone creates no Ramify exposure. |
| I1-21 | S01–S03 | `reference-lazy`, `await-member`, `await-destructure`, `then-member`, `then-destructure`: literal selected binding checks; `import-type`, `typeof-import-member`, `typeof-import-namespace`: type-only checks with no runtime load; `nonliteral-target`: explicit coverage note. |
| I1-22 | S03, O03, K05 | `hook-side-effect`, `empty-import`, `empty-export`, `discarded-lazy`: known ordinary/testing-eligible loads need no dummy symbol; `inline-type-statement`: preserve source-origin checking independently of its type request; `testing-target`: non-testing load denied even without selected symbols. |
| I1-23 | S04–S05, O03 | `two-css-resources`: distinct identities under the shared shim; `resource-alias`: same resource identity; `missing-resource`: source coverage note, but an exposure to it is invalid; `missing-resource-export`: known missing-name error; `json-binding`: actual resource owns its exports; `testing-style`: origin guard applies. |
| I1-24 | S06–S07 | `external`: proven package/builtin scope; `unresolved`, `unsupported-macro`, `unsupported-commonjs`: visible limits; `partial-clean`: completed bounded check may exit 0; `partial-denied`: same notes plus definite denial exit 1; `compiler-error`: separate compiler category. |
| I1-25 | H03, DA13 | `purpose`: first top-level prose paragraph and README path; `missing-readme`, `no-paragraph`: explicit missing state, no fallback and no importability failure; `readme-edit`: new batch metadata with unchanged permission results. |
| I1-26 | DA01, DA14, DA16, PC01, QT01 | `human-json`: same semantic result; `missing-stage`: cannot pass; `failed-resolver`: incomplete/blocked, not empty success; `browser-verifier-request`: unavailable while ordinary browser-tag matching remains supported; `help-version`: no compiler/UI/server load. |
| I1-27 | DA18, QT01, QT03 | `self-check`: migrated toolkit descriptions and implemented source pass the same engine; `self-negative`: deliberately forbidden toolkit import detected; `cancel`, `read-failure`, `dispose`: resources released and no late success; `report-retention`: plain result does not retain compiler state. |
| I1-28 | DA01, DA14, PC01, QT01 | `compiled-cli-clean`, `compiled-cli-denied`, `compiled-cli-invalid`, `compiled-cli-unavailable`: real subprocess exits/output match the documented contract; `no-servers`: no listeners/daemon launch; `relocated-package`: build and installed executable work without the enclosing repository. |
| I1-29 | L01, S06–S07 | `explicit-root`: another fixture or ancestor does not enter analysis; `excluded-owned-target`: cannot become an allowed external import; `scope-report`: config/tooling/external boundaries are visible; `changed-input`: captured-view consistency or explicit acquisition failure, never mixed-state success. |
| I1-30 | D01–D03, K05, K07 | `reference-regression`: existing application/protocol/Cucumber tiers still run; `test-discovery`: all migrated owner tests and the standalone testing-module fixture are discovered; `production-selection`: excludes testing-classified source and retains ordinary interfaces; `harness-required`: deleting or disabling a required instance fails the completion gate. |

The matrix exercises only the stated portions of each reference family. For
example, I1-23 does not implement compiled-source mapping from S05, and I1-30
does not establish all browser/instrumentation variants in K07. H01/H03 cover
inventory and metadata, not an implemented host lifecycle or write-authority
adapter. DA13 and wildcard changes are tested by repeated fresh batch runs here;
incremental invalidation is iteration 2 evidence.

K01–K04/K06 browser/tool execution, H02's interactive contract surface, H04,
the remaining parts of the composite families, the probes and separate policies
retain named pending/out-of-scope entries. Never mark a whole family passed
because one instance in this matrix passed.

## Harness implementation and evidence

Extend the existing harness rather than creating a second checker.

1. Keep the family catalogue and its authority classifications.
2. Add instance records identifying the matrix ID/subcase, required capabilities,
   fixture/root/config/registry, exact mutation, independent expectation and
   expected coverage.
3. Separate capability availability from execution and coverage. Derive execution
   from actual assertions, not a hand-edited availability flag or a successful
   example build.
4. Keep pure model tests, but make reference source assertions consume the real
   acquisition/parser/compiler/linker/checker result.
5. Copy the application into a unique ignored `.reference-work/` directory,
   excluding dependencies, build outputs and previous copies. Resolve its own
   installed dependencies from the example. Select the copied root explicitly.
6. Each negative starts from a checked baseline. Apply one recorded cause and
   assert the relevant reason, importer/source area, original and useful location.
   Access negatives should remain valid TypeScript; intentional parser/compiler
   negatives record that different expectation.
7. Run mutations independently, restore by deleting only the owned temporary
   copy, and support an explicit preserve-on-failure switch. Concurrent runs must
   not share mutation directories.
8. Every required subcase needs executable evidence. If the capability is absent,
   the completion gate fails; no unconditional skips or silent omission.
9. Keep `reference:report -- --dry-run` as an inventory, never an execution proof.
   Replace its hand-written violation total with checker-derived results only
   when the checker actually ran.
10. Persist a portable completion report containing revision/build identity,
    command, scope, capabilities, individual outcomes, diagnostics/coverage,
    durations and retained pending work. Do not record machine-specific secrets
    or full dependency inventories as report noise.

Required commands to add during implementation:

| Command from the Ramify root | Meaning |
| --- | --- |
| `npm run check:reference` | Invoke the compiled batch CLI on the unchanged example with the reviewed scope. |
| `npm run check:self` | Invoke it on the declared toolkit tree and reviewed independent-scope exclusions. |
| `npm run reference:verify -- --iteration 1` | Require every I1 instance and its capabilities, execute the matrix and fail on missing/failed assertions. |
| `npm run reference:report` | Run/report current supported tiers and retain the pending inventory. This alone is not the iteration gate. |
| `npm run reference:cases` | Validate family/instance inventory integrity, pointers and gate membership. |

The iteration manifest is verification data: it enumerates expected evidence,
not a second module language or permission registry. It must not derive expected
allowed/denied outcomes by calling the model under test.

## Work sequence

Each step has a concrete output and an exit condition. All belong to this single
iteration. Review changes to the agreed contract package before relying on them;
do not silently change a public boundary during implementation.

### Step 1 — Freeze scope, contracts and migration

- [ ] Re-inventory the current reference and toolkit files, commands, dependencies
  and case records; record the revision and intentional independent scopes.
- [ ] Expand the migration table into a complete file-by-file mapping.
- [ ] Draft every implemented owner's complete description and purpose README.
  Include source paths, original identities, tags, every foreign signature type,
  exposure routes and intended consumers in a contract map.
- [ ] Write exact library/session/report/CLI signatures and the package export map.
  Draft the future session-to-context-driver boundary without implementing IPC.
- [ ] Run focused compiler API probes on source aliases, unmarked interfaces,
  merged runtime bindings, wildcard exports and the two CSS resources.
- [ ] Freeze source-selection defaults, configuration inputs, exclusions, compiler
  integration choice, error/exit schema, finite work limits and fixture subcases.
- [ ] Present the concrete package for architecture/contract review before code
  migration or checker implementation. This preserves the user's request to
  approve architecture before implementation; drafting this plan does not grant
  approval to an unresolved contract change.

Exit: the implementation has reviewed boundaries and exact expected evidence.
There are no unresolved baseline semantics hidden behind a generic TODO.

### Step 2 — Migrate the package into its declared owners

- [ ] Move source/tests according to the reviewed map and introduce owner files.
- [ ] Split package entries and remove the combined root UI source barrel.
- [ ] Adapt build/test paths for nested `subs/` and owned `src/tests/`.
- [ ] Keep production browser/portable compilation separate from Node
  implementation/test ambient types. Do not solve Node compilation by granting
  Node ambient types to all portable production source.
- [ ] Update site aliases, diagram emission and repository consumers to legal
  surfaces; adapt diagram fixtures where the old model representation changed.
- [ ] Validate descriptions by the manual checklist until the new loader exists.
  Keep current tests, diagram outputs and site behavior working.

Exit: the package builds and tests in the target layout, and its declared
contracts are reviewable. Automated conformance is still explicitly pending.

### Step 3 — Implement the definitive pure model

- [ ] Introduce canonical identities and source-area-aware importer descriptors.
- [ ] Validate resolved registries, derive profiles and mandatory symbol tags.
- [ ] Adapt grounded exposure evaluation, aliases, name collisions and provenance.
- [ ] Apply testing-origin restrictions and then same-owner/tag rules.
- [ ] Port meaningful model/diagram expectations and add independent rule cases,
  including generic tag names and source-tag versus source-origin distinctions.

Exit: model behavior has independent positive/negative evidence. No filesystem
or source coverage is claimed by constructed-tree tests.

### Step 4 — Acquire and parse real projects

- [ ] Implement read-only explicit-root discovery, scope inventories, path and
  symlink checks, empty-owner metadata and coherent file acquisition.
- [ ] Implement the version 1 tokenizer/parser with located diagnostics.
- [ ] Extract README purpose data with explicit missing states.
- [ ] Add parser and real filesystem fixtures, including malformed placements
  outside otherwise valid owner source areas.

Exit: real descriptions and inventories are read correctly. Source grounding
remains a separate uncompleted stage until step 5.

### Step 5 — Resolve originals and link exposure contracts

- [ ] Build the compiler adapter over the captured input view and project config.
- [ ] Catalog exposed and unexposed exports, canonical originals, source areas,
  value/type existence, aliases, forwarding paths and resource descriptions.
- [ ] Resolve resources independently of their shared ambient shim.
- [ ] Link named owned/child selections and interface/child wildcards; validate
  assignments, completeness, foreign ownership and collisions.
- [ ] Establish the baseline's expanded contracts against the hand-reviewed map.
- [ ] Run required loader/export/wildcard mutations through real files.

Exit: the reference and toolkit descriptions are grounded in actual source
exports; no consumer-source checking is inferred from that success.

### Step 6 — Interpret accesses and produce batch analysis

- [ ] Implement every required source-form row against real compiler facts.
- [ ] Preserve origin checks for forwarded and symbol-free access.
- [ ] Evaluate located requests through the model and produce immutable reports.
- [ ] Track stage completion, invalid inputs, compiler errors and source coverage
  independently; stop dependent stages on invalid prerequisites.
- [ ] Implement cancellation, finite acquisition/work bounds and disposal.
- [ ] Run the source/tag/testing/resource matrix through the reusable session.

Exit: real project analysis succeeds through the public engine API, and known
negative mutations yield the expected findings.

### Step 7 — Deliver the CLI and activate the reference gate

- [ ] Add lazy batch dispatch, readable/JSON formatting and documented exits.
- [ ] Test real CLI handlers with an injected real session and temporary inputs.
- [ ] Add focused subprocess tests for compiled entry, output, exits, interruption,
  disposal and absence of server startup.
- [ ] Add instance execution and `reference:verify -- --iteration 1`.
- [ ] Ensure missing instances/capabilities fail the gate and unsupported reference
  work remains visible without being treated as a passing assertion.

Exit: a developer can install/run the command and verify the reference from its
files; the gate is reproducible without an enclosing application service.

### Step 8 — Self-check, regression, portability and delivery evidence

- [ ] Run the same checker over every implemented toolkit owner/source area.
  Review and fix real violations; do not exempt toolkit internals from rules.
- [ ] Execute an independent toolkit negative mutation in addition to reference
  negatives, retaining explicit self-check coverage.
- [ ] Run all commands in the validation section and review their evidence.
- [ ] Measure cold checks and repeated session creation/disposal; confirm that
  retained reports do not retain compiler sessions.
- [ ] Perform a relocated install/build/test/CLI smoke run outside the enclosing
  repository, using this package's own dependencies and lockfile.
- [ ] Update implementation-status guidance and command documentation to the
  delivered scope. Keep unimplemented daemon/MCP/browser capability claims false.
- [ ] Record gate membership, executed outcomes, remaining family instances and
  limitations in the completion report.

Exit: every completion condition below has evidence. Implementation is ready for
the next iteration without a throwaway checker or hidden alternate model.

## Validation and completion conditions

Run the following in the migrated Ramify package; script additions above are
implementation tasks, not commands claimed to exist today.

```sh
npm run build
npm run type-check
npm test
npm run reference:cases
npm run check:reference
npm run check:self
npm run reference:verify -- --iteration 1
npm run reference:report
npm run diagrams
npm run site:build
git diff --check
```

The reference report must continue running the example's type-check, Vitest
tests, Vite build and real Cucumber scenario. Those are regression evidence,
separate from architectural assertions. Capture their actual results rather
than quoting the old README test totals.

Review regenerated diagrams and teaching pages after model migration. Preserve
intended decisions and visible behavior; byte equality is expected only where
neither data nor rendering changed. A site build alone cannot establish diagram
semantics or browser portability.

Use real-session CLI workflows for quick tests. Use unit tests for model/parser
edge cases and focused real filesystem/subprocess tests for paths, framing,
scope, cancellation and executable behavior. No browser or HTTP server is needed
for every import mutation.

Agree finite file/input/work and report handling limits in step 1 using measured
fixture sizes; scope/page or fail explicitly when an operation cannot complete.
Do not silently truncate diagnostics and report complete coverage. Measure cold
latency, peak memory and repeated create/check/dispose behavior on the reference
and a 100-owner fixture. Numeric budgets and the supported workload are recorded
before the iteration is accepted. Add a checked-in real-session setup fixture for
the [memory probe](../../../scripts/memory-probe.mjs) and a repeated
create/check/dispose workload; retain input fixtures, runtime/dependency versions
and raw results with acceptance evidence. The
[probe recipe](../../architecture/memory-lifecycle.md#repeatable-setup-measurements)
separates setup/disposal samples from peak and repeated-use measurements.
Multi-context history/queue/lease measurements remain iteration 2 work.

The iteration is complete only when all of these hold:

- [ ] The unchanged reference has all fifteen owners and every required baseline
  source construct checked; application-owned baseline access is not hidden by
  an unsupported-form note. Proven external dependencies are reported separately.
- [ ] Every required I1 subcase ran and asserted its independent expectation.
  Syntax variants and positive controls are not collapsed into a false family pass.
- [ ] Invalid inputs, denied imports, compiler errors, analysis limits and
  unavailable execution have the documented distinct outcomes.
- [ ] The compiled CLI, direct API and harness agree on semantic findings.
- [ ] All implemented toolkit runtime code and owned tests are declared and
  checked; independent tools/site/example scopes are explicit.
- [ ] Current application/protocol/Cucumber, toolkit, diagram and site regression
  checks pass with reviewed changes.
- [ ] Package entries preserve portable/Node/UI boundaries and ordinary CLI
  startup avoids optional heavy dependencies.
- [ ] Cancellation, failures, repeated use and disposal meet the agreed limits;
  no runtime server is necessary to run the delivered checker.
- [ ] A relocated install/build/run works independently of the enclosing repo.
- [ ] The completion report records executed capabilities, source scope/coverage,
  pending family instances and the next iteration's requirements.

## Risks and implementation decisions to settle early

| Risk | Required response inside this plan |
| --- | --- |
| Compiler API or resource-resolution behavior differs from assumptions | Resolve with step 1 probes and a reviewed adapter contract before committing to extraction code. Use the project's actual resolution inputs. |
| Canonical identity follows aliases or shim symbols incorrectly | Assert identities directly on AppRouter forwarding and the two CSS resources, then across the negative fixtures. |
| A broad wildcard implementation manufactures a partial valid contract | Make export completeness and original ownership explicit linker prerequisites. |
| The legacy diagram model resists the new registry/source-area representation | Adapt presentation fixtures at the migration boundary; keep the definitive model as the sole rule authority. |
| Layout migration imports ui-owned vocabulary into portable geometry | Define neutral inputs in layout and adapt from presentation; review exact exposure and value/type routes. |
| Self-checking gives false confidence | Require independently expected reference and toolkit negatives, plus real compiled-entry checks. |
| Scope exclusions or coverage notes conceal unfinished checking | Freeze baseline scope and required forms; enforce them in the strict iteration gate. |
| Contract work starts implementing later services | Review future compatibility at the engine boundary; keep daemon, MCP, overlays and explorer runtime out of this deliverable. |

Do not add persistent caches, worker pools, a configuration language or an
alternative source checker to resolve schedule pressure. If a required case
cannot be implemented within the agreed scope, report the specific unfinished
capability; changing the iteration gate requires an explicit plan revision.
