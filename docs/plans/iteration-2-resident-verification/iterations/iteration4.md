# Iteration 4: Contexts owner

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 3 (`increment`; the `IncrementRun`,
`InputChange`, `RetainedAnalysis`, `RetainedStageId` and `ProjectResolution`
types the contexts interface names) and, through it,
iteration 2 (the header-only contexts owner). Contexts imports no analysis
value. **Owners:** `subs/daemon/subs/contexts/` (X1 to X3); the N5 relay
line in `subs/daemon/module.ramify`, declaration only.

## Goal

Implement the context manager: one isolated context per canonical root,
request scope and configuration and setup, generations and monotonic
revisions, six fingerprint classes, one ordered queue per context with
acknowledgment-ordered synchronized requests, published reads addressable by
revision id, debounced and coalesced background reconciliation, periodic
`verify` reconciliation, atomic publication of sealed results and unpublished
delivery of every other engine result, bounded history, leases, warm and cold
idle stages, re-warming and eviction. Everything is driven through the
neutral `AnalysisDriver`, `WatcherPort` and `ClockPort` ports, so every rule
is verified with a scripted driver and controlled ports and no filesystem,
engine or socket.

## Read first

- [contracts.md](../contracts.md): Contexts: isolation, ordering, publication
  and the analysis port, including the `Unavailable` reason table and the
  token, ordering, watcher and retention rules beneath the declarations.
- [scope.md](../scope.md): Freshness and supersession guarantees; Context and
  daemon budgets; Idle exit, crash and explicit stop (the lease paragraph).
- [owners.md](../owners.md): Contexts, Daemon (N5), Foreign signature types,
  the iteration 4 row of the Activation manifest.
- Main plan: Resolved decisions 2, 3, 4, 6 and 7; Engine results and their
  delivery; matrix rows I2-05 to I2-08 and I2-12.
- [Daemon and analysis](../../../architecture/daemon.md): Context identity and
  retained state; Revisions and atomic publication; Freshness, saves and
  overlays. [Memory lifecycle](../../../architecture/memory-lifecycle.md):
  State ownership and bounds; Pressure, eviction and recovery.
