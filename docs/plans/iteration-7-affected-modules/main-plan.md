# Plan 7: Affected modules from retained dependency facts

**Date:** 2026-09-12, revised 2026-09-28. **Status:** revised draft; implementation
starts on branch `feat/plan7-affected-modules` from `5a1934aa`. The 2026-09-12
draft was written against a Plan 5 checkout at 5 of 15 iterations. This revision
re-inventories the source after Plan 5's completion and the later session
queries, and rescopes the deliverable to what the ramify-audit consumer needs.
The plan keeps its identity; the earlier assessments under this directory are
historical evidence and are marked as such where cited.

Given changed paths or module IDs, return every transitively dependent module
and the set of modules whose tests to run. Answer from the resident session's
retained facts through the daemon, or from a fresh session in batch mode.
Expose one query through the TypeScript API, the daemon client and the CLI.

## Decisions, 2026-09-28

1. **Seeds are paths or module IDs.** A query names project-relative paths,
   exact inventory module IDs, or both. Ramify resolves a path to its module
   through the inventory: an inventoried file by its owner, a `module.ramify`
   or `README.md` beside a module directory by that module, and any other path
   under a module's source area by that area's owner. Every other path is
   unowned. The consumer never maps paths to modules itself.
2. **An unowned changed path widens the answer to every module.** A root
   `package.json`, a `tsconfig.json`, a lockfile or a path in no module's area
   can change any module's behavior. The answer keeps the known closure and
   sets `selection: 'all-modules'` with the reason `unowned-path`. Consumers
   filter documentation paths before asking, as ramify-audit's applicability
   policy already does.
3. **Deleted and moved paths need no base revision.** A deleted file is not
   inventoried, so it resolves by area containment to the module that owned
   it; that module and its current dependents are selected. A former importer
   that still names the deleted file has an unresolved target, which is a
   partial-coverage note and widens to every module. A former importer that
   dropped the import changed and is a seed itself. A deleted module directory
   contains no current area, so its paths are unowned and widen. This is
   conservative in every case without historical graph data, so the draft's
   deferred base-revision closure is closed as unnecessary.
4. **Coverage widening is global and counts only target-unknown notes.** A
   coverage note whose code leaves the target file's owner known, such as an
   unresolved original inside a resolved file or a signature note, keeps the
   answer complete. Any other note anywhere in the project makes coverage
   partial and widens to every module, because an unknown target could be an
   edge into the seeds. ramify-agent's 312 notes at `5a1934aa` are all
   `signature-inferred`, so its answers stay complete.
5. **Batch mode is a first-class form.** `ramify affected --batch` opens a fresh
   session over the selected root in a Node process, answers, and disposes it,
   exactly as `check --batch` trusts no daemon state. The answer is bound to
   the session's `inputId`. This is the form an audit of a prepared worktree
   uses. The draft's rejection of batch is withdrawn.
