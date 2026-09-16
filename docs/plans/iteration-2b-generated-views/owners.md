# Plan 2B ownership and file map

**Status:** proposed placement for [Plan 2B](main-plan.md). Plan 2B adds one
owner, `analysis/views`, and no package entry. Iteration 1 replaces every
proposed declaration below with exact lines verified against Plan 2A's completed
`module.ramify` files.

## Responsibility map

| Owner | Responsibility added or changed | Must not own |
| --- | --- | --- |
| `analysis/model [browser]` | `listAvailableOriginals` over the public `explainImport`; `decisions.ts` restored. | Views, paths or text formats. |
| `analysis/project` | `ViewId`, the reserved-output table and the extended `isRamifyGeneratedPath`. | Rendering or publication. |
| `analysis/typescript` | Static test-hierarchy extraction and its retained adapter operation. | Test execution or view formats. |
| `analysis/views` (new) | View definitions, registry, API view projection and renderer, exported-symbols and module-docs views, path validation of generated targets. | Filesystem writes, session lifetime, compiler objects. |
| `analysis` | `RetainedSession.materialize`, construction of `ViewFacts` and `ViewProviders` from one sequence. | View formats, promotion of observed inputs during a query. |
| `daemon/contexts` | `ContextManager.materialize` composed from the unchanged check path and one session query. | Queue entry kinds other than check. |
| `daemon [dispatch]` | Generic output publisher, symlink entries, service dispatch, validation and codec for `views`. | View formats or model decisions. |
| root `ramify [dispatch]` | Service vocabulary, resident assembly injection and relays. | Feature algorithms. |
| `cli [dispatch]` | `--view` parsing, help and per-view summary lines. | Projection, rendering or publication. |

## Planned source changes

### `analysis/model`

- Restore `src/decisions.ts` to its text at Plan 2A's implementation base
  (`71643d5`); `git diff 71643d5 -- subs/analysis/subs/model/src/decisions.ts` is
  empty.
- Rewrite `src/availability.ts` over `explainImport`. Keep its exports, order
  and uniqueness contract.
- Keep existing availability tests; add a test that fails if `decisions.ts`
  exports any name beyond its pre-Plan-2A exports.

### `analysis/project`

- Replace `src/generated-path.ts` with the reserved-output table. Keep the
  exported name `isRamifyGeneratedPath`.
- Add `ViewId`, `ReservedOutput` and `reservedOutputs` to
  `src/interfaces/project.ts` (covered by its existing interface wildcard).
- Apply the extended predicate at the existing call sites in inventory,
  configuration, capture and observer, and add root-path and symlink-alias cases.
- Add `reservedOutputs` to `module.ramify`:

  ```text
  expose-src isRamifyGeneratedPath, reservedOutputs from "generated-path.ts" to parent
  ```

### `analysis/typescript`

- Add `src/test-hierarchy.ts` with `describeTestHierarchy` and focused tests.
- Extend `src/interfaces/source.ts` with `TestNode`, `TestFileHierarchy`,
  `TestHierarchyLimits` and `RetainedSourceAnalysis.tests`, and implement it in
  `src/retained-source-analysis.ts`.
- Add to `module.ramify`:

  ```text
  expose-src describeTestHierarchy from "test-hierarchy.ts" to parent
  ```

### `analysis/views` (new owner)

- `subs/analysis/subs/views/module.ramify` with header `module views` and a
  `README.md` whose first paragraph states the owner's purpose.
- `src/interfaces/views.ts` for the view vocabulary in
  [contracts](contracts.md#views).
- `src/registry.ts` (`viewRegistry`, `projectViews`), `src/targets.ts` (path
  validation), `src/api-view.ts` and `src/api-view-documents.ts` (moved from
  `analysis` and `daemon`), `src/exported-symbols.ts`, `src/module-docs.ts` and
  `src/text.ts` (shared text layout).
- Tests in `src/tests/`.
- Declarations:

  ```text
  expose-src * from "interfaces/views.ts" to parent
  expose-src viewRegistry, projectViews from "registry.ts" to parent
  ```

- `analysis/module.ramify` relays the model, project and typescript names the
  views owner needs to `descendants`, where they are not already relayed, and
  adds `expose-sub * from views to parent`.

### `analysis`

- Replace `RetainedSession.apiView` with `materialize` in
  `src/interfaces/session.ts`, `session-engine.ts`, `session-host.ts`,
  `session-messages.ts` and `session-worker.ts`.
- Remove the promote step from the query; add identity comparison for a
  recreated compiler.
- Remove `src/api-view.ts` after its move, keeping deprecated type aliases only
  where Plan 2A evidence still imports them.

### `daemon/contexts`

- Remove the `PendingApiView` queue entry and restore `queue.ts`, `context.ts`
  and the check portions of `context-manager.ts` to their pre-Plan-2A behavior.
- Add `ContextManager.materialize` and its request and outcome types.

### `daemon`

- Replace `src/api-view-publisher.ts` with `src/output-publisher.ts`, keeping
  its transaction, recovery and failure-injection seams, and adding symlink
  entries and the recognizable-target rule.
- Remove `src/api-view-documents.ts` after its move.
- Extend `service.ts`, `validation.ts`, `codec.ts`, `connection.ts` and
  `connect-daemon.ts` for `views` and the `materialize-views` capability.
- Declaration change:

  ```text
  expose-src createFilesystemOutputPublisher from "output-publisher.ts" to parent
  ```

### Root

- Extend `src/interfaces/service.ts`, `src/resident-assembly.ts` and
  `src/tests/quick-environment.ts`.
- Relay `ViewId`, `ViewSelection` and the extended `MaterializedTarget` to
  descendants; remove relays of `ApiView*` names no consumer uses.

### `cli`

- Extend `src/arguments.ts`, `src/materialize-command.ts` and help text, with
  focused tests.

### Harness, repository and documentation

- `scripts/reference-harness/plan2b-instances.ts`, runtime and case files, and
  `--plan 2b` support in `verify.ts` and `plan.ts`.
- `scripts/measurements/plan2b.mjs` workloads.
- Root and reference `.gitignore` entries for `.exported_symbols/`,
  `docs/modules/` and their transient forms.
- A short `AGENTS.md` section naming `.exported_symbols` as generated
  architecture evidence and `docs/modules` as generated links.
- Every assertion of eleven toolkit owners: `CLAUDE.md`,
  `docs/development/testing.md`, `scripts/validate-final-contracts.ts`,
  `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` and
  harness counts.

## Test ownership

Each production owner keeps focused tests in its own `src/tests/`. View tests
use plain `ViewFacts` fixtures and controlled providers. Publisher tests use
temporary roots and the controlled filesystem. The reference harness owns
cross-owner, compiled-process, invariance and independent expected-tree cases.
