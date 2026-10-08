# Iteration 8 results: ordinary continuation and restoration

**Engineering result:** W01–W02 ordinary controls passed. Coordinator review and
joined qualification remain separate. Fork selection/recovery policy and old
public session entry-point retirement belong to iteration 9; final configured,
native and live qualification belong to iteration 14. No full audit, direct
whole suite, native witness or live model was run for this iteration.

## Identity and ownership

Worktree `/home/app/ramify-plan23-08-continuations`, branch
`feat/plan23-08-continuations`, initial accepted base `4d79ec73` (iterations 0–7).
The coordinator supplied independent installed dependencies. The provider
quiescence amendment `f5ef60e5ff909c559e2af277b8b279c01f29a7e5` and store cache
amendment `39486a63fe74b18820b9e38e729355aec0d6c854` were cherry-picked as worker
`2bd85d55` and `e351956f` before final verification. They are already integrated
by the coordinator; the delivery commit contains only this iteration's paths.
Resolve the delivery HEAD with `git log -1 --format=%H --
ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/08-results.md`.

Changed paths beneath `ramify-agent/`:

- `subs/harness/src/run/service.ts`
- `subs/harness/src/run/records.ts`
- `subs/harness/src/run/session-operations.ts` (new)
- `subs/harness/src/sessions/single.ts`
- `subs/harness/src/sessions/records.ts`
- `subs/harness/src/tests/plan23-continuing-work.test.ts` (new)
- `subs/harness/src/tests/single-session.test.ts`
- `subs/harness/src/tests/helpers/session-scenario.ts`
- `subs/harness/subs/agent/src/scripted.ts`
- this receipt

The scripted observation bridge was additionally reserved by coordinator
`32c1668f`; the scenario helper's narrow `onOpened`/`afterWrite` seam by
`6817444b`. `session-lifecycle.test.ts` is unchanged: temporary diagnostics were
removed before the required final run. No declaration, registry, manifest,
dependency pin, main-checkout file/index or another worker was edited.

Foreign API views for ordinary and testing source were separately refreshed
with `ramify materialize --from subs/harness/src` and `--from
subs/harness/src/tests`, then searched for the accepted operation API and plain
pi builtin declarations. No generated view was edited or imported.

## Runtime composition

`HarnessSessionOperations.open(directory, agent)` binds one production
`LedgerSessionStore` lifetime through `AgentPort.bindSessionStore`. Run service
uses `plans/.harness/session-operations`; standalone uses
`plans/.harness/sessions/session-operations`. Create, Continue, Fork, Retry,
Inspect and model-free AppendContext use that high-level operations port. The
harness neither reads executor files nor constructs SDK objects. Missing
injected operations fail with `genericSessionDriverUnavailableError`; they do
not dispatch a fresh legacy session.

The private adapter accepts the existing internal `SessionSpec`, concrete
`HarnessTaskBrief`, serialized authority/validator/destination and fresh current
closures. Its `ramify-agent.harness-operation/1` correlation retains original
packet, task, environment, policy, declarations and source point before
operation dispatch. A stopped process between correlation and engine intent
idempotently completes the same Create/Fork and Continue; Retry is used only
when that original engine operation exists. Unknown ancestry is unavailable.

`buildTaskPacket` supplies stable role instructions and a current user packet.
Owning goal/requirements are explicit canonical inputs; their exact old-render
blocks are removed from support text only at whole-line boundaries outside
Markdown fences. Embedded prose/JSON and quoted standalone goal lines are
preserved; empty heading-only sections are omitted. Briefing revisions supply full fresh
inputs or revision-bound changes on Continue. Actual qualification uses
`capability-qualification` / `submit_capability_qualification`; consultation uses
`consultation` / `answer_capability_consultation` with the owning response
schema's `z.toJSONSchema` serialization. The actual validator owns its full
schema; the builder places it once in the immutable declaration description,
with its compact wire input schema. A new role on Continue receives its role
instructions and old tools are inactivated. Candidate/snapshot, cwd, limits,
API views and current support are delivered by actual owning sources.

