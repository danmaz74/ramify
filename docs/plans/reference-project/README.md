# Reference project: Collection Review

**Date:** 2026-09-06. **Status:** Initial implementation plan. No application,
new rule, package installation, or checker implementation is delivered by this
document. [Case catalogue](cases.md) and [harness plan](harness.md) complete it;
the [implementation plan](implementation.md) sequences Phase 1 and the start of
Phase 2 into iterations.

## Objective and acceptance criterion

Create a small, runnable project under `examples/collection-review/` that serves
as an example, a reference for authoring modules, and a regression subject while
Ramify's evaluator, filesystem loader, source checker, and integrations develop.

Use one coherent application for the successful design. Apply small temporary
variants for failures and competing designs. Every known requirement should have
a named witness or an explicit separate responsibility; it need not become a new
application feature or module.

The target is useful architectural guidance for humans and agents. Keep normal
Vite, lazy loading, hook/style initialization, and programmable configuration
working. Unanalysed runtime paths may be reported without failing a bounded
check. There is no requirement to prevent runtime workarounds or prove complete
runtime isolation.

## A deliberately small application

The screen shows two fixed catalog records: one has a valid two-revision history;
the other has a missing predecessor. A **Review** button runs one deterministic
review and renders its findings. No database, agent, repository, background
scheduler, authentication product, or persistence is needed.

The same capabilities have two native API surfaces:

- **tRPC:** `catalog.get` and `reviews.run`, with an actual typed browser client.
- **MCP:** `catalog.inspect` and `reviews.run`, collected behind one server.
  A tiny review-session table supplies fresh per-request scope and observations.

The review controller schedules one task. The task uses an injected inspection
port, consumes a small report, and returns a result. A separate deterministic
validator checks the revision chain. Actual feature coordination remains in the
review runtime, while the root assembles adapters and dispatches requests.

Use real protocol adapters/types for these cases. An object merely named
`router` would miss the configured-runtime and inferred-type problems the
reference is intended to exercise. Keep protocol conformance itself delegated
to the protocol libraries.

## Proposed ownership tree

These are **14 Ramify owners**, not 14 packages. Each row owns `src/`, including
optional `src/tests/` and `src/interfaces/`, with children only beneath `subs/`.
Bracketed profiles are semantic
planning notation, not a new description grammar.

```text
collection-review [dispatch]             Node entry, configured protocols, assembly
└── workspace [ui, browser, dispatch]    browser shell; declaration-only relays
    ├── contracts []                    neutral report and revision vocabulary
    ├── shared-ui [ui, browser]         one shared StatusBadge
    ├── catalog [dispatch]              native tRPC and MCP adapters
    │   ├── core []                     two records; get/inspect; private helper
    │   └── ui [ui, browser]            pure CatalogCard, supplied with data
    └── reviews [dispatch]              API adapters and MCP session wrapper
        ├── core []                     review runtime assembly and owned port
        │   ├── controller []           one supervisor tick
        │   └── tasks []                one task and its result helper
        ├── validation []              deterministic revision validation
        └── ui [ui, browser, dispatch]  connected ReviewPanel
            └── pure-ui [ui, browser]   ReviewResult and private formatting
```

The shell deliberately contains the features so their selected views reach it
through upward exposure without becoming available to other features' UI;
backend children retain independent source profiles. The backend root owns its
actual assembly source. Keep E04 as an explicit browser-ancestor relay variant,
even if the baseline topology changes later. A sibling-shell comparison must
record that root's downward exposure also reaches other compatible UI modules:
`ui` excludes core consumers but does not select the shell alone.

Two owners are named `ui`, a reserved keyword of the description language.
`catalog/ui` therefore declares `module "ui" tagged [ui, browser]`,
`reviews/ui` declares `module "ui" tagged [ui, browser, dispatch]`, and their
parents reference them as `expose-sub ... from "ui"`. Quoting does not change
module identity.

Root protocol and assembly tests stay in root's `src/tests/`, with the fixed
profile `[testing, dispatch]`. Tests combining protocol and view contracts
live in `workspace/src/tests/`, whose fixed profile is already
`[testing, ui, dispatch]`. They can use the views exposed upward to `workspace`
without exposing those views downward to other feature UIs. Root exposes a
testing-only setup function and its needed types so these tests exercise the
actual configured system while preserving router/client identity.

