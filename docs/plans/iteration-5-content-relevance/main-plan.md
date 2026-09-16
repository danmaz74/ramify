# Plan 5 content relevance

**Date:** 2026-09-15. **Status:** draft, high level. Iteration files follow once
the [review decisions](#decisions-for-review) are taken. This plan adds no
capability, owner or package entry.
[Plan 5](../iteration-5-fast-incremental-checks/main-plan.md) contracts, the
[contract remediation](../iteration-5-contract-remediation/main-plan.md), the
[hook optimization](../iteration-5-hook-optimization/main-plan.md) and the
[structural edits](../iteration-5-structural-edits/main-plan.md) remain
authoritative except where a decision below changes them.

## Workflow and completion boundary

An agent writes a file and its post-write hook runs
`ramify check --changed <path>` against a warm resident context. Many writes
touch files whose bytes cannot change the result: documentation, images and
styles, and owned resources whose exports come from declarations elsewhere.
Today each such write costs daemon work, and a hook naming one is answered as
not checked.

After this plan:

- the capture distinguishes **content observations**, whose bytes a consumer
  reads, from **presence observations**, which matter only by existing at an
  exact path; a presence observation is never read, hashed or retained;
- one relevance rule, shared by the observer and the context manager, decides
  from the published revision whether a path can affect the result;
- a watcher event that cannot affect the result changes no context state;
- a hook naming only such paths is answered at once, with no update;
- a sweep observes presence paths by existence and kind only;
- an update whose paths are all ignored is identical at any compiler level.

Every published result still equals a batch run over the same inputs. The plan
is complete when every matrix row passes under owner tests, type-check and the
commit audit. Real-process measurement follows the plan, see
[Deferrals](#deferrals).

## Evidence

Read from source at `71643d5`. Rows marked *probe* are inferred from reading
and not yet shown by a test; iteration 1 confirms or refutes each before a later
iteration depends on it.

| ID | Cost or behavior | Location |
| --- | --- | --- |
| E1 | The watcher excludes only `node_modules`, `.git`, `dist` and `.reference-work`; every other path reaches the context. | `daemon/src/filesystem-watcher.ts:6` |
| E2 | Any watcher batch cancels running background work (periodic sweep, audit, watch update), marks the context reconciling and restarts the debounce, even when every path is later ignored. | `daemon/subs/contexts/src/context-manager.ts:212-235` |
| E3 | Inventory reads and hashes every file under a module's `src/`, whatever its extension, and keeps its bytes against `maxApplicationBytes`. | `analysis/subs/project/src/inventory.ts:154`, `capture.ts:292` |
| E4 | Files outside modules that the compiler selects are read in full only to produce warnings. | `inventory.ts:167` |
| E5 | Every sweep re-reads and re-hashes each retained file whose stat signature is unchanged. | `capture.ts:417` |
| E6 | A resource's exports come from compiler declarations, never from its bytes. JSON under `resolveJsonModule` is the exception, and the compiler host reads and records it itself. | `typescript/src/catalog.ts:471`, `retained-source-analysis.ts:479`, [resource bindings](../../model/typescript-source-interpretation.principles.md#resource-bindings-belong-to-the-resolved-resource) |
| E7 | An edit to an owned resource takes the source-edit path (compiler update, catalog, interpretation, relink) and publishes a new revision even when the surface is unchanged. | `analysis/src/session-revision.ts:693-740` |
| E8 | A path beneath a module's `subs/` that is neither in a `src/`, a `module.ramify` nor a module `README.md` rebuilds the inventory. | `observer.ts:224` |
| E9 | A hook naming an ignored path runs an update and replies `unobserved-input`, exit 2; the example hook writes a notice into the agent's context for each such write. | `context-manager.ts:346`, `examples/hooks/claude-code-post-write.mjs:8` |
| E10 *probe* | With the compiler released, an all-ignored update fails the identical test and takes the broad path. | `session-revision.ts:548`, `:572` |
| E11 *probe* | A file created outside every module in a directory the compiler enumerated is classified ignored; its warning waits for the next sweep. | `observer.ts:212-232` |
| E12 *probe* | `apply` discards the changes its promotion finds and can then return `unchanged`. | `observer.ts:106` |
| E13 *probe* | Editors that save atomically produce rename events for regular files, so an event's kind does not show whether content or membership changed. | `filesystem-watcher.ts` |
| E14 *probe* | The compiler never reads a non-JSON resource named by the resource witness. | `typescript/src/synthetic.ts:49` |

## Targets

| Target | Change | Removes |
| --- | --- | --- |
| A. Presence observations | The capture records owned resources and outside-module files as presence. A read by any consumer turns the observation into content during that computation's promotion. | E3, E4, and E5 for presence files |
| B. Presence identity | `CapturedInput`, `inputId`, fingerprints and the report's inputs describe a presence observation without a hash or size. | Hashing for identity only |
| C. Shared relevance rule | A pure rule in `analysis/project` that the observer's classification and the context manager both use. | E8, E11; drift between the two |
| D. Watcher gate | Events the rule finds irrelevant are dropped before they touch context state. | E1, E2 |
| E. Immediate hook answer | A hook naming only irrelevant paths, or presence paths whose presence is unchanged, is answered from the published revision. | E9 |
| F. Identical at any level | An all-ignored update on a session that is not stale is identical whether the compiler is hot or released. | E10 |

## Proposed contracts

### Observation kinds

- **Content.** Bytes some consumer reads: a module description, a module
  `README.md`, configuration and manifests, and every compiler host read,
  including source, declaration shims and JSON. Identity is the SHA-256 of the
  bytes, as today.
- **Presence.** A regular file at an exact path whose bytes no consumer reads:
  owned resources and outside-module files the compiler selects. Identity is
  presence and file kind. Missing-file probes and directory listings keep
  their existing identities.
- **Classification follows reads.** No extension list decides the kind. A
  presence observation that a consumer reads becomes content in the same
  computation's promotion. What makes the compiler read a resource is
  configuration, which already acquires the project again, or a source edit,
  whose own update records the read.
- **Limits.** `maxApplicationFiles` counts both kinds; `maxApplicationBytes`
  and `maxInputBytes` count content bytes only.

### Relevance rule

Evaluated against the published revision's inputs and the module directories
their `description` inputs name. A path is relevant when any of these holds:

1. its name is `module.ramify`;
2. the revision recorded it as a content observation;
3. the revision recorded it as a presence observation, a missing-file probe or
   a listed directory, and its presence, kind or membership differs from the
   recorded one (an `lstat`, and a directory read for a listed directory);
4. it matches the configuration path pattern;
5. it is beneath a module's `src/` and is not recorded;
6. it is a `README.md` directly in a module directory;
7. it is beneath a module's `subs/`, not recorded, and `lstat` does not show a
   regular file;
8. it is not recorded, and its parent is a directory the revision listed.

Rule 8 is broader than today's classification and depends on probe E11; see
decision 2. Rule 7 is narrower than today's (E8).

**Gate.** The rule applies only while the context has a published revision and
is not opening, conservative or waiting for a required sweep, and no queued or
running change can alter the module set (rules 1, 4 or 7). Otherwise every path
goes through the observer exactly as today.

### Watcher and hook

- **Watcher.** Under the gate, an irrelevant event is dropped: no queued path,
  no cancelled background work, no status change and no debounce. Overflow and
  error signals are unchanged.
- **Hook.** After the covering test, a request whose named paths are all
  irrelevant under the gate is answered at once with outcome `irrelevant` and
  the published revision. Before answering, the context checks each ancestor
  beneath a `subs/` for a `module.ramify` the revision does not record, which
  closes the race with a watcher that has not yet delivered one. When the gate
  is closed, the request queues as today, and a path the new revision finds
  irrelevant is reported as `irrelevant`, not `unobserved-input`.
- **Presence paths in a hook.** A named presence path is covered when its
  presence equals the published observation; the client's hash is not compared.
  The request format, including the `expectedContent` shape
  [Plan 7](../iteration-7-affected-modules/contracts.md) reuses, is unchanged.

## Decisions for review

1. **Hook outcome.** Proposed: CLI outcome `irrelevant`, exit 0, and the
   example hook exits 0 silently. Alternative: a distinct exit code. Exit 0 is
   accurate, since nothing such a file can hold can break a rule.
2. **Rule 8.** Proposed: adopt it if probe E11 confirms the gap, so creations in
   compiler-listed directories update warnings at once rather than at the next
   sweep. It makes some creations relevant that are ignored today.
3. **Client hashing.** Proposed: keep the client hashing every named path in
   this plan. An existence-first request that asks for hashes only for content
   paths costs a round trip, and is deferred until measurement shows hashing
   large binaries matters.
4. **Identity change.** Presence changes `inputId` once for an unchanged
   project. Batch and daemon share the capture, so session-equals-batch still
   holds. Proposed: a stated exception to the hook optimization's byte-identical
   decision 2, which compares against the previous build.
5. **Input schema.** Proposed: `CapturedInput` gains
   `observation: 'content' | 'presence'`, and `sha256` and `bytes` are `null`
   for presence. The JSON report's `inputs` changes with it. Review whether that
   requires a report schema version.

## Owners

No owner, exposure line or package entry is added, apart from the exposure
`daemon/contexts` needs to import the relevance rule from `analysis/project`.
Iteration 4 confirms that access under the module descriptions.

| Iteration | Owners | Main source |
| --- | --- | --- |
| 1 | `analysis/project`, `analysis`, `typescript`, `daemon` | tests only |
| 2 | `analysis/project` | `capture.ts`, `inventory.ts`, `observer.ts`, `interfaces/project.ts` |
| 3 | `analysis`, `daemon/contexts` | `session-revision.ts`, `session-engine.ts`, `report.ts`, `tokens.ts` |
| 4 | `analysis/project` | `observer.ts`, new relevance source, module description |
| 5 | `daemon/contexts` | `context-manager.ts` |
| 6 | `cli`, examples, architecture documents | `changed-command.ts`, `format.ts`, `claude-code-post-write.mjs`, `daemon.md`, `cli-invocation.spec.md`, `processes-and-clients.md`, `memory-lifecycle.md` |
| 7 | `analysis`, `daemon/contexts` | differential tests, closure |

## Acceptance matrix

| ID | Case | Evidence | Iteration |
| --- | --- | --- | --- |
| CR-1 | `probes-recorded`: E10 to E14 each confirmed or refuted by a test, and later rows amended to match | unit | 1 |
| CR-2 | `resource-not-read`: acquiring a project with owned `.md`, `.svg` and `.png` resources performs no read of them and retains no bytes | unit | 2 |
| CR-3 | `outside-not-read`: outside-module selected files yield the same warnings without an inventory read | unit | 2 |
| CR-4 | `read-upgrades`: a JSON resource the compiler reads becomes a content observation in that computation's promotion | unit | 2 |
| CR-5 | `presence-sweep`: a sweep stats presence paths and reads none; content paths keep today's behavior | unit | 2 |
| CR-6 | `presence-limits`: presence files count toward `maxApplicationFiles` and not toward byte limits | unit | 2 |
| CR-7 | `presence-identity`: `inputId` and fingerprints are unchanged by a content edit to a presence file and changed by its creation or deletion | unit | 3 |
| CR-8 | `session-equals-batch`: the existing equality tests pass with presence identities | unit | 3 |
| CR-9 | `presence-edit-no-revision`: a content edit to a presence file publishes nothing and runs no compiler update | unit | 3 |
| CR-10 | `identical-released`: an all-ignored update with the compiler released is identical and loads no compiler | unit | 3 |
| CR-11 | `rule-shared`: observer classification and the relevance rule agree on every fixture path class | unit | 4 |
| CR-12 | `subs-document`: an edit to `subs/<module>/NOTES.md` rebuilds nothing | unit | 4 |
| CR-13 | `subs-directory`: creating, renaming or deleting a directory beneath `subs/` stays structural | unit | 4 |
| CR-14 | `watcher-drops`: an irrelevant event queues nothing, cancels no background work and leaves the context synchronized | unit | 5 |
| CR-15 | `gate-closed`: with a queued `module.ramify` or configuration change, or a required sweep, every path goes through the observer | unit | 5 |
| CR-16 | `hook-irrelevant`: a hook naming only irrelevant paths is answered with no update call | unit | 5 |
| CR-17 | `hook-race-module`: a hook naming `subs/x/src/a.ts` just after `subs/x/module.ramify` is created, before its watcher event, is not answered irrelevant | unit | 5 |
| CR-18 | `hook-presence`: a hook naming an unchanged presence path is covered without a hash comparison; a deleted one is not | unit | 5 |
| CR-19 | `cli-outcome`: `--changed` on an irrelevant path prints outcome `irrelevant` and exits 0 in both formats | unit | 6 |
| CR-20 | `hook-silent`: the example hook exits 0 with no output for an irrelevant path | process | 6 |
| CR-21 | `differential`: random sequences of content edits, presence edits, creations, deletions and document edits publish the same results with and without the gate, and each equals batch | unit | 7 |
| CR-22 | `docs-updated`: the architecture documents state the observation kinds, the rule, the gate and the outcome | review | 6, 7 |

## Iterations

Iterations run in sequence in one worktree; each is one subagent.

| Iteration | Title | Prerequisites |
| --- | --- | --- |
| 1 | Probes: released compiler, listed-directory creations, promotion changes, atomic saves, witness reads | none |
| 2 | Presence observations in the capture and inventory | 1 |
| 3 | Presence identity, publication and the identical shortcut | 2 |
| 4 | Shared relevance rule in the observer | 1, 2 |
| 5 | Watcher gate and immediate hook answer | 3, 4 |
| 6 | CLI outcome, example hook and architecture documents | 5 |
| 7 | Differential test and closure | 1 to 6 |

## Verification policy

Each iteration runs its owners' test directories with `npx vitest run <dir>`,
`npm run type-check` and `git diff --check`, never `npm test` or the full suite
by hand, and never a command that stops every Node process. Full verification
is the cucumber-viz commit audit on the worktree after each iteration's commit;
failures are fixed before the next iteration starts.

## Deferrals

| Deferred | Reason |
| --- | --- |
| Existence-first hook request | Decision 3; after measurement shows client hashing of large files matters. |
| Content-file sweep re-hashing | The hook optimization's deferred "sweep re-hashing only moved files" still applies to content observations. |
| Real-process measurement | S100 hook rows for a document edit, a resource edit and an irrelevant-path hook follow this plan. Proposed budget for review: an irrelevant-path hook median under 50 ms end to end on S100. |
| Extension-based client filtering | Rejected: owned resources, module descriptions, module READMEs and compiler reads can have any location or extension. |

## Handoff

Iteration 7 writes `iterations/closure.md`: the probe outcomes, delivered
targets, contract changes, evidence per matrix row, audit results and remaining
gaps. Plans 3 and 7 consume `inputId`, and Plan 7 reuses the hook's
`expectedContent`. The closure states the presence identity they now observe.
