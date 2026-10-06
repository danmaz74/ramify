# CLAUDE.md - ramify.ts

ramify.ts is a self-contained sub-project that will eventually be extracted
into its own repository. These instructions apply to both Claude and Codex.
cucumber-viz is the external planning/implementation tool and will also become
a *consumer* of Ramify.

## Host-repo rules do NOT apply here

When working under `ramify/`, ignore the usual cucumber-viz rules:

- cucumber-viz architecture documents do not bind this project. Consult them
  when investigating the external tool or adapting a source pattern, rather
  than treating them as Ramify requirements.
- cucumber-viz conventions (barrel/vocabulary surfaces, BEM/plain-CSS UI
  rules, dependency-cruiser rules, audit semantics, feature-test tiers) do
  not apply.

## Authoritative Model Documents

The importability model is defined by these internal documents:

- [Cross-Module Importability Principles](docs/model/cross-module-importability.principles.md)
  defines the foundational commitments.
- [Cross-Module Importability Specification](docs/model/cross-module-importability.spec.md)
  contains the detailed rules.
- [Glossary](docs/model/glossary.md) defines their vocabulary.

Read these before changing the model, its implementation, or its documentation.
The website teaches the model through explanations and examples. It must
conform to these documents, as must the evaluator, diagrams, and other tools.
Keep foundational commitments in principles, detailed rules in specifications,
and vocabulary in the glossary. Both principles and specifications are authoritative.

Change a principles document only when a foundational commitment needs to change
or requires a necessary clarification. Exact model, format and source-interpretation
rules belong in specifications. Tooling scope, CLI behavior and implementation
choices belong in architecture specifications and plans; a definitive tooling
decision does not by itself require a principles edit.

The concrete representation is defined separately in
[Directory Structure And Module Description Specification](docs/model/module-description.spec.md).
It specifies the required `src/` and `subs/` layout, with optional same-owner
`src/tests/` and `src/interfaces/`, and the formal `module.ramify` version 1
language. Modules may occur only beneath `subs/`. The project root's description
is marked `root module <name>`, and `ramify check` climbs to the nearest marked
description. A description may declare nested trees as `owned-unwired`, `owned-nested-project` or
`external`; Ramify does not inventory or analyze them, and an analyzed file
that imports from one violates the boundary unless the import resolves through
a package, which makes it external. The module header classifies
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
effective to-parent contracts. The three forms use the same parent/descendants exposure
channels. Every exposure, including re-exposure, must make the exposed symbol's
signature companions (the project symbols its declared signature names) visible
wherever it makes the symbol visible. Each companion's required-importer tags must
also be tags of the symbol. A violation is an `exposed-without-companion` finding
at the first exposure step that lacks the companion. It fails the check and leaves
the model and every import decision unchanged. Ramify never supplies the missing
exposure, and there is no opt-out. Read the specification before changing discovery, description parsing,
source references, or documentation of the file format. It records the model's
rules; the batch engine implements the version 1 parser and filesystem loader.

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

[TypeScript Source Interpretation Specification](docs/model/typescript-source-interpretation.spec.md)
defines the definitive source interpretation, including testing-source isolation.
Resource ownership and binding identity follow the resolved resource, export
names come from its effective TypeScript export description, and ordinary
exposure and tag rules apply. Read it before designing source import checks.
Unmarked imports of purely type originals receive type-only availability
checks. Explicit namespace and lazy-import member selections check their
selected originals. There is no general ban on symbol-free cross-module loads;
known testing-source restrictions still apply. Definite violations fail;
analysis limits are nonblocking coverage notes by default. Missing or unrun
checker stages cannot pass as completed. The implemented batch checker uses
the project's captured inputs and configured TypeScript resolution.

Module prose lives in `README.md` beside `module.ramify`; a tour reads its first
top-level prose paragraph as a plain-text purpose summary and retains its path.
Missing documentation is explicit, with no fallback to another owner's prose.
README completeness is separate from module-description validity.

[Module Architect Principles](docs/agents/module-architect.principles.md)
define what Ramify gives an agent with a global view of a project's
architecture and what it leaves to that agent; their
[glossary](docs/agents/glossary.md) distinguishes a capability, which an
agent ascribes, from behavioral evidence, which Ramify derives. Ramify's
outputs use behavioral terms only. Read both before designing agent-facing surfaces.

The evaluator, teaching diagrams and toolkit source have migrated to the resolved
tag registry and module-owned `src/tests/`. `npm run check:self` checks all fifteen
toolkit owners, including owned tests. The independent scripts, site and example
have separate compiler scopes. The [iteration 15 completion report](docs/plans/done/iteration-1-project-verifier/iterations/iteration15-results.md)
records acceptance evidence and remaining limitations.

The toolkit audit is defined by the committed root `ramify-audit.json` and runs
from a clean commit with the published `ramify-audit` 0.7.0, installed outside
the repository: `/home/app/tools/ramify-audit-0.7.0/node_modules/.bin/ramify-audit
audit --cwd . --json`. Use `--full` for the release audit. `check:self` and
`check:reference` use disposable batch sessions so an audit leaves no resident
daemon behind. The nested `ramify-agent/ramify-audit.json` defines that
project's own audit, which keeps the agent's installed version; invoke it with
`ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent
--cwd .`.

## Implementation Architecture

