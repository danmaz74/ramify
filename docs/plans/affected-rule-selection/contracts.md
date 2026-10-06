# Contracts: affected-rule selection

**Status:** draft for coordinator review. These contracts are binding on
iterations 0 to 2 once they are reviewed. The authoritative wording of the rule
goes into [cli-invocation.spec.md](../../architecture/cli-invocation.spec.md)
through patch P1 in [protected documents](protected-documents.md).

## Scope

What changes:

- the meaning of an owned path seed in an affected query;
- the members of each path seed;
- the schema version of the selection and of the CLI document.

What does not change:

- module-ID seeds;
- ownership classification (`classifyProjectPath`) and the `basis` attribution;
- the reverse module graph and its traversal;
- widening;
- coverage;
- limits;
- refusals;
- the daemon operation and its IPC protocol `ramify.ipc/2`.

## The rule

Each distinct path seed is classified, without a filesystem read, into exactly
one kind. Owned seeds take a kind from the first row that applies; excluded and
outside-project seeds have kind `null`. The `selects` column lists the modules
the seed selects.

| Order | Kind | Applies when | `selects` |
| --- | --- | --- | --- |
| 1 | `ignored` | The seed carries an owned-ignored or scratch exclusion. | `[]` |
| 2 | `description` | The path's last segment is `module.ramify`, present or absent. | `[owner]` |
| 3 | `readme` | The path is `README.md` directly in a current module's directory. | `[]` |
| 4 | `source-area` | The path is at or beneath its owner's `src/`, present or absent. This includes testing and interface areas and resources such as `.md` files. | `[owner]` |
| 5 | `auxiliary-source` | The inventory lists the path with placement `auxiliary`. Or the inventory does not list it and it is compiler source under the revision's configuration, so a `.js`, `.jsx`, `.mjs` or `.cjs` path counts only when the configuration admits JavaScript. | `[owner]` |
| 6 | `captured-input` | The path is a [captured input](#captured-inputs) of the revision. | its [governed set](#governed-sets) |
| 7 | `inert` | Anything else: inert files, `.` and directories outside `src/`, other `.md` files and unread configuration files. | `[]` |

Rows 1 to 5 restate today's ownership facts, so only rows 6 and 7 consult the
revision's captured inputs. Row 4 precedes row 6, so a resource inside `src/`
that the revision also captures stays `source-area`. Row 3 precedes row 6, so
a README stays `readme` even though the revision captures it with role
`readme`.

For an owned seed, `module` still names the owner and `basis` keeps its `/2`
computation. Both are attribution only; `selects` alone decides selection.

### Captured inputs

For row 6, a path is a captured input when the revision's `CapturedInput` list
holds it with one of these:

- role `configuration`: the selected compiler configuration and the
  configurations it extends;
- role `absent`: absence the analysis read, such as a resolution candidate;
- role `dependency` with `bytes > 0`, or with the sha256 of empty content: a
  file whose content the analysis read;
- roles `source` or `resource`: unreachable here, because rows 4 and 5 come
  first; listed for completeness.

The definition mirrors the contexts' `analysisInput()` in
`subs/daemon/subs/contexts/src/dispositions.ts`. It holds the glossary's
"content or absence an analysis revision read and fingerprinted".

These never count:

- role `directory`;
- a `dependency` existence probe, recorded with 0 bytes and a signature hash.

A path the revision did not capture is not a captured input, even when it is
named like a configuration file.

### Governed sets

- **The whole project.** An input with role `configuration`, and a captured
  input whose last segment is `package.json`, govern every inventoried module.
  The configuration compiles every module's source, auxiliary source included,
  and the manifest decides package resolution and module format for all of
  them.
- **Its readers.** Any other captured input governs the owners of the files in
  `indexes.contributors[path]`: the analyzed files whose description reads it,
  resolves it or probed its absence.
- **The fallback.** When no file contributes the path, the input governs every
  inventoried module.

`selects` is byte-ordered and has no duplicates.

### Module lists

- `changedModules` is the set of module-ID seeds together with every seed's
  `selects`.
- `affectedModules` is the reverse-dependency closure of `changedModules`,
  minus `changedModules`.
- `testModules`, `selection` and `widening` keep their `/2` rules. Only a path
  outside the project, or partial coverage, widens.

A query whose seeds are all `ignored`, `readme` or `inert`, or that has only
excluded seeds, answers with empty `changedModules`, `affectedModules` and
`testModules` and `selection: 'dependency-closure'`, unless it is widened.

## The `/3` answer

```ts
// subs/analysis/src/interfaces/affected.ts — inline unions only; no new exported type name
export type AffectedPathSeed =
  | { readonly path: string; readonly status: 'owned'; readonly module: string;
      readonly basis: 'inventory' | 'declaration' | 'area' | 'containment';
      readonly exclusion: ProjectExclusion | null;
      readonly kind: 'source-area' | 'auxiliary-source' | 'description' | 'readme'
        | 'captured-input' | 'inert' | 'ignored';
      readonly selects: readonly string[] }
  | { readonly path: string; readonly status: 'excluded'; readonly module: null; readonly basis: 'excluded';
      readonly exclusion: ProjectExclusion; readonly kind: null; readonly selects: readonly [] }
  | { readonly path: string; readonly status: 'outside-project'; readonly module: null; readonly basis: 'none';
      readonly exclusion: null; readonly kind: null; readonly selects: readonly [] };

export interface AffectedSelection {
  readonly schemaVersion: 'ramify.affected/3';
  // every other member unchanged from /2
}
```

The answer must satisfy these invariants:

- `kind === 'ignored'` exactly when `exclusion !== null` on an owned seed.
- `selects` is `[]` for `ignored`, `readme` and `inert`.
- `selects` is `[module]` for `source-area`, `auxiliary-source` and `description`.
- `selects` is non-empty for `captured-input`, and it may omit the owner.
- Seeds stay byte-ordered by path, as in `/2`.

The CLI document `AffectedDocument` becomes `ramify.affected-cli/3`. Its other
members are unchanged. Help text and every reader that names `/2` move to `/3`
together. No reader for `/2` is kept, as the
[schema-versions rule](../../architecture/cli-invocation.spec.md) requires.

The IPC protocol stays `ramify.ipc/2`. The daemon codec carries the selection
as an opaque payload; it does not decode its contents. An envelope advances
only when its own members change.

Human output appends the kind and the selection to each owned seed's line:

```text
notes/design.md: owned by app (containment; inert; selects none)
tsconfig.json: owned by app (containment; captured-input; selects app, app/a, app/a-extra, app/a/grand, app/b)
subs/a/src/tmp/new.ts: owned by app/a (containment, scratch subs/a/src/tmp; ignored; selects none)
```

Excluded and outside-project lines are unchanged.

## Examples on the extended topology

The topology is the Phase 1 [written topology](../project-boundary-ramify/fixtures.md#topology).
The plan adds:

- `tsconfig.base.json`, which `tsconfig.json` extends;
- a root `package.json`;
- `subs/b/src/prompt.md`, read by `consumer.ts` at run time but not imported;
- `.devcontainer/devcontainer.json`;
- `scripts/run.sh`.

The **data variant** is a second revision. In it `subs/b/src/consumer.ts`
imports `../../../data/limits.json` under `resolveJsonModule`. It is a separate
revision because the import may add a coverage note. Coverage is complete in
the base revision. The module IDs are `app`, `app/a`, `app/a-extra`,
`app/a/grand` and `app/b`, and the reverse edges are `a -> app` and `a -> b`.
"all" means all five IDs.

| Path seed | status / module / basis / exclusion | kind | selects | changed | affected |
| --- | --- | --- | --- | --- | --- |
| `subs/a/src/api.ts` | owned / app/a / inventory / null | source-area | [app/a] | [app/a] | [app, app/b] |
| `subs/a/src/new.ts` (absent) | owned / app/a / area / null | source-area | [app/a] | [app/a] | [app, app/b] |
| `subs/a/src/tests/tmp/real.test.ts` | owned / app/a / inventory / null | source-area | [app/a] | [app/a] | [app, app/b] |
| `subs/b/src/prompt.md` | owned / app/b / inventory / null | source-area | [app/b] | [app/b] | [] |
| `scripts/check.ts` | owned / app / inventory / null | auxiliary-source | [app] | [app] | [] |
| `tools/tmp/helper.ts` | owned / app / inventory / null | auxiliary-source | [app] | [app] | [] |
| `subs/a/scripts/report.ts` | owned / app/a / inventory / null | auxiliary-source | [app/a] | [app/a] | [app, app/b] |
| `subs/a/scripts/removed.ts` (absent) | owned / app/a / containment / null | auxiliary-source | [app/a] | [app/a] | [app, app/b] |
| `subs/old/src/gone.ts` (absent; `subs/old` is no module) | owned / app / containment / null | auxiliary-source | [app] | [app] | [] |
| `module.ramify` | owned / app / declaration / null | description | [app] | [app] | [] |
| `subs/a/module.ramify` | owned / app/a / declaration / null | description | [app/a] | [app/a] | [app, app/b] |
| `subs/c/module.ramify` (absent) | owned / app / containment / null | description | [app] | [app] | [] |
| `README.md` | owned / app / declaration / null | readme | [] | [] | [] |
| `subs/a/README.md` | owned / app/a / declaration / null | readme | [] | [] | [] |
| `tsconfig.json` | owned / app / containment / null | captured-input | all | all | [] |
| `tsconfig.base.json` | owned / app / containment / null | captured-input | all | all | [] |
| `package.json` | owned / app / containment / null | captured-input if captured with content, else inert | all, else [] | all, else [] | [] |
| `data/limits.json` (data variant) | owned / app / containment / null | captured-input | [app/b] | [app/b] | [] |
| `notes/design.md`, `notes/new.md` (absent) | owned / app / containment / null | inert | [] | [] | [] |
| `subs/a/subs/grand/new.txt` | owned / app/a/grand / containment / null | inert | [] | [] | [] |
| `scripts/run.sh` | owned / app / containment / null | inert | [] | [] | [] |
| `.devcontainer/devcontainer.json` | owned / app / containment / null | inert | [] | [] | [] |
| `.` | owned / app / containment / null | inert | [] | [] | [] |
| `subs/a/fixtures/sample/src/world.ts` | owned / app/a / containment / owned-ignored `subs/a/fixtures/sample` | ignored | [] | [] | [] |
| `fixture-project/src/index.ts` | owned / app / containment / owned-ignored `fixture-project` | ignored | [] | [] | [] |
| `subs/a/src/tmp/new.ts` | owned / app/a / containment / scratch `subs/a/src/tmp` | ignored | [] | [] | [] |
| `src/tmp/throwaway.test.ts` | owned / app / containment / scratch `src/tmp` | ignored | [] | [] | [] |
| `external-project/file.ts` | excluded / null / excluded / external `external-project` | null | [] | [] | [] |
| `node_modules/sample/index.ts` | excluded / null / excluded / packages | null | [] | [] | [] |
| `../outside.ts` | outside-project / null / none / null | null | [] | [] | [], widened `unowned-path` |

Combined queries:

- `notes/design.md` with `subs/a/src/api.ts`: changed [app/a], affected
  [app, app/b], test modules [app, app/a, app/b]. The inert seed adds nothing.
- `README.md` with `subs/a/src/tmp/new.ts`: everything is empty and the
  selection is `dependency-closure`.
- Module ID `app/b` with `.devcontainer/devcontainer.json`: changed [app/b],
  affected [].

Three cells are fixed by facts that iteration 0 records, not by the rule:

- the `package.json` row, by its recorded role;
- the `data/limits.json` row, by its recorded role and contributors;
- the `.devcontainer` row, which assumes the fixture does not read that file's
  content.

The rule above decides each cell once those facts are recorded. If a fact turns
out differently, iteration 0 records it and the coordinator decides before
iteration 1.

Today's 0.2.0 answers are different in these rows:

- every `ignored`, `readme` and `inert` row selects its owner;
- `tsconfig.json`, `tsconfig.base.json` and `package.json` select only `app`;
- `data/limits.json` selects `app`.

Iteration 0 fixes those answers as the baseline.

## Expected toolkit answers with 0.3.0

These are the toolkit at `b4858aec` plus the 0.3.0 rule. Every answer keeps
`partial-coverage` widening and `all-modules`, as today, because 41 notes
include target-unknown codes. "root + 5" means changed [ramify] and affected
[ramify/cli, ramify/daemon, ramify/explorer, ramify/integration-tests,
ramify/service-api]. "all 15" means changed all fifteen modules and affected [].

| Path | Kind | Selects | 0.2.0 changed / affected |
| --- | --- | --- | --- |
| `docs/agents/README.md` | ignored | [] | root + 5 |
| `subs/presentation/subs/layout/README.md` | readme | [] | layout + 4 |
| `tsconfig.json` | captured-input | all 15 | root + 5 |
| `package.json` | captured-input | all 15 | root + 5 |
| `scripts/build-production.ts` | auxiliary-source | [ramify] | root + 5 |
| `scripts/probes/fixtures/synthetic-owners.ts` | auxiliary-source | [ramify] | root + 5 |
| `vitest.config.ts` | auxiliary-source | [ramify] | root + 5 |
| `scripts/probes/fixtures/compiler-api/consumer.ts` | ignored | [] | root + 5 |
| `subs/cli/src/tmp/x.ts` | ignored | [] | cli + 5 |
| `.devcontainer/devcontainer.json` | inert | [] | root + 5 |
| `CLAUDE.md` | inert | [] | root + 5 |
| `tsconfig.scripts.json` | inert | [] | root + 5 |
| `.` | inert | [] | root + 5 |
| `subs/presentation/subs/project-view/src/tests/fixtures/dependency-models.json` | source-area | [ramify/presentation/project-view] | unchanged |
| `subs/presentation/subs/layout/module.ramify` | description | [ramify/presentation/layout] | unchanged |

The `tsconfig.scripts.json`, `tsconfig.build.json` and `tsconfig.portable.json`
files are existence-only probes in the toolkit's revision, so they are `inert`.
Ramify never reads them. Whether an edit to one should still trigger a full
audit is the audit configuration's choice; see the [handoff](iterations/iteration2.md#handoff).

## Compatibility with ramify-audit 0.5.0

**Finding: `/2` cannot carry the rule. The plan defines `ramify.affected/3`
and `ramify.affected-cli/3`.** Three reasons, each sufficient on its own:

1. **The 0.5.0 reader rejects every additive change.** Its decoder treats an
   unknown member as a shape error, and every closed field as a fixed list.
   From `src/ramify-affected.ts` in ramify-audit 0.5.0:

   ```ts
   /** Unknown keys are a shape error: a reader of this schema version knows every member. */
   function assertKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
     const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
     if (unknown.length > 0) throw malformed(`${path} has unsupported members: ${unknown.join(', ')}.`);
   }
   const OWNED_BASES = ['inventory', 'declaration', 'area', 'containment'] as const;
   function decodePathSeed(item: unknown, path: string): RamifyAffectedPathSeed {
     if (!isRecord(item)) throw malformed(`${path} must be an object.`);
     assertKeys(item, ['path', 'status', 'module', 'basis', 'exclusion'], path);
     …
       const basis = oneOf(item.basis, OWNED_BASES, `${path}.basis`);
   const SELECTION_KEYS = [
     'schemaVersion', 'inputId', 'paths', 'changedModules', 'affectedModules', 'testModules',
     'selection', 'widening', 'scope', 'coverage', 'analysisCheck',
   ];
   ```

   The planner ran the installed 0.5.0 decoder,
   `/home/app/tools/ramify-audit-0.5.0/node_modules/ramify-audit/dist/ramify-affected.js`,
   on modified real answers:

   | Variant | Result |
   | --- | --- |
   | Each seed gains a member (`selects`) | malformed: "selection.paths[0] has unsupported members: selects." |
   | A new owned `basis` value | malformed: "basis must be one of inventory, declaration, area, containment." |
   | A new selection member | malformed |
   | `ramify.affected-cli/3` | `unsupported-schema` |
   | `/2` with an owned seed but empty `changedModules` | answered |

   Every non-answer becomes `ramify-unavailable`, and the audit falls back to
   full.
2. **The changed meaning would be misread even in `/2` shape.** The last
   variant decodes, but 0.5.0 would still misread it in two places.

   First, `partial-selection.ts` counts every owned queried seed as selecting
   whenever the reading selects any module:

   ```ts
   const selectingPaths = reading.modules.length === 0 ? [] : [...new Set(selection.paths
     .filter(seed => seed.status === 'owned' && queried.has(seed.path))
     .map(seed => seed.path))].sort(compareStrings);
   ```

   An inert `docs/` path in a mixed change would therefore count toward the
   drift cap.

   Second, its stage-2 validation of `fullAuditPaths` entries
   (`undetectedPlacementRefusal`) accepts any owned seed with basis `area` or
   `containment`. That would accept `tsconfig.json` as a path Ramify leaves to
   the audit, although it now selects every module.

   With no member to carry the kind, 0.5.0 cannot tell which seeds selected
   anything.
3. **Ramify's own versioning rule requires it.** A changed meaning of an
   existing value advances the schema version. Here, an owned seed no longer
   implies that its owner is selected. Phase 1's
   [schema versions](../project-boundary-ramify/contracts.md) state this rule.

What 0.5.0 does with a 0.3.0 answer: `decodeAffectedDocument` reports
`unsupported-schema` for `ramify.affected-cli/3`. `interpretAffectedResult`
maps that to `ramify-unavailable`, so every partial audit becomes a full audit,
recorded as a fallback rather than a failure. Iteration 2 confirms this on
real 0.3.0 answers.

## What ramify-audit 0.6.0 must read

- **Schema.** Read `ramify.affected-cli/3` and `ramify.affected/3` strictly,
  with no `/2` reader, and pin `ramify.ts` 0.3.0 in its fixtures.
- **Seed members.** Decode `kind` and `selects` on every seed, enforcing the
  invariants under [the `/3` answer](#the-3-answer).
- **Selecting paths.** A path selects when its seed's `selects` is non-empty,
  not when its status is `owned`. The drift cap counts only those paths.
- **Empty selections.** A query that selects nothing answers empty, with
  `dependency-closure`. Treat that as a selection of zero modules, which
  needs no tests from Ramify, and not as unavailable.
- **Stage 2 (validating `fullAuditPaths` entries).** Branch on `selects`,
  not on `basis`. The entry is for a path the audit must handle itself because
  Ramify selects nothing for it, so the rule is:
  - **Accept** an owned seed whose `selects` is empty. Its kind is `ignored`,
    `readme` or `inert`. Under `/3`, owned-ignored content such as
    `examples/collection-review/` and `scripts/reference-harness/` selects
    nothing. A full-audit entry is then the only way to make its edit run
    every check, so 0.5.0's `excluded-placement` refusal of owned seeds no
    longer fits.
  - **Refuse** an owned seed whose `selects` is not empty, because Ramify
    already selects modules for it:
    - `source-area` and `auxiliary-source` keep `ramify-source`;
    - `description` keeps `ramify-declaration`;
    - `captured-input` needs a new reason, recommended name
      `ramify-captured-input`.
  - **Keep** `excluded-placement` for excluded seeds, and keep the
    `outside-project` handling.

  This closes the gap that Plan 7's contracts document: "a captured-input
  entry is accepted until a Ramify answer marks captured inputs". The audit's
  0.6.0 plan decides the reason names.
- **Ignore lists.** `ignorePaths` applies before the query, as ramify-audit's
  Plan 8 (ignore paths, release 0.6.0) reinstates it. It is independent of this
  contract.
