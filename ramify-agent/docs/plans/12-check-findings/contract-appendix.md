# Plan 12 contract appendix

**Status:** fixed by iteration 1, 2026-09-24; renames, signal fields and module attribution implemented by iteration 4b; the scenario witness by iteration 6 (§7.1); the public wire and commands by iteration 7 (§8.1). **Owner of each part:** named in its section.

This appendix makes the [plan's](main-plan.md) contracts table exact before
producers depend on it. Section 1 is implemented by the pure
`harness/check-findings` child and its tests, section 2 by the harness's
`src/check-findings/` integration (iteration 2); sections 3–8 specify harness
contracts that later iterations implement. The
[architecture](../../architecture/check-findings.md) and the
[principles](../../check-findings.principles.md) keep their authority; where
this appendix is more precise, it records a decision within them. A later
iteration that must change a contract here records the change and its reason
in `results.md` and updates this appendix in the same commit.

## 1. The CheckFinding domain (iterations 1 and 4b, implemented)

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
consequence, rationale, uncertainty, remedy, `risk`, `ground`), `suggests`,
and the harness-bound `credibility` and `modules` (iteration 4b).

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
   the closing decision was `fix-by-check`, or when the report's source
   differs from the closing decision's source. A waived CheckFinding stays
   closed whatever the source, with the added evidence; on the same source
   any other closure stays closed with the added evidence too. A deferred
   CheckFinding stays deferred.
7. **Risk, ground, credibility and modules** (iteration 4b). `risk` is
   `high | medium | low`, the reporter's proposal. `ground` is `{ ref, hash }`
   or null: the reference the reporter named as grounding the concern.
   `credibility` is bound by the harness, never by the reporter: `objective`
   for a `check-failed` report; for a `review-concern`, `human-reviewed`,
   `agent-generated` or `ungrounded` from the ground's provenance class
   (§3.4). A view derives `objective-reproduced` for a CheckFinding with two
   or more objective reports. `modules` is a list of module paths, possibly
   empty. A CheckFinding's current risk is its latest risk correction, else
   its latest report's risk; its modules are the union of its reports'.
   As implemented: a report without a judgment (a failed check) proposes
   `high` for a required check and `medium` otherwise. `invalid-report` also
   refuses a `check-failed` report that is not `objective`, a
   `review-concern` that is, and a `review-concern` whose credibility is
   `ungrounded` without a null ground or the reverse. Without two objective
   reports a CheckFinding is as credible as its most credible report; its
   modules keep the order in which its reports first name them. The child
   derives risk, credibility and modules after every event (`signals.ts`)
   and holds them on the replayed entry.

An authorized obligation revision adds the scoped keys of the new obligation
to the CheckFinding, keeping the old ones. A report of the new obligation that
arrived first, as its own CheckFinding, then makes the key ambiguous; that is
the case the refusal exists for.

### 1.5 Decisions

`dispose { checkFinding, expectedRevision, decision }` where `decision` is
`{ actor, source, rationale, evidence, communication, risk?, decision: action }`.
`communication` is `{ mode: 'quiet' }` or `{ mode: 'report', choice,
uncertainty, reason }`, which the views show as a material choice. `risk`,
optional, corrects the CheckFinding's risk level with the action (iteration
4b). Iterations 1–4 implemented `verify-by-check`, `verify-by-assessment`
and `accept`; iteration 4b renamed them to the names below. A waiver's
`acceptedRisk` is a risk level, `high | medium | low`; `waived` and
`not-waived` are rejection codes.

Common refusals, in order: `unknown-check-finding`; `stale-revision`
(expected ≠ current); `awaiting-user-decision` (a pending request admits only
its answer); then the action's own.

| Action | From | Result | Action-specific refusals |
| --- | --- | --- | --- |
| `plan-repair { repair: assignment \| intent }` | open | open, `repair-planned` | `invalid-transition` |
| `claim-repair { candidate, change }` | open | open, `repair-claimed` | `invalid-transition` |
| `fix-by-check { candidate, witness }` | open | closed, `fixed-by-check` | `verification-kind-mismatch`, `producer-mismatch`, `wrong-subject`, `obligation-changed`, `incomparable-inputs` (selection), `source-mismatch` (witness source ≠ candidate), `failure-source` (witness on the source of the latest failure), `not-executed` (`not-run`), `insufficient-coverage` (`partial`), `not-passed` (`failed` or `inconclusive`) |
| `fix-by-assessment { reassessed }` | open | closed, `fixed-by-assessment` | `verification-kind-mismatch`, `unknown-report` |
| `supersede { reassessed, replacement }` | open, deferred | closed, `superseded` | `factual-obligation` for a `check` rule, `unknown-report` |
| `waive { authority, acceptedRisk, uncertainty }` | open, deferred | closed, `waived` | `required-obligation` for a required check |
| `revoke-waiver { reason }` | closed, `waived` | open, `waiver-revoked`; repair cleared | `not-waived` |
| `defer { authority, responsible, revisit }` | open | deferred, `deferred` | `required-obligation` for a required check |
| `request-user-decision { authority, conflicts[1..20], options[2..10] }` | open | open, `awaiting-user-decision` | `invalid-command` for repeated option IDs |
| `answer-user-decision { request, option }` | open, pending | open, `user-decision-answered` | `no-pending-user-decision`, `insufficient-authority` (actor not `user`), `unknown-option` |
| `reopen { cause }` | closed, deferred | open, `reopened`; repair cleared | `invalid-transition` from open, `waived` for a waived CheckFinding |
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
decisions, standing and verification rule; a group never closes a member,
with one exception (iteration 4b): a `same-issue` relation whose canonical is
waived also emits, as the harness actor, a `waive` on each newly joined open
member with authority `{ kind: 'governing-record', ref: <the canonical's
waiver decision> }`, so a re-raise of a waived issue settles. A required
check is never joined that way; its `waive` refusal stands. As implemented:
a newly joined member is one of the resulting group that was not in the
canonical's group before the relation; the relation itself is always
accepted, and a member that is a required check or awaits a user's answer
stays open. The waiver's source and evidence are the relation's, its
`acceptedRisk` the member's current risk, its `uncertainty` the canonical
waiver's, and it comes after the `check-finding-related` event in the same
decision, with the next decision ID.

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
| `list` | `owner` (null = all), `module` (null = all; iteration 4b), `select: attention \| all`, `standings` (with `all`), `due` (IDs), `order: id \| attention` (iteration 4b), `after` (cursor), `limit` | limit 1–100, default 50; `due` at most 500; an unknown due ID is `unknown-check-finding` |
| `detail` | `checkFinding` | the latest 200 reports and decisions, with totals |