The [architecture overview](docs/architecture/README.md) indexes the implementation
design. CLI checks use a lightweight client talking directly to the resident analysis
daemon. `--batch` selects an independent disposable session. Watch, status and
stop use the same client. The installed `ramify` launcher runs a Bun-compiled
client for the host, else the Node entry; the compiled client runs batch analysis
and the daemon in Node, as [optimization](docs/architecture/optimization.md) records.
The planned on-demand tRPC web process for
visualization remains separate.
The later root child `mcp [dispatch]` serves stdio through a lazily loaded
`ramify mcp` mode, using the same daemon client; it is independent of visualization.
Optional MCP HTTP hosting can mount that module in the separate web process.
The daemon excludes MCP/web/development dependencies and follows explicit memory
retention, queue and client-lifecycle limits. Quick tests run real services through
direct adapters, supplemented by actual transport and process tests. The
[CLI invocation contract](docs/architecture/cli-invocation.spec.md) fixes how
`ramify check` selects the project, finds the compiler configuration, reports
project warnings and exits.
Owned compiler source outside every module's `src/` and its owned nested trees,
including `scripts/`, sibling `tests/` or `interfaces/` and loose `subs/` source,
is its nearest module's auxiliary source: it is analyzed under that owner's
ordinary classification even when the compiler configuration does not select
it, and its originals can never be exposed. Other owned files there, apart from
`module.ramify` files and module READMEs, are inert files: Ramify never
classifies them, though one the compiler reads, such as `tsconfig.json` or an
imported data file, is a captured input whose change is rechecked.
Compiler-selected source inside an owned nested tree or a module's scratch
directory produces a warning without failing the check. Discovered stray
`module.ramify` files are layout errors even with valid contents. Other invalid
declarations and invalid exposure paths remain errors. A future
strict project configuration might make project warnings fail a check; its
syntax and scope are undecided.

[Daemon and analysis architecture](docs/architecture/daemon.md) owns the proposed
module tree, engine contracts, isolated contexts and revisioned source analysis.
Read the relevant architecture documents before planning or changing tooling.
Detailed contracts, protocols and measured budgets still require review. These
documents do not supersede the model or establish implemented capabilities.
The [implementation roadmap](docs/roadmap.md) records
its deliverables, prerequisites, contract reviews, acceptance evidence and
the briefs for authoring later plans. Visualization implementation remains later.
The first detailed plan is [batch project verification](docs/plans/done/iteration-1-project-verifier/main-plan.md).
It includes the reference checker and toolkit self-check; it does not implement
the daemon or other runtime clients.

## ramify-agent is a separate project

`ramify-agent/` holds ramify-agent, an agent harness that consumes Ramify. It lives
here during initial development and will move to its own repository. It has
its own [instructions](ramify-agent/AGENTS.md), package, lockfile and compiler scope,
and is its own Ramify project. The dependency points one way: nothing outside
`ramify-agent/` imports from it, names its roles or reads its files, and the toolkit's
`tsconfig.json` excludes it. The toolkit's roadmap, plans and cucumber-viz
workflow do not govern it.

## Conventions that DO apply

- Self-contained package: own `package.json` and toolchain; run npm commands
  from `ramify/`. Never import from cucumber-viz `src/`, and never add
  ramify to the host repo's build, test, or enforcement tooling.
- ESM with `.js` extensions in source imports and strict TypeScript. Put Vitest
  tests in the owner's `src/tests/`; a separately declared testing module may
  keep tests in ordinary `src/` under its complete header profile.
- Model teaching and examples stay application-agnostic. Development guides
  and source-reuse analyses may reference cucumber-viz as an external tool or
  provenance source, without adopting its domain names or conventions as rules.

## Writing conventions

These apply to every document, page and comment, including agent-written
results and docs-maintenance edits:

- A module exposes a symbol to its parent or to its descendants, and the other
  side receives it. Never say grant or route; an ancestor re-exposes what it
  received.
- Up and down describe motion in a picture, never a channel. Descendants are
  the target of exposure; the subtree is the region.
- Say a module's internals, not its inside. Use inside only as a preposition
  or in the inside/outside contrast.
- Say enforced, verified or a rule. Never say checked fact or coin similar
  terms.
- Glossary entries are definitions: one term, one crisp definition. Rationale
  belongs in the principles document.
- Assume common computer-science concepts such as trees, roots and siblings;
  state only what Ramify does with them.
- `.principles.md` files state short, durable commitments. `.spec.md` files
  define precise model or behavioral contracts, including rules, exceptions,
  formats and outcomes. Glossaries define terms; plans describe implementation
  and migration. Document kind does not establish approval or implementation.
- Principle statements stay short. Other documents reference principles
  documents, never the reverse; fold a new principle into the document where
  it belongs rather than adding a file.

## Architect view

`.ramify-architect/` at the project root is the generated, gitignored
architect view; name its path to search it. Its `README.md` opens with:

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

## Development workflow and skills

Use the [development guides](docs/development/README.md) for planning,
implementation, testing and cucumber-viz operations. The index lists the shared
Claude and Codex skills; select the one relevant to the task.

Before implementing in a new Studio execution worktree, run
`npm run worktree:prepare` from that checkout's root to install the example,
site and agent dependencies. Repeat after either package's manifest or lockfile changes.
Studio links only the toolkit's root dependencies; see the
[worktree guide](docs/development/cucumber-viz.md#execute-in-a-worktree).