Invocation/outcome records now add optional `sessionOperation` linkage with
harness run/operation and structured agent point. Before packet preparation,
`prompt.requestedInputsHash` explicitly identifies transitional caller input;
`prompt.inputsHash` is absent. The closing transaction commits the actual packet
hash/manifest as invocation revision 2 alongside its outcome. An existing
same-invocation transcript start is authenticated against the original head and
current message and reused, never duplicated or rewritten.

Restoration loads the original immutable intent rather than reconstructing the
current briefing. Fresh executable tool, validator, guard and current-authority
closures are rebound; serialized original authority/validator/destination and
declarations must still match. Accepted raw input plus normalized owning value,
schema, destination, validator and submission-file hash are correlated before
returning the accepted verdict. A terminal engine receipt hydrates the owning
value only when raw input, original destination, immutable validator and exact
owner-file bytes/hash agree. It performs no second acceptance, normalization or
model dispatch. Correlation alone never fabricates an accepted agent receipt:
a crash before the engine verdict retains the engine's unknown-effect rules.

Ordinary startup redispatches original recorded invocation/operation IDs. Exact
local architect action, assignment, captured `.iN` identity and nested contract
request are restored before allocating new work. A contract registration can
publish a provider before the consumer handback closes; startup first finishes
the exact active started/resumed consumer turn, then uses ordinary frontier
priority. Original accepted bodies, passed gates with current candidate proof,
registration/reopening identity, bounded original dependency-cycle findings,
iteration closure and completion-outline prefixes are reused. Missing graph
settlement is checked with original requirement/obligation identity. Unknown or
changed inputs and unconfirmed writer settlement refuse restoration. Existing
named recovery policy is not broadened.

Raw context-budget outcomes fail explicitly without creating partial accepted
reports or synthetic unfinished values. Stop fences submission immediately,
while actual tool/check drainage remains the settlement barrier. Adapter close
refuses pending or rejected/unconfirmed barriers. Service retains the outer
project lock if store close cannot prove quiescence; standalone retains its
project lock and scratch on unconfirmed release and cannot claim gate success.
Equipment cancellation is bounded by captured `stopSettleMs`.

The scripted bridge forwards the actual parent's observation records, actual
operation mode/point and one-to-one operation-qualified call IDs. It supplies
callback perception from only its own validated persisted provider events and
named snapshot additions; emitted/current `record.spec.prompt` bytes remain
unchanged. This is ordinary fake-model perception, not a native history claim.

## Verification and limits

Final required selectors were unchanged; `--maxWorkers=2` only bounds concurrency:

```sh
npm run test:quick -- subs/harness/src/tests/session-lifecycle.test.ts subs/harness/src/tests/plan23-continuing-work.test.ts subs/harness/src/tests/single-session.test.ts --maxWorkers=2
npm run type-check
npm run check:self
git diff --check
```

- Required focused run: **3 files, 43 tests passed**, 49.33 s. Evidence:
  `/tmp/ramify-plan23-08-required-literal-preservation.log`.
- New continuing-work file: 28 controls. Real service restart controls complete
  the existing consumer/provider scenario after original unfinished and accepted
  engineer operations, unfinished and accepted contract operations, registered
  contract before graph/closure, and accepted completion-outline prefix. They
  assert one original invocation start/end, one contract request/registration,
  one parent/contract closure and exact original transcript start/body. The
  scenario's normal forward-only external script needed explicit test-local
  revision-01 candidate and early Git preview answers for original gate reuse;
  production current-candidate proof was retained.
- Added terminal receipt controls refuse missing correlation, changed raw input,
  normalized value, file bytes, validator and destination, with no second model
  or acceptance. Additional controls cover immutable task conflict, accepted
  receipt restoration, correlation-before-engine-intent, continued role change,
  inherited obligations with delta-only emitted packet, denied authority,
  unknown old refs, stopped pending check and rejected live-owner settlement.
  Literal support preservation additionally asserts exact independent support
  bytes and their delivered manifest hash, including embedded JSON/prose and
  an exact goal line in a fenced block.
- Original lifecycle: 2 controls, including the unchanged 180 s bound. Standalone:
  13 controls, including unconfirmed barrier/project-lock/scratch retention.
