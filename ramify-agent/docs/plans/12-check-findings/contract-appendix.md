# Plan 12 contract appendix

**Status:** fixed by iteration 1, 2026-09-24. **Owner of each part:** named in its section.

This appendix makes the [plan's](main-plan.md) contracts table exact before
producers depend on it. Section 1 is implemented by the pure
`harness/check-findings` child and its tests; sections 2–8 specify harness
contracts that later iterations implement. The
[architecture](../../architecture/check-findings.md) and the
[principles](../../check-findings.principles.md) keep their authority; where
this appendix is more precise, it records a decision within them. A later
iteration that must change a contract here records the change and its reason
in `results.md` and updates this appendix in the same commit.

## 1. The CheckFinding domain (iteration 1, implemented)

**Owner:** `subs/harness/subs/check-findings/`. **Canonical schemas:**
[`src/interfaces/check-findings.ts`](../../../subs/harness/subs/check-findings/src/interfaces/check-findings.ts).
That file is the exact Zod; this section states what it fixes.

### 1.1 Exposed surface

```text
expose-src * from "interfaces/check-findings.ts" to parent
expose-src decideCheckFindingChange from "decide.ts" to parent
expose-src applyCheckFindingEvent, replayCheckFindingEvents, emptyCheckFindingState from "replay.ts" to parent
expose-src selectCheckFindings from "queries.ts" to parent
```

| Function | Signature | Meaning |
| --- | --- | --- |
| `decideCheckFindingChange` | `(state, command) => CheckFindingChange` | Validates a `report`, `dispose`, `relate` or `assess` command; returns `{ ok: true, events, replayed, touched }` or `{ ok: false, rejection }`. Pure; allocates IDs from `state`. |
| `applyCheckFindingEvent` | `(state, event) => CheckFindingApplied` | Applies one accepted event or refuses it as `replay-conflict`. |
| `replayCheckFindingEvents` | `(events, from?) => CheckFindingReplay` | Folds events from `emptyCheckFindingState()` or `from`; names the first refused position. |
| `selectCheckFindings` | `(state, query) => CheckFindingSelection` | A bounded list or one detail, `check-finding-view/1`. |

The child imports only `zod`. Its tests' purity check enforces that.

### 1.2 Identifiers and versions

| Value | Format | Allocation |
| --- | --- | --- |
| CheckFinding | `cf-0001` | `state.counters.findings + 1` |
| Report | `cfr-0001` | `state.counters.reports + 1` |
| Decision | `cfd-0001` | `state.counters.decisions + 1` |
| Relation | `cfl-0001` | `state.counters.relations + 1` |
| Event data version | `version: 1` | every event |
| View version | `check-finding-view/1` | every list and detail |

The counters are replayed from accepted events, so the harness does not allocate
these IDs itself: deciding under the run mutex over the current log is the
allocation. A revision starts at 1 and each `opened`, `reported` or `decided`
event raises it by one. A relation raises no revision.

### 1.3 Opaque references

| Field | Shape | Compared as |
| --- | --- | --- |
| `producer` | `review:<kind>` or `check:<kind>` | string equality |
| `source` | `{ kind: tree \| file \| document \| artifact, id }` | kind and id equal; a file never stands for a tree |
| `owner` | `{ kind: 'work-item', workItem }` or `{ kind: 'run' }` | kind and ID equal |
| `obligation` | `{ subject, revision }` | subject and revision equal |
| `verification` | `{ kind: 'assessment' }` or `{ kind: 'check', producer, obligation, selection, required }` | per rule below |
| `actor` | `agent { role, invocation }`, `user { name }`, `harness { reason }` | recorded, not authenticated here |
| `authority` | `{ kind: work-item-assessment \| user-decision \| governing-record, ref }` | recorded; kind checked for obligation revision |
| `evidence` | `{ kind, ref, hash: sha256:… \| null }` | recorded only |

Prose fields are at most 4000 characters, references 500, names 200; evidence
and locations at most 50 per list.

### 1.4 Reports and identity

A report carries `producer`, `attempt`, `reportKey`, `contentHash`, `owner`,
`source`, `issueKey`, `verification`, `observation` (`check-failed` or
`review-concern`, summary, evidence, locations), `judgment` (actor,
consequence, rationale, uncertainty, remedy) and `suggests`.

1. **Ingestion key** `(producer, attempt, reportKey)`. Same key and same
   `contentHash`: accepted with no events, `replayed: true`, naming the
   CheckFinding it led to. Same key, other hash: `report-key-conflict`.
2. **Content hash**, computed by the harness: `sha256:` + lowercase hex of
   SHA-256 over the UTF-8 bytes of the canonical JSON of the report input
   without `producer`, `attempt`, `reportKey` and `contentHash`. Canonical JSON
   sorts object keys by UTF-16 code unit, keeps array order, omits no `null`
   and has no whitespace.
3. **Issue key**, supplied only by a trusted producer adapter, is scoped by
   owner and verification obligation (`check:<subject>@<revision>`, or
   `assessment`). Exactly one holder: the report attaches
   (`check-finding-reported`). More than one: `ambiguous-issue-key` naming
   them; the harness may resubmit the report without its key, which opens a
   provisional CheckFinding for architect matching. None: a new CheckFinding.
4. Without an issue key a report always opens a new CheckFinding. `suggests`
   must name an existing CheckFinding (`unknown-check-finding` otherwise) and
   never attaches.
5. Form rules (`invalid-report`): a `review-concern` carries a judgment and is
   verified by `assessment`; a `check-failed` is verified by `check`; a check
   rule names the report's own producer.
6. **Reopening by report.** Attaching to a closed CheckFinding also emits a
   harness-actor `reopen` decision (cause `{ kind: 'report', report }`) when
   the closing decision was `verify-by-check`, or when the report's source
   differs from the closing decision's source. On the same source any other
   closure, such as an accepted choice, stays closed with the added evidence.
   A deferred CheckFinding stays deferred.

An authorized obligation revision adds the scoped keys of the new obligation
to the CheckFinding, keeping the old ones. A report of the new obligation that
arrived first, as its own CheckFinding, then makes the key ambiguous; that is
the case the refusal exists for.

### 1.5 Decisions

`dispose { checkFinding, expectedRevision, decision }` where `decision` is
`{ actor, source, rationale, evidence, communication, decision: action }`.
`communication` is `{ mode: 'quiet' }` or `{ mode: 'report', choice,
uncertainty, reason }`, which the views show as a material choice.

Common refusals, in order: `unknown-check-finding`; `stale-revision`
(expected ≠ current); `awaiting-user-decision` (a pending request admits only
its answer); then the action's own.

| Action | From | Result | Action-specific refusals |
| --- | --- | --- | --- |
| `plan-repair { repair: assignment \| intent }` | open | open, `repair-planned` | `invalid-transition` |
| `claim-repair { candidate, change }` | open | open, `repair-claimed` | `invalid-transition` |
| `verify-by-check { candidate, witness }` | open | closed, `verified-by-check` | `verification-kind-mismatch`, `producer-mismatch`, `wrong-subject`, `obligation-changed`, `incomparable-inputs` (selection), `source-mismatch` (witness source ≠ candidate), `failure-source` (witness on the source of the latest failure), `not-executed` (`not-run`), `insufficient-coverage` (`partial`), `not-passed` (`failed` or `inconclusive`) |
| `verify-by-assessment { reassessed }` | open | closed, `verified-by-assessment` | `verification-kind-mismatch`, `unknown-report` |
| `supersede { reassessed, replacement }` | open, deferred | closed, `superseded` | `factual-obligation` for a `check` rule, `unknown-report` |
| `accept { authority, uncertainty }` | open, deferred | closed, `accepted` | `required-obligation` for a required check |
| `defer { authority, responsible, revisit }` | open | deferred, `deferred` | `required-obligation` for a required check |
| `request-user-decision { authority, conflicts[1..20], options[2..10] }` | open | open, `awaiting-user-decision` | `invalid-command` for repeated option IDs |
| `answer-user-decision { request, option }` | open, pending | open, `user-decision-answered` | `no-pending-user-decision`, `insufficient-authority` (actor not `user`), `unknown-option` |
| `reopen { cause }` | closed, deferred | open, `reopened`; repair cleared | `invalid-transition` from open |
| `revise-obligation { authority, from, to }` | open | open, `obligation-revised`; rule's obligation becomes `to` | `verification-kind-mismatch`, `obligation-changed` (`from` ≠ current), `invalid-command` (`to` = `from`), `insufficient-authority` (`work-item-assessment`) |

Other open reasons: `new` on opening. A witness is refused in the order of
the table's list. `touched` lists every CheckFinding an accepted command
changes.

### 1.6 Relations and groups

`relate { actor, source, from: { checkFinding, revision }, to, relation,
shared, evidence, rationale }` with `relation` one of `same-issue`,
`related-but-distinct`, `distinct`, `uncertain`. Refusals:
`unknown-check-finding`, `stale-revision` (either side), `relation-self`,
`cross-owner`, and for `same-issue` `relation-cycle` when both already
belong to one group. The latest assessment of a pair is its current
relation. Groups are the connected components of current `same-issue`
pairs, with the earliest ID as canonical. Each member keeps its reports,
decisions, standing and verification rule; a group never closes a member.

`assess { commands[1..100] }` holds `dispose` and `relate` commands, decided
in order against the state the earlier ones leave. The first refusal refuses
all, with its `index`. One disposition per CheckFinding per assessment is
the ordinary case; a second must name the revision the first produced.

### 1.7 Events

| Type | Data (all `.strict()`) |
| --- | --- |
| `check-finding-opened` | `{ version: 1, checkFinding, revision: 1, report }` |
| `check-finding-reported` | `{ version: 1, checkFinding, revision ≥ 2, report }` |
| `check-finding-decided` | `{ version: 1, checkFinding, revision ≥ 2, decision: { …input, id, considered } }` |
| `check-finding-related` | `{ version: 1, relation: { …input, id } }` |

Exported data schemas: `checkFindingOpenedDataSchema`,
`checkFindingReportedDataSchema`, `checkFindingDecidedDataSchema`,
`checkFindingRelatedDataSchema`; the union is `checkFindingEventSchema`.
Replay refuses (`replay-conflict`) an ID that is not the next one, a revision
that does not follow, a `considered` that is not the prior revision, a
repeated ingestion key, an attachment whose issue key the CheckFinding does
not hold, and a relation naming an unknown CheckFinding.

### 1.8 Queries

| Query | Fields | Bounds |
| --- | --- | --- |
| `list` | `owner` (null = all), `select: attention \| all`, `standings` (with `all`), `due` (IDs), `after` (cursor), `limit` | limit 1–100, default 50; `due` at most 500; an unknown due ID is `unknown-check-finding` |
| `detail` | `checkFinding` | the latest 200 reports and decisions, with totals |

`attention` is every open CheckFinding of the owner and each deferred one
named in `due`, marked `open` or `due`. Pages are ordered by ID;
`next` is the last shown ID when more remain. `counts` covers every
CheckFinding of the owner (total, per standing, per reason) whatever the page
selects. A summary carries ID, revision, owner, standing, reason, `awaiting`
(`assessment`, `repair`, `witness`, `user-decision`; null unless open),
`attention`, verification, producers, title (first observation summary),
latest source, report and decision counts, group, pending user decision,
repair, and the latest material choice since the last reopening. A detail
adds the bounded histories and every current relation naming it.

## 2. Ledger composition (iteration 2)

**Owner:** harness `run/log.ts`, `run/records.ts`, a new `check-findings/`
integration folder. CheckFinding state is replayed only from the run log.

### 2.1 Carrier events

Child events are carried, in order, in a `checkFindings` array of the run
event that commits them, so each application transition is one ledger line:

```ts
const checkFindingEventsField = z.array(checkFindingEventSchema).max(100);
```

| Run event | Carries | Introduced by |
| --- | --- | --- |
| `check-findings-recorded` (new) | `{ cause, checkFindings: min(1) }` for every path without its own event: recovery, user answers, a factual promotion outside a gate | iteration 2 |
| `review-attempt-finished` (new) | review concerns promoted with the terminal attempt | iteration 3 |
| `reconciliation-assessed` (new) | the architect's relations and dispositions | iteration 5 |
| `iteration-closed` (existing, optional field) | `claim-repair` for each CheckFinding whose repair intent the accepted iteration resolves | iteration 5 |
| `gate-attempted` (existing, optional field) | factual promotion and `verify-by-check` from that gate | iteration 6 |

```ts
const checkFindingCauseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recovery'), detail: text }).strict(),
  z.object({ kind: z.literal('user-response'), command: commandIdSchema }).strict(),
  z.object({ kind: z.literal('producer'), producer: text, attempt: text }).strict(),
]);
event('check-findings-recorded', z.object({ cause: checkFindingCauseSchema, checkFindings: checkFindingEventsField.min(1) }).strict())
```

The state is `replayCheckFindingEvents(events.flatMap(e => e.data.checkFindings ?? []))`
in log order. A log with no carrier has the empty state. An existing field
is optional, so earlier logs stay valid.

### 2.2 Record layout

Each carried event's body is also committed as a materialized record in the
same transaction, for readers; replay never reads these files.

| Record | Path under the run directory | Schema literal | Ledger `id`, `revision` |
| --- | --- | --- | --- |
| Report | `check-findings/<cf>/reports/<cfr>.json` | `ramify-agent.check-finding-report/1` | `cfr`, 1 |
| Decision | `check-findings/<cf>/decisions/<cfd>.json` | `ramify-agent.check-finding-decision/1` (body: decision plus `checkFinding` and `revision`) | `cfd`, 1 |
| Relation | `check-findings/relations/<cfl>.json` | `ramify-agent.check-finding-relation/1` | `cfl`, 1 |

A projection may write rebuildable per-CheckFinding view files; they are not
records and no reader treats them as authority. The serialized line must fit
the ledger's 8 MiB limit; a submission whose transaction would not is refused
as an invalid submission before anything is appended.

### 2.3 Transition function

`commitCheckFindingChange(run, build)` runs under the run mutex:

1. refuse if the log is terminal (`run-ended`);
2. replay the current CheckFinding state from the log;
3. call `build(state)`, which returns the child command(s) and the carrier
   run event with its other records; slow work happened before, and its
   captured basis (request, attempt, source, revisions) is validated here;
4. decide with the child; a refusal returns without appending;
5. an exact replay with no events and no other record appends nothing;
6. append the carrier event, its records and the CheckFinding record copies
   in one transaction.

Direct ledger paths that change the same basis (gate attempts, iteration
closures, work-item completion) take the same mutex.

## 3. Review requests and attempts (iterations 3–4)

**Owner:** harness `src/reviews/`.

### 3.1 Identifiers and records

| Value | Format |
| --- | --- |
| Review request | `rq-0001`, the count of `review-request-recorded` + 1 |
| Review attempt | `rq-0001.a01`, the count of that request's attempts + 1 |
| Concern report key | `concern-01`, the concern's position in the validated submission |

| Record | Path | Schema literal |
| --- | --- | --- |
| Request | `reviews/<rq>/request.json` | `ramify-agent.review-request/1` |
| Attempt (terminal) | `reviews/<rq>/attempts/<nn>/attempt.json` | `ramify-agent.review-attempt/1` |
| Submission | `reviews/<rq>/attempts/<nn>/submission.json` | `ramify-agent.review-submission/1` |

### 3.2 Schemas

```ts
export const reviewKindSchema = z.enum(['code', 'scope', 'design']);
export const reviewPolicyVersion = 'review-policy/1';

const hashedRefSchema = z.object({ ref: text, hash: sha256Schema }).strict();
export const forkPointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),                      // code review, always
  z.object({ kind: z.literal('session'), session: sessionIdSchema, ref: text }).strict(),
  z.object({ kind: z.literal('unavailable'), reason: text }).strict(),
]);

export const reviewRequestSchema = z.object({
  id: text,                                   // rq-0001
  key: z.object({                             // one request per key
    iteration: text,                          // wi-001.i02
    candidate: text,                          // audited commit
    kind: reviewKindSchema,
    policy: z.literal(reviewPolicyVersion),
  }).strict(),
  workItem: text,
  assignment: text,                           // iteration assignment record path
  base: text,                                 // iteration base commit
  gate: text,                                 // passing gate attempt, ga-0007
  tree: text,                                 // audited tree of the candidate
  requirements: z.array(hashedRefSchema),     // scope: selected requirement text
  guidance: z.array(hashedRefSchema),         // design: selected guidance files
  forkPoint: forkPointSchema,
}).strict();

const inspectedSchema = z.array(z.object({ path: text }).strict());
const missingSchema = z.array(z.object({ path: text, reason: text }).strict());
export const notVerifiedReasonSchema = z.enum([
  'invalid-output', 'unavailable', 'timed-out', 'execution-failed', 'deadline',
  'queue-overflow', 'no-time-before-deadline', 'stopped',
]);

export const reviewAttemptSchema = z.object({
  id: text,                                   // rq-0001.a01
  request: text,
  queuedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime(),
  invocation: text.nullable(),
  session: sessionIdSchema.nullable(),
  requestedStart: z.enum(['fresh', 'fork']),
  actualStart: z.enum(['fresh', 'fork']).nullable(), // null when never started
  result: z.discriminatedUnion('result', [
    z.object({ result: z.literal('complete'), inspected: inspectedSchema, concerns: z.int().nonnegative() }).strict(),
    z.object({ result: z.literal('partial'), inspected: inspectedSchema, missing: missingSchema.min(1), concerns: z.int().nonnegative() }).strict(),
    z.object({ result: z.literal('not-verified'), reason: notVerifiedReasonSchema, detail: z.string() }).strict(),
  ]),
  /** Whether this attempt settles its request; a not-verified attempt with a retry left does not. */
  settles: z.boolean(),
  checkFindings: z.array(checkFindingIdSchema),  // opened or attached by this attempt
}).strict();

export const reviewSubmissionSchema = z.object({
  inspected: z.array(z.string().min(1)).max(500),
  missing: z.array(z.object({ path: z.string().min(1), reason: z.string().min(1).max(1000) }).strict()).max(500),
  concerns: z.array(z.object({
    summary: z.string().min(1).max(4000),
    consequence: z.string().min(1).max(4000),
    rationale: z.string().min(1).max(4000),
    uncertainty: z.string().min(1).max(4000),
    remedy: z.string().min(1).max(4000),
    locations: z.array(checkFindingLocationSchema).min(1).max(50),
    suggests: checkFindingIdSchema.nullable(),
  }).strict()).max(20),
}).strict();
```

A concern with an empty or unsupported location, or a submission naming
inspected paths outside the candidate diff, is `invalid-output`. An empty
`concerns` with `missing` empty is a clean covered scope; with `missing`
non-empty it is `partial`.

### 3.3 Events

| Event | Data | Records |
| --- | --- | --- |
| `review-request-recorded` | `{ request, workItem, iteration, kind, gate, candidate }` | request |
| `review-attempt-started` | `{ request, attempt, invocation, session, requestedStart, actualStart }` | none |
| `review-attempt-finished` | `{ request, attempt, result, settles, checkFindings }` | attempt, submission (when valid), CheckFinding copies |

A queued attempt is the durable request without a finished settling attempt;
it needs no event. One settling attempt ends the request; a result that
arrives after it, or after its attempt was finished as not verified, is
fenced: no event, and its session is stopped and cleaned up. Requests are
recorded before the driver advances past the passing iteration; recovery
records any missing request from `iteration-closed` accepted events whose
key has none.

### 3.4 Mapping a concern to a report

| Report field | Bound by the harness from |
| --- | --- |
| `producer` | `review:<request kind>` |
| `attempt` | the attempt ID |
| `reportKey` | `concern-<nn>` by position |
| `contentHash` | §1.4 rule 2 |
| `owner` | `{ kind: 'work-item', workItem: request.workItem }` |
| `source` | `{ kind: 'tree', id: request.tree }` |
| `issueKey` | `null` |
| `verification` | `{ kind: 'assessment' }` |
| `observation` | `review-concern`; summary; evidence `[{ kind: 'review-submission', ref: <submission path>, hash }]`; locations |
| `judgment` | actor `{ kind: 'agent', role: 'reviewer', invocation }`; consequence, rationale, uncertainty, remedy |
| `suggests` | the concern's hint, dropped when it names no CheckFinding of the same owner |

## 4. Policy (iterations 3–5)

The run policy becomes `run-policy/3`; `run-policy/2` runs remain readable.

```ts
limits: { …existing, reconciliationRoundsPerWorkItem: z.int().positive().optional() },
reviews: z.object({
  version: z.literal('review-policy/1'),
  kinds: z.array(reviewKindSchema).min(1),
  concurrency: z.int().positive(),
  queue: z.int().positive(),
  retries: z.int().nonnegative(),
  attemptMs: z.int().positive(),
  settleMs: z.int().positive(),
  maxConcerns: z.int().positive(),
}).strict().optional(),
```

| Value | Initial trial value |
| --- | --- |
| `kinds` | `code`, `scope`, `design` |
| `concurrency` (readers beside the one writer) | 2 |
| `queue` | 12 |
| `retries` after an execution or validation failure | 1 |
| `attemptMs` | 600 000 |
| `settleMs` from the completion request | 900 000 |
| `maxConcerns` per submission | 20 |
| `reconciliationRoundsPerWorkItem` | 3 |

A policy without `reviews` means the run records no requests: every review
and CheckFinding coverage view answers `unavailable`, never clean. Overflow
finishes the attempt as `queue-overflow`; an attempt or retry that cannot
finish before its work item's deadline finishes at once as
`no-time-before-deadline`. The writer has scheduling priority.

## 5. Fork points (iteration 4)

`iteration-assigned` and `outline-revised` gain an optional
`architectRef: z.object({ session: sessionIdSchema, ref: text }).strict().nullable()`.
On `iteration-assigned` it is the local architect's pinned ref at the
assignment (scope review's fork point); on the `outline-revised` that commits
a `request-completion` submission it is the ref after that submission
(reconciliation's fork point). `null` records that no pinned ref was
available; absence means an earlier run. A missing or unusable ref starts a
fresh session with the complete captured packet, and the attempt records
`actualStart: 'fresh'`.

## 6. Reconciliation (iteration 5)

| Value | Format | Record path | Schema literal |
| --- | --- | --- | --- |
| Reconciliation | `wi-001.rc01`, per work item | `work-items/<wi>/reconciliations/<nn>/basis.json` | `ramify-agent.reconciliation-basis/1` |
| Assessment | one per reconciliation | `work-items/<wi>/reconciliations/<nn>/assessment.json` | `ramify-agent.reconciliation-assessment/1` |

```ts
export const reconciliationBasisSchema = z.object({
  id: text,                                        // wi-001.rc01
  workItem: text,
  round: z.int().positive(),                       // ≤ reconciliationRoundsPerWorkItem
  source: z.object({ commit: text, tree: text }).strict(),
  requests: z.array(z.object({ request: text, attempt: text.nullable(), result: z.enum(['complete', 'partial', 'not-verified']) }).strict()),
  checkFindings: z.array(checkFindingAtSchema),    // the complete attention set, all pages
  due: z.array(checkFindingIdSchema),
  applied: z.int().nonnegative(),                  // CheckFinding state version at capture
  forkPoint: forkPointSchema,
}).strict();
```

Events: `reconciliation-started { workItem, reconciliation, round }` with the
basis; `reconciliation-assessed { workItem, reconciliation, invocation, next:
'complete' | 'correct' | 'await-user', checkFindings }` with the assessment;
the brief append is a ledger effect keyed `brief:<reconciliation>` whose
completion is `reconciliation-brief-appended { reconciliation, session, ref,
outcome }`. An empty attention set with every request settled appends no
`reconciliation-started` and calls no agent; the work-item gate follows.

The harness maps the architect's submission to one `assess` command: actor
`{ kind: 'agent', role: 'local-architect', invocation }`, source
`{ kind: 'tree', id: basis.source.tree }`, authority
`{ kind: 'work-item-assessment', ref: <reconciliation> }`, and a correction
as `plan-repair` with `{ kind: 'intent', ref: <reconciliation> }`. The next
`iteration-assigned` for that work item resolves the intent; recovery creates
it from the recorded assessment when absent. When the correction iteration
closes accepted, `iteration-closed` carries `claim-repair` for each
CheckFinding planned under that intent, with `candidate` its audited tree and
`change` the iteration ID.

Validation under the mutex, both at `reconciliation-assessed` and before
`work-item-completed`: the audited source is the basis source (or its
recorded scenario-rendering lineage with verified expected bytes), every
basis request is settled with the named attempt, every basis CheckFinding is
still at its captured revision, and no CheckFinding of the owner outside the
basis has become open or due. A mismatch refuses the assessment or the
completion and starts a new round.

## 7. Scenario witness (iteration 6)

| Report or witness field | Value |
| --- | --- |
| `producer` | `check:scenario` |
| `attempt` | the gate attempt, `ga-0005` |
| `reportKey`, `issueKey` | `scenario:<sc-id>` |
| obligation | `{ subject: 'scenario:<sc-id>', revision: 1 }`; an authorized obligation revision raises it |
| `selection` | `<mode>/<selection kind>@<profile hash>`, as the gate's scenario check recorded it |
| `required` | `true` for a required scenario gate |
| `source` / witness `source` | `{ kind: 'tree', id: <audited tree> }` |
| witness `coverage` | `complete` when the retained message stream reports the scenario executed with every step finished; `partial` when some pickle or step did not finish; `not-run` when it is excluded, absent or the stream is missing |
| witness `outcome` | `passed` or `failed` from the scenario result; `inconclusive` for a timeout, a launch error or an unreadable stream |

Only the scenario adapter builds a witness; the acceptance candidate is the
passing gate's audited tree. Two passing focused results may support a
provisional intermittent classification, which is not a disposition here and
never a required-gate pass. Untracked project scenarios are counted on gate
attempts and never promoted.

## 8. Public wire (iteration 7)

**Owner:** harness `src/interfaces/protocol/check-findings.ts`, imports only
`zod` and sibling protocol schemas, exposed `tagged [browser]` and re-exposed
by the root to descendants. It never imports the child's types; it redefines
the projection it serves.

```ts
export const checkFindingProtocolVersion = 'check-findings/1';
export const checkFindingWireLimits = { defaultLimit: 50, maxLimit: 100, detailHistory: 200 } as const;

export const reviewCoverageSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('available'), requested: z.int().nonnegative(), complete: z.int().nonnegative(),
    partial: z.int().nonnegative(), notVerified: z.int().nonnegative(), pending: z.int().nonnegative() }).strict(),
  z.object({ state: z.literal('unavailable'), reason: z.enum(['no-review-policy', 'records-unreadable']) }).strict(),
]);

export const checkFindingSummarySchema = z.object({
  id: z.string(), revision: z.int().positive(), workItem: z.string().nullable(),
  standing: z.enum(['open', 'deferred', 'closed']),
  reason: z.enum(['new', 'repair-planned', 'repair-claimed', 'awaiting-user-decision', 'user-decision-answered',
    'reopened', 'obligation-revised', 'deferred', 'verified-by-check', 'verified-by-assessment', 'superseded', 'accepted']),
  awaiting: z.enum(['assessment', 'repair', 'witness', 'user-decision']).nullable(),
  verification: z.enum(['assessment', 'check']), required: z.boolean(),
  producers: z.array(z.string()), title: z.string(), reports: z.int().nonnegative(), decisions: z.int().nonnegative(),
  group: z.object({ canonical: z.string(), members: z.array(z.string()) }).strict().nullable(),
  pendingUserDecision: z.string().nullable(),
  materialChoice: z.object({ decision: z.string(), choice: z.string(), uncertainty: z.string(), reason: z.string() }).strict().nullable(),
}).strict();

export const checkFindingListResponseSchema = z.object({
  protocol: z.literal(checkFindingProtocolVersion),
  runId: runIdSchema, version: z.int().nonnegative(),
  coverage: reviewCoverageSchema,
  total: z.int().nonnegative(), shown: z.int().nonnegative(), next: z.string().nullable(),
  counts: z.object({ open: z.int().nonnegative(), deferred: z.int().nonnegative(), closed: z.int().nonnegative() }).strict(),
  items: z.array(checkFindingSummarySchema).max(checkFindingWireLimits.maxLimit),
}).strict();

// checkFindingDetailSchema: the summary, bounded report and decision views with totals,
// relations, and links to work item, attempt, candidate diff and repair session.
// reviewAttemptViewSchema / reviewListResponseSchema: request, kind, candidate, attempts,
// result, inspected/missing counts, start mode; with protocol, runId, version, coverage.

export const respondToCheckFindingCommandSchema = z.object({
  commandId: commandIdSchema,
  expectedVersion: jobVersionSchema,
  type: z.literal('respond-to-check-finding'),
  payload: z.object({
    planId: planIdSchema, jobId: jobIdSchema,
    checkFinding: z.string().regex(/^cf-\d{4,}$/),
    request: z.string().regex(/^cfd-\d{4,}$/),
    expectedRevision: z.int().positive(),
    option: z.string().min(1).max(200),
    responder: z.string().min(1).max(200),
    note: z.string().max(4000).optional(),
  }).strict(),
}).strict();
```

Paths, beside the existing run paths:
`GET …/runs/:runId/check-findings?version=&workItem=&select=attention|all&after=&limit=`,
`GET …/runs/:runId/check-findings/:checkFinding?version=`,
`GET …/runs/:runId/reviews?version=&workItem=`; the command goes to
`POST /api/v1/commands`. A stale `version` is the existing `stale-version`
409 with `currentVersion`. A stale `expectedRevision` or a request that is no
longer pending is a refused command naming the CheckFinding's current
revision. No other CheckFinding command exists.

## 9. The worked stream

`src/tests/fixtures/stream.ts` in the child. One work item `wi-001`; trees
`t-01` (iteration 1), `t-02` (iteration 2), `t-03` (iteration 3), `t-04`
(correction `wi-001.i04`), `t-05` (after the requirement change). The
run-event column is the carrier of §2.1 that commits the step once the
producers exist.

| # | Step | Decision | CheckFinding events | Carrier |
| --- | --- | --- | --- | --- |
| 1 | code review `rq-0001.a01` concern 1: discount applied twice, `src/cart.ts` | accepted | opened `cf-0001`@1 `cfr-0001` | `review-attempt-finished` |
| 2 | same attempt, concern 2: duplicated rounding, same file | accepted | opened `cf-0002`@1 `cfr-0002` | same line as 1 |
| 3 | scope review `rq-0002.a01`: EUR default contradicts R2 | accepted | opened `cf-0003`@1 `cfr-0003` | `review-attempt-finished` |
| 4 | code review `rq-0004.a01` on `t-02`, in parallel: same default | accepted | opened `cf-0004`@1 `cfr-0004` | `review-attempt-finished` |
| 5 | step 1 delivered again after a crash | replay, no events | none | nothing appended |
| 6 | step 1's key with another content hash | `report-key-conflict` | none | nothing appended |
| 7 | `ga-0005` fails `scenario:sc-004` on `t-02` | accepted | opened `cf-0005`@1 `cfr-0005` | `gate-attempted` |
| 8 | `ga-0007` fails it again on `t-03`: same issue key | accepted | reported `cf-0005`@2 `cfr-0006` | `gate-attempted` |
| 9 | design review `rq-0009.a01`: configuration read in a loop | accepted | opened `cf-0006`@1 `cfr-0007` | `review-attempt-finished` |
| 10 | reconciliation `wi-001.rc01` at `t-03`, one `assess` | accepted | related `cfl-0001` `cf-0004`→`cf-0003` same-issue; related `cfl-0002` `cf-0002`→`cf-0001` distinct; decided `cf-0001`@2 `cfd-0001` plan-repair (intent `wi-001.rc01`); `cf-0002`@2 `cfd-0002` defer; `cf-0003`@2 `cfd-0003` accept (material choice reported); `cf-0004`@2 `cfd-0004` accept; `cf-0006`@2 `cfd-0005` supersede; `cf-0005`@3 `cfd-0006` plan-repair | `reconciliation-assessed` |
| 11 | correction `wi-001.i04` closes accepted on `t-04`: claim for `cf-0001` | accepted | decided `cf-0001`@3 `cfd-0007` claim-repair | `iteration-closed` |
| 12 | same closure: claim for `cf-0005` | accepted | decided `cf-0005`@4 `cfd-0008` claim-repair | same line as 11 |
| 13 | witness of `scenario:sc-005` | `wrong-subject` | none | none |
| 14 | partial run of `sc-004` | `insufficient-coverage` | none | none |
| 15 | `ga-0009` passes `sc-004` completely on `t-04` | accepted | decided `cf-0005`@5 `cfd-0009` verify-by-check | `gate-attempted` |
| 16 | reconciliation `wi-001.rc02`: fresh assessment of `cfr-0001` | accepted | decided `cf-0001`@4 `cfd-0010` verify-by-assessment | `reconciliation-assessed` |
| 17 | same assessment: R2 revision 2 contradicts the accepted choice | accepted | decided `cf-0003`@3 `cfd-0011` reopen | same line as 16 |
| 18 | same assessment: the fix would change an approved obligation | accepted | decided `cf-0003`@4 `cfd-0012` request-user-decision (`follow-r2`, `keep-eur`) | same line as 16 |

Final state, 21 events: `cf-0001` closed `verified-by-assessment` @4;
`cf-0002` deferred @2; `cf-0003` open `awaiting-user-decision` @4 pending
`cfd-0012`; `cf-0004` closed `accepted` @2; `cf-0005` closed
`verified-by-check` @5 with two reports; `cf-0006` closed `superseded` @2.
Group `{ canonical: cf-0003, members: [cf-0003, cf-0004] }`. With `due:
[cf-0002]` the attention set of `wi-001` is `cf-0002` (due) and `cf-0003`
(open); without it, `cf-0003` alone. The stream test replays the events from
their JSON lines into identical state and views, and shows that steps 16–18
decided as one `assess` produce the same events.

Event 1 as the child returns it:

```json
{
  "type": "check-finding-opened",
  "data": {
    "version": 1,
    "checkFinding": "cf-0001",
    "revision": 1,
    "report": {
      "producer": "review:code",
      "attempt": "rq-0001.a01",
      "reportKey": "concern-01",
      "contentHash": "sha256:0000000000000000000000000000000000000000000000000000000000000001",
      "owner": { "kind": "work-item", "workItem": "wi-001" },
      "source": { "kind": "tree", "id": "t-01" },
      "issueKey": null,
      "verification": { "kind": "assessment" },
      "observation": {
        "kind": "review-concern",
        "summary": "The discount is applied twice when a coupon is present",
        "evidence": [{
          "kind": "review-submission",
          "ref": "rq-0001.a01/submission.json",
          "hash": "sha256:00000000000000000000000000000000000000000000000000000000000007d1"
        }],
        "locations": [{ "path": "src/cart.ts", "startLine": 10, "endLine": 20 }]
      },
      "judgment": {
        "actor": { "kind": "agent", "role": "reviewer", "invocation": "inv-0010" },
        "consequence": "The discount is applied twice when a coupon is present: the behavior differs from the assignment",
        "rationale": "read the frozen candidate diff",
        "uncertainty": "moderate",
        "remedy": "a bounded change in the named file"
      },
      "suggests": null,
      "id": "cfr-0001"
    }
  }
}
```

The fixture's hashes and tree IDs are literal placeholders; a harness
integration test uses real ones.

## 10. Trusted inputs the harness binds

The child trusts every field below as given. Each is bound by harness code
from committed records, never copied from agent text except where marked as
the agent's own judgment.

| Input | Bound from |
| --- | --- |
| `producer` | the integration that ran: request kind or check adapter |
| `attempt` | the review attempt or gate attempt committed with or before the report |
| `reportKey` | concern position (reviews) or `scenario:<id>` (scenario adapter) |
| `contentHash` | computed by the harness, §1.4 |
| `owner` | the request's or gate's work item; `run` only for run-level reviews |
| `source`, witness `source`, `candidate` | the audited tree of the request, gate or completion candidate |
| `issueKey` | only an adapter that attests identity (scenario); `null` for reviews |
| `verification` including `required` and `selection` | the producer adapter and the gate's captured selection |
| observation `evidence` | the harness's retained records: submission, diff, gate output, message stream |
| judgment `actor` and decision `actor` | the invocation, role and assignment the harness started, or the user command's responder |
| judgment prose, `suggests`, concern locations | the agent's own submission, validated for form only |
| `authority` | the reconciliation being assessed, the answered user request, or a named governing record |
| `expectedRevision`, relation revisions | the captured reconciliation basis or the command's expected revision |
| `repair` | the reconciliation intent or the committed assignment ID |
| claim `candidate` and `change` | the accepted correction iteration's audited tree and ID |
| `witness` | only the scenario adapter, from the gate's retained results |
| `due` | the harness's evaluation of each deferral's revisit condition |
| terminal run, mutex, line size | the run log and ledger; the child knows none of them |
