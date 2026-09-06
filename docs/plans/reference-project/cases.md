# Reference-project case catalogue

**Status:** Planned witnesses, not implemented test results. Read the
[project plan](README.md) and [harness plan](harness.md). IDs identify families;
value/type forms and individual mutations are separately named instances.

## Reading the catalogue

**B** uses the clean runnable baseline. **M** makes a focused temporary mutation.
**C** executes a real tool compatibility fixture. **H** checks a small generic
host-adapter contract. **P** compares an undecided design. **E** records a separate
responsibility rather than pretending the import predicate enforces it.

Expectation authority and implementation status are independent:

- **A:** definitive model, layout, source interpretation, or reporting rule.
- **D:** definitive reference-project design, rather than a universal Ramify rule.
- **P:** genuinely undecided alternative; no normative pass/fail yet.
- **E:** independent policy, verifier, or host responsibility.

The selected source-checking scope accepts visible nonblocking runtime analysis
limits. None of the cases requires an exhaustive runtime closure proof.

## Ownership and layout

| ID | Mode / authority | Witness and meaningful expectation |
| --- | --- | --- |
| L01 | B + M / A | Every source, test, and application resource has exactly one owner under `src/`, including `src/tests/` and `src/interfaces/`. Nested tests use their testing profile exactly once; interfaces keep the ordinary profile. A child remains separate. A description anywhere inside `src/` is invalid and cannot silently fall back to its parent. |
| L02 | M / A | Missing/invalid root or child description, duplicate sibling names, and loose application source under `subs/` produce structural diagnostics. Malformed ownership must not be replaced with a guessed ancestor owner. |
| L03 | M + H / A | An empty owner has its own `src/` implementation scope, created before work if absent. Search excludes children; test and metadata scopes are distinct. No mandatory `index.ts`, package, or build per owner. |
| L04 | M + H / A | Moving a module through an ordinary grouping directory preserves declared identity. Renaming or reparenting changes it; historical-reference migration is explicit host work. |
| L05 | M / A | `expose-src` paths start at `src/`; `expose-test` paths start at `src/tests/`. Selecting a test file through either form preserves the same identity and testing tags. Missing export, root escape, alias collision and invalid duplicate declarations are diagnosed. Quoting/comments/version-token cases use small parser inputs. Accept `module tests tagged [testing]` and child references `from tests`; quoting `"tests"` preserves the same identity. Contrast the reserved name `"testing"`, which requires quotes. |
| L06 | M / A | Actual filesystem symlinks exercise v1 policy: a symlink root or description and a `from` path traversing a symlink are rejected; discovery does not traverse directory symlinks. These are filesystem fixtures, not parser-only strings. |
| L07 | B + M / A | `contracts/src/interfaces/vocabulary.ts` is ordinary owned source. A wildcard declaration selects its exports as covered by E07; moving a binding into an unselected file there does not expose it or change its profile. Source at sibling `tests/` or `interfaces/` fails layout validation; an ordinary nested `src/helpers/tests/` does not gain the test profile. |

## Exposure and original identity

| ID | Mode / authority | Witness and meaningful expectation |
| --- | --- | --- |
| E01 | B + M / A | Required parent, sibling-through-ancestor and deeper-descendant routes work. An unexposed TypeScript export remains private across owners; actual same-owner imports remain allowed after the testing-origin guard. |
| E02 | M / A | Remove one upward adapter/fixture hop. The root loses the original even if its tags match. Restore that hop without changing the source import and access returns. |
| E03 | B + M / A | Downward exposure reaches all proper descendants, including the originating branch and later subdivisions. Descendant-only exposure cannot escape above its owner; redundant relays do not expand it. |
| E04 | B + M / A | `workspace` can declaration-relay a server original it cannot browser-value-import. Retain an isolated browser-ancestor relay variant even if the baseline topology changes. Replacing its declaration relay with an incompatible source re-export produces the corresponding source/tag violation once supported. A sibling-shell comparison records the broader UI audience of root's downward view exposure; `ui` still excludes core consumers. |
| E05 | M / A | Rename imports/forwarded names without changing original identity, owner or tags. Two unrelated bindings with the same spelling remain different; a fresh wrapper/type alias is a new binding rather than a forwarding alias. |
| E06 | M / A | Add an unselected export to a file exposed only through named selections: the public Ramify contract is unchanged. A child wildcard relays the child's upward contract, not every export in its files. Missing child exposure and wildcard-name collisions remain diagnosed. |
| E07 | B + M / A | `contracts` exposes its shared vocabulary with `expose-src * from "interfaces/vocabulary.ts" to parent`. Expansion includes type and runtime exports, including `default` when present, and matches explicit selections of the same exports. Adding/removing an export changes the expanded contract and subsequent child-wildcard relays without editing the descriptions. A second unselected interface file stays private; merely referenced signature types gain no exposure. An empty valid file yields no names or exposures. |
| E08 | M / A | An owned-source wildcard accepts one exact file under `src/interfaces/`, including a nested file. Reject an ordinary implementation file, `src/tests/interfaces/`, `src/helpers/interfaces/`, a path normalized out of `src/interfaces/`, directory/glob targets, and every `expose-test *`. Retain L06's symlink checks and reject missing files. A testing module's ordinary `src/interfaces/` qualifies and retains testing classification. Child-contract wildcards remain valid. |
| E09 | M / A | Interface wildcards preserve canonical resource and source identities, including same-owner forwarding aliases, and reject a foreign-owned export or an incomplete/ambiguous export description. A uniform `tagged` clause assigns every selected original; conflicting assignments or omitted required tags fail. Without it, each original keeps its assigned/default tags. Required-symbol promises stay explicit. Duplicate same-name/same-original selections merge; same-name/different-original collisions fail across named and wildcard selections. Reject mixing bare `*` with names or `as`; quoted `"*"` remains a literal name. |

