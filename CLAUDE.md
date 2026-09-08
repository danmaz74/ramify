# CLAUDE.md - ramify.ts

ramify.ts is a self-contained sub-project that will eventually be extracted
into its own repository. cucumber-viz will become a *consumer* of it.

## Host-repo rules do NOT apply here

When working under `ramify/`, ignore the usual cucumber-viz rules:

- Do **not** check `docs/architecture/key-decisions.md`,
  `docs/architecture/modularization/`, or any other cucumber-viz
  architecture doc - none of them bind this sub-project.
- cucumber-viz conventions (barrel/vocabulary surfaces, BEM/plain-CSS UI
  rules, dependency-cruiser rules, audit semantics, feature-test tiers) do
  not apply.

## Authoritative Model Documents

The importability model is defined by two internal documents:

- [Cross-Module Importability Principles](docs/model/cross-module-importability.principles.md)
  contains the complete rules.
- [Glossary](docs/model/glossary.md) defines their vocabulary.

Read these before changing the model, its implementation, or its documentation.
The website teaches the model through explanations and examples. It must
conform to these documents, as must the evaluator, diagrams, and other tools.
Keep the authoritative rules in the principles document and the vocabulary
in its companion glossary.

Change a principles document only when its model, format or source-interpretation
rules need to change or require a necessary clarification. Tooling scope, CLI
behavior and implementation choices belong in architecture documents and plans;
a definitive tooling decision does not by itself require a principles edit.

The concrete representation is defined separately in
[Directory Structure And Module Description Principles](docs/model/module-description.principles.md).
It specifies the required `src/` and `subs/` layout, with optional same-owner
`src/tests/` and `src/interfaces/`, and the formal `module.ramify` version 1
language. Modules may occur only beneath `subs/`. The module header classifies
ordinary `src/`, including interfaces; the nested `src/tests/` area uses its
fixed testing profile: `testing` plus all required-importer tags in the module
header, without inheriting required-symbol tags. There is no `tests tagged [...]`
declaration or other test-profile override. Tests needing additional tags belong
to a separately declared testing module under `subs/`, with test code in its
ordinary `src/` so the full module header applies. It needs ordinary exposure
and tag compatibility to access another owner's exports. Test discovery and
production exclusions must account for testing modules as well as `src/tests/`.

`expose-src` names owned exports relative to `src/`; `expose-test` does the same
relative to `src/tests/`. An `expose-src` path may also select nested testing
source without changing its original classification. `expose-src *` selects all
exports of one explicitly named file beneath the owner's `src/interfaces/`;
it is invalid for files elsewhere, and `expose-test` accepts named selections
only. Directory placement alone exposes nothing. Expansion preserves original
ownership and tags, rejects foreign-owned exports, and includes added exports.
`expose-sub` names direct children and permits wildcard selection of their
effective upward contracts. The three forms use the same parent/descendants exposure
channels. Read the specification before changing discovery, description parsing,
source references, or documentation of the file format. It records the model's
rules; the current toolkit does not yet implement the filesystem loader or parser.

One resolved registry defines tags for the entire evaluation. Ramify fixes
two kinds: required importer and required symbol. The default registry defines
`testing`, `ui`, and `dispatch` as required importer, and `browser` as required
symbol. Projects may add names of either kind; matching and propagation must
depend on kind, not tag names. Only `testing` is structurally reserved and
cannot be removed or rebound. New owned exported bindings must carry all
required-importer tags of their original defining source area;
forwarding aliases retain their original binding's ownership and tags. Source
without testing classification cannot import or re-export testing-classified
source, including same-owner access and forwarding paths. Other same-owner
imports retain their exemption from exposure and symbol-tag checks. No per-file
or glob classification overrides are part of this model.

[TypeScript Source Interpretation Principles](docs/model/typescript-source-interpretation.principles.md)
defines the definitive source interpretation, including testing-source isolation.
Resource ownership and binding identity follow the resolved resource, export
names come from its effective TypeScript export description, and ordinary
exposure and tag rules apply. Read it before designing source import checks.
Unmarked imports of purely type originals receive type-only availability
checks. Explicit namespace and lazy-import member selections check their
selected originals. There is no general ban on symbol-free cross-module loads;
known testing-source restrictions still apply. Definite violations fail;
analysis limits are nonblocking coverage notes by default. Missing or unrun
checker stages cannot pass as completed. No TypeScript source checker is
implemented yet.

Module prose lives in `README.md` beside `module.ramify`; a tour reads its first
top-level prose paragraph as a plain-text purpose summary and retains its path.
Missing documentation is explicit, with no fallback to another owner's prose.
README completeness is separate from module-description validity.

The existing evaluator and examples predate the tag registry and the distinct
classification of module-owned `src/tests/`. Updating these specifications does
not establish implementation support; runtime, evaluator, and source-layout
migration work must be explicitly scoped separately.

## Implementation Architecture

The [architecture overview](docs/architecture/README.md) routes the implementation
design. The process split is decided: a lightweight CLI talks directly to the
resident analysis daemon; a separate on-demand tRPC web process serves later
visualization. Batch CLI execution uses a fresh session of the same engine.
The later root child `mcp [dispatch]` serves stdio through a lazily loaded
`ramify mcp` mode, using the same daemon client; it is independent of visualization.
Optional MCP HTTP hosting can mount that module in the separate web process.
The daemon excludes MCP/web/development dependencies and follows explicit memory
retention, queue and client-lifecycle limits. Quick tests run real services through
direct adapters, supplemented by actual transport and process tests. The
[CLI invocation contract](docs/architecture/cli-invocation.md) fixes how
`ramify check` selects the project, finds the compiler configuration, warns
about files outside modules and exits.
Compiler-selected files outside every module's `src/`, including sibling
`tests/` or `interfaces/` and loose `subs/` source, produce warnings without
failing the check. An owned import targeting them is an outside-scope analysis
limit, never an allowed import or an external package. Discovered stray
`module.ramify` files are layout errors even with valid contents. Other invalid
declarations and invalid exposure paths remain errors. A future
strict project configuration might make the outside-source warnings fail a
check; its syntax and scope are undecided and it is not part of Plan 1.

[Daemon and analysis architecture](docs/architecture/daemon.md) owns the proposed
module tree, engine contracts, isolated contexts and revisioned source analysis.
Read the relevant architecture documents before planning or changing tooling.
Detailed contracts, protocols and measured budgets still require review. These
documents do not supersede the model or establish implemented capabilities.
The [implementation roadmap](docs/plans/tooling-architecture/README.md) records
all six deliverables, prerequisites, contract reviews, acceptance evidence and
the briefs for authoring later plans. Visualization implementation remains later.
The first detailed plan is [batch project verification](docs/plans/iteration-1-project-verifier/main-plan.md).
It includes the reference checker and toolkit self-check; it does not implement
the daemon or other runtime clients.

## Conventions that DO apply

- Self-contained package: own `package.json` and toolchain; run npm commands
  from `ramify/`. Never import from cucumber-viz `src/`, and never add
  ramify to the host repo's build, test, or enforcement tooling.
- ESM with `.js` extensions in source imports; strict TypeScript;
  vitest tests co-located as `src/**/*.test.ts`.
- Documentation and examples must stay generic - no cucumber-viz domains or
  references in ramify docs or the site.