`attention` is every open CheckFinding of the owner and each deferred one
named in `due`, marked `open` or `due`. Pages are ordered by ID, or with
`order: attention` by risk (high first), then credibility (§1.4 rule 7,
`objective-reproduced` first), then the latest report ID descending, then
ID; `next` is the last shown ID when more remain. `order` defaults to `id`.
`after` is a position in the order: with `order: attention` it must name an
existing CheckFinding (else `unknown-check-finding`), and the page continues
after that CheckFinding's current place even when it has left the
selection. `module` selects the CheckFindings whose modules include it. `counts` covers every
CheckFinding of the owner, and of the module when one is given (total, per
standing, per reason) whatever the page selects. A summary carries ID,
revision, owner, standing, reason, `awaiting` (`assessment`, `repair`,
`witness`, `user-decision`; null unless open), `attention`, verification,
producers, title (first observation summary), risk, credibility, modules,
latest source, report and decision counts, group, pending user decision,
repair, and the latest material choice since the last reopening. A detail
adds the bounded histories and every current relation naming it.

## 2. Ledger composition (iteration 2, implemented)

**Owner:** harness `run/log.ts` and the integration folder
[`src/check-findings/`](../../../subs/harness/src/check-findings/)
(`records.ts`, `report.ts`, `state.ts`, `transition.ts`). CheckFinding state
is replayed only from the run log.

### 2.1 Carrier events

Child events are carried, in order, in a `checkFindings` array of the run
event that commits them, so each application transition is one ledger line:

```ts
const checkFindingEventsField = z.array(checkFindingEventSchema).max(100);
```

| Run event | Carries | Introduced by |
| --- | --- | --- |
| `check-findings-recorded` (new) | `{ cause, checkFindings: min(1) }` for every path without its own event: recovery, user answers, a factual promotion outside a gate | iteration 2 |
| `review-attempt-finished` (new) | review concerns promoted with the terminal attempt | iteration 3, implemented |
| `reconciliation-assessed` (new) | the architect's relations and dispositions | iteration 5 |
| `iteration-closed` (existing, optional field) | `claim-repair` for each CheckFinding whose repair intent the accepted iteration resolves | iteration 5 |
| `gate-attempted` (existing, optional field) | factual promotion and `fix-by-check` from that gate | iteration 6, implemented (§7.1) |

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
| Report | `check-findings/<cf>/reports/<cfr>.json` | `ramify-agent.check-finding-report/1` (body: report plus `checkFinding` and `revision`) | `cfr`, 1 |
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

### 2.4 The implemented interface