## Tags and source areas

| ID | Mode / authority | Witness and meaningful expectation |
| --- | --- | --- |
| T01 | B + M / A | Both feature UIs use shared `StatusBadge` and its props. Both core siblings are denied those originals in value and type forms even though they are visible. |
| T02 | B + M / A | Feature adapters/connected UI use exposed dispatch contracts. Core and `pure-ui` are denied dispatch-defined values and types. For the value negative, first make an existing dispatch original visible in a mutation, so denial tests its tag rather than a missing route. Adding `dispatch` never repairs a missing exposure route. |
| T03 | B + M / A | A browser importer needs the original's browser promise for a foreign value; an otherwise permitted type-only import is exempt. An otherwise permitted interface imported without `type` syntax also needs no `browser` promise when its resolved original exists only as a type; exposure, required-importer tags, and testing-origin checks still apply. Contrast an unmarked class/function import, which still requires `browser`. Use a fixture compiler configuration permitting unmarked type imports; compiler diagnostics are separate. A same-owner import retains the specified exemption. |
| T04 | M / A | Rename ordinary tag definitions and uses to project-defined names for both fixed kinds. Results are unchanged. Test conjunction of two restrictions; unknown/conflicting registry definitions are invalid. Exercise the resolved registry input independently of its unspecified configuration serialization. No per-owner shadow registry; reserved `testing` cannot be removed or rebound. |
| T05 | B + M / A | New owned exports retain required-importer tags from their source area; runtime promises stay explicit. The `src/tests/` profile is exactly `testing` plus the header's required-importer tags, with no runtime requirements. A standalone `tests tagged [...]` declaration is invalid. Changing a parent profile does not classify its child owners. |
| T06 | M / A | Forward a restricted original through a neutral/compatible alias: its restrictions survive. A newly defined wrapper or type alias receives its defining area's required tags. A source-forwarding path must pass its own supported checks. |

## Testing and composition

| ID | Mode / authority | Witness and meaningful expectation |
| --- | --- | --- |
| O01 | B + M / A | A core's `src/tests/` reads its unexposed private helper. A foreign parent or sibling test cannot. Moving a test-looking file out of `src/tests/` into ordinary `src/` removes testing classification; its filename adds none. |
| O02 | B + M / A | A foreign catalog-owned test fixture and its type follow ordinary exposure into review tests. Production cannot import them. Removing a fixture exposure denies foreign tests without affecting owner tests. |
| O03 | M / A | Production cannot import/load its own or foreign testing source: value, type, stylesheet, and a test barrel forwarding a production original all remain forbidden when their origins are identified. Non-testing forwarding cannot hide a testing original. |
| O04 | B + M / A + D | Pure-view tests stay with private formatting; connected tests use the public view. Node tests retain UI/dispatch coupling profiles where required without inheriting `browser`. Mutate module-header tags to verify the fixed derivation, including both kinds of project-defined tags. |
| O05 | B / A + D | Root protocol/assembly tests use the fixed `[testing, dispatch]` profile. Workspace UI/protocol integration tests use its fixed `[testing, ui, dispatch]` profile and views already exposed upward to that owner. Root exposes newly defined testing-only setup and needed types to preserve actual router/client identity. Feature production peers do not gain access to each other's views or testing setup. |
| O06 | B + M / A | A production-defined binding explicitly tagged `testing` keeps ordinary same-owner availability; the same tag does not make a foreign production importer eligible. This differs from defining the binding in testing source. |
| O07 | M / A | A separate testing module declares additional tags in its header, including `[testing, ui, browser]`, and puts its test code in ordinary `src/`. It has no private access to its parent without exposure, and foreign values require the declared runtime promise. Its own `src/tests/` still derives `[testing, ui]`. Compare explicit selected exposures and newly defined testing-only wrappers; a forwarding alias cannot acquire new tags. |

