# Iteration 3A: Root marker syntax and root migration

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 3](iteration3.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory, together with the coordinator's adoption of the R7 specification patches. Recheck the immediate handoff before editing.
**Owners and write scope:** Descriptions plus mechanical relays of the extended header type through analysis/root; the toolkit's two committed root descriptions; every toolkit generator, fixture, test double and header reader that writes or reads a root description, as inventoried below, including the reference harness's fixtures and its expected values for outputs this slice changes; the quoted root header in `docs/architecture/daemon.md`. This slice extends `ramify.analysis/2`. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Parse the root marker and mark every toolkit root before the rule is enforced. The parser accepts `root module`, the parsed header records the marker, every root the toolkit commits or generates carries it, and every child stays unmarked. Selection and acquisition do not change here; [iteration 3B](iteration3b.md) enforces the rule on roots that are already migrated, so each candidate passes its gate.

## Read first

- [Contracts](../contracts.md): Root marker; Description language and validation; Schema versions.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-41, PB1-44 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/descriptions/src/tokenize.ts`, for the keyword set.
- `subs/analysis/subs/descriptions/src/parse.ts`, for module header handling and the special tag tokens.
- `subs/analysis/subs/descriptions/src/interfaces/syntax.ts`, for `DescriptionDocument.module`.
- `module.ramify` and `examples/collection-review/module.ramify`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Root description inventory

Verified at `3f435172`, before iteration 3's changes. Line numbers drift:
recheck with `git grep -n -E "ramify 1|module\.ramify" -- src subs scripts examples`,
adding `-a` for the files Git classifies as binary (`subs/analysis/src/tests/api-view.test.ts`,
`scripts/reference-harness/plan2a-projection-cases.ts`). Root text derived by
concatenation, `.replace` or a template from a migrated base follows
automatically; verify it rather than editing it again.

A description a test intends as a selected or nested project root carries the
marker. One it intends as a child, a stray, an in-`src/` or reserved-container
description stays unmarked. A deliberately invalid root keeps its single
intended defect and gains the marker, so iteration 3B adds no second error
to it. Unreadable or nonsensical root text stays as written.

**Committed roots (2).** `module.ramify` becomes `root module "ramify" tagged [dispatch]`;
`examples/collection-review/module.ramify` becomes `root module collection-review tagged [dispatch]`.
`site/` has no description. The other 25 committed toolkit descriptions are
children and stay unmarked. `ramify-agent/` holds four more roots (its own
and three fixtures); they belong to Phase 3 and are not edited.

**Shared generators (11).**

| Generator | Root written at | Dependents |
| --- | --- | --- |
| `src/tests/fixture.ts` `fixture()`, `affectedFixture()` | `:17`, `:39` | 10 files |
| `subs/analysis/src/tests/session-test-fixture.ts` `fixture()`, `fixtureFiles` | `:35` | 19 files |
| `subs/analysis/src/tests/architect-fixture.ts` `architectProject()` | `:49` | 5 files and three golden views |
| `subs/analysis/src/tests/affected-fixtures.ts` `formFiles` | `:141` | 3 files |
| `subs/analysis/subs/project/src/tests/fixtures.ts` `fixture()` | `:17` | 9 files |
| `subs/analysis/subs/typescript/src/tests/fixtures.ts` `fixture()` | `:50` | 19 files; its `acquire()` double never parses the text |
| `subs/daemon/src/tests/ipc-fixture.ts` `ipcFixture()` | `:26` | 3 files |
| `scripts/reference-harness/fixtures/plan1/project.ts` `projectFixtureFiles`, `createProjectFixture` | `:6`, `:26` | most harness cases, `fixtures/plan2/*`, `lifecycle-fixture-cases.ts`, `resident-fixtures.test.ts` |
| `scripts/reference-harness/plan2a-materialize-fixture.ts` `materializeFixtureFiles` | `:23` | plan 2a CLI, scale and service cases; `scripts/measurements/plan2a-platform.mjs` |
| `scripts/probes/fixtures/synthetic-owners.ts` `syntheticOwnerFiles`, owner 0 | `:56` | `scripts/measurements/materialize.ts` S and X fixtures for measurements and plan 5 cases |
| `scripts/probes/fixtures/hundred-owners.ts` `hundredOwnerFiles`, owner 0 | `:22` | must stay byte-equal to `syntheticOwnerFiles(100)` |

**Local literal roots in `src/` and `subs/` (51 sites in 26 files).**
`src/tests/batch-cli.test.ts:101`; `companion-cli.test.ts:26, 59, 73, 104`;
`resident-cli.test.ts:117, 246, 307`. In `subs/analysis/src/tests/`:
`session-input-witness.ts:17`; `api-view.test.ts:75, 325`;
`dependency-analyzer.test.ts:68`, whose builder `module(name, exposures)`
serves root and children, so only `project()` at `:73` adds the marker;
`evaluate-accesses.test.ts:24, 71`; `inventory.test.ts:13, 78`;
`retained-session.test.ts:15`; `session.test.ts:14, 178, 559`;
`shared-globals.test.ts:13`; `validation.test.ts:13, 47, 57, 89`. In
`subs/analysis/subs/project/src/tests/`: `resolve-root.test.ts:51, 182, 188,
196, 200` and `project.test.ts:219, 249, 258`. In `subs/cli/src/tests/`:
`affected-command.test.ts:14`; `changed-command.test.ts:20, 171`;
`changed-cleanup.ts:25`, a deliberately invalid name, and `:32`;
`exhausted-recovery.ts:34`; `materialize-command.test.ts:32`;
`measure-command.test.ts:18` and the nested independent root at `:145`.
`subs/daemon/src/tests/service.test.ts:24, 242`; `affected-service.test.ts:12`.
`subs/explorer/src/tests/ProjectExplorerPage.test.tsx:76`;
`subs/integration-tests/src/explorer-router.test.ts:74`;
`browser-acceptance.ts:71, 1830, 1866`;
`subs/service-api/src/tests/project-binding.test.ts:30`.

**Local literal roots in `scripts/` (11 sites in 8 files).** In
`scripts/reference-harness/`: `plan2a-projection-cases.ts:63, 98`;
`plan2a-session-cases.ts:29`; `plan2a-workflow-cases.ts:250`;
`plan2a-isolation-cases.ts:91, 111`; `bounded-cases.ts:168`;
`production.test.ts:15` and the unknown-tag negative case at `:68`;
`runner.test.ts:141`, whose header-bytes assertion at `:156` changes with it;
`mutation.test.ts:23`, if the fixture is acquired.

**Test doubles and header readers.**

- `subs/analysis/subs/project/src/tests/fixtures.ts`: the `syntax` double
  (`:13-15`) returns a fixed document and the `declaration` double (`:28-44`)
  finds the header with `/^module\s/`. Both supply and accept the marker.
- `subs/analysis/subs/typescript/src/tests/fixtures.ts`: the `acquire()`
  double's synthetic documents (`:96`, `:107`) gain the new field.
- `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:313-350`
  parses both committed trees; its root expectations gain the marker.
- `scripts/reference-harness/gate-cases.ts:81` reads the toolkit header as the
  first line starting with `module ` and expects `module "ramify" tagged [dispatch]`.
- `scripts/reference-harness/plan2b-cases.ts:310` (`declaredModules`) uses
  `^module\s+…$` and throws on a marked root.
- `scripts/validate-final-contracts.ts`: a root it builds with `header()`
  carries the marker. The archived `owners.md` blocks stay unmarked and are
  compared by name, tags and selections only (`manifest()` at `:15-24`).

**Expected values that shift.** Reason each from the five added bytes, not
from candidate output:

- `src/tests/companion-cli.test.ts:51`: the location `start: 24, end: 93`
  becomes `29, 98`; its line and column do not change.
- The architect golden views `subs/analysis/src/tests/fixtures/architect-view-measured.txt`,
  `architect-view-measured-unreferenced.txt` and `architect-view-unavailable.txt`:
  the root module's documentation bytes 215 become 220 and its subtree's 850
  become 855. Regenerate with `RAMIFY_UPDATE_GOLDEN=1` and confirm the diff
  holds exactly those values.
- The S100 content-map digest at `scripts/measurements/materialize.ts:24` and
  `scripts/reference-harness/synthetic-owners.test.ts:14`. Compute the new
  digest from the generator's specified bytes with a separate command, record
  that command, and do not copy a candidate run's output.
- Measurement evidence fingerprints over the toolkit root and generators
  (`plan2a-inputs.mjs`, `resident-inputs.mjs`, `run.mjs`) change, as with any
  edit to those inputs. Archived results are not rewritten; the final gate
  reruns affected workloads under the [budget policy](../budgets.md#policy).

**Copied and pinned projects.** Copies of the toolkit and the example inherit
the committed markers. `toolkitFixture()` in
`scripts/reference-harness/plan5-engine-cases.ts:25`, used by the plan 5
engine and catalog cases, extracts the toolkit at pinned revision `e0be049`,
whose root is unmarked. After extraction it adds the marker to the copy's
module line, before any acquisition. Both compared engines read that same
copy, and the pinned engine sources contain neither the parser nor selection,
so the comparison stays like for like.

**Unchanged.** Parser-only cases (`grammar.test.ts`,
`project-boundary-grammar.test.ts`, `locations.test.ts`, `linking.test.ts`,
`capture.test.ts`, `scripts/reference-harness/parser-cases.ts`), synthetic
model fixtures, archived plan documents and evidence, and the planning probe
`docs/plans/iteration-7-affected-modules/probes/source-facts.mts`. No row of a
reviewed instance table compared byte for byte with an archived `subcases.md`
embeds description text; the rows that mention root descriptions are prose.
Change no row, count or instance identity.

## Deliverables

1. Parse the marker as the [contracts](../contracts.md#root-marker) specify: `root` joins the reserved keywords and the special tag tokens, `DescriptionDocument.module` gains `root: TextSpan | null`, the header span covers the whole module line, and a misplaced `root` is malformed under the existing parser codes. An unmarked description stays valid. Relay the extended type through analysis/root with its signature companions.
2. Add `root-marker-grammar.test.ts` beside the description tests, with independent expected spans and codes: marked and unmarked headers with tags, tabs, comments, CRLF and a byte-order mark; quoted `"root"` as module, export, alias and child names; `root` as a tag, unknown under the default registry and valid once registered; and `root` alone, doubled, after `module`, before another statement or in an unquoted name position. Retain exposure-record positive controls.
3. Mark every root in the inventory above and update its test doubles, header readers and shifted expected values. Update the quoted root header in `docs/architecture/daemon.md` (`:131-132` and `:252-256` at `3f435172`). Record each migrated site, and any root deliberately left unmarked with its reason, in the results.
4. Extend `ramify.analysis/2`: the snapshot's parsed module headers carry the marker field, per [schema versions](../contracts.md#schema-versions). Update every toolkit reader in this candidate and the reference harness's expected values for it, under [iteration gates](../execution.md#iteration-gates).
5. Leave selection and acquisition unchanged: an unmarked root still acquires and a marked child is still accepted until iteration 3B.

## Matrix rows executed here

Exercise PB1-41, PB1-44 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-41.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/subs/descriptions/src/tests/root-marker-grammar.test.ts
npm run build
npm run check:self
git grep -n -E '^(root )?module ' -- '*module.ramify' ':!ramify-agent'
```

The last command lists every committed header: exactly the two roots carry
`root`. Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-41 passes, both committed roots and every inventoried generator write marked roots, every child is unmarked, and the report's parsed headers carry the marker within `ramify.analysis/2`. Selection and acquisition are unchanged; the rule's enforcement is not claimed.

Record `iteration3a-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance. Record
the coordinator's adoption of the R7 specification patches, with its
baseline, approval and reviewed diff identity.

A marker-aware parser and migrated roots for iteration 3B, with the list of migrated sites.