`RunLog.next` and `RunLog.append` refuse an input whose `checkFindings` is
non-empty; only the transition builds a carrier, with `RunLog.carrier`.
`RunLog.open` replays every carried event and refuses a log whose events do
not replay (`CorruptRunLogError` naming the carrier's line), so a run is
never served with a history the child would not accept.

```ts
// src/check-findings/transition.ts
interface CheckFindingTarget { readonly mutex: Mutex; readonly log: RunLog }       // the service's Run is one
type CheckFindingBuild = (basis: { log: RunLog; state: CheckFindingState }) =>
  | { commands: readonly CheckFindingCommand[]; compose: (decided: CheckFindingDecided) => { event: CheckFindingCarrierInput; records?: CommitRecord[] } }
  | { stale: string };
interface CheckFindingDecided { events: CheckFindingEvent[]; outcomes: { touched: CheckFindingId[]; replayed: boolean }[] } // one outcome per command
function commitCheckFindingChange(target, build, at?): Promise<
  | { kind: 'committed'; event: RunEvent; decided }
  | { kind: 'replayed'; decided }
  | { kind: 'refused'; refusal: { reason: 'run-ended' | 'stale-basis' | 'check-finding' | 'partial-replay' | 'too-many-events' | 'too-large'; message; command?; rejection? } }>;
function decideCheckFindingTransaction(log, build, at?): /* the same, without appending; for a caller that already holds the mutex, such as a ledger effect's completion */;

// src/check-findings/report.ts
type BoundReport = Omit<CheckFindingReportInput, 'contentHash'>;
function checkFindingContentHash(report): string;   // §1.4 rule 2
function reportCommand(report: BoundReport): { type: 'report'; report: CheckFindingReportInput };

// src/check-findings/state.ts
function checkFindingStateOf(ledger): CheckFindingState;          // replayed once per process, then advanced line by line
function replayCheckFindingState(entries): CheckFindingState;     // from the empty state

// RunService
recordCheckFindings(planId, runId, { cause, commands }): Promise<CheckFindingCommit | undefined>; // a check-findings-recorded line
checkFindings(planId, runId, query): CheckFindingSelection | undefined;                          // the child's selection
```

Rules the transition adds to §2.3:

- `build` runs under the mutex, reads only the log and the state, and
  returns `stale` when what the slow work captured no longer holds. It never
  performs slow work.
- Commands are decided in order, each against the state the earlier ones
  leave; the first refusal refuses the transition (`check-finding` with the
  0-based `command` and the child's rejection).
- When every command is an exact report replay the result is `replayed` and
  nothing is appended. When only some are, the transition is refused as
  `partial-replay`: one line never commits half of an earlier one.
- A report is idempotent by its ingestion key. A decision is not: a
  redelivered decision meets `stale-revision`, because it names the revision
  it was decided at. A carrier that must be idempotent by a key of its own,
  such as a review attempt or a reconciliation, checks the log for that key
  in `build`.
- `compose` must carry exactly the decided events; the transition adds a
  record copy of each after the carrier's own records. More than 100 events
  are refused as `too-many-events`; a line over the ledger's 8 MiB bound is
  refused as `too-large` before any byte is written.

## 3. Review requests and attempts (iterations 3–4)

**Owner:** harness `src/reviews/`. Code review is implemented by iteration 3;
§3.5 records its exact interface and where it refines §3.1–3.4. Scope and
design review, their fork points and the bounded scheduler are implemented
by iteration 4; §3.6 records them.

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
  z.object({ kind: z.literal('session'), session: sessionIdSchema, ref: text }).strict(),   // scope review
  z.object({ kind: z.literal('orientation'), key: sha256Schema }).strict(),                 // design review (iteration 4)
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
    risk: z.enum(['high', 'medium', 'low']),                                        // iteration 4b
    ground: z.object({ path: z.string().min(1), quote: z.string().max(1000).optional() }).strict().nullable(),  // iteration 4b
  }).strict()).max(20),
}).strict();
```

A concern with an empty or unsupported location, or a submission naming
inspected paths outside the candidate diff, is `invalid-output`. A `ground`
path must be a path of the candidate that `snapshot_read` answered during the
attempt, else `invalid-output`; the reviewer names what it actually read, or
null. As implemented (iteration 4b), a refused ground is a validation error
returned to the reviewer like any other, so it can read the file and submit
again; `invalid-output` follows only when the submissions run out. A binary
file, which `snapshot_read` does not answer with content, is no ground. An
empty
`concerns` with `missing` empty is a clean covered scope; with `missing`
non-empty it is `partial`.

### 3.3 Events

| Event | Data | Records |
| --- | --- | --- |
| `review-request-recorded` | `{ request, workItem, iteration, kind, gate, candidate }` | request |
| `review-attempt-started` | `{ request, attempt, invocation, session, requestedStart, actualStart }` | none |
| `review-attempt-finished` | `{ request, attempt, result, settles, checkFindings }` | attempt, submission (when valid), CheckFinding copies |
| `review-orientation-recorded` (iteration 4) | `{ key, request, invocation, session, outcome: oriented \| failed }` | orientation |

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
| `judgment` | actor `{ kind: 'agent', role: 'reviewer', invocation }`; consequence, rationale, uncertainty, remedy; `risk` and `ground` from the concern, `ground.hash` the candidate's blob hash of the path (iteration 4b) |
| `suggests` | the concern's hint, dropped when it names no CheckFinding of the same owner |
| `credibility` | harness classification of the ground path (iteration 4b): `human-reviewed` for a path matching `**/*.principles.md`, a document of the run's plan directory, a feature file the harness wrote or an approved requirement record; `agent-generated` for any other path; `ungrounded` for null. The classifier is one function with these four rules; it is not a registry. |
| `modules` | `ownerOf` (`kpi/lines.ts`) for each location against the candidate's module index at `request.tree`, deduplicated; the work item's module when no location falls inside a module; empty only for a run-level owner (iteration 4b) |

§3.7 records how iteration 4b implements the last three rows.

### 3.5 The implemented code review (iteration 3)

**Files:** `src/reviews/records.ts` (schemas, IDs, layout, event data),
`state.ts` (requests and attempts replayed from the log, coverage),
`scheduler.ts` (the bounded reader queue), `snapshot.ts` (candidate
snapshot and its four tools), `submission.ts` (the submission's rules),
`message.ts` (the reviewer's first message); the prompt package
`reviewer/1` (`prompts/reviewer.system.md`, `code-review.procedure.md`); the
run service's review section; the evidence child's `CandidateSource`.

Refinements of §3.1–3.4:

- **Records** carry their `schema` literal; the submission record adds
  `attempt`. The registry keys are `reviewRequest`, `reviewAttempt` and
  `reviewSubmission`. `reviewKindSchema`, `reviewPolicyVersion` and
  `reviewPolicySchema` live in `run/records.ts`, beside the run policy that
  captures them.
- **`review-attempt-started`** is `{ request, attempt, invocation, session,
  requestedStart }`. The executor's actual start is known only after the
  session starts, so the terminal attempt record carries `actualStart`.
- **`review-attempt-finished`** is `{ request, attempt, result: complete |
  partial | not-verified, reason: notVerifiedReason | null, settles,
  checkFindings }`; the attempt record holds the full result.
- **Eligibility.** A request is owed for every `iteration-closed` with
  outcome `accepted`, a gate and a commit, whose iteration was licensed by
  `iteration-assigned`. Contract iterations (`contract-requested`) are not
  reviewed in v1. One request per kind in the captured policy's `kinds`;
  `base` is the accepted boundary before the gate, `tree` is Git's tree of
  the audited commit, `assignment` the assignment record's path.
- **Reader.** Role `reviewer`, a fresh session, no built-in tool, a working
  directory of its own under the attempt, and four harness tools:
  `snapshot_list`, `snapshot_read`, `snapshot_search`, `snapshot_diff`.
  They answer the audited commit from Git's objects only and refuse an
  absolute path, a path out of the candidate, `.git`, a generated view
  (`.ramify-architect`, `.ramify`), a symbolic link anywhere on the path and
  a submodule. The invocation's absolute bound is `min(invocationAbsoluteMs,
  attemptMs)`. A reader holds no writer; a run-wide bound refuses it without
  failing the run; a session of it that does not become idle blocks no
  writer.
- **Submission rules** beyond the schema: at most `maxConcerns` concerns;
  every changed path of the diff named exactly once, as inspected or as
  missing; a path named inspected must have been answered by
  `snapshot_read` or `snapshot_diff` during the attempt; a concern location
  is a file of the candidate or a path the diff deleted, with `endLine ≥
  startLine`.
- **Results.** Submitted: `complete` with no missing path, else `partial`.
  Every submission rejected up to the bound, or an end without one:
  `invalid-output`. Idle or attempt bound: `timed-out`. A failed session or
  a context budget reached: `execution-failed`. An unreadable candidate, no
  reviewer package, a kind this harness cannot review yet, or a run-wide
  bound: `unavailable`. A reader stopped by the run: `stopped`, or
  `deadline` at the settlement bound. Invalid output, timed-out and
  execution failure are retried while `retries` remain and the run accepts
  attempts; every other result settles its request.
- **Commit and fence.** One `commitCheckFindingChange` per terminal
  attempt: `build` refuses (stale) a request already settled and an attempt
  already finished; the commands are one `report` per concern bound per
  §3.4, with the evidence hash `sha256:` over the canonical JSON of the
  submission record. A refused concern set is recommitted as
  `invalid-output` without concerns; `run-ended` and `stale-basis` are the
  fence, and append nothing.
- **Lifecycle.** The queue starts at most `concurrency` attempts and
  finishes waiting requests beyond `queue` as `queue-overflow`. Before the
  final gate the run waits at most `settleMs` for its reviews, then stops
  every reader and finishes what remains as `deadline`. A stop, and a
  failure, stop every reader (and the writer, for a stop), wait the stop
  bound, and finish every unsettled request as `stopped` before the
  terminal event. A closing service records nothing. Recovery records every
  request owed and finishes each unsettled one: `execution-failed` for an
  attempt whose reader was running, `stopped` for one never started; the
  recovered run is interrupted and runs nothing more.
- **Query.** `RunService.reviews(planId, runId, workItem?)` answers the
  requests from the log and the coverage `{ state: available, requested,
  complete, partial, notVerified, pending }`, or `{ state: unavailable,
  reason: no-review-policy }` for a run whose policy has no `reviews`.
- **Gate mutex.** The ledger's `EffectSpec` gains `serialize`, the caller's
  own serialization held while the intent is built and appended and while
  the completion is, and not while `perform` runs; `intent` may be built
  under it. The gate's commit-and-audit effect uses the run mutex so, and a
  terminal event waits for the effect in flight.

### 3.6 Scope, design and the bounded scheduler (iteration 4)

**Files:** `src/reviews/inputs.ts` (plan excerpts, guidance selection,
orientation key), `message.ts` (one message per question and the
orientation's), `records.ts` (the orientation record and event, the
`orientation` fork point), `scheduler.ts` (deadlines), `submission.ts`
(the orientation's submission); the prompt package `reviewer/2`
(`reviewer.system.md`, `reviewer-orientation.system.md` and the code, scope
and design procedures); `jobs/mutex.ts` (`PriorityMutex`); the run
service's review section; the pi adapter's fork.

- **Inputs by question.** Code: `requirements: []`, `guidance: []`,
  `forkPoint: none`. Scope: `requirements` are the sections of the captured
  plan the assignment's `requirementRefs` cite, as `{ ref: plan#<anchor> |
  plan:<from>-<to>, hash }` with the SHA-256 of the excerpt's text;
  `forkPoint` is `session` from `iteration-assigned.architectRef`, or
  `unavailable` with the reason when it is null or absent. Design:
  `guidance` is read from the audited candidate itself: every
  `*.principles.md`, then the `README.md` of each directory on the way to a
  changed path, at most 12 files, 64 KiB each and 192 KiB together, each
  with the SHA-256 of its bytes; `forkPoint` is `orientation` with its key,
  or `unavailable` when the candidate holds no guidance or it cannot be
  read, and such a design request finishes `unavailable` without a reader.
- **Orientation key** = SHA-256 over the canonical JSON of the question
  (`design`), the guidance refs and hashes, the reviewer package's hash, the
  run's agent, the model and the reviewer's context policy. Any change is
  another orientation, never a reuse.
- **Orientation.** The first design attempt of a key runs one reviewer
  invocation with the guidance inline, no tool but `submit_orientation`
  (`{ read: [every guidance path once], summary }`), kept on success.
  `review-orientation-recorded` commits `reviews/orientations/<key16>.json`
  (`ramify-agent.review-orientation/1`: key, guidance, request, invocation,
  session, the executor's `ref` at its end, outcome, summary, reason). A
  failed orientation is recorded too and never made again in the run; the
  attempts of its key start fresh with the reason. Two attempts of one key
  share one orientation in flight.
- **Starts.** Scope forks `{ mode: fork, from: forkPoint.ref }` with the
  fork relation `{ from: { session, invocation: <the assignment's
  invocation> }, reason: scope-review, briefs }`; design forks the
  orientation's ref with `reason: design-orientation`. The fork relation's
  `generation` is now optional: only a fork of the architect context (a
  placement request) names one. A missing or unusable point starts fresh
  with the caller's degradation on the invocation record (`requested:
  fork`, `degradedReason`); a fork the executor cannot take is its own
  degradation on `invocation-ended`. `requestedStart` is `fork` for every
  request whose fork point is not `none`, and the attempt's `actualStart` is
  what the executor answered. The message is the question's complete input
  in either case: the design message names each guidance path and hash and
  asks a reviewer that has not read one to read it through the snapshot.
- **Deadline.** A request's deadline is its work item's first
  `outline-revised` carrying `architectRef` after the request was recorded,
  plus `settleMs`, or the run's own settlement deadline once the final
  settlement began, whichever is earlier. A waiting request, first attempt
  or retry, with `now + attemptMs > deadline` is finished at once as
  `no-time-before-deadline`, whether or not a slot is free; the queue wakes
  at the completion request and when a waiting request's last moment to
  start passes.
- **Order and priority.** Waiting requests start in the order they were
  recorded, whatever their work item or question; beyond the queue's bound
  the newest overflow. Invocation starts use a `PriorityMutex`: a waiting
  writer's start goes before every waiting reader's.
- **pi fork.** The adapter opens the parent for a fork with the fork's own
  working directory, so the fork's session file names the reviewer's
  directory rather than its parent's. Isolation is the fork's tool set:
  pi offers exactly the spec's tools, and the fork still holds whatever its
  parent read before the point.

### 3.7 Concern signals (iteration 4b, implemented)

**Files:** `src/reviews/records.ts` (`reviewGroundSchema`, the concern's
`risk` and `ground`), `snapshot.ts` (`SnapshotTools.read()`: every file
`snapshot_read` answered, with the `sha256:` of its content),
`submission.ts` (the ground rule), `signals.ts` (`groundCredibility`,
`candidateModuleIndex`, `concernModules`), `message.ts` (the scope question
names the plan document when the candidate holds it); the run service's
`concernBindings`; the prompt package `reviewer/3`.

- **Ground.** `ref` is the resolved candidate path, `hash` the `sha256:` of
  the content `snapshot_read` answered for it in the attempt. `quote` stays
  in the submission record only.
- **Credibility.** `groundCredibility(path, { planId, featureFiles })`:
  `human-reviewed` for a basename ending `.principles.md`, a path under
  `plans/<planId>/` outside its `.harness/`, or a path among the tracked
  scenario records' `file`s; `agent-generated` otherwise; `ungrounded` for
  null. The approved-requirement rule has nothing to match: the run's
  records live in its gitignored state directory, which no audited
  candidate holds, so no ground a reviewer read can name one.
- **Modules.** `candidateModuleIndex` reads the candidate's own
  `module.ramify` files from Git's objects: the root's, then recursively each
  `<dir>/subs/<name>/module.ramify` of a module, named by declared-name path
  (`root/child/…`, as the architect view names them), each owning its `src/`,
  `module.ramify` and `README.md`. A declaration anywhere else declares
  nothing. `concernModules` applies `ownerOf` to each location, keeping
  location order, else the work item's module from the committed work-item
  record. A candidate whose declarations cannot be read leaves only that
  fallback, with a warning.
- **Sequencing.** The bindings are read after the reviewer's invocation and
  before the transition takes the run mutex; `build` only maps them.

## 4. Policy (iterations 3–5)

The run policy becomes `run-policy/3`; `run-policy/2` runs remain readable.

```ts
limits: { …existing, reconciliationRoundsPerWorkItem: z.int().positive().optional(),
  laterRoundMinimumRisk: z.enum(['medium', 'high']).optional() },   // iteration 5: the correction floor after round 1
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
| `kinds` | `code`, `scope`, `design` (iteration 4; iteration 3 captured `code` alone) |
| `concurrency` (readers beside the one writer) | 2 |
| `queue` | 12 |
| `retries` after an execution or validation failure | 1 |
| `attemptMs` | 600 000 |
| `settleMs` from the completion request | 900 000 |
| `maxConcerns` per submission | 20 |
| `reconciliationRoundsPerWorkItem` | 3 |
| `laterRoundMinimumRisk` | `medium` |

A policy without `reviews` means the run records no requests: every review
and CheckFinding coverage view answers `unavailable`, never clean.

Iteration 3 implements `run-policy/3` as above (`defaultReviewPolicy`,
`reconciliationRoundsPerWorkItem: 3`). The role union gains `reviewer`, and
the policy's `context` becomes an object of the five earlier roles with an
optional `reviewer`, so a `run-policy/2` record still reads and still
requires every role it could invoke. Overflow
finishes the attempt as `queue-overflow`; an attempt or retry that cannot
finish before its work item's deadline finishes at once as
`no-time-before-deadline`. The writer has scheduling priority.

## 5. Fork points (iteration 4, implemented)

`iteration-assigned` and `outline-revised` gain an optional
`architectRef: z.object({ session: sessionIdSchema, ref: text }).strict().nullable()`
(`architectRefSchema` in `run/records.ts`). On `outline-revised` it is
present exactly on the revision that commits a `request-completion`
submission; a revision committed with an assignment has none, and that
presence is what starts the work item's review deadline (§3.6). The ref
is the one the executor reported at the end of the local architect's
invocation, where the harness kept the session.
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
  checkFindings: z.array(checkFindingAtSchema),    // the complete attention set, all pages, in attention order
  due: z.array(checkFindingIdSchema),
  applied: z.int().nonnegative(),                  // CheckFinding state version at capture
  forkPoint: forkPointSchema,
  floor: z.enum(['any', 'non-low', 'none']),       // what a correction may be planned for this round
}).strict();
```

The floor is `any` in round 1, `non-low` (a risk at least
`laterRoundMinimumRisk`) in later rounds, and `none` in the last round. The
packet states it, and orders the signals by risk, credibility and recency.

Events: `reconciliation-started { workItem, reconciliation, round }` with the
basis; `reconciliation-assessed { workItem, reconciliation, invocation, next:
'complete' | 'correct' | 'await-user' | 'unresolved', checkFindings }` with the assessment;
the brief append is a ledger effect keyed `brief:<reconciliation>` whose
completion is `reconciliation-brief-appended { reconciliation, session, ref,
outcome }`. An empty attention set with every request settled appends no
`reconciliation-started` and calls no agent; the work-item gate follows.

The harness maps the architect's submission to one `assess` command: actor
`{ kind: 'agent', role: 'local-architect', invocation }`, source
`{ kind: 'tree', id: basis.source.tree }`, authority
`{ kind: 'work-item-assessment', ref: <reconciliation> }`, and a correction
as `plan-repair` with `{ kind: 'intent', ref: <reconciliation> }`. Before
the child decides, the harness refuses the submission as a whole for a
`plan-repair` below the basis floor (`correction-floor`, naming the
CheckFinding and its risk) and for a `waive` on a CheckFinding whose
`modules` are not all the work item's module or its included children
(`insufficient-authority`, naming the modules); a refused submission is
returned to the fork once, then the attempt fails as invalid output. The next
`iteration-assigned` for that work item resolves the intent; recovery creates
it from the recorded assessment when absent. When the correction iteration
closes accepted, `iteration-closed` carries `claim-repair` for each
CheckFinding planned under that intent, with `candidate` its audited tree and
`change` the iteration ID.

Validation under the mutex, both at `reconciliation-assessed` and before
`work-item-completed`: the audited source is the basis source (or its
recorded scenario-rendering lineage with verified expected bytes), every
basis request is settled with the named attempt, and every basis CheckFinding
is still at its captured revision. A mismatch refuses the assessment or the
completion and starts a new round when one remains. A CheckFinding of the
owner that became open or due after the basis starts a new round when one
remains and its risk clears the next round's floor; otherwise it stays open
and completion proceeds. `work-item-completed` gains
`unresolved: [{ checkFinding, reason }]` with reason `rounds-exhausted`
(open at the last round's assessment), `below-floor` (open, not correctable
in its round, and neither waived nor deferred) or `raised-after-last-round`
(opened after the last basis). The projection marks an unresolved
CheckFinding with that reason, and one of non-low risk with reason
`raised-after-last-round` as surfaced by the latest review.

### 6.1 The implemented reconciliation (iteration 5)

**Files:** `src/reviews/reconciliation.ts` (IDs, layout, basis and
assessment records, the fork's submission, its validation and binding,
floors, the brief and the basis comparison), `reconciliation-message.ts`
(the packet), the prompt `reconciliation.procedure.md` in the
`local-architect/3` package, `reviews/scheduler.ts` (`changed()`), and the
run service's reconciliation section.

Refinements of §6:

- **Submission** `reconciliationSubmissionSchema`: `relations[]` (`from`,
  `to`, `relation`, `shared`, `evidence` references, `rationale`),
  `dispositions[]` (`checkFinding`, `rationale`, `communication`, optional
  `risk` correction, `action`: `repair`, `fixed { reassessed }`,
  `supersede { reassessed, replacement }`, `waive { acceptedRisk?,
  uncertainty }`, `defer { revisit }`, `request-user-decision { conflicts[{
  document, text }], options }`, `leave`), `next` (`complete`, `correct {
  goal }`, `await-user`, `unresolved`) and `brief`. `leave` records no
  decision: it is allowed only below the round's floor, and the signal stays
  open. `next` must follow the dispositions: a user decision, else a repair,
  else a signal left open, else `complete`. `acceptedRisk` defaults to the
  signal's current risk. A conflict's `revision` is the harness's: the
  captured plan's `sha256:` for `plan`, else the basis commit for a file of
  it; its text must occur verbatim in the document.
- **Refusals before the child** are returned as validation errors with the
  codes in their message (`correction-floor`, `insufficient-authority`),
  with every other rule; the invocation's ordinary rejection bound
  (`rejectedSubmissionsPerTurn`) applies, then the round is refused.
- **Round start.** Round 1 starts for any signal. A later round starts only
  when a signal of at least `laterRoundMinimumRisk` needs a disposition, or
  a claimed repair or a user's answer awaits assessment. No round starts once
  `reconciliationRoundsPerWorkItem` are spent. The floor is `none` in the last
  round, which wins over `any` when there is one round.
- **Due deferrals.** This version evaluates no revisit condition: `due` is
  always `[]`, and a deferred signal is visible history only.
- **Events.** `reconciliation-refused { workItem, reconciliation | null,
  stage: assessment | completion, reason }` is added: a basis refused at the
  commit of an assessment, a fork that ended without one, or a completion
  refused before `work-item-completed`. `reconciliation-brief-appended`
  carries `session` and `ref` (null where none), `outcome: appended |
  already-present | session-lost | failed | no-session` and `reason`.
  `iteration-assigned` gains optional `corrects` (the reconciliation whose
  intent it resolves); `iteration-closed` carries the claims.
  `work-item-completed.unresolved` is `[{ checkFinding, reason }]`, absent
  when empty.
- **Completion validation.** A changed audited source (other than the
  expected rendering of tracked feature files, byte for byte) or request set
  always refuses the completion; a basis signal at another revision, or a
  new open signal, refuses it only when a round remains and the signals then
  warrant one. After at most `reconciliationRoundsPerWorkItem` refusals of one
  completion request the run fails as `repair-exhausted`.
- **Unresolved reasons.** An open signal at completion is
  `raised-after-last-round` when the latest round's basis did not hold it,
  else `rounds-exhausted` when that round was the last, else `below-floor`.
- **Brief.** The fork's brief follows the harness's list of recorded
  decision and relation IDs and the signals left open. The append's
  completion moves the executor's point of the architect's session, not a
  harness point, as the engineer's continuation note does; the next
  continuation lists the reconciliation among its `briefs`. A brief that did
  not land is quoted in the next architect input from the committed
  assessment record.
- **Fork.** Reason `reconciliation`; continue reason `reconciliation` for
  the architect's turn that assigns a correction.

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

### 7.1 The implemented scenario witness (iteration 6)

**Files:** `src/checks/scenario-findings.ts` (observations, promotion,
witnesses, classification, the line's notes), the run service's
`scenarioGateFindings` and `gateAttempted` (the gate effect's `perform` and
`complete`), and the scenarios child's reducer (`unfinished`).

**Supported producer shape.** A committing gate attempt with a work item
(`iteration`, `contract`, `breaking-iteration` and `work-item` checkpoints)
whose `scenarios` command carries a summary of an executing (not dry) run.
Each tracked scenario it observed is one observation: every result in the
summary, and every scenario an `identity` selection named with no result.

| Observation | Coverage | Outcome |
| --- | --- | --- |
| result `passed`, stream holds it whole | `complete` | `passed` |
| result `failed`, `undefined`, `pending` or `ambiguous`, whole | `complete` | `failed` |
| result `skipped` (no step ran an assertion) | `partial` | `inconclusive` |
| result with `unfinished` (a pickle never started or a step has no result) | `partial` | `failed` when a finished step failed, else `inconclusive` |
| named by an identity selection, no result (a timed-out or unlaunched run, a missing stream, a scenario the run did not execute) | `not-run` | `inconclusive` |

A scenario of an `all` or `all-untagged` run with no result is not observed:
nothing says it was selected. The reducer's result gains optional
`unfinished: { pickles, steps, observed }`, present only when the stream
does not hold the scenario whole; `observed` is the worst status of the
steps that finished.

**Selection and breadth.** `selection` is `<mode>/<run module>@<first 16 hex
of the SHA-256 of the canonical JSON of the mode's command argv>`: the
conditions the scenario itself ran under. The support files, setup and
teardown are the run's captured configuration, the same for every gate of
the run. What else the run selected is the observation's breadth (the
module run's identity list, `all-untagged` or `all`); a witness whose run is
not at least as broad as the run that observed the CheckFinding's latest
failure is offered with coverage `partial`, so the child refuses it as
`insufficient-coverage` (a narrower selection). An identity run covers
another identity run that selected a subset, `all-untagged` covers any
identity run, `all` covers everything.

**Promotion.** In a gate whose verdict is not `passed`, a failed
observation is promoted only when the owner's CheckFinding for
`scenario:<id>` exists (the report attaches, and after a `fix-by-check`
reopens it), or an earlier committed gate attempt of the same work item
observed the same scenario failed; then the line reports the latest nine
earlier failures and the current one, oldest first. A first failure, an
inconclusive observation and the project's own scenarios are never
promoted. Each report binds: `producer` `check:scenario`; `attempt` the
gate; `reportKey` and `issueKey` `scenario:<id>`; `owner` the gate's work
item; `source` the tree of that gate's audited commit; `verification`
`{ kind: 'check', producer, obligation: { subject: 'scenario:<id>',
revision: 1 }, selection, required: true }`; `observation` `check-failed`
with a one-line summary, the gate record and the run's message stream as
evidence and the feature file and line as its location; `judgment` null
(so the child proposes `high`); `credibility` `objective`; `modules` the
scenario's owner module.

**Witness.** In a gate whose verdict is `passed`, for each open scenario
CheckFinding of the work item whose scenario the gate observed: the adapter
attests the obligation `{ scenario:<id>, 1 }` only when the result names the
feature file the record names and the attempt's guarded comparison reported
no change to it; otherwise it notes `obligation-changed` itself. The
witness names the gate as its attempt, the observation's selection,
coverage and outcome, and `source` and `candidate` the audited tree. The
decision's actor is `harness`. The child then refuses a changed or revised
obligation, another mode or module run (`incomparable-inputs`), the tree of
the latest failure (`failure-source`), `not-run`, `partial` and a result
that did not pass. An unobserved scenario is never offered.

**Classification.** `classifyScenarioAttempts(outcomes)` over the attempts
of one scenario on one tree: `intermittent` (provisional) for at least one
failure and two complete passes, `reproduced` for two failures and no pass,
else `inconclusive`. A witness refused as `failure-source` carries the
classification of the attempts on that tree; it never fixes a CheckFinding
and never passes a gate.

**The gate's line.** `gate-attempted` gains two optional fields:
`checkFindings` (the carrier array) and `scenarioFindings: { refused:
{ reason: 'source-unavailable' | 'transition-refused', message } | null,
notes: [{ scenario, checkFinding | null, step: 'promotion' | 'witness',
code, classification? }] }`, present only when there is something to say.
A note's `code` is the child's rejection code, or `event-bound` (the line
already carries 100 events) or `source-unavailable` (a failure's tree was
not read). `perform` reads the tracked scenarios, every earlier gate
attempt of the work item and the trees a promotion or witness needs through
the candidate source, outside the mutex, and reads no tree when the gate has
nothing to promote or witness; `complete` plans against the state under
the mutex, deciding every command in order, and commits with
`decideCheckFindingTransaction`. A tree that cannot be read, or a refused
transition, commits the attempt with `scenarioFindings.refused` and a
warning. The verdict and `next` are the attempt's own and are decided
before any of this.

**Unpromoted.** First failures of a work item, inconclusive observations
(timeouts, launch errors, missing streams, cut-short results that observed
no failure), dry runs, the project's own scenarios (counted on the attempt),
readiness and final gates, a gate whose scenario check had nothing to
select, and every other command of a gate (tests, type check, Ramify check, harness
rules, guarded changes) stay on their gate attempts.

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
    'reopened', 'waiver-revoked', 'obligation-revised', 'deferred', 'fixed-by-check', 'fixed-by-assessment', 'superseded', 'waived']),
  awaiting: z.enum(['assessment', 'repair', 'witness', 'user-decision']).nullable(),
  verification: z.enum(['assessment', 'check']), required: z.boolean(),
  risk: z.enum(['high', 'medium', 'low']),
  credibility: z.enum(['objective-reproduced', 'objective', 'human-reviewed', 'agent-generated', 'ungrounded']),
  modules: z.array(z.string()),
  unresolved: z.enum(['rounds-exhausted', 'below-floor', 'raised-after-last-round']).nullable(),
  waiver: z.object({ by: z.string(), reason: z.string(), acceptedRisk: z.string() }).strict().nullable(),
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
  counts: z.object({ open: z.int().nonnegative(), deferred: z.int().nonnegative(), closed: z.int().nonnegative(),
    unresolved: z.int().nonnegative() }).strict(),
  items: z.array(checkFindingSummarySchema).max(checkFindingWireLimits.maxLimit),
}).strict();

// One row per module with at least one CheckFinding; a CheckFinding of two modules counts in both,
// so the rows do not sum to the run's counts.
export const checkFindingModuleCountsSchema = z.object({
  protocol: z.literal(checkFindingProtocolVersion),
  runId: runIdSchema, version: z.int().nonnegative(),
  coverage: reviewCoverageSchema,
  modules: z.array(z.object({ module: z.string(), open: z.int().nonnegative(), deferred: z.int().nonnegative(),
    unresolved: z.int().nonnegative(), highestOpenRisk: z.enum(['high', 'medium', 'low']).nullable(),
    pendingUserDecisions: z.int().nonnegative() }).strict()),
}).strict();

const userCheckFindingCommand = (type: string) => z.object({
  commandId: commandIdSchema,
  expectedVersion: jobVersionSchema,
  type: z.literal(type),
  payload: z.object({
    planId: planIdSchema, jobId: jobIdSchema,
    checkFinding: z.string().regex(/^cf-\d{4,}$/),
    expectedRevision: z.int().positive(),
    reason: z.string().min(1).max(4000),
    responder: z.string().min(1).max(200),
  }).strict(),
}).strict();
export const waiveCheckFindingCommandSchema = userCheckFindingCommand('waive-check-finding');
export const revokeCheckFindingWaiverCommandSchema = userCheckFindingCommand('revoke-check-finding-waiver');

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
`GET …/runs/:runId/check-findings?version=&workItem=&module=&select=attention|all&order=id|attention&after=&limit=`,
`GET …/runs/:runId/check-findings/modules?version=`,
`GET …/runs/:runId/check-findings/:checkFinding?version=`,
`GET …/runs/:runId/reviews?version=&workItem=`; the commands go to
`POST /api/v1/commands`. A stale `version` is the existing `stale-version`
409 with `currentVersion`. A stale `expectedRevision` or a request that is no
longer pending is a refused command naming the CheckFinding's current
revision. A user waive maps to `waive` with actor `{ kind: 'user', name:
responder }` and authority `{ kind: 'user-decision', ref: commandId }`,
acceptedRisk the CheckFinding's current risk; a user revocation maps to
`revoke-waiver`. A waive of a required check is refused by the child; a
waive of a CheckFinding with a pending user decision also answers nothing and
is refused as `awaiting-user-decision`. No other CheckFinding command
exists; there is no generic mark-resolved.

### 8.1 The implemented wire (iteration 7)

The exact Zod is
[`interfaces/protocol/check-findings.ts`](../../../subs/harness/src/interfaces/protocol/check-findings.ts),
exposed `tagged [browser]` and re-exposed by the root with every name it
exports; the projections are `src/projections/check-findings.ts`, the
command mapping and authority rules `src/check-findings/user-commands.ts`.
It keeps §8's shape, with these decisions:

| Part | As implemented |
| --- | --- |
| Paths | `protocolPaths.runCheckFindings(planId, runId, { version?, workItem?, module?, select?, order?, after?, limit? })`, `runCheckFindingModules(planId, runId, version?)`, `runCheckFinding(planId, runId, id, version?)`, `runReviews(planId, runId, { version?, workItem?, after?, limit? })`; the query type `CheckFindingPathQuery` is exported from `paths.ts`. `version` is optional; given and not the run's, the answer is `stale-version` 409 with `currentVersion` (`ProjectionError` gained that code). Limits 1–100, default 50; an unknown `select`, `order`, `after` or a malformed count is `invalid-request`; a detail ID that is no CheckFinding is `not-found`. |
| Select | `attention` (open), `reported` (open, and settled ones whose latest decision since the last reopening was reported as a material choice) and `all`. The wire default is `attention`; the web asks for `reported` by default and `all` behind its toggle. The page cursor is a position in the order, as the child's. |
| List | Adds `query { workItem, module, select, order }`. `counts` is `{ total, open, deferred, closed, fixed, waived, superseded, unresolved, awaitingUser }` over every CheckFinding of the owner and module, whatever the page shows. `coverage` is the work item's when one is named, else the run's. |
| Summary | §8's fields, with `obligation` (`<subject>@<revision>` for a check), `latestReview`, `userCommands` (`respond`, `waive`, `revoke`: what the harness would accept from a person now; none once the run has ended), a structured `pendingUserDecision { request, by, rationale, conflicts, options }` instead of its ID, and `settlement` in place of `waiver`: a union of `fixed-by-check` (with the witness), `fixed-by-assessment`, `superseded`, `waived` (actor, reason, accepted risk, uncertainty) and `deferred` (reason, revisit), null while open. Actors are `{ kind: agent, role, invocation } \| { kind: user, name } \| { kind: harness, reason }`. |
| Unresolved | The reason `work-item-completed` named for an open signal of that work item; an open signal of a completed work item that it did not name, opened or reopened afterwards, is `raised-after-last-round`. `latestReview` marks an unresolved signal of non-low risk that is `raised-after-last-round` or whose first report came from a review of its work item's latest reviewed iteration. |
| Detail | The summary, reports and decisions (latest 200 each, with totals) as wire views, the current relations, `attempts` (per report: review attempt and request, iteration, gate, reviewer session and invocation, and the candidate diff `{ base, commit, tree }`; a gate's audited commit for a check) and `repairs` (per `plan-repair` or `claim-repair`: the reconciliation, the correction iteration its `corrects` or `change` names, and that iteration's sessions). |
| Module counts | As §8, rows sorted by module path. |
| Reviews | `reviewListResponseSchema`: `protocol, runId, version, coverage, workItem, total, shown, next, requests`; each request with its base and candidate commit, the settling result or null while pending, and each attempt's state, sessions, requested and actual start, result and reason, inspected, missing and concern counts and CheckFindings. Coverage is `records-unreadable` when a review record the log holds fails its schema. |
| Commands | The three schemas of §8, in `runCommandSchema`. Each is decided in `commitCheckFindingChange`'s `build` under the run mutex: the run's version (rule 3, `stale-version`), then the CheckFinding (`not-found`), its revision (`conflict`, evidence `cf-0001 is at revision N`), a request that is no longer pending (`conflict`) and authority (the user may waive any signal and revoke any waiver; `mayRevoke` needs a rank at least the waiver's actor's). The child command is `dispose` with actor `user { name: responder }`, the latest report's source, rationale the note or reason, evidence `{ kind: user-command, ref: commandId }`, quiet communication: `answer-user-decision`, `waive { authority: { user-decision, commandId }, acceptedRisk: current risk }` or `revoke-waiver`. A child refusal is `conflict`, or `invalid-request` for an unknown option; an ended run is `conflict`. |
| Durable acceptance | The line is `check-findings-recorded` with the new cause `{ kind: 'user-command', command: AcceptedCommand }`; its sequence is the receipt's. Recovery remembers these commands like `stop-requested`, so a retry after a restart returns the original receipt. `user-response` remains for the service's own callers. |

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
| 10 | reconciliation `wi-001.rc01` at `t-03`, round 1, floor `any`, one `assess` | accepted | related `cfl-0001` `cf-0004`→`cf-0003` same-issue; related `cfl-0002` `cf-0002`→`cf-0001` distinct; decided `cf-0001`@2 `cfd-0001` plan-repair (intent `wi-001.rc01`); `cf-0002`@2 `cfd-0002` defer; `cf-0003`@2 `cfd-0003` waive (material choice reported); `cf-0004`@2 `cfd-0004` waive; `cf-0006`@2 `cfd-0005` waive (low risk, agent-generated ground); `cf-0005`@3 `cfd-0006` plan-repair | `reconciliation-assessed` |
| 11 | correction `wi-001.i04` closes accepted on `t-04`: claim for `cf-0001` | accepted | decided `cf-0001`@3 `cfd-0007` claim-repair | `iteration-closed` |
| 12 | same closure: claim for `cf-0005` | accepted | decided `cf-0005`@4 `cfd-0008` claim-repair | same line as 11 |
| 13 | witness of `scenario:sc-005` | `wrong-subject` | none | none |
| 14 | partial run of `sc-004` | `insufficient-coverage` | none | none |
| 15 | `ga-0009` passes `sc-004` completely on `t-04` | accepted | decided `cf-0005`@5 `cfd-0009` fix-by-check | `gate-attempted` |
| 16 | reconciliation `wi-001.rc02`, round 2, floor `non-low`: fresh assessment of `cfr-0001` | accepted | decided `cf-0001`@4 `cfd-0010` fix-by-assessment | `reconciliation-assessed` |
| 17 | same assessment: R2 revision 2 contradicts the waiver | accepted | decided `cf-0003`@3 `cfd-0011` revoke-waiver | same line as 16 |
| 18 | same assessment: the fix would change an approved obligation | accepted | decided `cf-0003`@4 `cfd-0012` request-user-decision (`follow-r2`, `keep-eur`) | same line as 16 |
| 19 | design review `rq-0012.a01` on `t-05`: configuration read in a loop again, `suggests: cf-0006` | accepted | opened `cf-0007`@1 `cfr-0008` | `review-attempt-finished` |
| 20 | reconciliation `wi-001.rc03`, round 3, floor `none`: `cf-0007` is `cf-0006` again | accepted | related `cfl-0003` `cf-0007`→`cf-0006` same-issue; decided `cf-0007`@2 `cfd-0013` waive (harness, governing record `cfd-0005`) | `reconciliation-assessed` |
| 21 | same assessment: a `plan-repair` for `cf-0003` | `correction-floor` (harness, before the child) | none | none |

Final state, 24 events: `cf-0001` closed `fixed-by-assessment` @4;
`cf-0002` deferred @2; `cf-0003` open `awaiting-user-decision` @4 pending
`cfd-0012`; `cf-0004` closed `waived` @2; `cf-0005` closed
`fixed-by-check` @5 with two reports; `cf-0006` closed `waived` @2;
`cf-0007` closed `waived` @2. Groups `{ canonical: cf-0003, members:
[cf-0003, cf-0004] }` and `{ canonical: cf-0006, members: [cf-0006,
cf-0007] }`. With `due: [cf-0002]` the attention set of `wi-001` is
`cf-0003` (open, high) then `cf-0002` (due, low) in attention order; without
it, `cf-0003` alone. After step 20 the work item completes with `cf-0003`
unresolved, reason `rounds-exhausted`. The stream test replays the events
from their JSON lines into identical state and views, and shows that steps
16–18 decided as one `assess` produce the same events. Iterations 1–4
implemented steps 1–18 under the earlier names with `cf-0006` superseded;
iteration 4b renamed them, waived `cf-0006` and added steps 19 and 20. Step
21 is the harness's refusal before the child decides anything (§6), so the
child's fixture holds steps 1–20 and iteration 5's reconciliation tests
own step 21. The fixture's risks are `cf-0001` and `cf-0003` high,
`cf-0004` medium, `cf-0002`, `cf-0006` and `cf-0007` low, and `cf-0005`
high as a required check; with `order: attention` every CheckFinding lists
as `cf-0005`, `cf-0003`, `cf-0001`, `cf-0004`, `cf-0006`, `cf-0007`,
`cf-0002`.

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
        "remedy": "a bounded change in the named file",
        "risk": "high",
        "ground": { "ref": "src/tests/cart.test.ts", "hash": "sha256:00000000000000000000000000000000000000000000000000000000000007d2" }
      },
      "suggests": null,
      "credibility": "agent-generated",
      "modules": ["project/cart"],
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
| judgment `risk` | the reviewer's own proposal; a decision's `risk` is the assessing architect's correction |
| judgment `ground` | the reviewer's own reference, validated as a candidate path it read; the hash is the candidate's |
| `credibility` | the harness's classification of the ground's provenance, §3.4; `objective` for a check producer |
| `modules` | `ownerOf` over the report's locations against the module index at the report's own tree, else the work item's module |
| waive and revoke authority | the harness: a local architect's `modules` must all be its work item's module or included children; the global architect and the user cover every module; a revocation needs a rank at least the waiver actor's, user above global architect above local architect above harness (`mayWaive`, `mayRevoke`, iteration 7) |
| `authority` | the reconciliation being assessed, the answered user request or command, or a named governing record |
| `expectedRevision`, relation revisions | the captured reconciliation basis or the command's expected revision |
| `repair` | the reconciliation intent or the committed assignment ID |
| claim `candidate` and `change` | the accepted correction iteration's audited tree and ID |
| `witness` | only the scenario adapter, from the gate's retained results |
| `due` | the harness's evaluation of each deferral's revisit condition |
| terminal run, mutex, line size | the run log and ledger; the child knows none of them |
