# Iteration 1 results: contracts moved to the harness

**Date:** 2026-09-20. **Status:** complete. Branch `refactor/contract-authority`.

The map and HTTP contracts now belong to the module that implements the
behavior they govern. The harness owns them in its `src/interfaces/`, exposes
them to the root with the `browser` tag, and the root re-exposes exactly that
named surface to its descendants. `subs/contracts/` is gone. No public name,
shape, signature or tag changed.

## Evidence identity

| View | Revision | Input identity |
| --- | --- | --- |
| Baseline architect | `rev/1:625c81ff-0ac6-4415-adb5-d9f72166475b:1` | `input/1:0093edd543f04e74385b5322b56fd65804a04d2406b6a9230d9f5ded9702376d` |
| Final architect | `rev/1:625c81ff-0ac6-4415-adb5-d9f72166475b:9` | `input/1:969e69fbe75e4dc91bee6ea55e9581e9e5b033c60d925427c1a547b148486177` |

Both were produced by `ramify materialize --view architect --view api --from
subs/web/src`. The final views were materialized after every source and
document change of this iteration and before this note was written, so writing
this note advances the input identity again.

Baseline copies of `.ramify-architect/`, of `subs/web/src/.ramify/` and of the
exposed-name inventory were kept outside the working tree for the comparison
below.

## Public-surface comparison

The web requester API view names the same seven contract files, with the same
110 names, before and after.

| File in the requester view | Names |
| --- | ---: |
| `subs/harness/src/interfaces/map.ts` | 32 |
| `subs/harness/src/interfaces/protocol/errors.ts` | 5 |
| `subs/harness/src/interfaces/protocol/ids.ts` | 4 |
| `subs/harness/src/interfaces/protocol/jobs.ts` | 37 |
| `subs/harness/src/interfaces/protocol/maps.ts` | 15 |
| `subs/harness/src/interfaces/protocol/paths.ts` | 2 |
| `subs/harness/src/interfaces/protocol/queries.ts` | 15 |

Each post-move file's markdown is byte-identical to the baseline file it
replaces once the source path is normalized. Every declaration block, every
type-only marker and every prose description is unchanged, so names, runtime
shapes and TypeScript signatures are preserved. The view's `coverage` and
`truncated` counts are also unchanged (`coverage: 2`, `truncated: 1`);
`errorCodeSchema` is still rendered as truncated, which is a rendering detail
of the view rather than a difference in the symbol.

Differences, all intended:

- Owner: the names belonged to `ramify-agent/contracts/map` and
  `ramify-agent/contracts/protocol`; they belong to `ramify-agent/harness`.
- Source path: `subs/contracts/subs/map/src/interfaces/map.ts` became
  `subs/harness/src/interfaces/map.ts`, and each
  `subs/contracts/subs/protocol/src/interfaces/<file>.ts` became
  `subs/harness/src/interfaces/protocol/<file>.ts`.
- Owner count: the architect view listed eight owners and now lists five. The
  three `contracts` owners are absent from `.ramify-architect/`, and no record
  there names `ramify-agent/contracts`.

Nothing else changed:

- The `browser` tag still reaches every one of the 110 names. The harness
  declares it on each `expose-src`, and the architect view records it on the
  exposed behavioral symbols `isWithin`, `validateMapSubmission` and
  `protocolPaths`.
- Every symbol the web imports is available to it: the requester view lists
  all seven files, `npm run check:self` reports 0 denied accesses, and the web
  type check passes.
- `startServer`, `ProjectRootError` and `ProjectLockError` were not newly
  exposed. They stay on `expose-src ... to parent` in the harness and appear in
  no `expose-sub` of the root. Searching the web requester API view for the
  three names finds nothing.
- The web imports no harness implementation path. Its only harness imports are
  the seven `src/interfaces/` files.

## Final module tree

```text
ramify-agent
├── harness
│   ├── src/interfaces/map.ts
│   ├── src/interfaces/protocol/{errors,ids,jobs,maps,paths,queries}.ts
│   └── agent
│       └── pi
└── web
```

### Root `module.ramify`

