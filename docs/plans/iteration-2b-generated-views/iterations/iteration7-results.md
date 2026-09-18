# Iteration 7 results: Materialize the architect view

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `a8dc8f4`, iteration 6's completed results.
The implementation commit is `b01fdd0`. Every verification command was run on that tree.

## Prerequisites

- Iteration 3's handoff held:
  - `RetainedSession.architectView(query, control?)` answered through the worker;
  - the resident assembly and the daemon's counted session passed it through;
  - the contexts scripted driver answered it with a placeholder `unavailable`.
- Iteration 4's handoff held: `renderArchitectView` imported only `byteOrder` at run time, and root statement R11
  re-exposed it and the architect types to descendants.
- Iteration 5's handoff held: `publish(root, revision, { api, architect }, requestId, control)` is one transaction,
  and the architect target switches last. `runMaterialize` already mapped `invalid-path` to `invalid-location` and
  `resource-limit` to `resource-unavailable`.
- Iteration 6's handoff held. The analyzer's `ready` outcome carried `testReferences`, and the process runner
  validated them. The context manager's `mapDiagram` kept `outcome.diagram` alone.

## Built

### Root `ramify`

- `src/interfaces/service.ts`:
  - `MaterializeViewId = 'api' | 'architect'`;
  - `MaterializeParams.views?: readonly MaterializeViewId[]`, absent meaning `['api']`;
  - `MaterializedArchitectSummary`: `modules`, `records` and `dependencies`, which is `'measured'` or
    `{ unavailable: ArchitectDependencyReason }`;
  - the `materialized` outcome's optional `architect`, present exactly when `views` names the architect view;
  - `ServiceCapability` gains `'materialize-views'`.
- `module.ramify` is unchanged. R6's `*` covers the new names, and R9 and R11 already re-exposed what `daemon` and
  its contexts use.

### `daemon/contexts`