- Plan 1 [contracts](../../done/iteration-1-project-verifier/contracts.md#future-contexts-boundary-type-review-only):
  the type-only `AnalysisDriver` review this iteration extends.

## Deliverables

1. `src/interfaces/contexts.ts` exactly as contracts.md declares it, with the
   named analysis and project types imported as types through root's relays
   and no root or daemon import; `ContextSetup` carries only `registry` and
   `capabilities`; `ContextSelection` records the request's `scope` and
   `configuration` literals (`ProjectRequest['scope']`,
   `ProjectRequest['configuration']`) beside the root and setup; and
   `AnalysisDriver.check` takes the contexts-shaped `{ project, setup,
   previous, changes }` object, never an `IncrementInputs`.
2. `src/context-manager.ts` exporting `createContextManager`, with private
   `context.ts` (one context's state machine), `queue.ts` (acknowledgment
   order, coalescing, supersession, cancellation), `tokens.ts` (`ctx/1:`
   SHA-256 over the canonical JSON selection, `gen/1:` UUID per open,
   `rev/1:<generation>:<sequence>`, the six fingerprints) and `history.ts`
   (retention accounting in `RetainedAnalysis.bytes` and report bytes;
   lookup by revision id).
3. The ordering rules enforced: synchronized requests answered only from a
   capture started at or after acknowledgment, shared captures, published
   revision reuse with `reusedRevision: true`, `superseded` on `expect`
   mismatch, cancelled background work publishing nothing, no publication
   from a stale generation, `wait: true` resolving on the first publication;
   a `published` read naming a `revision` answered by exactly that retained
   revision or by `evicted-revision` and never by the current one; a driver
   result with `retained: null` delivered as `reported` with
   `published: false` and `revision: null`, publishing nothing and marking the
   context `reconciling`; `open` on an unresolvable request returning
   `unresolved` with the driver's report and no context; `Unavailable` only
   for the reasons contracts.md tables.
4. The watcher and retention rules enforced: `debounceMs` batching and
   distinct-path coalescing with cause `watch`; `conservative` with
   `changes: null` on `overflow`, `error`, a lost watcher or more than
   `maxQueuedPaths`; the periodic `verify` reconciliation with `changes: []`
   every `verificationIntervalMs` while warm; `ContextRevision.changed` taken
   from the driver's `changed`; history bounded by count and bytes while
   keeping `published` and `lastValid`; warm, cold and evicted stages; a
   request re-warming a cold context with a reattached watcher and a
   conservative next run; least-recently-active unleased eviction;
   global-bytes eviction oldest-first, then cold contexts, then
   `resource-unavailable`.
5. `src/tests/controlled-ports.ts` exposing `createControlledWatcher`,
   `createControlledClock`, `ControlledWatcher` and `ControlledClock`;
   private `src/tests/scripted-driver.ts` returning scripted reports,
   `retained` (null for incomplete reports) and `changed` lists; owner tests
   `tokens`, `queue`, `publication`, `watcher-events`, `history` and
   `eviction`, each asserting that nothing survives `dispose()` and each
   ordering, watcher and retention rule named by at least one test, including
   cold re-warming.
6. Declarations: contexts X1 to X3 activated; daemon's N5 relay line added to
   its header so root may later name the vocabulary. Harness: capability
   `contexts`; unit handlers over fixture `M` for the 27 instances.

## Matrix rows executed here

- I2-05: `context-id-derivation` (two roots, two ids; equal selections
  collide deterministically); `branch-irrelevant` (different `cwd`, same
  resolution, one context); `generation-on-reopen` (new `GenerationId`; old
  token `expired-generation`); `revision-monotonic` (sequences 1 to 5 embed
  the generation UUID); `fingerprint-classes` (only the matching class
  changes; `registry` and `engine` constant).
- I2-06: `queue-order` (three acknowledged requests share or follow the next
  capture; outcomes in acknowledgment order); `coalesce-background` (fifty
  batches, one `watch` analysis, the driver receives every distinct path
  once); `cancel-request` (`cancelled` under its id; driver signal aborted;
  nothing published); `cancel-background` (running analysis aborted; next
  publication is the union); `wait-first-publication` (`wait: true` resolves
  with revision 1; `wait: false` returns `pending`).
- I2-07: `invalid-current` (`outcome.execution: 'invalid'`; `lastValid`
  unchanged); `historical-last-valid` (the invalid report is returned;
  `lastValid` only in status); `recovery-publishes` (`lastValid` equals
  `published`); `pending-before-publication` (`opening`, `published: null`,
  `initializing`).
- I2-08: `lost-events` (`cause: 'request'`; status returns to
  `synchronized`); `overflow` (10,001 paths give `changes: null` and
  `conservative`); `watcher-error` (`watcher-unavailable`; synchronized
  request succeeds; watcher reattached after the next publication);
  `unwatched-dependency` (at `verificationIntervalMs` the driver receives
  `changes: []`; the revision has cause `verify` and `changed` naming the
  dependency; `reconciling` during the run, `synchronized` after; an
  unchanged capture publishes nothing); `debounce` (events at 0, 50 and
  90 ms; one analysis at 190 ms).
- I2-12: `history-count` (eight of twelve retained, oldest dropped);
  `history-bytes` (at most three 10 MiB reports under 32 MiB); `global-bytes`
  (oldest-first across contexts before `resource-unavailable`);
  `context-lru-eviction` (ninth open evicts with `pressure`; reopen gets a new
  generation); `leased-not-evicted` (`resource-unavailable`, no eviction);
  `resource-unavailable` (the check is `unavailable`; no substitute inputs);
  `evicted-revision` (a read naming a dropped revision is `evicted-revision`;
  the current revision is not substituted); `retained-revision-exact` (a read
  naming a retained older revision returns exactly it with `published: true`,
  `verified: false` and `captureStarted: null`; `wait` ignored).

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 2 --iteration 4   # requires 2, 3 and 4
npm run check:self                                   # daemon header plus N5 links to real contexts exports
git diff --check
```

Evidence kind: `unit` over `M` only; the controlled clock makes every timing
assertion deterministic. Quick evidence with the real engine starts in
iteration 5.

## Exit criteria

- `createContextManager` exists with the reviewed interface; every listed
  instance ran and asserted its own expectation.
- Every ordering, watcher and retention rule in contracts.md has at least one
  owner test naming it, including revision-addressed reads, unpublished
  delivery, `verify` reconciliation and cold re-warming.
- The contexts declaration is complete and daemon's N5 relay links.

## Handoff

Iteration 5 wraps this manager in the validated daemon service and implements
`AnalysisDriver` from iteration 3's operations; the controlled ports become
the quick environment's ports; `ContextRevision`, `ContextStatus`,
`CheckOutcome`, `OpenOutcome` and `ContextEvent` cross the wire unchanged in
iterations 7 to 9.