```ramify
ramify 1
module "ramify-agent"

// The harness owns the formats it implements and exposes them here. This
// module re-exposes exactly that public contract surface to every descendant,
// so the web client validates what crosses the wire with the same schemas.
// Starting a server and its lock failures stay with the root.

// map.ts
expose-sub Availability, Citation, ImplementationMap from harness to descendants
expose-sub InputManifest, MapApproval, MapSubmission, ModulePath from harness to descendants
expose-sub NewCapability, Reuse, Seam, ShapeValidation from harness to descendants
expose-sub TouchedModule, ViewIdentity, Weight, WorkItem from harness to descendants
expose-sub availabilitySchema, citationSchema from harness to descendants
expose-sub implementationMapSchema, inputManifestSchema from harness to descendants
expose-sub isWithin, mapApprovalSchema, mapSubmissionSchema from harness to descendants
expose-sub modulePathSchema, newCapabilitySchema, reuseSchema from harness to descendants
expose-sub seamSchema, sha256Schema, touchedModuleSchema from harness to descendants
expose-sub validateMapSubmission, viewIdentitySchema from harness to descendants
expose-sub weightSchema, workItemSchema from harness to descendants

// protocol/ids.ts
expose-sub JobId, PlanId, jobIdSchema, planIdSchema from harness to descendants

// protocol/queries.ts
expose-sub MappingState, PlanDocument, PlanEntry from harness to descendants
expose-sub PlanListResponse, PlanResponse, ProjectResponse from harness to descendants
expose-sub ReadablePlanEntry, UnreadablePlanEntry from harness to descendants
expose-sub mappingStateSchema, planEntrySchema from harness to descendants
expose-sub planListResponseSchema, planResponseSchema from harness to descendants
expose-sub projectResponseSchema, readablePlanEntrySchema from harness to descendants
expose-sub unreadablePlanEntrySchema from harness to descendants

// protocol/errors.ts
expose-sub ErrorCode, ErrorResponse, errorCodeSchema from harness to descendants
expose-sub errorHttpStatus, errorResponseSchema from harness to descendants

// protocol/jobs.ts
expose-sub AcceptedCommand, Activity, ApiViewEvidence, Command from harness to descendants
expose-sub CommandResponse, CommandType, EventPage from harness to descendants
expose-sub FailureReason, JobEvent, JobEventOf, JobEventType from harness to descendants
expose-sub JobListResponse, JobResponse, JobSnapshot, JobState from harness to descendants
expose-sub Receipt, Usage, acceptedCommandSchema, activitySchema from harness to descendants
expose-sub apiViewEvidenceSchema, approveMapCommandSchema from harness to descendants
expose-sub commandIdSchema, commandResponseSchema, commandSchema from harness to descendants
expose-sub eventPageSchema, failureReasonSchema, jobEventSchema from harness to descendants
expose-sub jobListResponseSchema, jobResponseSchema from harness to descendants
expose-sub jobSnapshotSchema, jobStateSchema, jobVersionSchema from harness to descendants
expose-sub receiptSchema, startMappingCommandSchema from harness to descendants
expose-sub stopJobCommandSchema, terminalEventTypes, usageSchema from harness to descendants

// protocol/maps.ts
expose-sub MapRevision, ModuleTree, ModuleTreeResponse from harness to descendants
expose-sub ReadableRevision, RevisionEntry, RevisionListResponse from harness to descendants
expose-sub RevisionResponse, TreeModule from harness to descendants
expose-sub moduleTreeResponseSchema, readableRevisionSchema from harness to descendants
expose-sub revisionEntrySchema, revisionListResponseSchema from harness to descendants
expose-sub revisionResponseSchema, treeModuleSchema from harness to descendants
expose-sub unreadableRevisionSchema from harness to descendants

// protocol/paths.ts
expose-sub apiPrefix, protocolPaths from harness to descendants
```

The selections are split across several statements per file only for line
length; a statement's selection list cannot span lines. `expose-sub` accepts no
tag clause, so the `browser` tag is declared once, where the symbols originate.

### `subs/harness/module.ramify`

```ramify
ramify 1
module harness

// The server for one project, which the root starts with the web client's
// build output and its choice of agent. Jobs, the run store, plan discovery,
// the mapping procedure and the HTTP adapter stay internal.
expose-src startServer, ProjectRootError from "http/server.ts" to parent
expose-src ProjectLockError from "store/lock.ts" to parent

// The public contracts of the behavior this module implements: the
// implementation map it validates and persists, and the HTTP protocol it
// serves. Each file imports nothing but `zod` and its sibling schemas, so
// every export promises browser safety and the root re-exposes it to the
// web client.
expose-src * from "interfaces/map.ts" tagged [browser] to parent
expose-src * from "interfaces/protocol/ids.ts" tagged [browser] to parent
expose-src * from "interfaces/protocol/queries.ts" tagged [browser] to parent
expose-src * from "interfaces/protocol/errors.ts" tagged [browser] to parent
expose-src * from "interfaces/protocol/jobs.ts" tagged [browser] to parent
expose-src * from "interfaces/protocol/maps.ts" tagged [browser] to parent
expose-src * from "interfaces/protocol/paths.ts" tagged [browser] to parent
```

`subs/web/module.ramify` is unchanged: it still exposes nothing, stays tagged
`[ui, browser]`, and its comment already said that it imports only the
browser-safe contracts it receives from the root.
`subs/contracts/module.ramify`, `subs/contracts/subs/map/module.ramify` and
`subs/contracts/subs/protocol/module.ramify` were removed with their READMEs.