## Dispatch, reports and runtime direction

| ID | Mode / authority | Witness and meaningful expectation |
| --- | --- | --- |
| D01 | B / D | One configured tRPC runtime composes both feature factories. Valid browser/client calls preserve exact inputs and results; focused compiler-negative calls reject invalid input, missing context and wrong results without broad casts. |
| D02 | B / D | One MCP surface lists and dispatches two feature-owned tools. Each adapter owns its argument/result handling. Actual review coordination runs behind the review capability, not in root's protocol switch. Verify behavior and review ownership; tags alone cannot prove absence of business logic. |
| D03 | B / D | Re-resolve a session for every list/call; change its binding between requests and run two sessions concurrently. Each handler uses its request snapshot. Catalog sees only the neutral scope/callback contract, not full review identity. |
| D04 | B + M / A + D | Native factories travel upward; only selected neutral protocol contracts travel downward. Delete a hop or introduce a direct core import of dispatch plumbing to exercise distinct denials. |
| D05 | B + P / A + D + P | Both features consume one neutral revision/report contract through normal exposure; shared contracts cannot import their consumers. A core-owned behavior/return type also exercises explicit associated-type declarations. Alternatives belong to P01/P04. |
| R01 | B + M / A | The controller consumes task helpers through the review runtime's local downward route. Tasks cannot import the controller, and validation outside that subtree cannot import runtime behavior or types. |
| R02 | B + M / A | Runtime parent composes independent children through exposed factories. Parent-owned integration tests call the actual supervisor and task; a new parent import of a child-private helper fails. |

## Source, resources and diagnostics

| ID | Mode / authority | Witness and meaningful expectation |
| --- | --- | --- |
| S01 | B + M / A | `.js` substitution, configured aliases, named/default imports, and type/import-type expressions identify the correct originals and forms. The alias path does not create another owner. |
| S02 | B + M / A | Namespace member, destructuring, literal lazy selection and explicit source-star forwarding follow the specified bounded selection policy. Unknown escaping/computed member use is a visible limitation, not a reason to grant every export. |
| S03 | B + M / A | Statement-level and inline `type` imports preserve known coupling restrictions. Neither is rejected solely to prevent possible ordinary statement initialization under the specified runtime-load policy. |
| S04 | B + M / A | Two UI owners each have a CSS module described by the same shim; resources retain distinct original identities. Alias one resource, select a missing export, and reference a missing file accepted by a broad shim. Resolution and identity failures stay distinct. |
| S05 | H + M / A | A bound JSON resource and known compiled source map to their actual originals; the shim/generated directory does not define ownership. Put generated/packaging support in small separate fixture scopes. |
| S06 | M / A | Report invalid layout, definite forbidden import, known external target, unresolved target, and unsupported loader separately. One definite violation plus an unsupported loader must still fail for the violation. |
| S07 | B + H / A | A run with no detected violations and known analysis limits can succeed with a partial-coverage report. Do not relabel unchecked constructs as allowed/external or claim complete runtime coverage. |

## Actual tool compatibility

These tests run tools, not just the importability evaluator. Their execution can
precede Ramify support; analyzer expectations attach when that capability exists.