- `interfaces/contexts.ts`:
  - `ApiViewRequest.views?: readonly ('api' | 'architect')[]` (see [Deviations](#deviations));
  - the `projected` outcome's `projection` becomes `ApiViewProjection | null`, beside
    `architect: ArchitectViewProjection | null`, each null exactly when its view was not requested;
  - `ApiViewQueryLimits.architect`: `details`, `tests` and `maxProjectionBytes`;
  - `ContextDependencyFactsOutcome`: the diagram answer whose `ready` variant adds
    `testReferences: TestReferenceFacts | null`;
  - `ContextManager.dependencyFacts(request, lease, control?)`.
- `context.ts`: `RetainedDiagram` gains `testReferences`, and its `bytes` count the references' JSON too.
- `context-manager.ts`:
  - **Views.** `deliverApiView` reads `views`, absent meaning `['api']`. At the pinned sequence it calls
    `session.apiView` only for `api`, then `session.architectView` only for `architect`, with
    `apiViewLimits.architect`.
    - An answer other than `projected` from either query settles the whole request.
    - `superseded` marks the context reconciling with a required sweep, as the API view's supersession already did.
    - `resource-limit` maps to `resource-unavailable`; `invalid-revision` and `analysis-failed` map to
      `analysis-failed`, with the message prefixed by the session's reason.
  - **Cancellation.** Each delivery passes an abort signal to both queries. Settling the request, by cancellation,
    a deadline or a released lease, aborts a query still running.
  - **Limits.** The default limits gain Plan 2B's architect values: 240-byte signatures, 280-byte documentation,
    four overloads and 32 MiB details; 240-byte titles, 40 titles a record and 16 MiB titles; and a 64 MiB projection.
  - **Facts.** The existing job logic is now `dependencyFacts`. Its jobs, retained result and answer order are
    unchanged. Every caller of a job receives the facts answer.
  - **Public answer.** `dependencyDiagram` calls `dependencyFacts` and answers `{ status, requestId, revision, diagram }`
    for `ready`, dropping the references, and every other answer unchanged.
  - **Retention.** `mapDiagram` retains the references beside the diagram and counts both in `retainedBytes` and in
    the per-context and global budgets:
    - the diagram's own admission and messages are unchanged;
    - references that would exceed a budget the diagram alone meets are dropped, and the diagram is retained with
      `testReferences: null`;
    - references naming another input than the diagram's make the outcome `analysis-failed`, as the process runner
      already does.

  A cached diagram is served with its references without a new analyzer run.

### `daemon`

- `validation.ts`: `materialize` accepts an optional `views`, a non-empty list of distinct known identifiers.
- `host.ts` advertises `materialize-views`, and `codec.ts` accepts it in a welcome.
- `service.ts`:
  - **Limits.** `apiViewLimits` passes the architect limits explicitly, as it does the API view's.
  - **Views.** `runMaterialize` passes `views` to `ContextManager.apiView` only when the request has it, so a request
    without it is Plan 2A's.
  - **Wait.** After a `projected` outcome with an architect projection, `waitForDependencies` asks
    `dependencyFacts` for that revision with the client's context lease. It uses the service clock and an exported
    `dependencyWait = { intervalMs: 250, limitMs: 125_000 }`:
    - `ready` gives measured dependencies with the answer's `testReferences`;
    - `busy`, either `analysis-running` or `inputs-changed`, pauses `intervalMs` and asks again;
    - `superseded` ends the invocation as `superseded` with the newer revision, publishing nothing;
    - `resource-unavailable`, `invalid-current`, `analysis-failed` and `resource-limit` give unavailable
      dependencies with that reason;
    - an unknown context, an earlier generation or disposal ends the invocation as `unavailable` with that reason;
    - the client's cancellation ends it as `cancelled`.

    The limit is scheduled once, at the first request. Reaching it aborts the wait, including a job this caller
    started or joined, and gives unavailable dependencies with `wait-limit`. A job with no other caller then aborts.
  - **Render.** It calls `renderArchitectView({ revision, projection, dependencies })`. A renderer throw is
    `unavailable`/`analysis-failed`.
  - **Publish.** It calls `publish(root, revision, { api: projection, architect: view }, ...)`, with `api` null when
    the API view was not requested, and maps the publisher's outcome as before.
  - **Outcome.** A `materialized` outcome carries `architect` when it was requested.

### `cli`

- `arguments.ts`:
  - `--view <api|architect>` may repeat, once per view, in the order given;
  - a missing value, an unknown or differently cased value, a duplicate, and `--from` or `--all` without `api` when
    `--view` is given are invalid invocations;
  - the result carries `views` only when `--view` was given.

  The help text keeps Plan 2A's usage line and adds
  `ramify materialize --view <api|architect>... [--from <path> | --all] [--root <dir>]`, a paragraph on views, and
  "incompatible service" in the exit line.
- `errors.ts`: the CLI failure code `incompatible-service`.
- `materialize-command.ts`:
  - With `views` and a welcome without `materialize-views`, it fails with `incompatible-service` before opening a
    context: `Error [incompatible-service]: …`, exit 2.
  - Without the API view it resolves no `--from` path and sends the selection `{ scope: 'all' }`, which the daemon
    ignores.
  - It sends `views` only when `--view` was given.
  - Success output keeps the two lines and adds
    `Architect view: .ramify-architect, <modules> modules, <records> records, dependencies <measured|unavailable (<reason>)>`.

  The `Materialized` line counts every target, the architect target included, and its entries include the view's
  records, as `MaterializedTarget.entries` defines them.

### Outside the owners

- `src/tests/quick-environment.ts` advertises `materialize-views`. Its default assembly already served
  `architectView` through the real session.
- `subs/daemon/subs/contexts/src/tests/scripted-driver.ts` serves `architectView`:
  - it records `architectViewCalls`;
  - it answers scripted outcomes from `architectViewPending`, each receiving the query's signal;
  - by default it projects an empty projection of the current revision, or `invalid-revision` for another sequence.

  `testApiViewLimits` gains the architect limits.
- `src/tests/dependency-diagram-daemon.test.ts` (BD24) compared `retainedBytes` with the facts and the diagram
  exactly. It now requires the retained difference, the test references, to be positive and within the analyzer's
  16 MiB bound, and the public answer to have exactly the four fields.

### Tests

- `subs/daemon/subs/contexts/src/tests/api-view.test.ts`: six AV26 tests.
- `subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts`:
  - three C9 tests for `dependencyFacts`;
  - BD22's retained bytes include the references;
  - BD19's expired-generation token is fixed (see [Deviations](#deviations)).
- `subs/daemon/src/tests/service.test.ts`: six AV25–AV27 tests.
  - They use a fixture with a function and a test file that calls it, and a controllable runner.
  - A publisher records every input and publishes it for real, and a spy on the controlled clock finds the wait's
    pauses.
  - BD23's retained bytes include the references.
- `subs/daemon/src/tests/validation.test.ts`, `codec.test.ts` and `ipc.test.ts`: AV25.
- `subs/cli/src/tests/arguments.test.ts`: AV24's grammar and exit before connecting.
- `subs/cli/src/tests/materialize-command.test.ts`: AV24's request and output with and without `--view`, and AV25's
  incompatible service. Its quick environment uses a runner that answers unavailable at once.
- `src/tests/resident-cli.test.ts`: AV28 through the quick environment, with the analyzer run in process.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV24 | See the AV24 witnesses below | pass |
| AV25 | See the AV25 witnesses below | pass |
| AV26 | See the AV26 witnesses below | pass |
| AV27 | See the AV27 witnesses below | pass |
| AV28 | See the AV28 witnesses below | pass |

AV24 witnesses:

- **Grammar** (`arguments.test.ts`):
  - repeated `--view` values parse in the order given, with `--all`, `--from` and `--root`;
  - these are rejected with their messages: a missing value, one followed by a flag, an empty value, `other`, `API`,
    a duplicate `api`, a third `architect`, `--view architect --all`, `--from … --view architect`, and `--view` on
    `check`;
  - three of them through `runCli` exit 2 with `invalid-invocation` and no connection or batch call.
- **Help.** It lists both materialize usage lines.
- **No `--view`** (`materialize-command.test.ts`). The request's keys are exactly `freshness`, `requestId`,
  `selection` and `token`. The output is Plan 2A's two lines, also against a daemon whose welcome lacks
  `materialize-views`.
- **`--view architect` from `src/`.** The request carries `views: ['architect']` and the selection
  `{ scope: 'all' }`. The output is the two lines plus
  `Architect view: .ramify-architect, 1 modules, 1 records, dependencies unavailable (analysis-failed)`.
  `.ramify-architect/_meta.json` is written.
- **Plan 2A handlers.** See [Plan 2A materialize handlers](#plan-2a-materialize-handlers).

AV25 witnesses:

- **Validation** (`validation.test.ts`):
  - absent views and `['api']`, `['architect']` and both orders are valid, and the input is unchanged;
  - these are invalid: an empty list, duplicates, `other`, `API`, `''`, `null`, a number, a string, `null` as the
    list, an object, an array-like object, a sparse array and an array with an extra property;
  - a missing selection, and published freshness, are still invalid with views.
- **Service** (`service.test.ts`). Five invalid lists through the codec-backed request are `invalid-request`, with
  no dependency run and no publication.
- **Wire** (`codec.test.ts`). A welcome listing `materialize-views` round-trips; `materialize-view` and
  `materializeViews` are refused.
- **Real host** (`ipc.test.ts`):
  - the public socket client's welcome contains `materialize-views`;
  - `views: ['architect']` reaches the service unchanged and answers `materialized` with only the architect target
    and `architect: { modules: 1, dependencies: { unavailable: 'analysis-failed' } }`;
  - duplicate views are `invalid-request`.
- **Client without the capability** (`materialize-command.test.ts`). A connection whose welcome lacks
  `materialize-views` makes `materialize --view api --all` exit 2 with `Error [incompatible-service]: …` on stderr,
  nothing on stdout, no `materialize` request and no context opened.

AV26 witnesses (`api-view.test.ts`, scripted driver):

- **No views.** Only `apiView` is called, and the outcome has `architect: null`.
- **Architect alone.** After the default capture moves to revision 2, only `architectView` is called, once, with
  `{ sequence: 2, ...architect limits }`. The outcome has revision 2, `projection: null` and the projection of
  sequence 2.
- **Both views.** Joined with a synchronized check in one capture, one session operation serves both. The check's
  revision, the outcome's revision and both projections are sequence 2, and each query is called once at sequence 2.
- **Supersession.**
  - A superseded architect query makes the outcome `superseded` with the pinned revision and leaves the context
    unsynchronized.
  - A superseded API query ends the request before any architect query.
- **Refusals.** An architect `resource-limit` is `resource-unavailable`; `invalid-revision` is `analysis-failed`; a
  thrown query is `analysis-failed` with its message.
- **Cancellation.** Cancelling the request aborts the signal of the running architect query and answers `cancelled`.

AV27 witnesses (`service.test.ts`, real session and publisher, controllable runner):

- **Ready.**
  - The runner receives the published revision's completed report.
  - The outcome reports `architect: { modules: 1, records, dependencies: 'measured' }` and exactly one target, the
    architect target.
  - The one publish input has `api: null`.
  - `_meta.json` names the revision and input, with `dependencies`, `dependencyScope` and `testReferences` as
    `measured`, `production` and `measured`.
  - **The renderer received the references:** `tests.jsonl` is exactly the one suite record with
    `"exercises":["fixture#run"]`. No API view is written.
  - An unchanged repeat is answered from the retained facts with no new run and writes 0 bytes.
  - A request without views reports no `architect`, publishes `architect: null` and runs nothing.
- **Busy.**
  - Another context's job holds the analyzer, so the first answer is `busy`/`analysis-running`.
  - The service schedules one 250 ms pause on the service clock.
  - After 249 ms there is still one run, one pause and no publication.
  - The other job then settles, and 1 ms later a second run starts for this revision. Once it is ready, one publish
    call carries both views: targets `api`, `api`, `architect`, with `dependencies` and `testReferences` measured.
- **Wait limit.**
  - The limit is scheduled once, at the first request. The first run answers `inputs-changed` (busy); after the
    pause a second run starts and stays pending.
  - 1 ms before the limit its signal is not aborted. At the limit it is aborted.
  - The view is published with `dependencies: { unavailable: 'wait-limit' }`: `_meta.json` has
    `dependencyReason: "wait-limit"` and `testReferences: "unavailable"`, and no record has `exercises`.
- **Unavailable.** Runs answering `analysis-failed` and `resource-limit` publish with that `dependencyReason`.
- **Superseded.** While the run is pending, an edit and a synchronized check publish revision 2. The materialize
  answers `superseded` with revision 2, the run's signal is aborted, and the publisher is never called.
- **Cancelled.** Aborting the client's control during a pending run answers `cancelled`, aborts the run and calls no
  publisher. Neither `.ramify-architect` nor `src/.ramify` exists afterwards.
- **Timers.** Every quick environment is disposed with no timer left, so the wait's limit and pauses are released.

AV28 witness (`resident-cli.test.ts`):

- **Fixture.** It exposes `value` and a function `run`. The consumer module calls `run` in production and in
  `src/tests/use.test.ts`.
- **Command.** `materialize --view api --view architect --all` runs through the quick environment and the real
  service, with the analyzer in process. It exits 0 with no stderr.
- **One transaction.** Exactly one publish call carries both views. Its targets are `src/.ramify`,
  `subs/consumer/src/.ramify`, `subs/consumer/src/tests/.ramify` and `.ramify-architect`, in that order.
- **Output.** The three lines are `Root: <root>`, `Materialized: revision 1; 4 target(s), …, 0 unchanged` and
  `Architect view: .ramify-architect, 2 modules, <records> records, dependencies measured`.
- **One revision.** The analyzer ran once, `ready`. Both `_meta.json` files name the publish call's revision.
- **Facts.** The root's `behavior.jsonl` lists `"behavioral":["fixture/consumer"]`, and the consumer's `tests.jsonl`
  carries `"exercises":["fixture#run"]`.
- **Release.** No connection, subscription or lease remains.

C9 witnesses (`dependency-diagram.test.ts`):

- **Join.** A facts caller and a diagram caller join one job. The facts answer is
  `{ status, requestId, revision, diagram, testReferences }`, and the diagram answer is exactly
  `{ status, requestId, revision, diagram }`.
- **Retained.** A second facts request is answered from the retained result with the frozen references and no run.
  `retainedBytes` is the session's facts plus the diagram's and the references' JSON.
- **Supersession.** A newer revision supersedes a facts request.
- **Null references.** References refused by the analyzer are retained as `null`, and only the diagram is counted.
- **Budgets.** With `maxRetainedBytesPerContext`, and then `maxRetainedBytesGlobal`, one byte below the diagram
  with 20 reference files, the diagram is retained without references and is still served by `dependencyDiagram`.
- **Another input.** References of another input are `analysis-failed`, with nothing retained.

Mutations were each restored from a copy after their run, and each made at least one test fail:

- **Service:**
  - measured dependencies with `testReferences: null` instead of the answer's references;
  - the wait limit reported as `cancelled`;
  - a busy answer taken as unavailable dependencies;
  - a pause of 0 ms instead of 250 ms;
  - a superseded answer published as unavailable dependencies;
  - no limit timer.
- **Contexts:**
  - the architect query run without being requested, and the API query likewise;
  - the default architect limits instead of the manager's;
  - an architect supersession ignored;
  - the query not aborted when the request settles;
  - references not retained;
  - their bytes not counted;
  - references retained past the per-context budget;
  - `dependencyDiagram` answering the facts answer.
- **Validation:** duplicate views accepted; an empty list accepted.
- **CLI:**
  - `views: ['api']` sent without `--view`;
  - no capability check;
  - no architect line;
  - `--from` accepted without `api`;
  - a duplicate `--view` accepted.
- **Host:** `materialize-views` not advertised.

"The default architect limits instead of the manager's" first survived, because the test used limits equal to the
defaults. The test now passes other limits, and fails under the mutation.

## Plan 2A materialize handlers

A scratch driver, `.reference-work/plan2a-materialize-driver.ts` (ignored, not committed), ran 57 Plan 2A handlers
with an owned, empty `RAMIFY_ENDPOINT_DIR`: every memory handler of I2A-02 and I2A-06 to I2A-11, and
I2A-12:limit-preservation. 56 pass, including:

- I2A-09's service cases;
- I2A-10's CLI cases: the help's first materialize line is still exactly Plan 2A's, and the compiled process
  materializes through the installed launcher;
- I2A-11's agent workflow cases.

One fails, and it failed before this iteration. I2A-09:compact-wire expects each target's keys to be exactly Plan 2A's
seven. Iteration 5 added `view` to `MaterializedTarget`, as C6 requires, so every target now has eight. The driver
gives the same failure at `a8dc8f4`, and this iteration does not change the case. See [Handoff](#handoff).

## Sample run

The built CLI (`dist/src/ramify`) ran with an owned endpoint directory, `/tmp/rp2b7-ep`, created with mode 0700.
It ran on a copy of `examples/collection-review` at `/tmp/rp2b7-ref`: the tracked and untracked unignored files, with
`node_modules` linked to the worktree's. The daemon was already running from `check:self`, so the first invocation
opens a new context. The times are wall-clock times of the whole CLI process.

```text
$ ramify materialize --view architect
Root: /tmp/rp2b7-ref
Materialized: revision 1; 1 target(s), 123 entries, 85337 bytes written, 0 unchanged
Architect view: .ramify-architect, 15 modules, 123 records, dependencies measured
exit 0; elapsed 5405 ms

$ ramify materialize --view architect
Root: /tmp/rp2b7-ref
Materialized: revision 1; 1 target(s), 123 entries, 0 bytes written, 1 unchanged
Architect view: .ramify-architect, 15 modules, 123 records, dependencies measured
exit 0; elapsed 371 ms

$ ramify materialize
Root: /tmp/rp2b7-ref
Materialized: revision 1; 2 target(s), 12 entries, 3621 bytes written, 0 unchanged
exit 0; elapsed 346 ms

$ ramify materialize --view api --view architect --all
Root: /tmp/rp2b7-ref
Materialized: revision 1; 30 target(s), 674 entries, 120839 bytes written, 3 unchanged
Architect view: .ramify-architect, 15 modules, 123 records, dependencies measured
exit 0; elapsed 600 ms
```

- **Metadata.** `_meta.json` reads `"dependencies":"measured","dependencyScope":"production","testReferences":"measured",`
  `"metrics":"unavailable","cut":9,"detailsUnavailable":2`.
- **Size.** The view has 62 files and 146,777 bytes.
- **No new revision.** Every invocation answered from revision 1: publishing the view started no revision.
- **Unchanged.** The repeats wrote 0 bytes. The three unchanged targets of the last run are the architect view and
  the root module's two API targets.
- **Search.** `rg -n -i 'inspect' .ramify-architect/` returns test records with their `exercises`, such as
  `["collection-review#createTestSystem"]`, and the feature record of the integration tests.

A toolkit copy at `/tmp/rp2b7-tk` gave these figures, from an earlier build of the same runtime sources:

| Invocation | Result | Elapsed |
| --- | --- | ---: |
| `materialize --view architect`, new context | 15 modules, 1,591 records, measured, 809,330 bytes written | 14,059 ms |
| Unchanged repeat | 0 bytes written | 1,025 ms |
| `materialize --view api --view architect --all` | 30 targets, 2,101,499 bytes written, architect unchanged | 2,485 ms |
| `materialize` | 2 targets unchanged, 0 bytes written | 430 ms |

The toolkit view has 62 files and 870,770 bytes. Its `_meta.json` records `cut: 351`, `detailsUnavailable: 1` and
`dynamicTitles: 20`.

## Verification

```sh
npx vitest run subs/cli/src/tests/materialize-command.test.ts                          # 7 passed
npx vitest run subs/daemon/subs/contexts/src/tests/api-view.test.ts subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts   # 26 passed
npx vitest run subs/daemon/src/tests/service.test.ts subs/daemon/src/tests/validation.test.ts subs/daemon/src/tests/codec.test.ts     # 49 passed
npx vitest run subs/daemon/src/tests/session-counters.test.ts src/tests/resident-assembly.test.ts src/tests/resident-cli.test.ts      # 16 passed
npm run type-check                                                                      # clean, all four scopes
npm run build                                                                           # built
npm run check:self   # passed: 15 owners, 413 source files, 15 resources, 6118 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2a.test.ts   # 8 passed
```

Additional focused runs:

```sh
npx vitest run src/tests/dependency-diagram-daemon.test.ts src/tests/dependency-analyzer-process.test.ts   # 5 passed
npx vitest run subs/daemon/subs/contexts/src/tests/ subs/cli/src/tests/ subs/daemon/src/tests/ipc.test.ts \
  subs/daemon/src/tests/architect-view-publisher.test.ts subs/daemon/src/tests/api-view-publisher.test.ts \
  subs/integration-tests/src/explorer-router.test.ts                                     # 22 files, 407 passed
```

- **Ordering.** Type-check and build ran before the tests that use the built analyzer entry and daemon.
- **Endpoints.** `check:self`, the sample runs and the Plan 2A materialize handlers each used an owned
  `RAMIFY_ENDPOINT_DIR` created with mode 0700: `/tmp/rp2b7-ep`, then `/tmp/rp2b7-h` and `/tmp/rp2b7-h2`.
  - Each daemon was stopped with `dist/src/ramify daemon stop`: PIDs 420276, 420677 and, on the committed build,
    438930.
  - After each stop, `daemon status` answered `not running` and the PIDs were gone.
  - The handler and harness runs started no daemon in their directories.
  - Every directory and project copy was removed.
- **Other processes.** A daemon and explorer of the `ramify-plan6d-behavioral-diagram` worktree, and explorers of
  `/ramify`, were running throughout. They were not touched. No process of this worktree remained.
- **Full suite.** The full test suite was not run.

## Deviations

- **Contexts view type.** C7 gives `ApiViewRequest.views` the root's `MaterializeViewId`. The root's source is tagged
  `dispatch` and `daemon/contexts` is untagged, so the import is denied (`required-importer-tag`), and `check:self`
  failed on it. `ApiViewRequest` declares the same union inline instead, and the daemon passes its
  `MaterializeViewId[]` unchanged. Root's `MaterializeViewId` is unchanged. This follows the existing pattern: the
  daemon's `MaterializedViewId` is also a separate union. C7 in `contracts.md` now says so.
- **A separate facts operation.** C7 has the service wait "using the service's own `dependencyDiagram` path". The
  contexts tests fix `ContextManager.dependencyDiagram`'s ready answer to exactly four fields, so the references
  cannot ride on it.
  - `ContextManager.dependencyFacts` is the same path under another name: the same jobs, retained result, order,
    lease and cancellation.
  - `dependencyDiagram` is `dependencyFacts` without the references.
  - `ContextDependencyFactsOutcome` names its answer.
  - C7 in `contracts.md` now names `dependencyFacts`.
- **Retention bound.** Iteration 6 asked for the references to be counted against the retention budgets. They are
  counted. When only they exceed a budget, the diagram is retained without them, so the explorer's answer never
  depends on the references.
- **Named summary.** C7 writes the `architect` summary inline; it is named `MaterializedArchitectSummary`.
- **Help text.** C7's grammar is one line. The help keeps Plan 2A's line, which I2A-10:grammar-default requires
  verbatim, and adds the `--view` form as a second line.
- **Selection without the API view.** C7 says `selection` stays required and is ignored. The CLI sends
  `{ scope: 'all' }` then, and resolves no working-directory path. So `--view architect` works with `--root` from
  any directory.
- **Context-level failures during the wait.** An unknown context, an earlier generation or disposal during the
  dependency wait ends the invocation as `unavailable` with that reason, publishing nothing. They are not among C4's
  dependency reasons. The CLI reopens on the first two as it already does.
- **Cancelled session queries.** Both session queries of a delivery receive an abort signal, and settling the request
  aborts them. The API view's query was not cancelled before. Its published bytes are unchanged.
- **BD19's token.** `dependency-diagram.test.ts` made an "earlier generation" by replacing the token's last hex digit
  with `0`. When the generation already ended in `0`, the token was current, the request started a job the test
  never settled, and the test timed out. That happened in 1 of 15 runs at `a8dc8f4`, and 1 of 10 with this
  iteration's changes. The digit is now always different, and 12 further runs passed.
- **BD24.** Iteration 6 kept BD24's exact `retainedBytes` equality, which counted the diagram alone. The references
  are now retained too, and their size is not in the public answer, so BD24 bounds them instead (see
  [Outside the owners](#outside-the-owners)).
- **Documentation.** The results of iterations 3–5 give documentation to "iteration 7". Those were the earlier
  numbers; iteration 8 owns documentation now, and this iteration changed none.

## Limitations

- **Wait pace.** While the analyzer answers `inputs-changed`, each ask starts a new analyzer job. The asks are 250 ms
  apart plus each job's run time, until the context publishes the newer revision (`superseded`) or the limit.
- **Lock hold.** The publication lock of a root is held through the dependency wait, up to 125 s. A second
  materialize of that root waits; checks do not.
- **Counters.** A `--view architect` invocation that does not find retained facts starts an analyzer job. The job
  increments the daemon's `dependencyDiagrams` and, when ready, `behaviorRuns`. The synchronized request also
  performs the required sweep that any synchronized request with no expectations performs, as Plan 2A's
  materialize does.
- **Compact-wire case.** I2A-09:compact-wire fails since iteration 5, as described above.

## Handoff

- **Iteration 8** receives:
  - **Command.** A working `ramify materialize --view architect` in the built CLI. Without `--view`, the request and
    output are Plan 2A's.
  - **Wire types changed by this iteration:**
    - `ServiceCapability` gains `materialize-views`: the host advertises it, the codec accepts it, and the quick
      environment lists it.
    - `MaterializeParams` gains `views?: readonly MaterializeViewId[]`, with `MaterializeViewId = 'api' | 'architect'`.
    - `MaterializeOutcome`'s `materialized` variant gains `architect?: MaterializedArchitectSummary`, which is
      `{ modules, records, dependencies: 'measured' | { unavailable: ArchitectDependencyReason } }`.
    - Iteration 5's `MaterializedTarget.view` is unchanged. A `materialize` result now includes the architect target
      when it was requested.
  - **Unchanged on the wire:** `dependencyDiagram` and every other operation. The contexts vocabulary changed
    (`ApiViewRequest.views`, the nullable `projection` with `architect`, `ApiViewQueryLimits.architect`,
    `ContextDependencyFactsOutcome` and `ContextManager.dependencyFacts`), but it is in-process only.
  - **Plan 2A harness (AV34).** `plan2a.test.ts` passes. The whole Plan 2A verification would fail
    I2A-09:compact-wire, because iteration 5 added `view` to every `MaterializedTarget` (C6). It fails at `a8dc8f4`
    too. AV34 needs a decision: extend that case's expected keys with `view`, or record the change as intended.
  - **Invariance (AV30).** A `--view architect` invocation without retained facts starts one analyzer job. The job
    increments `dependencyDiagrams` and, when ready, `behaviorRuns`. Any synchronized materialize also performs a
    required sweep (`sweeps`, `analyses`), as Plan 2A's does. The session's `shapeRuns()` and `testTitleRuns()` count
    in the worker and are not in daemon status. Publishing the view started no revision in any run above.
  - **Timings.** On a warm daemon, toolkit: 14.1 s for a new context and 1.0 s for an unchanged repeat. Reference:
    5.4 s and 0.4 s. Budget: 90 s.
  - **Measurement hooks.** `dependencyWait` in `subs/daemon/src/service.ts` holds the 250 ms and 125 s values. Service
    tests find the pauses with a spy on the quick environment's clock.
  - **Documentation.** The architecture documents, owner READMEs and `AGENTS.md` do not describe `--view`,
    `dependencyFacts` or the dependency wait yet.