## Files moved

Every move went to the destination the main plan specified; there was no
deviation.

| From | To |
| --- | --- |
| `subs/contracts/subs/map/src/interfaces/map.ts` | `subs/harness/src/interfaces/map.ts` |
| `subs/contracts/subs/protocol/src/interfaces/errors.ts` | `subs/harness/src/interfaces/protocol/errors.ts` |
| `subs/contracts/subs/protocol/src/interfaces/ids.ts` | `subs/harness/src/interfaces/protocol/ids.ts` |
| `subs/contracts/subs/protocol/src/interfaces/jobs.ts` | `subs/harness/src/interfaces/protocol/jobs.ts` |
| `subs/contracts/subs/protocol/src/interfaces/maps.ts` | `subs/harness/src/interfaces/protocol/maps.ts` |
| `subs/contracts/subs/protocol/src/interfaces/paths.ts` | `subs/harness/src/interfaces/protocol/paths.ts` |
| `subs/contracts/subs/protocol/src/interfaces/queries.ts` | `subs/harness/src/interfaces/protocol/queries.ts` |
| `subs/contracts/subs/map/src/tests/map.test.ts` | `subs/harness/src/tests/map-contract.test.ts` |
| `subs/contracts/subs/protocol/src/tests/protocol.test.ts` | `subs/harness/src/tests/protocol-contract.test.ts` |

41 TypeScript files changed, with 75 changed lines. Every one is an import
specifier except a single comment in `subs/harness/src/http/app.ts`, which
named the protocol's former module. The out-of-tree spike tool
`spikes/briefs/tools/brief.ts` follows the map to its new path.

Documents updated where they describe the active module tree: the root,
`harness` and `web` READMEs, `AGENTS.md`, `docs/architecture.md`,
`docs/architecture/autonomous-implementation-loop.md`,
`docs/implementation-loop.md`, `docs/measurements-and-kpis.md`,
`docs/work-loop.md`, and the status of
`docs/spikes/autonomous-loop-initial-analysis/README.md`, which records the
tree as it stood before this refactor. Plan 1's plan, iteration briefs, results
and completion report were left as they are; they remain the evidence of the
structure that plan implemented. The `contracts` paths that remain in the tree
belong to the `fixtures/collection-review` test project and to captured spike
evidence, and are unrelated to this module tree.

## Validation

Run from `ramify-agent/` on the final state.

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/harness/src/tests/map-contract.test.ts subs/harness/src/tests/protocol-contract.test.ts` | pass: 2 files, 22 tests |
| `npm run type-check` | pass (root, `subs/web`, `scripts`) |
| `npm test` | pass: 21 files, 160 tests |
| `npm run build:web` | pass: 287 modules, `dist/web/assets/index-DJ9mvXsL.js` |
| `npm run check:self` | passed; completed, coverage complete; 5 owners, 73 source files, 776 accesses; 0 errors, 0 warnings, 0 analysis limits; 478 allowed, 0 denied |
| `npx ramify materialize --view architect --view api --from subs/web/src` | revision 9; 5 modules, 338 records, dependencies measured |

The relocated contract tests were run alone first, as the brief requires. The
baseline run of the same gate, before any edit, gave 21 files and 160 tests,
and 8 owners with 73 source files and 776 accesses and no findings. The file,
test and access counts are identical; only the owner count fell.

## Behavior

HTTP, map and persisted-data behavior did not change.

- No `/api/v1` path changed: `paths.ts` and `apiPrefix` moved unedited.
- No payload schema changed: every one of the 110 declarations is byte-identical
  in the requester API view.
- No error status mapping changed: `errorHttpStatus` and `errorCodeSchema`
  moved unedited.
- No command semantics changed: the command, receipt, snapshot and event
  schemas and `terminalEventTypes` moved unedited, and `jobs/service.ts` changed
  only in its import lines.
- No map validation changed: `validateMapSubmission` and its schemas moved
  unedited, and the 22 relocated contract tests pass unchanged.
- No persisted JSON format changed: `job.json`, `events.jsonl`, `map/<n>.json`
  and `map/<n>.approval.json` are written from the same schemas, and the
  publication, approval and recovery tests pass unchanged.

## Handoff

Autonomous-loop planning starts from a harness-owned map contract and client
protocol. It may extend them in place: new durable run events and state stay
private to the harness, and the public protocol grows only with the commands
and projections its clients need, each exposed to the parent with the `browser`
tag and named in the root's descendant selections. It does not need
`contracts/run` or any other neutral definitions module, and should not
recreate one without evidence that some contract has authority independent of
the harness.
