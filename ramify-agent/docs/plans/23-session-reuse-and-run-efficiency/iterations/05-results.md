# Iteration 5 results: catalog references and scenario form

C01–C03 provider contracts are implemented and verified. This receipt qualifies
pure catalog/form behavior; composed intake, revision and registered-test
runtime wiring remains iteration 10 work, including its retire-only validator.

## Identity and ownership

- Worktree `/home/app/ramify-plan23-05-catalog`, branch `feat/plan23-05-catalog`.
- Base `544d205bc827a0ed801a23e5dd777c3765bef1ae`, with accepted iteration-0
  execution-v1 contracts and fixture/write-set freeze.
- Result HEAD is the commit containing this receipt; resolve with
  `git log -1 --format=%H -- ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/05-results.md`.
- Changed paths: plan-evidence `src/interfaces/catalog.ts`,
  `src/tests/catalog.test.ts`, new `src/tests/plan23-catalog-contracts.test.ts`;
  scenarios `src/form.ts`, `src/tests/form.test.ts`, `module.ramify`; this receipt.
  These seven paths are within the frozen iteration-5 write set. The catalog
  interface's existing wildcard exposure already includes new contracts.
- No prompt, focused-command, run/service/records, harness declaration, manifest,
  registry, package or lockfile changes. Main/other worktrees and their indexes
  were not edited. No push or merge performed by this worker.

## Implemented behavior and evidence

| Row | Actual provider control |
| --- | --- |
| C01 / F5 | Missing reference `missing-key` and wrong-kind local `hyp-a` fail in submitted terms before ID allocation. Duplicate `cap-a` and malformed `req-a` name their keys. Rejection preserves serialized catalog bytes; valid retry issues the same `fr-001`/`ctx-001` as the independent clean submission. Existing allocation ordering is retained. |
| C02 / F5 | Retirement with no additions returns an empty ID map and preserves retired identities; next issuance skips them. Revision references validate retained active elements and newly submitted keys before allocating additions. Invalid re-citation is atomic. Each reference list supplies its legal kinds, including multiple/no legal kinds. Stale key-to-retired-ID maps cannot resolve citations. A plan scenario may use its captured `ps-NN` identity without duplicate Gherkin; original registry source is retained. Architect scenarios still require source, supplied plan source must still match, and unknown registry identities reject. Catalog elements refuse an added Gherkin field. |
| C03 / F5 | Agent-declared `kind: 'non-behavioral'` acceptance can cite an actually registered test instead of citing that acceptance in scenario refs. Unknown tests, scenario IDs, file paths, wrong declaration kind, foreign acceptance refs and duplicate declarations reject structurally. Missing declarations retain the ordinary scenario citation requirement; other behavioral form rules remain enforced. No classification or test adequacy is inferred. |

`acceptElements` and `reviseCatalog` retain their existing immutable allocation
and numbering behavior. The new optional reference lists are validated before
the allocation section. Rejection never mutates a counter or input catalog.
Durable writes remain the harness owner's responsibility.

Existing scenario-record/state regressions retain architect-owned `done`:
binding a done obligation leaves it done and only the architect's explicit
revision moves it back. This work adds no audit-to-scenario mapping, execution
match, source inspection or automatic semantic promotion/withdrawal.

## Executed checks and limits

Independent `npm ci` passed from this worktree's `ramify-agent/`, with committed
dependency pins/lockfile unchanged. Log `/tmp/ramify-plan23-05-npm-ci.log`.
Generated ordinary API views were refreshed separately for plan-evidence and
scenarios before foreign discovery; testing views were refreshed separately:

```sh
node_modules/.bin/ramify materialize --from subs/harness/subs/plan-evidence/src
node_modules/.bin/ramify materialize --from subs/harness/subs/scenarios/src
node_modules/.bin/ramify materialize --from subs/harness/subs/plan-evidence/src/tests
node_modules/.bin/ramify materialize --from subs/harness/subs/scenarios/src/tests
```

All passed, each 2 targets/838 entries. Ordinary views record revision
`rev/1:1374b576-4a76-40d1-9fc7-a315e5747e2f:1`, coverage 37/truncated 2.
Testing views record revision ending `:5`, coverage 51 for plan-evidence and
45 for scenarios, both truncated 2. These explicit limits are not absent-API
proof. Logs `/tmp/ramify-plan23-05-api-{catalog,scenarios}{,-tests}.log`.
No new cross-owner production imports were needed; new testing imports remain
same-owner. Generated views were neither edited nor committed. The known
iteration-0 architect materializer failure remains retained qualification debt.

Executed commands from `ramify-agent/`, with focused workers capped at two:

```sh
npm run test:quick -- subs/harness/subs/scenarios/src/tests/form.test.ts subs/harness/subs/plan-evidence/src/tests/plan23-catalog-contracts.test.ts subs/harness/subs/plan-evidence/src/tests/catalog.test.ts --maxWorkers=2
npm run test:quick -- subs/harness/src/tests/analysis-submission.test.ts subs/harness/src/tests/catalog-extraction.test.ts subs/harness/subs/scenarios/src/tests/records.test.ts subs/harness/subs/scenarios/src/tests/states.test.ts --maxWorkers=2
npm run type-check
npm run check:self
```

- Required plus owner catalog focused checks passed **3 files/55 tests**:
  14 new controls and 41 existing tests. Log
  `/tmp/ramify-plan23-05-focused-final.log`.
- Affected analysis/extraction/records/states regressions passed **4 files/60
  tests**, duration 4.24s. Log `/tmp/ramify-plan23-05-regressions.log`.
- Type-check passed configured harness, web, scripts and browser script scopes.
  Log `/tmp/ramify-plan23-05-types.log`.
- Installed `check:self` passed structural checking with partial coverage:
  12 owners/647 source files/50 resources/12,557 accesses; 0 errors/0 warnings/
  314 analysis limits; 9,249 allowed/0 denied/3,308 external accesses. Log
  `/tmp/ramify-plan23-05-structure.log`.
- Baseline owner form/catalog passed **2 files/41 tests** before changes.
  The first new test fixture used an invalid manifest root path and principles
  scan status; its setup rejected before executing its cases. The fixture was
  corrected to `plans/example/plan.md` and the declared empty-principles status,
  then all focused controls passed. No contract assertion was weakened.
- `git diff --check` passed. Tests are ordinary in-process schema/function
  controls; no real Git/CLI/audit/shell/model launch occurred in those tests.
  Structural CLI checking is separate evidence, not a native test claim.

No whole suite/full audit, live trial or performance comparison ran here.
Iteration-0 native project-boundary DataView failure remains Q03 debt for
iteration 14; no passing skip or whole-plan completion is claimed.

## Exact consumer integration handoff

Catalog API additions:

```ts
interface ElementReferenceList {
  readonly path: string;
  readonly citations: readonly string[];
  readonly allowedKinds: readonly ElementKind[];
}
acceptElements(catalog, submission, references?: readonly ElementReferenceList[]): ElementAcceptance;
validateElementReferences(references, catalog, submitted?: readonly Pick<SubmittedElement, 'key' | 'kind'>[]): string[];
// Existing CatalogRevision additionally accepts:
references?: readonly ElementReferenceList[];
```

For initial analysis/checking, supply reference lists in submitted terms before
acceptance/rewrite. Use existing policies: entry requirement/acceptance and
scenario refs are `functional`, entry context refs are `context`. Other fields
must supply their own declared legal kinds, never inferred text classification.
Include non-behavioral declaration `ref` as a functional acceptance reference.
After successful acceptance, use the returned `ids` with `resolveCitations` for
local-key rewrites. Example error:
`entries.cap-a.requirementRefs.1: unknown element reference "missing-key"`;
wrong kind: `reference "hyp-a" is context; expected functional`.

Scenario API additions:

```ts
nonBehavioralAcceptanceSchema // strict { ref: string, kind: 'non-behavioral', test: string }
type NonBehavioralAcceptance = z.infer<typeof nonBehavioralAcceptanceSchema>;
// ScenarioFormEntry additionally accepts:
nonBehavioralAcceptance?: readonly NonBehavioralAcceptance[];
interface ScenarioFormEvidence { readonly registeredTests: ReadonlySet<string> }
validateScenarioForm(submission, planScenarios, entries, viewNames?, evidence?): ScenarioFormResult;
```

The coordinator approved an additional exact iteration-10 reservation for
`src/analysis/submission.ts` on 2026-10-08; iteration 5 does not edit it.
Integration 10 must add the declaration array to strict `entrySchema`,
carry it through `scenarioFormOf`, and rewrite its `ref` in
`acceptArchitectElements` alongside ordinary element keys. Extend its evidence
adapter with test identities derived only from the actual accepted registration
records; scenario IDs, file paths and arbitrary test titles are not registered
test identities. Preserve accepted declaration/provenance for later checks;
do not reconstruct classification from requirement prose or test execution.
Unknown-test example: rule 6, path
`entries.1.nonBehavioralAcceptance.0.test`, naming the submitted test and ref.

Integration 10's `src/analysis/extraction.ts` replacement correction schema
still requires `elements.min(1)`. Remove that minimum for replacement with a
nonempty retire list, pass revision reference lists before ID allocation, and
keep re-citations/form validation against the resulting active catalog. Empty
additions are already accepted by the provider. Retire-only composed runtime
is **not yet qualified** by this provider receipt.

The initial analysis schema already imports `scenarioSubmissionSchema`; it now
permits an omitted plan-origin Gherkin while validating architect-origin source.
Captured scenario source/identity remains the registry authority. Retain
architect semantic reports and configured audit health as their separate gates.
