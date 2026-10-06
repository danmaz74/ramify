# Contracts: affected-rule selection

**Status:** reviewed by the coordinator on 2026-10-06. This file is the
complete reader contract for `ramify.affected-cli/3` and `ramify.affected/3`.
ramify-audit 0.6.0 (its Plan 8) reads it.

Iterations 0 to 2 are bound by it. The rule's authoritative wording goes into
[cli-invocation.spec.md](../../architecture/cli-invocation.spec.md) through
the authorized patch P1 in [protected documents](protected-documents.md).

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
- refusals and exit codes;
- the daemon operation and its IPC protocol `ramify.ipc/2`.

## The rule

Each distinct path seed is classified into exactly one kind, without a
filesystem read. An owned seed takes the kind of the first row that applies.
Excluded and outside-project seeds have kind `null`. A seed selects the
modules in its `selects` list.

| Order | Kind | Applies when | `selects` |
| --- | --- | --- | --- |
| 1 | `ignored` | The seed carries an owned-ignored or scratch exclusion. | `[]` |
| 2 | `description` | The path's last segment is `module.ramify`, present or absent. | `[owner]` |
| 3 | `readme` | The path is `README.md` directly in a current module's directory. | `[]` |
| 4 | `inert` | The path's last segment ends in `.md`, compared case-sensitively, wherever the path lies, including beneath `src/`. | `[]` |
| 5 | `source-area` | The path is at or beneath its owner's `src/`, present or absent. This includes the testing and interface areas and every non-`.md` resource. | `[owner]` |
| 6 | `auxiliary-source` | The inventory lists the path with placement `auxiliary`. Or the inventory does not list it and it is compiler source under the revision's configuration; a `.js`, `.jsx`, `.mjs` or `.cjs` path counts only when the configuration admits JavaScript. | `[owner]` |
| 7 | `captured-input` | The path is a [captured input](#captured-inputs) of the revision. | its [governed set](#governed-sets) |
| 8 | `inert` | Anything else: inert files, `.` and directories outside `src/`, and configuration files the revision did not read. | `[]` |

Notes on the ordering:

- Rows 1 to 6 depend only on the path and the inventory. Only rows 7 and 8
  consult the revision's captured inputs.
- Rows 3 and 4 precede row 7. A module README, or a `.md` resource that the
  revision captures, still selects nothing. This is Dan's decision: a `.md`
  path is classified as inert wherever it lies.
- The kind `inert` is broader than the glossary's *inert file*, which lies
  outside `src/`. The kind also covers `.md` paths beneath `src/`. Both mean
  that Ramify selects nothing for the path.

For an owned seed, `module` still names the owner, and `basis` keeps its `/2`
computation. Both only attribute the path; `selects` alone decides selection.

### Captured inputs

For row 7, a path is a captured input when the revision's `CapturedInput` list
holds it with one of these:

- role `configuration`: the selected compiler configuration and the
  configurations it extends;
- role `absent`: absence the analysis read, such as a resolution candidate;
- role `dependency` with `bytes > 0`, or with the sha256 of empty content: a
  file whose content the analysis read;
- role `source` or `resource`: listed for completeness; rows 4 to 6 always
  come first, so these never reach row 7.

This mirrors the contexts' `analysisInput()` in
`subs/daemon/subs/contexts/src/dispositions.ts`. It matches the glossary's
"content or absence an analysis revision read and fingerprinted".

These never count:

- role `directory`;
- a `dependency` existence probe, recorded with 0 bytes and a signature hash.

A path the revision did not capture is not a captured input, even when it is
named like a configuration file.

### Governed sets

- **The whole project.** An input with role `configuration`, and a captured
  input whose last segment is `package.json`, govern every inventoried module.
  The configuration compiles every module's source, auxiliary source included.
  The manifest decides package resolution and module format for all of them.
- **Its readers.** Any other captured input governs the owners of the files in
  `indexes.contributors[path]`: the analyzed files whose description reads it,
  resolves it or probed its absence.
- **The fallback.** When no file contributes the path, the input governs every
  inventoried module.

### Module lists and empty answers

- **`changedModules`:** the module-ID seeds together with every seed's
  `selects`.
- **`affectedModules`:** the reverse-dependency closure of `changedModules`,
  minus `changedModules`.
- **`testModules`:**
  - `changedModules` ∪ `affectedModules` when `selection` is
    `dependency-closure`;
  - every module when `selection` is `all-modules`.
- **`selection` and `widening`:** they keep their `/2` rules. Only a seed
  outside the project (`unowned-path`) or partial coverage (`partial-coverage`)
  widens. Widening never adds to `changedModules` or `affectedModules`.

**Empty answers.** If no module-ID seed is given and no path seed has a
non-empty `selects`, then `changedModules` and `affectedModules` are empty.
That happens when every seed is `ignored`, `readme`, `inert`, or excluded. An
empty answer is a complete answer:

- Ramify selects no module because of the change.
- `testModules` is also empty unless the answer is widened.
- When it is widened, `testModules` lists every module while
  `changedModules` and `affectedModules` stay empty.
- An empty answer is never "unavailable". It exits 0 like any other answer.

## Reader contract

### Invocation and exit

```text
ramify affected [<module-id>...] [--path <path>]... [--root <dir>] [--batch] --format json
```

| Exit | stdout |
| --- | --- |
| 0 | One `ramify.affected-cli/3` document, including empty and widened answers. |
| 1 | One `ramify.cli/1` document: an invalid project, an unknown module ID or an invalid seed. |
| 2 | One `ramify.cli/1` document: unavailable, pending, cold, superseded or past a deadline. |
| 130 | Interrupted; no result. |

The `ramify.cli/1` failure document is unchanged:
`{ schemaVersion, status: 'unavailable', diagnostics: [{ category, code, message }], exitCode }`.

### `ramify.affected-cli/3`

The document has exactly these members:

| Member | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `'ramify.affected-cli/3'` | |
| `root` | string | The absolute project root. It equals `selection.scope.root`. |
| `mode` | `'resident'` or `'batch'` | |
| `revision` | `{ sequence: number or null, inputId: string }` | `sequence` is null in batch. `inputId` equals `selection.inputId`. |
| `ramifyVersion` | string | For example `'0.3.0'`. |
| `selection` | `ramify.affected/3` | Below. |

### `ramify.affected/3`

The selection has exactly these members:

| Member | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `'ramify.affected/3'` | |
| `inputId` | string | The revision's input identity, `input/1:<64 hex>`. |
| `paths` | path seed[] | One per distinct path seed, byte-ordered by `path`. |
| `changedModules` | `{ id, directory }[]` | Byte-ordered by `id`. See [module lists](#module-lists-and-empty-answers). |
| `affectedModules` | `{ id, directory }[]` | As above. |
| `testModules` | `{ id, directory }[]` | As above. |
| `selection` | `'dependency-closure'` or `'all-modules'` | |
| `widening` | `('partial-coverage' or 'unowned-path')[]` | Distinct and sorted. Empty exactly when `selection` is `dependency-closure`. |
| `scope` | `{ root, selection, invokedFrom, configuration, walkedAreas, ownership }` | Unchanged from `/2`. `ownership` is `{ modules: { id, parent, directory }[], exclusions: { kind, directory, owner }[] }`. |
| `coverage` | `{ status: 'complete' or 'partial', notes }` | Unchanged from `/2`. Each note is `{ id, code, location, message, related }`. |
| `analysisCheck` | `'passed'` or `'failed'` | Unchanged. |

### Path seeds

Every seed has exactly the members `path`, `status`, `module`, `basis`,
`exclusion`, `kind` and `selects`:

| `status` | `module` | `basis` | `exclusion` | `kind` | `selects` |
| --- | --- | --- | --- | --- | --- |
| `owned` | the owner's ID | `inventory`, `declaration`, `area` or `containment` | null, or an `owned-ignored` or `scratch` exclusion whose `owner` is `module` | one of the eight rows' kinds | as the row says |
| `excluded` | null | `excluded` | an exclusion whose `owner` is null | null | `[]` |
| `outside-project` | null | `none` | null | null | `[]` |

Invariants a reader may rely on, and should reject a document that breaks:

- For an owned seed, `kind` is `ignored` exactly when `exclusion` is not null.
- `selects` is `[]` for `ignored`, `readme`, `inert` and `null`.
- `selects` is exactly `[module]` for `source-area`, `auxiliary-source` and
  `description`.
- For `captured-input`, `selects` is non-empty and may omit `module`.
- `selects` is byte-ordered with no duplicates, and names only modules in
  `scope.ownership.modules`.
- Every module in any seed's `selects` appears in `changedModules`.
- `readme` and `description` seeds have basis `declaration` when the path is
  a current module's README or description. A `description` seed for a
  module that does not exist yet has basis `containment`.

A path *selects* exactly when its `selects` is non-empty.

### TypeScript shape

The interface in `subs/analysis/src/interfaces/affected.ts` uses inline unions
only. It adds no new exported type name, because a new name would become a
signature companion that the root description must relay.

```ts
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
// AffectedSelection.schemaVersion: 'ramify.affected/3'; AffectedDocument.schemaVersion: 'ramify.affected-cli/3'.
```

The IPC protocol stays `ramify.ipc/2`. The daemon codec carries the selection
as a payload it does not decode, and an envelope's version advances only when
its own members change. No `/2` reader is kept, as the
[schema-versions rule](../../architecture/cli-invocation.spec.md) requires.

### Human output

`--format human` appends the kind and the selection to each owned seed's line:

```text
Path notes/design.md: owned by app (containment; inert; selects none)
Path tsconfig.json: owned by app (containment; captured-input; selects app, app/a, app/a-extra, app/a/grand, app/b)
Path subs/a/src/tmp/new.ts: owned by app/a (containment, scratch subs/a/src/tmp; ignored; selects none)
```

Excluded and outside-project lines are unchanged.

### Example: one complete document

This is `ramify affected --batch --format json --path tsconfig.json` on the
[extended topology](#examples-on-the-extended-topology), rooted at
`/work/app` and pretty-printed. The `scope` values and the `inputId` are
illustrative; iteration 1's tests record the exact ones.

```json
{
  "schemaVersion": "ramify.affected-cli/3",
  "root": "/work/app",
  "mode": "batch",
  "revision": { "sequence": null, "inputId": "input/1:0000000000000000000000000000000000000000000000000000000000000000" },
  "ramifyVersion": "0.3.0",
  "selection": {
    "schemaVersion": "ramify.affected/3",
    "inputId": "input/1:0000000000000000000000000000000000000000000000000000000000000000",
    "paths": [
      { "path": "tsconfig.json", "status": "owned", "module": "app", "basis": "containment", "exclusion": null,
        "kind": "captured-input", "selects": ["app", "app/a", "app/a-extra", "app/a/grand", "app/b"] }
    ],
    "changedModules": [
      { "id": "app", "directory": "." }, { "id": "app/a", "directory": "subs/a" },
      { "id": "app/a-extra", "directory": "subs/a-extra" }, { "id": "app/a/grand", "directory": "subs/a/subs/grand" },
      { "id": "app/b", "directory": "subs/b" }
    ],
    "affectedModules": [],
    "testModules": [
      { "id": "app", "directory": "." }, { "id": "app/a", "directory": "subs/a" },
      { "id": "app/a-extra", "directory": "subs/a-extra" }, { "id": "app/a/grand", "directory": "subs/a/subs/grand" },
      { "id": "app/b", "directory": "subs/b" }
    ],
    "selection": "dependency-closure",
    "widening": [],
    "scope": {
      "root": "/work/app", "selection": "given", "invokedFrom": "/work/app",
      "configuration": "/work/app/tsconfig.json",
      "walkedAreas": ["scripts", "src", "subs/a/scripts", "subs/a/src", "subs/a/src/tests", "subs/a-extra/src", "subs/b/src", "tools"],
      "ownership": {
        "modules": [
          { "id": "app", "parent": null, "directory": "." },
          { "id": "app/a", "parent": "app", "directory": "subs/a" },
          { "id": "app/a-extra", "parent": "app", "directory": "subs/a-extra" },
          { "id": "app/a/grand", "parent": "app/a", "directory": "subs/a/subs/grand" },
          { "id": "app/b", "parent": "app", "directory": "subs/b" }
        ],
        "exclusions": [
          { "kind": "external", "directory": "external-project", "owner": null },
          { "kind": "owned-ignored", "directory": "fixture-project", "owner": "app" },
          { "kind": "scratch", "directory": "src/tmp", "owner": "app" },
          { "kind": "owned-ignored", "directory": "subs/a/fixtures/sample", "owner": "app/a" },
          { "kind": "scratch", "directory": "subs/a/src/tmp", "owner": "app/a" }
        ]
      }
    },
    "coverage": { "status": "complete", "notes": [] },
    "analysisCheck": "passed"
  }
}
```

### Example: one seed per kind

These are the same query on the same revision, one seed each. Each row shows
the seed and the members that differ from the document above. All of them
have `widening: []` and `selection: 'dependency-closure'`, except the last,
and `coverage` is complete.

| Kind | Seed (`path`, `status`, `module`, `basis`, `exclusion`, `kind`, `selects`) | `changedModules` | `affectedModules` | `testModules` |
| --- | --- | --- | --- | --- |
| `source-area` | `subs/a/src/api.ts`, owned, `app/a`, inventory, null, `source-area`, `["app/a"]` | app/a | app, app/b | app, app/a, app/b |
| `auxiliary-source` | `scripts/check.ts`, owned, `app`, inventory, null, `auxiliary-source`, `["app"]` | app | — | app |
| `description` | `subs/a/module.ramify`, owned, `app/a`, declaration, null, `description`, `["app/a"]` | app/a | app, app/b | app, app/a, app/b |
| `readme` | `subs/a/README.md`, owned, `app/a`, declaration, null, `readme`, `[]` | — | — | — |
| `captured-input` | `tsconfig.json`, as in the complete document | all five | — | all five |
| `captured-input` (readers) | `data/limits.json` in the data variant, owned, `app`, containment, null, `captured-input`, `["app/b"]` | app/b | — | app/b |
| `inert` (`.md` in `src/`) | `subs/b/src/prompt.md`, owned, `app/b`, inventory, null, `inert`, `[]` | — | — | — |
| `inert` (other) | `notes/design.md`, owned, `app`, containment, null, `inert`, `[]` | — | — | — |
| `ignored` | `subs/a/src/tmp/new.ts`, owned, `app/a`, containment, `{ kind: 'scratch', directory: 'subs/a/src/tmp', owner: 'app/a' }`, `ignored`, `[]` | — | — | — |
| `null` (excluded) | `external-project/file.ts`, excluded, null, excluded, `{ kind: 'external', directory: 'external-project', owner: null }`, null, `[]` | — | — | — |
| `null` (outside) | `../outside.ts`, outside-project, null, none, null, null, `[]` | — | — | all five; `selection: 'all-modules'`, `widening: ['unowned-path']` |

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
the base revision.

The module IDs are `app`, `app/a`, `app/a-extra`, `app/a/grand` and `app/b`.
The reverse edges are `a -> app` and `a -> b`. "all" means all five IDs.

| Path seed | status / module / basis / exclusion | kind | selects | changed | affected |
| --- | --- | --- | --- | --- | --- |
| `subs/a/src/api.ts` | owned / app/a / inventory / null | source-area | [app/a] | [app/a] | [app, app/b] |
| `subs/a/src/new.ts` (absent) | owned / app/a / area / null | source-area | [app/a] | [app/a] | [app, app/b] |
| `subs/a/src/tests/tmp/real.test.ts` | owned / app/a / inventory / null | source-area | [app/a] | [app/a] | [app, app/b] |
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
| `subs/b/src/prompt.md` | owned / app/b / inventory / null | inert | [] | [] | [] |
| `subs/a/src/notes.md` (absent) | owned / app/a / area / null | inert | [] | [] | [] |
| `notes/design.md`, `notes/new.md` (absent) | owned / app / containment / null | inert | [] | [] | [] |
| `tsconfig.json` | owned / app / containment / null | captured-input | all | all | [] |
| `tsconfig.base.json` | owned / app / containment / null | captured-input | all | all | [] |
| `package.json` | owned / app / containment / null | captured-input if captured with content, else inert | all, else [] | all, else [] | [] |
| `data/limits.json` (data variant) | owned / app / containment / null | captured-input | [app/b] | [app/b] | [] |
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

Three cells depend on facts that iteration 0 records:

- the `package.json` row, by its recorded role;
- the `data/limits.json` row, by its recorded role and contributors;
- the `.devcontainer` row, which assumes the fixture does not read that file's
  content.

Once those facts are recorded, the rule decides each cell. If a fact turns out
differently, iteration 0 records it and reports it to the coordinator before
iteration 1.

Today's 0.2.0 answers differ in these rows:

- every `ignored`, `readme` and `inert` row selects its owner, including both
  `.md` rows under `src/`;
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
Ramify never reads them. Under 0.6.0 they are the only kind of file a
toolkit `undetectedConfigFilesForcingFullAudit` entry could name; see the
[handoff](iterations/iteration2.md#handoff).

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

   Second, its stage-2 validation of `undetectedConfigFilesForcingFullAudit`
   entries (`undetectedPlacementRefusal`) accepts any owned seed with basis
   `area` or `containment`. It would therefore accept `tsconfig.json` as a file
   no tool detects, although Ramify now selects every module for it.

   With no member to carry the kind, 0.5.0 cannot tell which seeds selected
   anything.
3. **Ramify's own versioning rule requires it.** A changed meaning of an
   existing value advances the schema version. Here, an owned seed no longer
   implies that its owner is selected. Phase 1's
   [schema versions](../project-boundary-ramify/contracts.md) state this rule.

What 0.5.0 does with a 0.3.0 answer: its decoder reports
`unsupported-schema` for `ramify.affected-cli/3`. `interpretAffectedResult`
maps that to `ramify-unavailable`, so every partial audit becomes a full audit,
recorded as a fallback rather than a failure. Iteration 2 confirms this on
real 0.3.0 answers.

## How ramify-audit 0.6.0 consumes `/3`

ramify-audit 0.6.0 is the first release that reads `/3`, through an iteration
of its Plan 8 briefed from this file. Its qualification runs on this plan's
iteration 2 production artifact before publication, as Plan 7 did with 0.2.0.

- **Schema.** It reads `ramify.affected-cli/3` and `ramify.affected/3`
  strictly, as this [reader contract](#reader-contract) defines them, with no
  `/2` reader. It pins `ramify.ts` 0.3.0.
- **Selecting paths.** A queried path selects when its seed's `selects` is
  non-empty. Only those paths count toward the drift cap.
- **Selected modules.** Its reading stays `changedModules` ∪
  `affectedModules`. An [empty answer](#module-lists-and-empty-answers) is a
  selection of zero modules, never `ramify-unavailable`.
- **Stage 2.** It validates `undetectedConfigFilesForcingFullAudit` entries.
  An entry is accepted only when its seed has `kind: 'inert'`. Every other
  kind is refused, and the refusal names the kind: `source-area`,
  `auxiliary-source`, `description`, `readme`, `captured-input`, `ignored`, or
  `null` for excluded or outside-project paths. This keeps the audit's D7
  (the list is for files that no tool detects) and closes the captured-input
  gap that Plan 7's contracts record.
- **Ignore lists.** `ignorePaths` applies before the query, as Plan 8
  reinstates it. It is independent of this contract.