| ID | Mode / authority | Observable result |
| --- | --- | --- |
| K01 | C / D | A real browser opens the Vite app, calls the real typed API and renders the review result. Lazy UI loading resolves; the test observes behavior rather than only a successful bundle. |
| K02 | C + M / A + D | Vite glob named-selection eager/lazy variants render the same selected component. A fixture file also exports an unrelated private symbol, so changing loading timing must not force broad exposure. An unsupported macro remains a nonblocking coverage note. |
| K03 | C / A + D | Keep a runtime-selected preview fallback and Vite-injected setting working. An unresolved static target set does not disable the actual loader. No mandatory generated registry. |
| K04 | C / A + D | Plain CSS and bound CSS modules visibly style the browser; a known testing-origin stylesheet still triggers the adopted source guard in its negative case. |
| K05 | C / A + D | One real Cucumber scenario imports shared hook initialization through two setup paths in the same runtime; the intended effect occurs once. Legitimate side-effect setup needs no fake exported capability. |
| K06 | C / A + D | Real Jiti loads a small TypeScript configuration whose value changes visible behavior. A separate independent-project preview/config fixture is scoped honestly; arbitrary future projects are not certified. |
| K07 | C + H / A + D | Test runners find each owner's `src/tests/`, testing modules' ordinary `src/`, and actual shared helpers. Production selection excludes testing-classified source while retaining production `src/interfaces/` vocabulary. Independently analysed fixture programs stay separate. Include a small mock/instrumentation case and one compiled-entry smoke case with explicit scope. |

## Generic host integration and retained policies

| ID | Mode / authority | Contract to exercise |
| --- | --- | --- |
| H01 | H / A + E | Discover canonical declared IDs, parent relationships, source/test/resource owners and empty modules without packages or required facade files. |
| H02 | H / A + E | Render a selected symbol contract with original owner, tags, alias, source reference and consumer-specific value/type availability. Show expanded interface-file and child-contract wildcard changes even when the declarations are unchanged. A receivable symbol is not automatically importable. |
| H03 | H / A + E | Return the module/metadata root, owned `src/` and nested `src/tests/` and `src/interfaces/` paths, plus the module README path and purpose summary under the contract below. Ordinary-source and testing classifications remain disjoint despite containment. Own-source search excludes child implementations; lifecycle/rename output preserves identity rules. |
| H04 | H / E | Possible exposure, observed dependency use, test ownership/regression selection and write authority are separate inputs/outputs. Provide tiny known manifests instead of an agent launcher or workflow engine. |
| X01 | E | Project-specific canonical paths and API/vocabulary quality, explicit annotations/docs and growth budgets remain independent review/checker policies. The reference keeps good examples but does not claim Ramify enforces them. |
| X02 | E | Cycles, process-spawning conventions, packaging/build policies and migration ratchets are separate checks. Preserve explicit scope instead of simulating a full platform. |
| X03 | H + E | Browser-compatibility matching uses a declared promise. A separate verifier may catch a deliberately false claim through a private dependency; successful rendering is not proof of every export's runtime closure. |

H03 reads each owner's `README.md` beside `module.ramify` and returns its first
top-level prose paragraph as a plain-text summary and the documentation path,
following the [README convention](README.md#module-purpose-and-documentation).
Verify a present summary after a title, a missing file, and a README without a
prose paragraph. Missing documentation is explicit and does not invalidate the
module or inherit another owner's summary. Every baseline owner supplies a
purpose paragraph for the tour; absence cases use separate fixtures or variants.

## Unresolved design probes

These must remain visibly non-normative until a decision is recorded. Keep the
small baseline working while comparing their declaration, source and audience
costs. A probe result cannot silently approve an alternative.

| ID | Comparison |
| --- | --- |
| P01 | Neutral shared report versus producer-owned report exposed to consumers versus a consumer-owned projection. Track original identity, required adapters, type duplication and permitted audiences. |
| P02 | Parent-owned supervisor integration test versus task-local tests with a meaningful custom required-importer role. Include production assembly's need for the same original and mandatory export/test tag propagation. |
| P03 | Runtime grouping versus independently placed controller/tasks/validation with custom roles. Preserve both positive and negative edges; do not introduce an exact-child grant as an assumed feature. |
| P04 | Explicit behavior/type exposures versus automatic associated-type exposure. Include nested signature types, a fresh alias and a foreign-owned type; measure declarations and added audiences on this small tree. |
| P05 | Compare an unadopted all-types selector against legal named selections and the adopted `src/interfaces/` file wildcard. Only the all-types selector is proposed syntax; E07–E09 specify binding expectations for the existing wildcard. |
| P06 | A permitted protocol launch-configuration dependency versus a core-owned launch port whose adapter performs the whole protocol-specific launch operation. No real worker process is needed to compare ownership and typed contracts. |

## Completion rule

Each family must end in one of: executed supported assertion, named pending
capability, explicitly undecided probe, or documented separate responsibility.
Only executed assertions count as verified. The reference is not complete while
a required case has simply disappeared into an exclusion or an unconditional skip.