Tests needing other classifications use a separate testing module with those
tags in its header and test code in its ordinary `src/`. Exercise that shape
in a temporary variant; it does not add an owner to the clean baseline.

The two feature `src/` areas are their adapters. Separate `core` children make
the protocol boundary explicit without adding another `server` owner to each
feature. One feature's entire UI is already pure; only the connected feature
needs an ordinary `pure-ui` child.

Shared test support is one fixture exported from `catalog/core/src/tests/`, relayed
upward and then made available to other owners' tests. A separate support owner
would add no distinct requirement. Shared UI does retain its own owner: two
vertical feature UIs must use it while their core siblings cannot.

This is a small teaching baseline, not a proof of a mathematically minimal tree.
Use roughly 20–30 production TS/TSX files as a design budget, not a pass/fail
metric. Add a file/owner only when it carries a distinct responsibility or case.
Parser edge cases and alternative layouts belong in temporary variants.

## Concrete paths and package boundary

```text
examples/collection-review/
├── README.md
├── package.json                       one example package and its own lockfile
├── tsconfig.json                      independent from toolkit compilation
├── vite.config.ts                     root points at workspace/src/
├── vitest.config.ts                   selects owned tests and testing-module source
├── module.ramify                      explicit application root
├── src/                               Node entry and protocol composition
│   ├── interfaces/                    selected dispatch vocabulary
│   └── tests/                         protocol and assembly tests
└── subs/
    └── workspace/
        ├── module.ramify
        ├── README.md                  module purpose and local documentation
        ├── src/                       index.html, main.tsx, typed client, styles
        │   └── tests/                 UI/protocol integration tests
        └── subs/                      remaining owners from the tree

scripts/reference-harness/             Node-only copying/checking/reporting
docs/plans/reference-project/          this plan
```

Keep configuration and package metadata distinct from owned application source.
Place application HTML/styles under the workspace's actual `src/`. The loader
receives the example's explicit root and source scope, not the surrounding
toolkit or its independent fixture programs.

Use `contracts/src/interfaces/vocabulary.ts` for the baseline's shared report
and revision vocabulary, with `expose-src * from "interfaces/vocabulary.ts" to parent`.
This explicitly selects all exports of that file with their original tags;
the directory remains ordinary source of `contracts` and exposes nothing by
placement alone. Other contracts use named selections, providing a comparison
when an unrelated export is added. Baseline tests and their helpers belong in each
owner's `src/tests/`, whose fixed profile takes precedence over ordinary `src/`.
The separate testing-module variant places its test code in that module's
ordinary `src/`. Discovery and runner configuration account for both forms;
production-only selection excludes testing-classified source while retaining
production interface vocabulary.

The package is self-contained: explicit dependencies, no imports from another
application, and no accidental reliance on dependencies installed outside
Ramify. One lockfile applies to the example, not to every owner. Keep its Node
types and framework dependencies out of the toolkit's pure model compilation.
Adding a workspace/package manager migration is unnecessary.

## Module purpose and documentation

Every owner in the reference baseline, including the application root, has a
`README.md` beside `module.ramify`. Its first prose paragraph describes the
module's purpose. Further paragraphs may explain its contracts and usage.

The module-information adapter reads that owner's README and returns its path
and the first top-level Markdown paragraph as a plain-text summary. Headings,
lists, and code blocks do not supply the summary. A missing README or a README
without a purpose paragraph is reported explicitly; the adapter does not borrow
text from another owner. H03 exercises these results, and the Phase 5 tour uses
the returned descriptions and links to the full READMEs.