- All four configured TypeScript checks passed. Evidence:
  `/tmp/ramify-plan23-08-types-literal-preservation.log`.
- Structural execution completed, check passed, coverage partial: **0 errors,
  0 warnings, 317 analysis limits**, 12 owners/667 files/50 resources, 9,505
  allowed accesses/3,419 external. Evidence:
  `/tmp/ramify-plan23-08-structure-literal-preservation.log`. Limits remain diagnostic;
  this is not a complete analysis claim. `git diff --check` passed.

Git, candidates, process, audit and model boundaries in these ordinary controls
are scripted. They establish owning orchestration/identity/settlement behavior,
not actual provider restoration, kernel cleanup or test-suite health. Accepted
completion remains the architect's declared decision; no audit-to-scenario
mapping or harness semantic judgment was added. Standalone qualification here
covers its existing fresh command and settlement lifetime, not a new public
resume command. Final native/live Q02 and full configured Q03 remain iteration14.

Earlier attempts were not passing evidence: pre-cache unchanged lifecycle hit
180000 ms timeout (`...lifecycle-fifth.log`); post-cache missing scripted
inherited perception omitted scenario reports (`...required-final.log`);
complete restart attempts exposed restoration of a yielded finished session
(`...new-owning-phases.log`), provider scheduling before original consumer tail
(`...new-owning-phases2.log`), then missing original candidate/preview script
answers (`...new-owning-phases3.log`, `...new-owning-phases4.log`). These files are
under `/tmp/ramify-plan23-08-`. The first final 42-case run passed; coordinator review then found unsafe
substring deduplication. The exact literal preservation control was added and
the required 43-case run repeated after correction. All were corrected and the final exact selectors
passed. The focused registered diagnostic had skipped nonselected cases and is
not claimed as acceptance. Early Stop test teardown and standalone fixture
assumptions also failed before final controls were corrected. No timeout or
required assertion was weakened.

## Iteration 9 handoff

`run/session-operations.ts` is a private harness compatibility adapter, not a
new legacy/public agent API. `SessionSpec` refs are now provider-neutral
`session-point/1` JSON, but caller choices still use transitional structures.
Iteration 9 must bind exact request-time parent points and remove old public
executor-file/session entry points without adding a legacy reader.

Remaining fork/recovery decisions in `run/service.ts`:

| Owning function | Current boundary to migrate/qualify in 9 |
| --- | --- |
| `reviewStart` / `orientation` | Scope/design fork selection and recorded fresh degraded choices; code review intentionally fresh. |
| `reconciliationStart` / `reconcileWorkItem` | Completion/basis parent point and brief inheritance; missing point fresh choice remains transitional. |
| `selectElements` / `reselectWorkContext` | Orientation/current local parent fork and recorded missing-point fresh selector. |
| `requestPlacement` | Global architect fork from `globalContextOf`, exact request-time origin and replacement policy; `existingId` replay remains owning request identity. |
| `resolveUnresolved` | Global fork, request-time context and replacement/accepted-fork recovery. |
| `resumeCapabilityTask` / `runCapabilityCoordinator` | Recorded capability stack/point selection and existing reconstructed-parent policy. |
| `consultCapabilityConsumer` | Engineer continuation/returned consultation and existing named reconstruction. Actual consultation tool/schema already bound. |
| `coordinateNestedCapability` / `finishCapabilityHandback` / `recoverVerifyingHandback` | Nested parent continuation, qualification/return handback and explicit lost-parent reconstruction. |
| `takeIteration` | Ordinary same-iteration repair uses new operations; capability-return `resume` and authorized named reconstruction choices remain 9's policy surface. |

All actual run and standalone dispatches and model-free append calls now use the
new abstraction. Transitional fork callsites are translated into high-level
Fork operations; this receipt does not qualify their selection/recovery policy
as preserving. Full line inventory:
`/tmp/ramify-plan23-08-final-migration-inventory.txt`; preparatory original phase
inventory `/tmp/plan23-ordinary-recovery-inventory.md` and original fork inventory
`/tmp/migration-inventory.md` remain read-only references. Coordinator owns
central ordinary/test exposures, registry and statuses.
