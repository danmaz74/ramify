# Plan 1 executable instance inventory draft

**Status:** proposed review input for iteration 2; no instance has executed in
iteration 1. This document freezes fixture causes and independent expectations;
it does not establish implementation availability or architectural acceptance.
The [main-plan matrix](main-plan.md#reference-acceptance-matrix),
[reference contract map](../reference-project/contract-map.md), and authoritative
[description](../../model/module-description.principles.md),
[importability](../../model/cross-module-importability.principles.md), and
[source](../../model/typescript-source-interpretation.principles.md) rules govern
these records. The matrix's family mapping remains attached to every child
instance; passing one instance never passes an entire family.

## Membership and intermediate gates

The `ID` column preserves every matrix subcase. A row with variants is a required
group, not an execution record: replace that group with **all** its explicit
`ID/variant` children in the syntax-variant table below. Every other row is one
execution record. Each child inherits its implementing iteration, fixture,
capabilities and assertions unless its variant overrides them. A handler cannot
remove a group, variant or positive control from gate membership. Iteration 2
stores this complete reviewed set independently of handler registration and
reports every member as `not-executed`; it implements no I1 semantic instance.
Iteration 8 activates migration/build behavior and reruns prerequisites; its
formal matrix acceptance remains I1-30 in iteration 14.

| Implementing iteration | Direct prerequisites | New matrix groups |
| --- | --- | --- |
| 2 | 1 draft | Inventory and gate infrastructure only |
| 3 | 2 | I1-14 |
| 4 | 2 | I1-04 syntax |
| 5 | 2, 4 | I1-02, I1-03, I1-04 paths, I1-25, I1-29 discovery/warnings/scope |
| 6 | 3, 5 | I1-23 catalog identities |
| 7 | 3, 4, 5, 6 | I1-05, I1-09, I1-10, I1-11 |
| 8 | 7 | Migration and production selection; no new matrix groups |
| 9 | 7 | I1-06, I1-07, I1-08, I1-18 |
| 10 | 9 | I1-12, I1-13, I1-15, I1-16, I1-17, I1-23 testing-style |
| 11 | 9 | I1-19, I1-20, I1-21, I1-22 |
| 12 | 10, 11 | I1-23 missing-resource cases, I1-24, I1-27 session, I1-29 outside-target/coherence |
| 13 | 8, 12 | I1-26, I1-28 except relocation |
| 14 | 13 | I1-01, I1-30 |
| 15 | 14 | I1-27 self-check/negative, I1-28 relocation |

The iteration 1 acceptance gate applies before iteration 3 onward starts; it
is a review condition rather than an additional numeric prerequisite. Iteration
6 reads iteration 1's compiler probes through that transitive prerequisite.

`reference:verify -- --plan 1 --iteration N` requires the union of instances
assigned to N and every transitive prerequisite. Missing capabilities, removed
records, unrun assertions and assertion failures all fail that command. Other
members stay explicitly `not-executed`. Without `--iteration`, every leaf in this
document is required, so the full gate is expected to fail until iteration 15.
Neither mode infers membership from available handlers or calls the evaluator
to generate its expected verdict. Both modes must be exercised with removed
records and injected assertion failures, as I1-30:harness-required specifies.

## Fixture and assertion conventions

Every source fixture runs in a unique ignored
`.reference-work/<run-id>/<instance-id>/project/` directory selected explicitly;
slashes in an instance ID become directory segments. Preserve-on-failure keeps
only that run's copy. Normal cleanup deletes only the owned copy. Do not mutate
the running example, its dependencies, the toolkit checkout or another run.
Reference copies exclude dependencies, build outputs and previous copies and
resolve external packages through the example's own installed dependency tree.
Stable root-relative paths, statement IDs and source spans are assertions;
absolute temporary roots and timing are not semantic identity.

All acquisition/session requests use `ProjectRequest.scope: 'whole-project'`
and `ProjectRequest.configuration: 'discover'`. The row changes only the
explicit root or working directory as stated; fixture configurations are placed
on disk at discovery locations, never supplied as a configuration override.

Fixture roots/configurations/registries in the table are these exact recipes.
They are iteration 2 inventory definitions, not fixtures claimed to exist now.

| Code | Fixture root and configuration | Registry and baseline |
| --- | --- | --- |
| R | Copy `examples/collection-review/`; copied `tsconfig.json` (ES2022, ESNext, bundler, strict, isolatedModules, react-jsx, types `node`, `vite/client`, `@features/*` paths). Preserve its `src`, `subs/**/src`, `vite.config.ts`, `vitest.config.ts` selection. | Default resolved registry. Its two root configuration-file warnings are expected; every owned baseline construct requires coverage at the final gate. |
| F | Independent fixture recipe at `scripts/reference-harness/fixtures/plan1/<ID>/`; materialize the project in the temporary root. Use the concrete F tree below with `tsconfig.json`. | Default registry unless row says custom. Three owners, no pre-existing violations. |
| J | F with a JavaScript consumer `subs/consumer/src/probe.js`; same `tsconfig.json` plus `allowJs: true, checkJs: true`. | Default registry; provider stays TypeScript. |
| T | Copy migrated toolkit root, with `tsconfig.json` as specified in [scope.md](scope.md); root package dependencies resolve from the toolkit. | Default registry; only toolkit owners enter its program. |
| M | Pure model fixture supplied through the library: root `fixture`, children `provider`/`consumer`, canonical originals and source areas matching F; no compiler configuration or disk root. | Explicit resolved registry per row; expected results are literal assertions. |
| H | The reference runner's own copied family/instance catalogue and deterministic assertion stubs, under the temporary root. No compiler configuration. | Registry not applicable. Gate membership is the frozen document-derived set. |

F has `module.ramify` (`ramify 1`, `module fixture`), `src/`,
`subs/provider/{module.ramify,README.md,src/interfaces/api.ts}` and
`subs/consumer/{module.ramify,README.md,src/probe.ts}`. Each purpose README
contains `# <name>`, a blank line and `Purpose of <name>.`. Consumer's header is
`module consumer`; provider's is `module provider`. `src/interfaces/api.ts`
contains these concrete exports (newlines as shown):

```ts
export const value = 1;
export interface Type { readonly value: number }
export class Runtime {}
export function Merged(): number { return 1; }
export namespace Merged { export const member = 1; }
export const privateValue = 2;
export interface PrivateType { readonly hidden: true }
export default function defaultValue(): number { return 3; }
```

Provider declares `expose-src value from "interfaces/api.ts" tagged [browser]
to parent` and `expose-src Type, Runtime, Merged, default from
"interfaces/api.ts" to parent`. Root declares `expose-sub * from provider to
descendants`. F also has a root `package.json` containing `{"private":true,"type":"module"}`.
Consumer starts with `import { value } from
'../../provider/src/interfaces/api.js'; void value;`. This is the named exposure
baseline; `privateValue`/`PrivateType` remain catalogued and private. `default`
is the newly exported default binding here; variants needing an alias use an
explicit `export { value as default }` instead and assert the preserved original.

F's compiler configuration is exactly:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true,
    "moduleDetection": "force",
    "verbatimModuleSyntax": false, "isolatedModules": false, "types": [],
    "resolveJsonModule": true,
    "paths": { "@provider/*": ["./subs/provider/src/*"] }
  },
  "include": ["src", "subs/**/src"]
}
```

Within F source snippets, `API` means the literal relative specifier
`../../provider/src/interfaces/api.js` from consumer's `src/probe.ts`;
`P/api` means provider's `src/interfaces/api.ts`; `P/description` means
provider's `module.ramify`. Resolve relative paths mechanically from the
specified importer when it changes. Every edit names its baseline anchor and
must assert that the anchor occurs exactly once before applying it. Source
mutation files under an existing owner are named `src/__i1_probe.ts` unless the
row names an authored file; they are compiler roots even if a compiler include
pattern does not select them. No fixture needs to call an imported function to
establish an import request.

Reference owner abbreviations expand to these existing physical directories:

| Name | Relative path in R |
| --- | --- |
| W | `subs/workspace` |
| C | `subs/workspace/subs/contracts` |
| A | `subs/workspace/subs/catalog` |
| K | `subs/workspace/subs/catalog/subs/core` |
| KU | `subs/workspace/subs/catalog/subs/ui` |
| RV | `subs/workspace/subs/reviews` |
| RC | `subs/workspace/subs/reviews/subs/core` |
| TK | `subs/workspace/subs/reviews/subs/core/subs/tasks` |
| CT | `subs/workspace/subs/reviews/subs/core/subs/controller` |
| VL | `subs/workspace/subs/reviews/subs/validation` |
| RU | `subs/workspace/subs/reviews/subs/ui` |
| PU | `subs/workspace/subs/reviews/subs/ui/subs/pure-ui` |
| SU | `subs/workspace/subs/shared-ui` |
| IT | `subs/integration-tests` |

Reference statement IDs (C1, W1, W2, R3, etc.) resolve through the existing
[contract map](../reference-project/contract-map.md#exposing-statements), never
line numbers copied from an older revision. For example W2 is
`expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog
to parent`; removing its `createCatalogRouter` selection preserves its other
two selections. Removing the full W2 statement would introduce extra causes.

Capability labels below identify required verification behavior, not new public
API enum values. `registry`, `parse`, `acquire`, `metadata`, `catalog`, `link`,
`static-access`, `tags-origin`, `namespace`, `lazy`, `symbol-free`, `resources`,
`coverage`, `session`, `cli`, `build-selection`, `regression`, and `harness-gate`
map to the owned stage/capability contracts in [contracts.md](contracts.md).
Requiring a capability also requires its stage prerequisites. A stage-level
positive in iterations 3–11 asserts only its completed stage data, without
claiming a completed CLI/source check. Full-session and process rows require
all checking stages; deleting one cannot turn an empty report into success.

Unless a row expects a limit, its tested construct has complete relevant
coverage and no unexpected diagnostic. Unless marked otherwise, source negatives
remain valid TypeScript. A denial asserts the independent reason, importer file
and source area, accessed target, canonical original and owner, and relevant
exposure/declaration locations. Invalid input asserts the responsible path/span
and dependent stages blocked, with no guessed permission graph. Warning-only
rows assert no invented ownership or testing profile. Coverage notes assert that
unknown work is neither allowed nor external; known decisions survive.
Operational failure asserts retained partial findings, no completed result and
resource release. The [CLI contract](../../architecture/cli-invocation.spec.md)
solely determines exits; stage rows do not pretend to execute a future CLI.

## Exact reason assertions

Natural-language expectations below map to these exact contract codes. They
are assertions on the typed result, not permission labels inferred by a test
runner. Parser-negative leaves carry their exact `DescriptionIssue.code` in
the variant table. An acquisition wrapper may also report `invalid-description`
while retaining the original parser code and span.

| Expected outcome | Required code or typed state |
| --- | --- |
| Missing explicitly selected root marker | `ProjectIssue.code = 'missing-root-description'` |
| Invalid child syntax; duplicate sibling; description in src; stray marker | `invalid-description`; `duplicate-name`; `description-in-src`; `stray-description`, respectively |
| Missing exact declared file; case mismatch; containment/absolute invalidity | `missing-file`; `case-mismatch`; `invalid-path`, respectively |
| Root/description/reference symlink | `symlink-root`; `symlink-description`; `symlink-reference`, respectively |
| Selected outside-source warning | `OutsideSourceWarning.code = 'outside-module-source'`; never an import/layout failure |
| Invalid registry definition; unknown tag use | `ModelIssue.code = 'invalid-registry'`; `unknown-tag`, respectively |
| Missing original-required tag; conflicting explicit assignment | `missing-required-tag`; `conflicting-tags`, respectively |
| Missing export; name collision; invalid interface wildcard | `LinkIssue.code = 'missing-export'`; `name-collision`; `invalid-wildcard-target`, respectively |
| Foreign or ambiguous wildcard expansion | `foreign-original`; `ambiguous-expansion`, respectively; invalid whole linked result |
| Missing visibility | `ImportDecision.reason = 'not-visible'` |
| Required importer/symbol tag mismatch | `required-importer-tag` / `required-symbol-tag`, with the exact tag in requirements |
| Production-to-testing source access | `testing-origin`, with exact blocking origins even for null symbol selection |
| Same-owner allowed; foreign visible allowed; eligible load without symbols | `same-owner`; `exposed`; `symbol-free`, respectively |
| Missing selected resource export | `AnalysisDiagnostic.code = 'missing-export'`, category `missing-export`; definite failure |
| No project; no compiler config; references-only config | `root-not-found`; `configuration-not-found`; `references-only-configuration`, respectively |
| Unimplemented requested verifier; invalid command/format; unrun required stage | `unavailable-capability`; `invalid-invocation`; `missing-stage`, respectively |
| Input read failure; retry exhaustion; resolver execution failure | `read-failure`; `changed-input`; `internal-error`, respectively; never a completed result |
| New analysis after disposal | `session-disposed`; no compiler operation starts |
| Missing purpose file; no paragraph | `ModulePurpose.state = 'missing-file'` / `'no-paragraph'`; metadata state, not a diagnostic failure |

Coverage assertions use `SourceLimit.code`, not `AnalysisDiagnostic.code`:
`unknown-key`, `namespace-escape`, `nonliteral-target`, `unsupported-loader`
(for Vite glob), `unsupported-commonjs`, `unresolved-target`, `unresolved-original`,
`resource-target` (a missing source-import resource), `outside-module-target`,
and `compiler-blocked`. A compiler-blocked construct retains its compiler code
without turning that compiler problem itself into a definite import failure.
An established external has `SourceTarget.kind = 'external'` and proven
`resolution: 'package'` or `'builtin'`; it has no invented allowed application
`ImportDecision`. Cancellation returns the contract's cancelled outcome; it is
not an `AnalysisCode` fabricated from process exit 130.

## Required matrix subcases

| ID | Iteration | Required capability | Fixture | Exact mutation or selected observation | Independent expectation and coverage |
| --- | --- | --- | --- | --- | --- |
| I1-01:baseline | 14 | session, all bounded source forms | R | Check unchanged root; enumerate all 15 headers, all owned implementation/tests/resources, R3 AppRouter, W2/W4 factories, C1/W1 vocabulary, lazy panel and IT hook. | Complete bounded baseline; no owned access hidden by a coverage note; private exports remain catalogued; proven externals and the two configuration warnings are separate. |
| I1-02:missing-root | 5 | acquire | F | Delete root `module.ramify`; explicitly select that root. | Missing root description is located invalid layout; no inference from provider/consumer. |
| I1-02:invalid-child | 5 | acquire, parse | F | Replace provider header with `ramify 1` followed by `module Bad_Name`. | Invalid child description at provider marker; no ancestor ownership assigned to its source. |
| I1-02:duplicate-name | 5 | acquire | F | Rename consumer's declared name to `provider`, preserving its physical directory. | Duplicate sibling declared names located at both headers; registry tree invalid. |
| I1-02:description-in-src | 5 | acquire | F | Add valid `ramify 1` / `module hidden` at `subs/consumer/src/hidden/module.ramify`. | Located forbidden description; `src/` never creates a new owner. |
| I1-02:stray-description | 5 | acquire | F | Add `loose/file.ts`, select `loose` in compiler include, then add valid `loose/module.ramify`. | Individual layout error on marker, alongside ordinary outside-source warning; valid contents do not make it a child. |
| I1-02:loose-subs-source | 5 | acquire | F | Add `subs/loose.ts`; append this exact file to compiler include. | One aggregated `subs` warning count 1; no layout error, owner or testing profile. |
| I1-02:sibling-tests | 5 | acquire | F | Add `tests/probe.ts`; append `tests` to compiler include. | One `tests` warning count 1; sibling name does not classify testing. |
| I1-02:sibling-interfaces | 5 | acquire | F | Add `interfaces/probe.ts`; append `interfaces` to compiler include. | One `interfaces` warning count 1; no owner, exposure or third source area. |
| I1-03:empty-owner | 5 | acquire | F | Add header-only `subs/empty/module.ramify` with `module empty` and no `src/`. | Fourth owner retained with intended `subs/empty/src`; all bytes/directory entries unchanged by acquisition. |
| I1-03:grouping-move | 5 | acquire | F | Move provider to `subs/group/provider`, retaining header/name and declared parent; acquire before and after. | Same ModuleId; physical directory/source roots change; imports need not be resolved in this acquisition-only fixture. |
| I1-03:rename | 5 | acquire | F | Change `module provider` to `module renamed`; acquire before/after. | New declared-path ID, no historical alias or invented migration. |
| I1-03:reparent | 5 | acquire | F | Move provider to `subs/consumer/subs/provider`; acquire before/after. | Provider's new declared path includes consumer and changes ID; no historical mapping. |
| I1-04:syntax-valid | 4 | parse | F | Parse each explicit valid-description variant below as independent bytes, before linking. | Every variant preserves token/statement spans and expected decoded AST; no filesystem claim. |
| I1-04:syntax-invalid | 4 | parse | F | Parse each explicit invalid-description variant below. | Located parse failure for that cause; no successful AST advertised. |
| I1-04:exact-path | 5 | acquire | F | Replace exact `interfaces/api.ts` source reference with each explicit no-probing variant below while retaining the real `.ts` file. | Invalid exact source path; compiler substitutions and aliases cannot repair descriptions. |
| I1-04:case-mismatch | 5 | acquire | F | Change only referenced `interfaces/api.ts` to `interfaces/Api.ts`; retain actual lowercase directory entry. | Invalid on Linux and macOS, even if filesystem lookup would find it. |
| I1-04:escape | 5 | acquire | F | Apply each containment/absolute-path variant below to a source reference. | Located invalid reference outside its fixed owned source root; no read outside authorized scope. |
| I1-04:symlink-root | 5 | acquire | F | Explicitly select a POSIX symlink `project-link` pointing to the fixture root. | Reject symlink module-root selection; distinct from canonicalizing an implicit working directory path. |
| I1-04:symlink-description | 5 | acquire | F | Replace provider marker with symlink to a copied real description file outside its directory. | Reject linked module-description file; do not accept target bytes as provider declaration. |
| I1-04:symlink-reference | 5 | acquire | F | Replace `P/api` with symlink to an ordinary file outside provider's `src/`. | Exact source reference invalid; no ownership escape. |
| I1-04:symlink-directory | 5 | acquire | F | Put symlink `subs/linked` to an external directory containing a valid module and source. | Do not traverse or discover its owner/source; source-root inventory is unchanged. |
| I1-05:missing-file | 7 | link | R | Replace C1's path with `interfaces/missing.ts`. | Invalid declaration at C1, missing file distinct from missing export; dependent source stage blocked. |
| I1-05:missing-export | 7 | link | R | Replace C1 selection `*` with `AbsentVocabulary`, keeping path and tags. | Located missing-export input error; existing catalog must not fabricate binding. |
| I1-05:name-collision | 7 | link | R | Replace C1 with named `RecordId as Shared, Revision as Shared` from its existing vocabulary file, tagged browser to parent. | Two distinct originals collide under `Shared`; whole contract invalid. |
| I1-05:conflicting-tags | 7 | link | R | Keep C1; append `expose-src RecordId from "interfaces/vocabulary.ts" tagged [] to parent`. | Conflicting explicit tag assignments to one original, both locations retained; no order dependence. |
| I1-05:same-original-repeat | 7 | link | R | Append a second named `RecordId` selection with `[browser]` and the same parent destination as C1. | Harmless same-name/same-original merge with both declaration witnesses. |
| I1-05:statement-permutation | 7 | link | R | Run original order, reverse each owner's exposure statements, then rotate them by one; retain headers and statement bodies. | Three separately recorded equivalent semantic contracts, ignoring source-span order alone. |
| I1-05:named-growth | 7 | link | R | Add exported `hiddenGrowth = 1` to K's `src/catalog.ts`; K1 stays named and unchanged. | New original catalogued with default tags, absent from K1/A3/W2 effective contracts. |
| I1-06:remove-hop | 9 | static-access | R | Remove only `createCatalogRouter` from W2; leave root `src/assembly.ts` import untouched. | Root access denied for missing visibility, original A/router.ts#createCatalogRouter, missing W2 hop evident. |
| I1-06:restore-hop | 9 | static-access | R | Start from same checked baseline, remove then restore W2's exact selection before a fresh check. | Root's unchanged import allowed with A1/W2 exposure evidence and same original identity. |
| I1-06:relay-only | 9 | link, static-access | R | Observe unchanged W2 and browser-classified W header, selecting server/dispatch createCatalogRouter. | Declaration relay valid despite W source being unable to value-import that unpromised original. |
| I1-06:source-forward | 9 | static-access | R | Add W/src/__i1_probe.ts re-exporting `{ createCatalogRouter }` from A/src/router.js. | Denied at forwarding file for missing browser promise after A1 visibility; does not invalidate W2 declaration. |
| I1-07:deeper-descendant | 9 | static-access | R | Add TK/subs/nested/module.ramify (`module nested`) and its src/probe.ts importing `RecordId` from C vocabulary. | New descendant receives existing C1/W1 path without added relays; type import allowed. |
| I1-07:reverse-task-controller | 9 | static-access | R | Add TK/src/__i1_probe.ts importing `tick` from CT/src/controller.js. | Denied visibility: CT1 stops at RC; RC3 exposes task originals only. |
| I1-07:validation-runtime | 9 | static-access | R | Add VL probe selecting runtime operation/type in separate variants below. | Both denied for absent descendant exposure of RC2; type-only syntax cannot create visibility. |
| I1-07:parent-private | 9 | static-access | R | Add A/src/__i1_probe.ts importing `resolvePredecessors` from K/src/history.js. | Parent cannot access child's unexposed private helper; missing visibility. |
| I1-08:import-rename | 9 | static-access | R | In root assembly change the import to `{ inspect as inspectLocal }`; change its port initializer from `{ inspect }` to `{ inspect: inspectLocal }`, preserving the required property name. | Original remains K/catalog.ts#inspect, tags empty, A3/W2 exposure alias unchanged. |
| I1-08:exposure-rename | 9 | link, static-access | R | In A3 rename exposed `inspectRecord` to `inspectPublic`; change W2 selection to `inspectPublic`; source imports unchanged. | Source's original inspect identity/tags and permission unchanged; exposure name changes coherently. |
| I1-08:same-owner-forward | 9 | catalog, static-access | R | Assert R3-selected protocol.ts `export type { AppRouter } from '../assembly.js'` and authored consumers. | Original is root assembly.ts#AppRouter, tags dispatch; accessed protocol file retained separately. |
| I1-08:same-spelling | 9 | catalog, static-access | F | Add consumer/src/local.ts exporting its own `value`; import it as `ownValue` beside provider value. | Same spelling yields two different originals/owners; own import allowed without exposure. |
| I1-08:new-wrapper | 9 | catalog, static-access | F | Add consumer header `[ui]` and consumer/src/wrapper.ts `import { value } from API; export const wrapped = () => value;`. | `wrapped` is a new consumer original with `[ui]`; it does not inherit provider's browser promise. |
| I1-08:new-type-alias | 9 | catalog, static-access | F | Add consumer header `[ui]`; define `import type { Type } from API; export type LocalType = Type;`. | LocalType is a new consumer original tagged ui, distinct from Type and from a forwarding alias. |
| I1-09:equivalent-names | 7 | catalog, link | R | Compare C1 wildcard with explicit names of all 17 current vocabulary exports in contract map, same tags/destination. | Exactly equal original/name pairs and C1/W1 reach; no signature-derived additions. |
| I1-09:add-export | 7 | catalog, link | R | Add `export const addedVocabulary = 1;` to C/src/interfaces/vocabulary.ts; fresh acquisition each run. | New owned original appears in C1 and W1 with browser assignment; old entries preserved. |
| I1-09:remove-export | 7 | catalog, link | R | Remove export modifier only from unused `revisionSchema`, leaving internal uses valid. | Fresh catalog and C1/W1 expansion lose that name; no stale retained contract. |
| I1-09:unselected-file | 7 | catalog, link | R | Add C/src/interfaces/unselected.ts exporting `unselected = 1`; keep C1 path. | Original remains private; directory membership alone does not select the file. |
| I1-09:signature-only-type | 7 | catalog, link | R | Observe `ToolInputSchema` and `ToolResult` in root protocol.ts signatures while R1 selects its four authored exports only. | Both private originals remain unexposed; McpToolContribution's signature does not expose them. |
| I1-09:empty-file | 7 | catalog, link | R | Add C/src/interfaces/empty.ts with `export {};`; add a wildcard for that exact file to parent. | Valid empty expansion retained with declaration evidence; original C1 unaffected. |
| I1-09:default | 7 | catalog, link | R | Add `export default function defaultVocabulary() { return 1; }` to vocabulary.ts. | Default binding included by C1 and relayed by W1, with browser tags. |
| I1-10:nested-interface | 7 | link | F | Add provider/src/interfaces/nested/extra.ts with `export const extra = 1`; wildcard exact `interfaces/nested/extra.ts` to parent. | Valid owned interface wildcard, extra selected. |
| I1-10:testing-module-interface | 7 | link | F | Change provider header to `[testing]`; add wildcard of P/api tagged `[testing]`, replacing its two named exposures. | Ordinary interface in testing module is a valid target; every expanded new binding retains testing. |
| I1-10:implementation | 7 | link | F | Copy P/api to provider/src/api.ts; wildcard `api.ts`. | Invalid wildcard location despite existing owned exports. |
| I1-10:tests-interface | 7 | link | F | Copy P/api to provider/src/tests/interfaces/api.ts; wildcard `tests/interfaces/api.ts`. | Invalid owned wildcard target; remains testing area. |
| I1-10:helpers-interface | 7 | link | F | Copy P/api to provider/src/helpers/interfaces/api.ts; wildcard `helpers/interfaces/api.ts`. | Invalid wildcard target outside direct owner's src/interfaces subtree. |
| I1-10:normalized-outside | 7 | link | F | Add provider/src/api.ts; wildcard `interfaces/../api.ts`. | Normalized resolved file is outside interfaces; invalid wildcard, even if path stays within src. |
| I1-10:directory | 7 | link | F | Wildcard `interfaces/` in provider. | Directory is not an exact source file; invalid target. |
| I1-10:glob | 7 | link | F | Wildcard path `interfaces/*.ts`. | No glob expansion; missing/invalid exact file target, never selection of api.ts. |
| I1-10:test-wildcard | 7 | parse, link | F | Add `expose-test * from "fixture.ts" to parent`. | Grammar rejects test wildcard; no linked selection. |
| I1-11:owned-alias | 7 | catalog, link | F | Add provider/src/interfaces/alias.ts `export { value as renamed } from './api.js'`; wildcard it without tag clause. | renamed preserves value's provider original and browser tags; legal same-owner expansion. |
| I1-11:resource-alias | 7 | resources, link | F | Add provider/src/theme.module.css, effective default resource shim, interface alias `export { default as styles } from '../theme.module.css'`; wildcard alias file. | Expanded styles keeps exact resource original/area and default tags; shim not owner. |
| I1-11:foreign-forward | 7 | catalog, link | F | Add consumer/src/interfaces/foreign.ts forwarding provider value; wildcard that file to parent. | Entire owned wildcard invalid because original is foreign, even though consumer source may import it. |
| I1-11:ambiguous-expansion | 7 | catalog, link | F | Create provider interfaces/a.ts and b.ts each exporting different `clash`; combined.ts star-forwards both; wildcard combined.ts. | Ambiguous export enumeration is intentional compiler negative; whole expansion invalid, no convenient subset. |
| I1-11:required-tag-omission | 7 | link | F | Set provider header `[ui]`; wildcard P/api explicitly tagged `[browser]` (replace named exposures). | Invalid assignment omits defining area's required ui tag. |
| I1-11:assignment-conflict | 7 | link | F | Keep explicit value `[browser]`; add wildcard P/api tagged `[]`. | Conflict for same value original invalidates complete contract; ordering irrelevant. |
| I1-11:cross-selection-collision | 7 | link | F | Combine named and wildcard selections under same exported name, with the two variants below. | Same original merges; distinct original invalidates; both independently recorded. |
| I1-11:literal-star-name | 7 | parse, catalog, link | F | Add provider/src/interfaces/star.ts `const starred = 1; export { starred as '*' };`; expose quoted `"*"` from it. | Exactly one literal-star export selected, distinct from bare wildcard syntax; moduleResolution bundler permits arbitrary export names. |
| I1-12:ui-value | 10 | tags-origin | R | Add K/src/__i1_probe.ts importing StatusBadge from SU/src/status-badge.js. | SU1/W5 establish visibility; deny missing required importer ui. |
| I1-12:ui-type | 10 | tags-origin | R | Same importer selecting StatusBadgeProps through statement-level type import. | Visible type denied missing ui, with no browser-value reason. |
| I1-12:dispatch-value | 10 | tags-origin | R | Prepare root src/interfaces/dispatch-probe.ts `export function dispatchProbe() { return 1; }`, expose it tagged [dispatch, browser] to descendants; add K/PU imports in separate variants. | Root-owned pure dispatch value visible with explicit browser promise; denied missing dispatch in both importer profiles. |
| I1-12:dispatch-type | 10 | tags-origin | R | Add K or PU type import of ProtocolFacilities from root interfaces/protocol.js in separate variants. | R1 establishes visibility; each importer denied missing dispatch. |
| I1-12:tag-without-path | 10 | tags-origin | R | Add TK import of CT tick; also add browser to importer header and explicit browser promise to CT1. | Still denied visibility because CT1 stops at RC; matching tags cannot supply the absent exposure. |
| I1-13:browser-value | 10 | tags-origin | F | Consumer header browser; replace its value selection with Runtime. | Visible foreign runtime binding lacking browser denied required-symbol tag. |
| I1-13:explicit-type | 10 | tags-origin | F | Browser consumer imports Runtime in each explicit type modifier variant below. | Both type-only requests allowed; no browser promise required. |
| I1-13:unmarked-interface | 10 | tags-origin | F | Browser consumer uses `import { Type } from API; let typed: Type;`. | Pure-type original yields type-only availability, allowed under valid non-verbatim configuration. |
| I1-13:unmarked-class | 10 | tags-origin | F | Browser consumer uses unmarked Runtime import only in a type annotation. | Runtime still requests value, denied missing browser despite later type usage. |
| I1-13:merged-runtime | 10 | tags-origin | F | Browser consumer imports Merged unmarked and uses `typeof Merged` as a type. | Function/namespace merge has runtime existence; value request denied missing browser. |
| I1-13:same-owner | 10 | tags-origin | F | Give provider header browser; add provider/src/local.ts importing Runtime from its own interfaces/api.js. | Ordinary source-origin check passes; same-owner exemption permits unpromised runtime binding. |
| I1-14:renamed-kinds | 3 | registry | M | Replace nonreserved defaults with `coupled` required-importer and `portable` required-symbol; mirror ui/browser classification and explicit symbol sets in fixture. | Same availability truth table by kind; registry identity changes; no hard-coded ui/browser behavior. |
| I1-14:conjunction | 3 | registry | M | Registry has two required-importer tags coupled/transport and two required-symbol tags portable/deterministic; test every single omitted requirement and all-present positive. | All applicable rules conjoin; five independent variants below. |
| I1-14:unknown | 3 | registry | M | Use unknown `unregistered` once in a module profile and once in a symbol assignment, separately. | Located invalid uses; no default acceptance of unknown name. |
| I1-14:duplicate | 3 | registry | M | Supply two definitions named coupled, separately with equal kinds and conflicting kinds. | Both duplicate sets invalid; identical duplicate not silently merged. |
| I1-14:invalid-kind | 3 | registry | M | Call validation with serialized input definition `{name:'coupled',kind:'custom'}`. | Explicit invalid registry rather than executing a project-supplied rule. |
| I1-14:remove-testing | 3 | registry | M | Supply otherwise complete definitions omitting testing. | Reserved testing removal invalid. |
| I1-14:rebind-testing | 3 | registry | M | Define testing as required-symbol. | Reserved kind rebinding invalid. |
| I1-14:two-evaluations | 3 | registry | M | Evaluate coupled requirement with one registry, dispose/finish; evaluate same source/tag names under a second registry binding coupled as required-symbol, keeping testing fixed. | Independent expected decisions and different identities; no definitions/decision cache leakage. |
| I1-15:derived-profile | 10 | tags-origin | R | Inspect W ordinary src versus W/src/tests and PU equivalents. | W tests testing/ui/dispatch and PU tests testing/ui; browser is absent; exact sets, not subset checks. |
| I1-15:child-profile | 10 | tags-origin | R | Compare RV dispatch header and child RC empty header/source profile. | RC ordinary profile remains empty; no parent dispatch inheritance. |
| I1-15:test-looking-file | 10 | tags-origin | F | Add consumer/src/example.test.ts importing provider value; consumer header browser. | File remains ordinary browser, not testing; no filename override. |
| I1-15:nested-helpers-tests | 10 | tags-origin | F | Add consumer/src/helpers/tests/probe.ts with consumer browser header and import of unpromised Runtime. | Ordinary browser profile; denied browser value proves nested name does not derive testing profile. |
| I1-15:own-private-test | 10 | tags-origin | R | Observe K/src/tests/catalog.test.ts access to K/src/history.ts resolvePredecessors. | Own testing area can access private production original without exposure. |
| I1-15:foreign-private-test | 10 | tags-origin | R | Add RC/src/tests/__i1_probe.ts importing K/src/history.js resolvePredecessors. | Foreign testing source denied visibility; testing does not expose private helper. |
| I1-16:foreign-fixture | 10 | tags-origin | R | Observe RC/src/tests/runtime.test.ts importing K/src/tests/fixture.js makeCatalogFixture. | Allowed with K2/A4/W3 and both importer/original testing areas retained. |
| I1-16:remove-fixture-hop | 10 | tags-origin | R | Delete W3 only, retaining K2/A4 and all source. | RC test import denied visibility while K's own tests stay allowed; no origin violation invented. |
| I1-16:production-value | 10 | tags-origin | R | Add makeCatalogFixture imports in K/src/__i1_probe.ts and RC/src/__i1_probe.ts as separate variants. | Both same-owner and foreign ordinary production denied testing-source origin before exemptions/tags. |
| I1-16:production-type | 10 | tags-origin | R | Same two importer variants using explicit type-only makeCatalogFixture import. | Both denied testing-source origin; erasure cannot bypass isolation. |
| I1-16:production-side-effect | 10 | tags-origin | R | Same two importer variants with symbol-free import of K/src/tests/fixture.js. | Both denied testing-source origin, with no dummy symbol request. |
| I1-16:testing-barrel | 10 | tags-origin | F | Add provider/src/tests/barrel.ts re-exporting production value; provider/src/probe.ts imports value through that barrel. | Denied accessed testing path although original is same-owner ordinary value. |
| I1-16:production-forwarding-test | 10 | tags-origin | R | Add K/src/barrel.ts re-exporting makeCatalogFixture from its tests, and ordinary K/src/__i1_probe.ts consuming that barrel. | Forwarding file itself denied, downstream original/path provenance retains testing; ordinary barrel does not launder source area. |
| I1-17:production-tagged-testing | 10 | tags-origin | F | Explicitly assign `[testing]` to ordinary provider Runtime, retain parent exposure; import from provider/src/local.ts and ordinary consumer separately. | Same-owner production allowed after ordinary origin; foreign production denied required importer testing. |
| I1-17:separate-testing-module | 10 | tags-origin | R | Observe IT header `[testing, dispatch]` and R2 setup import; add IT/src/__i1_probe.ts importing root-private assembleSystem. | Ordinary IT src uses full header; setup allowed, root-private assembly denied visibility. |
| I1-17:testing-module-browser | 10 | tags-origin | F | Consumer header `[testing, browser]`; ordinary src imports unpromised Runtime, then a fresh positive adds explicit browser to Runtime exposure. | First denied required-symbol browser despite testing; positive allowed with promise. |
| I1-17:nested-tests | 10 | tags-origin | F | Consumer header `[testing, browser]`; its src/tests/probe.ts imports unpromised Runtime. | Derived profile exactly testing, no browser; authorized type/value imports allowed. |
| I1-18:js-substitution | 9 | catalog, static-access | R | Inspect root assembly's `.js` imports of existing `.ts` owners. | Resolved original uses defining `.ts` file; written `.js` target spelling retained separately. |
| I1-18:path-alias | 9 | catalog, static-access | R | Compare W app's CatalogCard `@features/catalog/subs/ui/src/catalog-card.js` import with fresh copy using relative `../subs/catalog/subs/ui/src/catalog-card.js`. | Identical KU original and permission; alias is configured project resolution. |
| I1-18:AppRouter-forward | 9 | catalog, static-access | R | Assert W/src/client.ts import through root interfaces/protocol.js and RU inline import. | R3 selects root assembly AppRouter original and dispatch tags for both forms. |
| I1-18:named-default | 9 | catalog, static-access | F | Run named value import and default import variants below, including explicit same-original default forwarding alias fixture. | Selected names and default alias preserve expected originals; named and default exports are not conflated by spelling. |
| I1-18:source-types | 9 | static-access | R | Add K probe importing root ProtocolFacilities using both type modifiers; named forwarding forms are separate variants. | All retain required-importer dispatch denial through visible R1; forwarding file is importer. |
| I1-18:application-alias | 9 | catalog, static-access | R | Assert W app's authored `@features/...` CatalogCard access. | Resolved target belongs to KU, never external merely because specifier is bare. |
| I1-19:namespace-members | 11 | namespace | F | Consumer `import * as ns from API; void ns.value;`. | Exactly value selected/allowed; no request for privateValue or unrelated exports. |
| I1-19:literal-key | 11 | namespace | F | Consumer selects ns['value'] and ns["value"] in separate variants. | Each selects only value with same original; complete coverage. |
| I1-19:destructure | 11 | namespace | F | Consumer destructures `{ value }` or `{ value: renamed }` from imported namespace separately. | Only value selected in each; renaming preserves original. |
| I1-19:qualified-type | 11 | namespace | F | Ordinary and type-only namespace import variants use `type Local = ns.Type`. | Type-only request for Type, no runtime namespace property assumption. |
| I1-19:private-growth | 11 | namespace | F | After checking explicit ns.value, append exported `privateGrowth = 3` to P/api without exposure. | Existing explicit selection unchanged, private original catalogued but never requested. |
| I1-19:unknown-key | 11 | namespace, coverage | F | Consumer declares `key: keyof typeof ns` then selects `ns[key]`; key is not a literal selection and compiler syntax is valid. | Explicit `unknown-key` coverage note; no broad allowed selection, no definite violation for unknown target. |
| I1-19:escape | 11 | namespace, coverage | F | Pass namespace to `declare function consume(x: unknown): void`; invoke consume(ns). | Namespace escape is partial coverage, not allowed/external or definite denial. |
| I1-19:known-denial-plus-escape | 11 | namespace, coverage | F | Select ns.privateValue, then pass ns to consume declared above. | Known visibility denial retained alongside namespace-escape note; failed bounded check. |
| I1-20:source-star | 11 | namespace | F | Replace consumer probe with `export * from API`. | Check all star members except default: value/Type/Runtime/Merged allowed; privateValue/PrivateType denied; no silent removal. |
| I1-20:type-star | 11 | namespace | F | Consumer `export type * from API`. | Same non-default membership, all type-only; private members still denied visibility. |
| I1-20:namespace-export | 11 | namespace | F | Consumer `export * as ns from API`. | Whole namespace includes default plus other exports; known private originals denied. |
| I1-20:type-namespace-export | 11 | namespace | F | Consumer `export type * as ns from API`. | Whole namespace including default, exclusively type-only; private members denied. |
| I1-20:downstream-selection | 11 | namespace | F | Consumer star-forwards API; consumer/src/use.ts imports only value from ./probe.js. | Forwarding probe still requests all star exports and fails private selections; downstream use cannot narrow it. |
| I1-20:no-declaration | 11 | namespace | F | Prepare F with provider moved to consumer/subs/provider, root relay removed, and consumer probe forwarding value from `../subs/provider/src/interfaces/api.js`; root/src/use.ts imports value from `../subs/consumer/src/probe.js`. | Consumer can import child value via provider parent exposure; root cannot: consumer has no to-parent declaration. Denied visibility proves source forwarding alone creates no exposure. |
| I1-21:reference-lazy | 11 | lazy | R | Check W/src/app.tsx's authored `.then((panel) => ({ default: panel.ReviewPanel }))` callback. | Only ReviewPanel original selected; RU1/RV5 and W header satisfy tags; no lazy coverage gap. |
| I1-21:await-member | 11 | lazy | F | Apply direct awaited member and awaited namespace member/literal-key variants below. | Each selects only value as runtime binding; no unrelated private requests. |
| I1-21:await-destructure | 11 | lazy | F | `const { value: local } = await import(API); void local;`. | Value original selected once, full bounded coverage. |
| I1-21:then-member | 11 | lazy | F | Direct callback dot and literal-key selections below. | Each checks only value original as runtime request. |
| I1-21:then-destructure | 11 | lazy | F | `import(API).then(({ value: local }) => local)`. | Destructured callback selects provider value, no namespace escape. |
| I1-21:import-type | 11 | lazy | F / J | Separate TS `type Local = import(API).Type` and checked-JavaScript JSDoc variants below. | Type-only Type request, no runtime load; both configurations and evidence records required. |
| I1-21:typeof-import-member | 11 | lazy | F | Browser consumer defines `type Local = typeof import(API).Runtime`. | Runtime's type selected, allowed without browser promise, no runtime load. |
| I1-21:typeof-import-namespace | 11 | lazy | F | `type Namespace = typeof import(API)` with consumer browser header. | Types of runtime namespace members including default selected; privateValue denied visibility, type-only exports not invented as runtime members; no browser-value denial. |
| I1-21:nonliteral-target | 11 | lazy, coverage | F | `declare const target: string; void import(target);` and nonliteral template variant below. | Explicit unresolved dynamic-target coverage note; no inferred external or same-owner target. |
| I1-22:hook-side-effect | 11 | symbol-free | R | Observe IT/src/steps/collection-review.steps.ts `import '../support/hooks.js'`. | Known testing module target loaded by testing importer, allowed without dummy symbol; K05 runtime regression remains separate. |
| I1-22:empty-import | 11 | symbol-free | F | Consumer `import {} from API`. | Resolved ordinary target passes origin; zero symbol requests and no exposure requirement for its private exports. |
| I1-22:empty-export | 11 | symbol-free | F | Consumer `export {} from API`. | Same known-target origin check, zero selected originals. |
| I1-22:discarded-lazy | 11 | symbol-free, lazy | F | Consumer `await import(API);` with result discarded. | Zero symbol requests; resolved ordinary target passes origin. |
| I1-22:inline-type-statement | 11 | symbol-free | F | Set `verbatimModuleSyntax:true`; browser consumer uses `import { type Type } from API`. | Type-only request passes; retained statement/runtime load checked independently, no invented browser requirement. |
| I1-22:testing-target | 11 | symbol-free, tags-origin | F | Add provider/src/tests/hook.ts with `export {};`; ordinary provider or consumer loads it through each explicit load variant below. | Denied known testing target even with no selected symbols; same-owner and foreign records distinct. |
| I1-23:two-css-resources | 6 | catalog, resources | R | Read KU/catalog-card.module.css and PU/review-result.module.css and their actual import declarations under shared vite/client shim. | Two resource originals with distinct owned paths, each default export and ui tags; shared shim symbol never merges them. |
| I1-23:resource-alias | 6 | catalog, resources | R | Add KU/src/styles-alias.ts forwarding default from ./catalog-card.module.css as cardStyles. | Forwarded binding retains KU resource identity/source area/default tags, separate from alias file. |
| I1-23:missing-resource | 12 | resources, coverage, session | R | Delete KU's CSS file while keeping authored source import; separately add exposure to that missing file in declaration variant. | Source-only case is explicit unverifiable target, not external; declaration variant invalid input. Two records below. |
| I1-23:missing-resource-export | 12 | resources, session | R | Add named `absentStyle` import of KU CSS in KU/src/__i1_probe.ts while effective shim exports only default. | Public real session reports located missing-export error and failed check; intentional compiler missing-name error is not downgraded to coverage. |
| I1-23:json-binding | 6 | catalog, resources | F | Add provider/src/data.json `{ "count": 1 }`, import its default in provider/src/json.ts under resolveJsonModule. | Resolved resource owns default/effective exports, independent of synthetic declaration representation. |
| I1-23:testing-style | 10 | resources, tags-origin | R | Copy KU CSS to KU/src/tests/theme.module.css; ordinary KU source imports its default under same shim. | Testing origin denied before same-owner exemption; resource path establishes source area. |
| I1-24:external | 12 | coverage, session | R | Select actual root imports of installed @trpc/server and node:http (separate records below). | Proven dependency/builtin targets outside application model; no fabricated owner or allowed application request. |
| I1-24:unresolved | 12 | coverage, session | F | Consumer imports `missing` from `@unmapped/application`; no matching path/package/declaration. | Resolution coverage note at import; not external based on bare spelling; partial bounded check may complete. |
| I1-24:unsupported-macro | 12 | coverage, session | R | Add W/src/__i1_probe.ts `const modules = import.meta.glob('./*.tsx'); void modules;`. | Vite glob is explicit unsupported macro coverage, no assumed target permission or implementation adapter. |
| I1-24:unsupported-commonjs | 12 | coverage, session | F | Use separate compiler-valid CommonJS-pattern fixture variants below. | Potential cross-module access unsupported/unverifiable, no translation to automatic permission. |
| I1-24:partial-clean | 12 | coverage, session | F | Add nonliteral dynamic import to the unchanged allowed named-import consumer. | Completed bounded session has allowed known access plus coverage note, no failure; later CLI mapping exit 0. |
| I1-24:partial-denied | 12 | coverage, session | F | Same prepared partial baseline plus named privateValue import. | Same coverage note and definite visibility denial both retained; failed check/later exit 1. |
| I1-24:resolution-blocked | 12 | coverage, session | F | Add provider/src/interfaces/broken.ts `export { broken } from './missing.js';`; consumer imports broken from that file beside its valid value import. Leave broken unselected by descriptions. | Compiler problem only on blocked construct as coverage; known selection still checked; compiler diagnostics alone not import violations. |
| I1-25:purpose | 5 | metadata | F | Set provider README to heading, list, first top-level prose `Provider purpose.`, then second prose paragraph. | Exact first prose summary `Provider purpose.` and root-relative README path; no heading/list fallback. |
| I1-25:missing-readme | 5 | metadata | F | Delete provider README only. | Explicit `ModulePurpose.state = 'missing-file'`, no inherited/root purpose and no description/import failure. |
| I1-25:no-paragraph | 5 | metadata | F | Provider README contains heading and list only. | Explicit `ModulePurpose.state = 'no-paragraph'` retaining README path, no fallback. |
| I1-25:readme-edit | 5 | metadata | F | Fresh acquire baseline then replace purpose paragraph with `Updated provider purpose.`; source/descriptions unchanged. | New captured README identity/metadata; ownership/exposure inputs unchanged; later full gate additionally confirms unchanged permission results. |
| I1-26:human-json | 13 | cli, session | R | Run compiled `check --root R` and `check --root R --format json` against identical bytes. | Same semantic findings, warnings, coverage, root/config and completed stages; formatting-only differences, deterministic locations. |
| I1-26:missing-stage | 13 | cli, session | F | Through injected batch operation provide a report with access stage not executed. | CLI cannot emit success from empty findings; incomplete/unavailable exit 2. |
| I1-26:failed-resolver | 13 | cli, session | F | Inject resolver execution failure before catalog completion through real session test binding. | Explicit incomplete/blocked stages and exit 2, no empty success; cleanup verified. |
| I1-26:browser-verifier-request | 13 | cli, session | F | Request `browser-verification` in direct batch/session capability input; separately test unsupported CLI command `verify-browser`. | API explicitly unavailable and CLI unsupported invocation exit 2; normal browser tag matching remains implemented. No undocumented check flag added. |
| I1-26:help-version | 13 | cli | T | Launch actual compiled --help and --version as separate records, tracing loaded modules. | Exit 0; no TypeScript, React, MCP, HTTP/web adapter load. |
| I1-27:self-check | 15 | session, cli | T | Run compiled CLI and direct session over migrated toolkit. | Current declarations, all implemented owner source and tests pass; independent scripts/site/example absent from program. |
| I1-27:self-negative | 15 | session, cli | T | Add `subs/presentation/subs/layout/src/__i1_probe.ts`: `import type { BatchInvocation } from '../../../../../src/interfaces/batch.js'; export type Probe = BatchInvocation;`. | Root descendant exposure establishes visibility; deny required importer dispatch. Original ramify/src/interfaces/batch.ts#BatchInvocation; importer ramify/presentation/layout ordinary browser profile. |
| I1-27:cancel | 12 | session | F | Abort real analysis at captured input acquisition and at compiler/catalog work in separate deterministic barriers. | Interrupted operation releases input/compiler state; no late completed result; later CLI cancellation exit 130. |
| I1-27:read-failure | 12 | session | F | Inject captured-view read error at provider's api.ts after discovery, using input adapter fault rather than POSIX mode bits. | Operational incomplete result retains earlier evidence, dependent stages blocked, all resources released. |
| I1-27:dispose | 12 | session | F | Dispose after completed run and during a held in-flight run, separately; repeat disposal. | Idempotent cleanup, rejected new work after disposal, no late success; already returned plain report remains usable. |
| I1-27:report-retention | 12 | session | F | Retain completed report, dispose session, traverse every report property/prototype and perform repeated create/analyze/dispose memory workload. | Only immutable plain serializable data; no AST/symbol/program/cache handles or hidden session retention; memory assertions follow scope budgets. |
| I1-28:compiled-cli-clean | 13 | cli | R | Invoke installed bin `ramify check --root R` with human and JSON variants. | Real process exit 0 and one completed result; warnings allowed, no daemon. |
| I1-28:compiled-cli-denied | 13 | cli | R | Apply exact I1-06 remove-hop cause; execute both formats. | Exit 1 with located root createCatalogRouter visibility denial and same semantics in both formats. |
| I1-28:compiled-cli-invalid | 13 | cli | R | Replace C1 source path with missing file, execute both formats. | Exit 1, located invalid declaration, blocked dependent source checking; not exit 0/2. |
| I1-28:compiled-cli-unavailable | 13 | cli | F | Exercise missing configuration, solution-only references, unsupported command and invalid format variants below. | Each real process exits 2, explicit cause, no guessed project configuration or capabilities. |
| I1-28:compiled-cli-warnings | 13 | cli | F | Add compiler-selected loose/file.ts without description and run both formats. | Visible aggregated warning, no layout failure, exit 0 in human and JSON; no strict flag. |
| I1-28:compiled-cli-stray-description | 13 | cli | F | Same prepared selected outside file plus valid loose/module.ramify; run both formats. | Located marker layout error and exit 1 in both formats; marker not included in ordinary-file warning count. |
| I1-28:no-servers | 13 | cli | R | Run actual clean batch CLI under process/listener tracing and wait for process exit. | No listen/bind or daemon spawn and prompt process release; do not merely grep output for server names. |
| I1-28:relocated-package | 15 | cli, build-selection | T | Copy package without node_modules/dist/enclosing repo to unique temp parent, install, clean build, install its bin, then check copied reference. | Build bootstraps without existing dist; installed executable/entries resolve locally; clean/denied behavior preserved without enclosing repository. |
| I1-29:explicit-root | 5 | acquire | F | Place another invalid ramified project above fixture and explicitly select F. | Root selection given=F; ancestor project is not inventoried or analyzed (compiler ancestor lookup remains only if F config absent). |
| I1-29:root-from-subdirectory | 5 | acquire | F | Set working directory to consumer/src; omit explicit root. | Same complete F root selected by climb, selection method found; all owners inventoried. |
| I1-29:root-from-grouped-subdirectory | 5 | acquire | F | Move consumer physically under subs/group/consumer; cwd there/src, descriptions retain declared parent/name. | Climb crosses ordinary grouping directory and selects full F root. |
| I1-29:root-outside | 5 | acquire | F | Cwd is fresh unmarked directory beside fixture, containing fixture only in a subdirectory. | No-project unavailable, names cwd; never searches below cwd; later CLI exit 2. |
| I1-29:nested-project-root | 5 | acquire | F | Place independent described/configured child project at examples/demo and at subs/consumer/examples/demo in separate variants; cwd inside each. | Nearest independent root selected; enclosing subs ancestry does not cross nearer non-subs boundary. |
| I1-29:outside-module-target | 12 | acquire, coverage, session | F | Add selected root loose.ts exporting loose; consumer imports it using correct relative path. | Warning plus located outside-scope analysis limit; no application allowed verdict and no external dependency classification. |
| I1-29:stray-files | 5 | acquire | F | Add selected root config-extra.ts, tests/a.ts and tests/b.ts, plus unselected ignored/c.ts; no descriptions there. | Warnings root config-extra count 1 and tests count 2 only; no failure, no classification; ignored file silent. |
| I1-29:scope-report | 5 | acquire | R | Acquire unchanged root explicitly and from W/src in independent records. | Effective real root, given/found method, tsconfig path, every walked ordinary/test area and configuration inputs visible; same owned scope. |
| I1-29:changed-input | 12 | acquire, session | F | At controlled read barrier change provider api.ts once, then in separate variant on every acquisition attempt. | Finite whole-acquisition retry yields coherent bytes/identity in once case; exhaustion explicit incomplete, never mixed-state success. |
| I1-30:reference-regression | 14 | regression | R | Run example type-check, Vitest, Vite build and real Cucumber scenario through existing reference-report tiers, each with separate execution/duration. | All actual application/protocol/Cucumber assertions pass; this does not substitute for architectural source evidence. |
| I1-30:test-discovery | 14 | regression | T / F | Enumerate migrated tests against move-map; add small testing-module fixture with ordinary src/*.test.ts and nested src/tests helper/test. | Every owner test and testing-module ordinary test discovered exactly once; no lost migrated tests or unregistered assertion. |
| I1-30:production-selection | 14 | build-selection | T / F | Invoke iteration 8 production:files and actual clean production build on toolkit and standalone testing-module fixture, separately. | Both src/tests and testing module ordinary src excluded; ordinary interfaces retained; full type-check/test inputs unchanged; build consumes identical selected set. |
| I1-30:harness-required | 14 | harness-gate | H | Independently remove required record, disable required handler, and inject failed assertion in intermediate/full modes, per variants below. | Every sabotage fails its gate; remaining pending work cannot mask failure; unsabotaged intermediate gate succeeds while final iteration-15 requirements remain explicitly pending. |

## Explicit variant execution records

These suffixes are part of required membership, not suggestions for a test
framework's internal parameterization. `D` below is the exact description
`ramify 1\nmodule provider\nexpose-src value from "interfaces/api.ts" to parent\n`.
Escapes shown in backticks specify fixture bytes; literal escape spellings
inside a description string are identified explicitly. Valid syntax probes
assert original UTF-16 offsets as well as normalized AST values. Invalid syntax
probes exercise parsing/decoded-name validation, not filesystem linking.

| Leaf ID | Exact independent fixture change or invocation | Additional expected assertion |
| --- | --- | --- |
| I1-04:syntax-valid/lf | D unchanged. | Version/header plus one exposure statement; LF spans. |
| I1-04:syntax-valid/crlf | Replace every LF in D with CRLF. | Same AST; source spans point into original CRLF text. |
| I1-04:syntax-valid/bom | Prefix D with exactly UTF-8 EF BB BF. | One initial BOM accepted, UTF-16 locations include the decoded BOM. |
| I1-04:syntax-valid/no-final-newline | Remove final LF from D. | Last statement still parsed completely. |
| I1-04:syntax-valid/comments | Add `// header` line and trailing `// expose value` comment. | Comments excluded from tokens, statement locations correct. |
| I1-04:syntax-valid/string-comment | Source path becomes `interfaces//api.ts`. | `//` inside string is path text, not a comment; parser only assertion. |
| I1-04:syntax-valid/space-tab | Add spaces/tabs around lines, between mandatory tokens and around list commas. | Only permitted horizontal whitespace normalized. |
| I1-04:syntax-valid/quoted-reserved | Header `module "testing"`; selection `"from" as "to"` from keywords.ts. | Names decoded exactly; name testing alone adds no tag. |
| I1-04:syntax-valid/keyword-prefix | Header `module testing-tools`; select `fromValue` and `From`. | Maximal words are names, case-sensitive. |
| I1-04:syntax-valid/escaped-quote | Quoted selected name contains literal escape `\"`. | Decodes embedded quote without terminating string. |
| I1-04:syntax-valid/escaped-backslash | Quoted selected name contains literal escape `\\`. | Decodes one backslash; no mistaken comment/string end. |
| I1-04:syntax-valid/escaped-slash | Path contains literal escape `\/` between interfaces and api.ts. | Decodes slash, exact expected string. |
| I1-04:syntax-valid/unicode-scalar | Quoted selected name uses literal `\u03B1`. | Decodes Greek alpha, no Unicode normalization. |
| I1-04:syntax-valid/surrogate-pair | Quoted selected name uses literal `\uD83D\uDE00`. | Decodes one scalar, not two isolated surrogates. |
| I1-04:syntax-valid/empty-tags | Header and source statement each use `tagged []`. | Explicit empty sets preserved, distinct syntax from omitted clause. |
| I1-04:syntax-valid/all-destinations | Source statement ends `to parent, descendants`. | Both distinct destinations preserved. |
| I1-04:syntax-valid/child-wildcard | Add `expose-sub * from child to descendants`. | Entire wildcard child selection, no tag override. |
| I1-04:syntax-valid/interface-wildcard | Replace selection value in D with bare `*`. | Owned wildcard syntax parsed, later location validation still required. |
| I1-04:syntax-valid/named-test | Add `expose-test fixture as helper from "fixture.ts" tagged [testing] to parent`. | Named test selection parsed relative to separate source root. |
| I1-04:syntax-valid/custom-tag | Header `module provider tagged [custom-tag]`; fixture registry defines custom-tag required-importer, but parseDescription receives text only. | Registered tag is not a new grammar keyword. |
| I1-04:syntax-invalid/version | D version becomes 2. | `unsupported-version`: Unknown-version diagnostic. |
| I1-04:syntax-invalid/missing-version | Delete D first line. | `missing-version`: Required version header failure. |
| I1-04:syntax-invalid/header-order | Put module line before version. | `invalid-order`: Header ordering failure. |
| I1-04:syntax-invalid/unknown-clause | Append `except child` to exposure statement. | `unknown-clause`: Unknown syntax rejected, no partial successful statement. |
| I1-04:syntax-invalid/semicolon | Append semicolon to module header. | `trailing-token`: Semicolons invalid. |
| I1-04:syntax-invalid/test-profile | Add `tests tagged [testing, browser]`. | `test-profile-declaration`: No test-profile declaration language. |
| I1-04:syntax-invalid/bare-cr | Replace one LF separator with bare CR. | `bare-cr`: Bare CR rejected. |
| I1-04:syntax-invalid/interior-bom | Add BOM immediately before module line. | `invalid-whitespace`: BOM accepted only at initial byte position. |
| I1-04:syntax-invalid/double-bom | Prefix D with two BOMs. | `invalid-whitespace`: At most one initial BOM. |
| I1-04:syntax-invalid/unknown-escape | String path contains literal escape `\q`. | `invalid-escape`: Invalid escape located. |
| I1-04:syntax-invalid/isolated-high-surrogate | Selected quoted name is literal `"\uD83D"`. | `invalid-scalar`: Unpaired high surrogate rejected. |
| I1-04:syntax-invalid/isolated-low-surrogate | Selected quoted name is literal `"\uDE00"`. | `invalid-scalar`: Unpaired low surrogate rejected. |
| I1-04:syntax-invalid/escaped-control | Selected name contains literal `\n`. | `invalid-name`: Legal escape decoding to forbidden name control rejected. |
| I1-04:syntax-invalid/delete-control | Selected name contains literal `\u007f`. | `invalid-name`: Decoded DEL rejected. |
| I1-04:syntax-invalid/empty-name | Selected name is `""`. | `empty-name`: Nonempty decoded-name constraint. |
| I1-04:syntax-invalid/empty-path | Source path is `""`. | `empty-name`: Nonempty decoded-path constraint. |
| I1-04:syntax-invalid/unquoted-reserved | Selected name is bare `from` in name position. | `reserved-name`: Exact keyword cannot be a bare name. |
| I1-04:syntax-invalid/quoted-tag | Header uses `tagged ["browser"]`. | `invalid-tag-syntax`: Tags must be bare names. |
| I1-04:syntax-invalid/quoted-destination | Exposure ends `to "parent"`. | `invalid-destination`: Destination keyword cannot be quoted. |
| I1-04:syntax-invalid/duplicate-tag | Header uses `tagged [ui, ui]`. | `duplicate-tag`: Duplicate tag-list item rejected. |
| I1-04:syntax-invalid/duplicate-destination | Exposure ends `to parent, parent`. | `duplicate-destination`: Duplicate destination rejected. |
| I1-04:syntax-invalid/trailing-selection-comma | Selection is `value,`. | `invalid-list`: No trailing comma. |
| I1-04:syntax-invalid/trailing-tag-comma | Header uses `tagged [ui,]`. | `invalid-list`: No trailing comma. |
| I1-04:syntax-invalid/trailing-destination-comma | Exposure ends `to parent,`. | `invalid-list`: No trailing comma. |
| I1-04:syntax-invalid/wildcard-mixed | Selection `*, value`. | `invalid-selection`: Wildcard must be entire selection. |
| I1-04:syntax-invalid/wildcard-alias | Selection `* as all`. | `invalid-selection`: Wildcard cannot be aliased. |
| I1-04:syntax-invalid/child-tag-override | `expose-sub value from child tagged [browser] to parent`. | `unknown-clause`: Re-exposure cannot assign tags. |
| I1-04:syntax-invalid/multiline-statement | Split the quoted source path after `interfaces/` with a physical LF before its closing quote. | `unterminated-string`: One physical line per statement. |
| I1-04:syntax-invalid/non-ascii-whitespace | Replace mandatory space after module with NBSP. | `invalid-whitespace`: NBSP is not token separator. |
| I1-04:syntax-invalid/invalid-module-name | Header `module "Bad_Name"`. | `invalid-name`: Quoting does not relax module-name spelling. |
| I1-04:syntax-invalid/missing-source | `expose-src value to parent`. | `missing-from`: Mandatory from/path missing. |
| I1-04:syntax-invalid/missing-destination | `expose-src value from "interfaces/api.ts"`. | `missing-to`: Mandatory destination missing. |
| I1-04:syntax-invalid/json-object | Add `{ "expose": "value" }` as statement. | `unknown-statement`: No alternative JSON grammar. |
| I1-04:exact-path/js-extension | Replace path with `interfaces/api.js`. | Existing api.ts does not satisfy exact declared path. |
| I1-04:exact-path/extensionless | Replace path with `interfaces/api`. | No extension probing. |
| I1-04:exact-path/configured-alias | Replace path with `@provider/interfaces/api.ts`. | No compiler path-alias probing. |
| I1-04:escape/parent | Reference `../outside.ts`; create actual provider/outside.ts. | Cannot escape provider/src. |
| I1-04:escape/absolute | Reference absolute path of P/api. | Absolute owned reference invalid even if file belongs to same owner. |
| I1-05:statement-permutation/original | Original exposure order. | Baseline semantic contract recorded. |
| I1-05:statement-permutation/reversed | Reverse each owner's exposure lines. | Same semantic contract. |
| I1-05:statement-permutation/rotated | Rotate exposure lines one position. | Same semantic contract. |
| I1-07:validation-runtime/value | VL probe imports RC/src/runtime.js createReviewRuntime. | Visibility denied. |
| I1-07:validation-runtime/type | VL probe imports type ReviewOutcome from same file. | Visibility denied. |
| I1-11:cross-selection-collision/same-original | Existing value exposure plus interface alias `export { value } from './api.js'`, wildcard alias file. | Name value merges one original across selections. |
| I1-11:cross-selection-collision/distinct-original | Alias file defines its own exported value instead of forwarding it; wildcard unchanged. | Different originals collide as value; full contract invalid. |
| I1-12:dispatch-value/core | K probe imports root src/interfaces/dispatch-probe.js dispatchProbe. | Missing dispatch; browser not in importer. |
| I1-12:dispatch-value/pure-ui | PU probe imports root src/interfaces/dispatch-probe.js dispatchProbe. | Missing dispatch; explicit browser promise avoids a second independent tag cause. |
| I1-12:dispatch-type/core | K type-imports root ProtocolFacilities. | Missing dispatch. |
| I1-12:dispatch-type/pure-ui | PU type-imports root ProtocolFacilities. | Missing dispatch only; no browser-value request. |
| I1-13:explicit-type/statement | `import type { Runtime } from API;`. | Explicit type-only form. |
| I1-13:explicit-type/inline | `import { type Runtime } from API;`. | Type-only binding; written statement kept separately. |
| I1-14:conjunction/all-present | Importer coupled/transport/portable/deterministic; original same set. | Value allowed. |
| I1-14:conjunction/missing-importer-coupled | Remove coupled only from importer. | Denied coupled requirement. |
| I1-14:conjunction/missing-importer-transport | Remove transport only from importer. | Denied transport requirement. |
| I1-14:conjunction/missing-symbol-portable | Remove portable only from original. | Denied portable value requirement. |
| I1-14:conjunction/missing-symbol-deterministic | Remove deterministic only from original. | Denied deterministic value requirement. |
| I1-14:unknown/header | Unknown tag in importer profile. | Invalid tag use. |
| I1-14:unknown/symbol | Unknown tag in original assignment. | Invalid tag use. |
| I1-14:duplicate/same-kind | Duplicate coupled required-importer definition. | Duplicate rejected. |
| I1-14:duplicate/conflicting-kind | coupled assigned required-importer and required-symbol. | Conflict rejected. |
| I1-16:production-value/same-owner | K ordinary source imports own makeCatalogFixture value. | Testing-origin denial before same-owner exemption. |
| I1-16:production-value/foreign-owner | RC ordinary source imports K fixture value. | Testing-origin denial. |
| I1-16:production-type/same-owner | K ordinary source type-imports own makeCatalogFixture. | Testing-origin denial. |
| I1-16:production-type/foreign-owner | RC ordinary source type-imports K fixture. | Testing-origin denial. |
| I1-16:production-side-effect/same-owner | K ordinary source symbol-free loads own fixture. | Testing-origin denial without symbol. |
| I1-16:production-side-effect/foreign-owner | RC ordinary source symbol-free loads K fixture. | Testing-origin denial without symbol. |
| I1-17:testing-module-browser/unpromised | Original Runtime has no browser promise. | Required-symbol browser denial. |
| I1-17:testing-module-browser/promised | Add browser to Runtime's explicit exposure assignment in prepared baseline. | Authorized testing/browser importer allowed. |
| I1-18:named-default/named | Consumer selects named value in F. | Provider value original. |
| I1-18:named-default/default | Consumer default-imports F's named defaultValue function. | Own default function original, distinct from value. |
| I1-18:named-default/forwarded-default | Replace function default export with `export { value as default }`; consumer default-imports API. | Same original as named value, preserving value browser assignment. |
| I1-18:source-types/import-statement | K `import type { ProtocolFacilities }` from root protocol interface. | Type request, dispatch denial. |
| I1-18:source-types/import-inline | K `import { type ProtocolFacilities }` from same file. | Type request, dispatch denial. |
| I1-18:source-types/export-statement | K `export type { ProtocolFacilities } from ...`. | Forwarding K is importer, dispatch denial. |
| I1-18:source-types/export-inline | K `export { type ProtocolFacilities } from ...`. | Same type request, dispatch denial. |
| I1-19:literal-key/single-quote | ns['value']. | Only value selected. |
| I1-19:literal-key/double-quote | ns["value"]. | Only value selected. |
| I1-19:destructure/direct | `const { value } = ns;`. | Only value selected. |
| I1-19:destructure/renamed | `const { value: local } = ns;`. | Same original retained. |
| I1-19:qualified-type/ordinary-namespace | `import * as ns from API; type Local = ns.Type;`. | Type-only Type request. |
| I1-19:qualified-type/type-namespace | `import type * as ns from API; type Local = ns.Type;`. | Type-only Type request, explicit erased namespace. |
| I1-21:await-member/direct | `(await import(API)).value`. | Value selected. |
| I1-21:await-member/namespace-dot | `const ns = await import(API); void ns.value;`. | Same value selection. |
| I1-21:await-member/namespace-key | `const ns = await import(API); void ns['value'];`. | Same literal-key selection. |
| I1-21:then-member/dot | `import(API).then(ns => ns.value)`. | Direct callback value selection. |
| I1-21:then-member/key | `import(API).then(ns => ns['value'])`. | Direct callback literal-key value selection. |
| I1-21:import-type/typescript | F consumer probe.ts: `type Local = import(API).Type;`. | TS AST import type, no runtime load. |
| I1-21:import-type/jsdoc-javascript | J consumer probe.js: `/** @typedef {import('../../provider/src/interfaces/api.js').Type} Local */` followed by `export {};`. | allowJs and checkJs both true in independent config; JSDoc import type checked, no runtime load. |
| I1-21:nonliteral-target/variable | `declare const target: string; void import(target);`. | Nonliteral-target note. |
| I1-21:nonliteral-target/template | ``declare const name: string; void import(`./${name}.js`);``. | Template target note, no guessed finite expansion. |
| I1-22:testing-target/same-owner-side-effect | Provider ordinary file: `import './tests/hook.js';`. | Testing origin denied. |
| I1-22:testing-target/foreign-side-effect | Consumer: `import '../../provider/src/tests/hook.js';`. | Testing origin denied. |
| I1-22:testing-target/same-owner-empty-import | Provider ordinary file: `import {} from './tests/hook.js';`. | Testing origin denied. |
| I1-22:testing-target/foreign-empty-import | Consumer empty-imports provider test hook. | Testing origin denied. |
| I1-22:testing-target/same-owner-empty-export | Provider ordinary file: `export {} from './tests/hook.js';`. | Testing origin denied. |
| I1-22:testing-target/foreign-empty-export | Consumer empty-re-exports provider test hook. | Testing origin denied. |
| I1-22:testing-target/same-owner-discarded-lazy | Provider ordinary file: `await import('./tests/hook.js');`. | Testing origin denied. |
| I1-22:testing-target/foreign-discarded-lazy | Consumer discards awaited import of provider test hook. | Testing origin denied. |
| I1-23:missing-resource/source | Delete CSS only; no description refers to it. | Unverifiable source target, bounded partial outcome. |
| I1-23:missing-resource/declaration | Prepared copy exposes KU CSS default to parent; after valid baseline delete CSS. | Missing declared resource invalidates input; dependent source checking blocked. |
| I1-24:external/package | Root src/protocol.ts imports @trpc/server. | Resolution proves installed external dependency. |
| I1-24:external/builtin | Root src/server.ts imports node:http. | Builtin scope established explicitly. |
| I1-24:unsupported-commonjs/require | F consumer .ts declares callable `require`, then `const ns = require(API); void ns.value;`. | Uninterpreted CommonJS cross-module access; no ESM permission fiction. |
| I1-24:unsupported-commonjs/import-equals | Independent F config module Node16/moduleResolution Node16, fixture package type commonjs; consumer uses `import ns = require(API); void ns.value;`. | Compiler-valid import-equals, unsupported profile. |
| I1-24:unsupported-commonjs/export-equals | Same Node16/CommonJS-package fixture, replace consumer probe with `import ns = require(API); export = ns;`. | Export-assignment form remains explicitly unsupported. |
| I1-24:unsupported-commonjs/module-exports | Same Node16/CommonJS-package fixture, declare `module: {exports: unknown}` and require; `module.exports = require(API)`. | Potential application CommonJS forwarding note. |
| I1-26:browser-verifier-request/api | Request public browser-verification capability with real session. | Explicit unavailable; ordinary bounded bundle remains usable. |
| I1-26:browser-verifier-request/cli | Execute unsupported `ramify verify-browser --root F`. | Exit 2 usage, no invented flag/capability. |
| I1-26:help-version/help | Actual executable --help. | Exit 0 and lightweight module-load trace. |
| I1-26:help-version/version | Actual executable --version. | Exit 0 and lightweight module-load trace. |
| I1-27:cancel/acquisition | Abort at input read barrier. | No late success; capture resources released. |
| I1-27:cancel/catalog | Abort while compiler catalog traversal is paused. | No late success; compiler resources released. |
| I1-27:dispose/completed | Analyze, retain report, dispose twice, attempt new analyze. | Idempotence and disposed-state failure. |
| I1-27:dispose/in-flight | Dispose while held analysis is active, then release barrier. | Pending work cannot complete successfully or retain resources. |
| I1-28:compiled-cli-clean/human | Compiled check --root R. | Exit 0; complete human report. |
| I1-28:compiled-cli-clean/json | Same root --format json. | Exit 0; exactly one versioned JSON document stdout. |
| I1-28:compiled-cli-denied/human | W2 negative, human. | Exit 1 with located denial. |
| I1-28:compiled-cli-denied/json | W2 negative, JSON. | Exit 1, structured same denial. |
| I1-28:compiled-cli-invalid/human | C1 missing target, human. | Exit 1 with invalid input. |
| I1-28:compiled-cli-invalid/json | C1 missing target, JSON. | Exit 1, dependent stages blocked. |
| I1-28:compiled-cli-unavailable/no-config | Remove F config; isolate F under ancestors with no tsconfig.json. | Exit 2 no configuration. |
| I1-28:compiled-cli-unavailable/references | Root config has only `files:[]` and `references:[{"path":"./tsconfig.child.json"}]`; create child config. | Exit 2 naming referenced config, no invented solution support. |
| I1-28:compiled-cli-unavailable/command | Execute `ramify inspect --root F`. | Explicit unavailable/usage exit 2. |
| I1-28:compiled-cli-unavailable/format | Execute `ramify check --root F --format xml`. | Invalid invocation exit 2. |
| I1-28:compiled-cli-warnings/human | Selected loose file only, human. | Warning visible, exit 0. |
| I1-28:compiled-cli-warnings/json | Selected loose file only, JSON. | Same warning/count, exit 0. |
| I1-28:compiled-cli-stray-description/human | Selected loose file plus valid stray marker, human. | Marker location, exit 1. |
| I1-28:compiled-cli-stray-description/json | Same invalid layout, JSON. | Same marker error, exit 1. |
| I1-29:nested-project-root/root-example | F/examples/demo is independent described project with config. | demo selected from its src. |
| I1-29:nested-project-root/child-example | F/subs/consumer/examples/demo is independent described project with config. | demo selected, not F or consumer. |
| I1-29:scope-report/given | Explicit --root R through acquisition input. | Selection given with exact configuration/walked areas. |
| I1-29:scope-report/found | Cwd W/src, root omitted. | Selection found, same complete root/scope. |
| I1-29:changed-input/once | Change api.ts once at capture barrier, then stabilize. | Coherent retry or explicit failure according to finite policy; never mixed identity. |
| I1-29:changed-input/repeated | Change api.ts at every capture validation barrier through retry exhaustion. | Explicit incomplete acquisition failure. |
| I1-30:reference-regression/type-check | Run example's actual type-check command. | Actual exit and diagnostics recorded. |
| I1-30:reference-regression/vitest | Run example's actual Vitest command. | Real assertion count/outcomes, no inherited README totals. |
| I1-30:reference-regression/build | Run example's actual Vite build. | Build artifacts produced successfully. |
| I1-30:reference-regression/cucumber | Run actual standalone IT scenario via example's Cucumber command. | Real protocol/runtime scenario including K05 passes. |
| I1-30:test-discovery/toolkit | T: enumerate actual migrated test files against every test destination in move-map. | Every migrated owner test discovered exactly once. |
| I1-30:test-discovery/testing-module | F plus the concrete verification owner below; enumerate ordinary src and nested src/tests tests. | Both test forms discovered exactly once despite production exclusion. |
| I1-30:production-selection/toolkit | Run production selector plus clean toolkit build. | No testing file in selected/emitted root set; normal type-check discovers all tests. |
| I1-30:production-selection/testing-module | F plus separate testing owner ordinary src test and ordinary provider interfaces. | Testing-owner src excluded, ordinary interfaces retained, test discovery includes excluded test. |
| I1-30:harness-required/intermediate-remove | Remove I1-14:renamed-kinds record; request --iteration 3. | Membership failure even if handler still exists. |
| I1-30:harness-required/intermediate-disable | Disable same required handler; request --iteration 3. | Unrun required assertion failure. |
| I1-30:harness-required/intermediate-assertion | Handler runs but its literal expected decision assertion fails; request --iteration 3. | Failed assertion fails gate. |
| I1-30:harness-required/full-remove | Remove same required record; request full --plan 1. | Explicit removed-record failure, distinguished from pending later capabilities. |
| I1-30:harness-required/full-disable | Disable same handler; full --plan 1. | Explicit unrun failure, never silent skip. |
| I1-30:harness-required/full-assertion | Fail same assertion; full --plan 1. | Explicit assertion failure, not concealed by future pending work. |

## Fixture details and capability mapping

The F CSS-resource recipe is root `src/resources.d.ts` containing
`declare module '*.module.css' { const styles: Readonly<Record<string, string>>;
export default styles; }` and the named resource containing `.ok { color:
green; }`. The effective export description has only `default`; the dictionary's
keys are CSS class keys, not named module exports. The compiler owns the shim
interpretation; project acquisition independently proves the resource exists.
This recipe is used only where F rows call for CSS, preserving the reference's
real vite/client description in R rows.

For I1-14:renamed-kinds, compare visible foreign imports with these literal
expected cases: importer `[coupled, portable]`, original `[coupled, portable]`
permits value; removing coupled from importer denies value and type; removing
portable from original denies value but permits explicit type. The default
ui/browser-name fixture has exactly the same decisions. For
I1-14:two-evaluations, use importer `[]`, ordinary provider original `[coupled]`,
and established visibility. The first registry defines coupled as
required-importer, so value is denied; the second defines it as required-symbol,
so value is allowed because the importer does not require coupled. Both keep
reserved testing as required-importer. These expectations are supplied data,
never calculated by the implementation under test.

The test-discovery/production fixture extends F with
`subs/verification/module.ramify` (`ramify 1`, `module verification tagged
[testing]`), `subs/verification/src/ordinary.test.ts`, and
`subs/verification/src/tests/nested.test.ts`. Both tests contain one passing
assertion using the test runner's ordinary API. Provider's ordinary interface
file remains present. The selector excludes both verification files and every
other `src/tests/` file, includes provider's interface file and consumer ordinary
source, and does not change the whole-project compiler/test input inventory.
The fixture's test compiler enables the runner's ambient types; that does not
alter any Ramify source profile.

| Verification label | Public analysis capability or independent evidence |
| --- | --- |
| registry | `registry` |
| acquire | `layout`, through acquisition stage |
| metadata | `metadata` |
| parse | `descriptions`, through parse stage |
| catalog | `source-catalog` |
| link | `exposure-linking` |
| static-access | `static-access` |
| tags-origin | `tags-origin` |
| namespace | `namespace-access` |
| lazy | `lazy-access`; import types belong to this bounded source-form implementation |
| symbol-free | `symbol-free-access` |
| resources | `source-catalog` for iteration 6 identity evidence; `resource-access` when import checking is asserted |
| coverage | `coverage` |
| session | Real disposable session plus required completed `registry`, `acquisition`, `parse`, `catalog`, `link`, `access`, `decide`, `report` stages |
| cli | Independent actual executable/process/formatter evidence over the same report |
| build-selection | Independent production selector/build evidence using the public inventory/profile contract |
| regression | Existing actual application/test/build tiers, independently reported |
| harness-gate | Required-membership, assertion-execution and capability-gate integrity evidence |

`browser-verification` remains unavailable in Plan 1. Ordinary browser tag
matching is `tags-origin`; requesting the separate verifier must not silently
substitute matching. Inventory-only analysis used by production selection
requires registry/layout/metadata/descriptions and does not claim source checking.
An iteration 6 resource-identity record does not depend on the not-yet-implemented
iteration 12 resource-access/session capability; the final gate later reruns the
record through its actual catalog provider while baseline source access gets its
own complete evidence.

## Inventory validation and remaining evidence

A separate iteration 1 compiler-validity audit exercised virtual F/J source
snippets with the installed native API; it did not execute a Ramify instance.
It confirmed the unmarked interface, merged runtime binding, literal-star export,
unknown computed key, checked-JavaScript JSDoc and type-star forms. The audit
caught removed Node10 resolution (compiler 5108) and top-level await in a file
without module status (1375). The recipes now set `moduleDetection: "force"`
and an explicit module package; CommonJS variants use Node16 resolution/module
plus package type commonjs. All corrected configurations and source forms had
zero compiler diagnostics in the follow-up audit. No fixture files were written
by that audit and every native snapshot/client was disposed.

The iteration 1 document comparison found **187 matrix subcase groups**, all
present once. **47** groups expand into **168** explicitly named variant
records; the other **140** groups are individual records, yielding **308
required executable leaves**. The comparison ignored inline code identifiers
that are not subcase names (`tick`, `allowJs`, `checkJs`, `module.ramify`, and
`--root`) and deduplicated the matrix's repeated explanation of `import-type`.
No missing/extra group, duplicate leaf or orphan variant was found.

| Implementing iteration | Required leaves initially not executed |
| --- | --- |
| 2 | 0; inventories all 308 |
| 3 | 14 |
| 4 | 53 |
| 5 | 35 |
| 6 | 3 |
| 7 | 34 |
| 8 | 0; migration verification and prerequisite reruns |
| 9 | 26 |
| 10 | 36 |
| 11 | 44 |
| 12 | 23 |
| 13 | 22 |
| 14 | 15 |
| 15 | 3 |

All entries remain **not executed**. Fixture materialization, source assertions,
capability activation and the immutable portable completion report are work for
the assigned iterations. Iteration 2 must preserve the matrix/family pointers,
fixture root/config/registry and exact variant membership when creating managed
inventory records. Architecture/contract acceptance remains the iteration 1
review gate before iteration 3; this document's consistency check cannot approve
it.

The completion report retains pending portions of K01–K04/K06/K07, H02/H04,
composite reference families, P01–P06 probes and separate policies, with their
existing authority classifications. Passing the 308 leaves establishes only
this plan's stated bounded scope; it does not certify an unimplemented browser
verifier, daemon, source adapter, MCP/explorer service or whole composite family.