This follows the [module README convention](../../model/module-description.principles.md#module-documentation-lives-in-its-readme).
Ramify modules remain valid without READMEs; every reference-baseline owner
needs a purpose paragraph for the tour. Documentation retrieval adds no
`module.ramify` field and does not affect ownership, exposure, or tags.

## Required exposure routes

1. **Adapters upward:** feature adapters expose factories to `workspace`, which
   declaration-relays them to the root. The root mounts the finished APIs.
   A source barrel in `workspace/src/` is not a substitute for this relay.
2. **Dispatch vocabulary downward:** the root exposes selected neutral protocol
   and invocation types to descendants. Dispatch consumers can import them;
   core and pure UI cannot. Configured runtimes/services are passed to factories,
   not automatically exposed as broadly importable singletons.
3. **Core to its adapter:** each core exposes selected behavior and needed types
   to its feature parent. The parent calls them. Runtime implementations are
   not broadcast merely to let the connected UI make an API request. Catalog
   also relays the core-owned `CatalogSummary` type down to its UI child.
4. **Shared UI:** `StatusBadge` and its props reach `workspace`, which exposes
   them to descendants. Both feature UIs pass; both core owners fail for values
   and types because they lack `ui`.
5. **Views:** `ReviewResult` and its view-owned props travel upward to connected
   UI. Private formatting and its tests stay in `pure-ui`; no `dispatch`
   classification is inherited from the parent. Each feature's selected UI
   component travels up through its feature owner to `workspace` for shell
   composition; it does not need a general downward exposure to other features.
6. **Runtime direction:** task helpers travel up to `reviews/core` and down only
   inside that subtree. Controller operations travel upward only. Validation
   sits outside that subtree and cannot import its runtime implementations.
   Validation's selected functions may travel up to `reviews` and down to core.
7. **Test support:** a catalog-owned test fixture follows ordinary upward/downward
   routes. Test profiles retain required-importer classifications but do not
   inherit browser runtime requirements. Root also defines a testing-only setup
   function in its `src/tests/`, using its own assembly internals, and exposes
   that function and needed types to descendants. Workspace integration tests
   obtain the actual configured router/client pair through this contract.
   These are new testing-owned bindings, not retagged forwarding aliases.
   Own tests keep private access; foreign tests use selected exposed contracts.
8. **Neutral reports:** `contracts` exposes selected report/revision vocabulary
   to `workspace`, which makes it available to descendants. Sibling cores gain
   access through this route, not merely through their placement in the tree.
9. **Business port:** review core exposes its owned `InspectionPort` to its
   controller/task descendants and upward as part of its factory contract. Any
   ancestor that names it explicitly needs the corresponding upward relays.

Use explicit source exposures in the baseline. Do not require `index.ts` files.
Keep one targeted forwarding example in a test variant so alias/provenance
behavior is exercised without turning the whole project into barrels.

## Protocol and report contracts

The root creates the configured tRPC runtime once. Each feature factory receives
the facilities and context/service contract it needs, and preserves inferred
input/output/error types when composed. The browser uses the resulting router
type; pure views receive values and callbacks instead of importing that type.

Catalog owns its MCP tool arguments, core calls, and result adaptation. Reviews
owns the session wrapper: resolve the current binding separately for every
`tools/list` and `tools/call`, then create one immutable invocation snapshot.
Catalog receives only `recordId`, revision scope, and a small observation
callback. Full session/run identity stays in Reviews. Root combines the native
contributions and wires the wrapper without parsing business arguments/results.

Test a binding change between list and call, plus two concurrent sessions. These
are ordinary correctness tests for fresh context, not a new security system.

Two kinds of type sharing should be visible:

- A core-owned `CatalogSummary` returned by `getRecord`, with explicit behavior
  and type exposures. This supplies a small behavior-associated-type probe.
- A neutral `InspectionReport` containing revision facts and findings, used by
  both features. Review core owns its required `InspectionPort`. Root wires a
  structurally compatible Catalog operation into the review factory; any report
  adaptation belongs to a feature. A task never imports a protocol client.

Direct business-capability injection is sufficient for the baseline. The two
MCP tools receive real list/call tests separately; a nested MCP client inside
each review would add no necessary ownership case.

Neutral report ownership, runtime grouping, and parent-owned supervisor
integration tests are **provisional reference-project choices**. They make one
coherent baseline runnable. They do not decide every project's preferred design;
the alternatives remain explicit probes in the case catalogue.

## Tool and framework budget

Use React/ReactDOM, TypeScript, Vite, Vitest, a schema library, the native tRPC
server/client packages, and the MCP TypeScript SDK. A plain typed tRPC client
is enough; a query-state framework is not required. Add Jiti and browser
automation for focused compatibility checks. Choose and lock compatible
versions during scaffolding; do not assume another package's installed versions.

Add only a tiny real Cucumber registration smoke fixture for its known setup
case: one scenario and shared hook initialization imported through two paths.
It is not the application's feature-test framework or an excuse to build a
large scenario suite. Framework-specific checks belong to the harness where
possible, with no extra business owners.

Prefer in-process protocol tests for fast feedback, then one real API/browser
smoke path. The MCP SDK supplies paired in-memory transports for a client/server
test, and tRPC has a Fetch adapter suitable for exercising requests without a
full HTTP framework. [MCP testing transport](https://ts.sdk.modelcontextprotocol.io/v2/clients/connect),
[tRPC Fetch adapter](https://trpc.io/docs/server/adapters/fetch).

For the runnable example, use one Node API listener for the tRPC and MCP routes
and a Vite frontend. Avoid another server framework unless its adapter materially
simplifies those two mounts. Test processes use available local ports and close
their own listeners/browser; they never control an unrelated development server.

## Specification prerequisites and decision status

The [principles](../../model/cross-module-importability.principles.md) now make
the two-kind tag registry, kind-based export/test policies, and same-owner
`src/tests/` classification definitive. The [description grammar](../../model/module-description.principles.md)
accepts registered tag names and interface-file wildcards beneath the owner's
`src/interfaces/`. Cases E07–E09 cover their full expansion, path restrictions,
original identities, tags, and contract growth. The [source profile](../../model/typescript-source-interpretation.principles.md)
adopts explicit namespace/lazy selections, permits symbol-free loads subject
to testing-source isolation, and distinguishes definite failures from
nonblocking analysis limits. These are specification commitments, not evidence
of evaluator, loader, or source-checker implementation.

Phase 0 maps those rules to case expectations and concrete integration inputs.
The registry's configuration serialization and explicit default-replacement
operation remain unspecified; use the default registry for the baseline and
the resolved registry contract for model-level custom-tag cases. Do not invent
accepted configuration syntax. Descriptions can target the definitive format
before its parser exists, with capability status reported separately.

Phase 0 also maps the [README purpose convention](#module-purpose-and-documentation)
to H03's adapter inputs and outputs. This is a documentation contract with no
new description-language field.

T03 exercises the definitive [unmarked-interface rule](../../model/typescript-source-interpretation.principles.md#explicit-bindings-are-classified-individually):
retain written import form but use type-only availability for a purely type
original. Exposure, required-importer tags, and testing-origin checks still
apply. An unmarked runtime-bearing class or function retains the value check.
Use a compiler configuration permitting unmarked type imports and report
compiler diagnostics separately. The case remains unimplemented until a
source checker can execute it.

Keep these further choices out of the required baseline:

- Automatic exposure of behavior-associated types or an additional `types` selector.
- A new selected-child/test-area exposure primitive.
- A universal runtime import guard or mandatory finite preview registry.
- Full protocol-independent launching in core: an isolated probe compares an
  allowed launch configuration dependency with a core-owned launch port.

## Delivery sequence

| Phase | Concrete deliverable | Exit condition |
| --- | --- | --- |
| 0. Scope and expectations | A living owner/contract map (`contract-map.md`), started with the first iteration and extended by every later one, definitive specification references, registry integration inputs, README retrieval contract, case metadata and capability gates. | The map's format exists and each iteration leaves it current. Every case distinguishes its binding rule or reference design from implementation status, undecided probes, and separate responsibilities. No invented accepted syntax. |
| 1. Runnable reference | The small screen, both native protocol surfaces, in-memory behavior, explicit module descriptions, per-owner purpose READMEs and owned tests. | Independent install/type-check, application tests, protocol checks and ordinary Vite build work even before a source checker exists. |
| 2. Reference harness | Temporary-copy mutations, meaningful expected diagnostics and a capability/coverage report. | Active supported cases execute; absent capabilities are reported as unimplemented, not green. |
| 3. Evaluator and loader integration | Attach source-area/custom-tag evaluator support and then real filesystem/description parsing. | Owner/reach/profile cases consume the real project; do not substitute an old handcrafted world as parser evidence. |
| 4. Source and tool integration | Resolve originals/resources, classify supported imports and report coverage limits. | Required imports/denials and actual Vite/React/Cucumber/Jiti compatibility cases pass within the declared scope. |
| 5. Reference polish | Short tour using module README summaries and links, case commands, expected explanations, small generic host-adapter contract checks. | H03 verifies README retrieval and missing-documentation results; every baseline owner supplies a purpose paragraph. A new contributor can run the example, create a violation, and understand its diagnosis without another repository. |

The project is a continuing implementation aid. Completing a phase does not
mean later capabilities already work, and a runnable sample alone is not a
Ramify conformance result. See [harness reporting](harness.md).