6. **No commit-keyed reuse of analysis data.** Re-analyzing the same commit in
   another worktree or a batch session repeats the analysis. The idea is
   recorded as a [deferred optimization](../../architecture/optimization.md#deferred-commit-keyed-reuse-of-analysis-data)
   and is out of scope here.
7. **MCP, the evidence validator and the measurement gate are deferred.** The
   draft's `ramify_affected_modules` tool, `scripts/verify-affected.mts` and
   200-query measurement protocol are not part of this plan. Acceptance is the
   owned tests, `npm run check:self`, real invocations on the toolkit and on
   ramify-agent, and one modest timing sample.
8. **The on-demand graph stays.** No module graph, edge bookkeeping or query
   cache is retained between queries, and ordinary checks and hooks perform no
   graph work. The draft's [strategy comparison](storage-strategy-comparison.md)
   supports this and remains valid.
9. **The full test suite runs only through an audit.** Iterations run focused
   Vitest files, `npm run type-check` and `npm run check:self`. The plan's
   final gate is one ramify-audit run of
   [`audit/plan7-affected-modules.request.json`](../../../audit/plan7-affected-modules.request.json).

## Runnable outcome

```sh
ramify affected --path subs/core/src/core.ts --format json          # resident
ramify affected app/core app/storage --format json                  # module IDs
ramify affected --path subs/core/src/core.ts --batch --format json  # fresh session
```

For modules `A -> B -> C`, where an arrow means "depends on", and an unrelated `D`:

| Seeds | `changedModules` | `affectedModules` | `testModules` | `selection` |
| --- | --- | --- | --- | --- |
| `--path subs/c/src/c.ts` | C | A, B | A, B, C | `dependency-closure` |
| `--path subs/d/src/tests/d.test.ts` | D | none | D | `dependency-closure` |
| `--path subs/c/src/deleted.ts` (no longer on disk) | C | A, B | A, B, C | `dependency-closure` |
| `--path package.json` | none | none | A, B, C, D | `all-modules`, `unowned-path` |
| `c` with a nonliteral dynamic import anywhere | C | A, B | A, B, C, D | `all-modules`, `partial-coverage` |
| `--path docs/x.md` | none | none | A, B, C, D | `all-modules`, `unowned-path` |

Module IDs are exact inventory IDs. Results carry IDs and project-relative
directories; the caller chooses and runs the tests. Cycles terminate and
outputs are deterministic. The [contracts](contracts.md) specify inputs,
results, failures and freshness.

## Verified state at `5a1934aa`

Inspected on 2026-09-28 in the toolkit checkout. These facts shape the
iterations; each iteration re-verifies the paths it touches.

1. **The retained session already hosts read-only queries.**
   `RetainedSession` in `subs/analysis/src/interfaces/session.ts` has `update`,
   `sweep`, `verify`, `report`, `releaseRevision`, `releaseCompiler`,
   `apiView`, `architectView`, `measurements` and `explorerDetails`.
   `session-engine.ts` implements them in the worker under `#serialize`;
   `session-host.ts` forwards them over the request-ID protocol of
   `session-messages.ts`; `session-worker.ts` dispatches by operation name.
   `measurements(sequence)` is the closest pattern: it checks the sequence,
   disposal and `facts.invalid`/`inventory`/`areaIssues`, then reads
   `facts.inventory` directly.
2. **The facts hold everything the graph needs.** `SessionFacts` in
   `session-facts.ts` retains `inventory`, `areas`, per-file `FileFacts` with
   `description`, `accesses` and `coverage`, the `catalog`, `model`,
   `decisions` and `indexes.owners`. `SourceAccess.importer` is a
   `SourceOrigin` whose `area.owner` is the consumer; `target` is a
   `SourceTarget` whose `application` variant carries an origin;
   `selections[].original` is an `OriginalId` with `owner`; `forwarding` lists
   origins. `FileDescription.dependencies.shims` lists declaration shims.
3. **A module boundary projection exists but is not reusable as is.**
   `dependency-diagram.ts` projects `(consumer, importedModule, original)`
   boundaries from a report's accesses through an ownership resolver. It omits
   unused boundaries, symbol-free loads and same-owner accesses, and works on
   a complete report. The affected query needs every access form and works on
   retained facts, so it has its own private projector. The two share the
   inventory's owner lookup and vocabulary, not code.
4. **`measure` is the wiring pattern for a new read-only operation.** Contexts
   declares the request and outcome in `interfaces/contexts.ts` and schedules
   it in `context-manager.ts`; the daemon adds the operation to `service.ts`,
   the capability list in `codec.ts` and the gated method in `connection.ts`;
   root names it in `src/interfaces/service.ts` and assembles it; the CLI has
   `measure-command.ts`, its arguments in `arguments.ts` and dispatch in
   `run-cli.ts`, with tests in `subs/cli/src/tests/measure-command.test.ts`
   and `subs/daemon/src/tests/measure-service.test.ts`.
5. **Batch runs through one seam.** `src/interfaces/batch.ts` declares
   `BatchInvocation`, `BatchResult` and `BatchOperation`; the CLI receives it
   as `environment.batch`; the Node entry runs it in process and the compiled
   client runs it in a Node child through `batch-entry.ts`. The affected batch
   form adds a second operation on that seam.
6. **Cost of a fresh analysis.** `ramify check --batch` took 10.2 to 10.8 s on
   the toolkit (15 owners, 438 source files, 6,579 accesses) and 15.5 to
   16.3 s on ramify-agent (12 owners, 525 files, 10,637 accesses); a cold
   daemon plus a new context took 14.0 s on ramify-agent. The `--batch`
   affected form pays this once per invocation.
7. **The consumer contract.** ramify-audit's Plan 1 needs path seeds, a
   revision-bound answer for a prepared checkout, the module inventory with
   directories, the unowned changed paths, coverage notes and the Ramify
   version. This plan supplies each of them through `AffectedSelection` and
   the CLI document.

## Dependency and coverage semantics

1. Nodes are declared Ramify modules of the revision's inventory. Same-owner
   `src/tests/` belongs to its module; a separately declared testing module is
   its own node.
2. For every retained access, the consumer is the importer's owner. Providers
   are the application target's owner, each selected original's owner and each
   forwarding origin's owner. Include value, type-only, namespace, dynamic,
   side-effect, re-export and symbol-free accesses, denied accesses included.
   Exposure declarations and ancestry contribute no edges.
3. For every retained file description, add the file owner's dependency on the
   owner of each owned path in `dependencies.shims`. Resolution candidates
   and other description inputs are analysis dependencies, not edges.
4. Drop self-edges. Traverse the reverse graph at module granularity from all
   seeds in one pass. If B/file1 depends on C and A depends on B/file2,
   changing C selects B and A. Never prune with Plan 5's checked set,
   description equality or selected symbols.
5. `changedModules` are the seeds, including path-derived ones;
   `affectedModules` are the reached dependents excluding seeds; `testModules`
   is their union, or every inventoried module when the selection is
   `all-modules`. All lists are sorted by UTF-8 byte order of ID and
   deduplicated. An unknown module ID fails the whole query with the complete
   unknown set. Empty seeds are valid at the API and yield empty lists.
6. A path resolves per decision 1; `paths` reports each with its module and
   basis. Any `none` basis widens with `unowned-path`.
7. Coverage is partial when any retained note has a code other than
   `incomplete-exports`, `ambiguous-original`, `unresolved-original`,
   `unknown-key`, `namespace-escape`, `signature-inferred` or
   `signature-unresolved`. Partial coverage widens with `partial-coverage` and
   returns the notes.
8. Missing facts, an invalid current revision, a stale sequence, a malformed
   query and a resource limit are explicit unavailable outcomes. Never answer
   from an older valid revision. `analysisCheck` reports the revision's
   existing verdict and claims nothing about tests.

## Architecture and scope

Analysis owns the private projector and the session operation, in the worker,
serialized with mutations and cooperative with cancellation. Contexts schedules
the request against the covering revision with the same freshness rules as
`measure`. The daemon exposes it as the `affected` operation and capability.
Root names it in the service interface, assembles it, and adds the batch
operation. The CLI adds `ramify affected` with resident and `--batch` forms.
The [ownership package](owners.md) lists the exact files, manifest lines and
purpose sentences.

A ready query makes no compiler call, source read, `report()` projection or
new session. A warm session answers with the compiler released. Only the
compact answer crosses the worker. Bounds: at most 4,096 seeds, 4,096
inventoried modules and 100,000 unique edges; over a bound is `resource-limit`.

Deferred: MCP tool, evidence validator, measurement gate, historical
revisions, symbol-level impact, test execution, individual test-file selection,
graph caching, browser integration and commit-keyed analysis reuse.

## Iterations

| Iteration | Capability and owners | Prerequisite | Matrix |
| --- | --- | --- | --- |
| 1 | Projector, session operation and worker round trip; `analysis` | none | A7-01 to A7-05 |
| 2 | Context scheduling, daemon operation, root service; `contexts`, `daemon`, root | 1 | A7-06 to A7-08 |
| 3 | CLI command, batch form and documentation; `cli`, root | 2 | A7-09 to A7-11 |
| 4 | Real invocations, self-check, results report and audit gate | 3 | A7-12 to A7-13 |

The [manifest](iterations/manifest.json) registers them sequentially. Each
iteration file is self-contained: prerequisites, read-first list, deliverables,
matrix rows, verification commands and exit criteria. The
[acceptance matrix](acceptance.md) and [case inventory](cases.json) define
completion.

## Review and completion

- [ ] Iteration 1: projector, session and worker cases pass; no compiler,
      source read or report call on a ready query.
- [ ] Iteration 2: contexts, daemon and IPC answers match at one input identity;
      unavailable, superseded, cold and cancelled outcomes are explicit.
- [ ] Iteration 3: `ramify affected` resident and batch forms agree on the
      reference project; documentation names the command and its exits.
- [ ] Iteration 4: real answers on the toolkit and ramify-agent are recorded
      with timings; `npm run check:self` passes; the audit request passes.
- [ ] Roadmap status advanced with the completion report.
