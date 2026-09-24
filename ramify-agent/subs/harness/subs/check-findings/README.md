# check-findings

Maintains issue identity and valid dispositions across check observations and
agent judgments, as pure functions: it decides whether a report is a replay,
a new CheckFinding or another report of an existing one; validates each
decision against the current revision, the verification rule and the trusted
evidence the harness supplies; replays accepted events into state; and
selects bounded lists, details and the set that needs attention at a decision
boundary. It has no I/O and imports only `zod`. It reads no file, calls no
agent, runs no check, touches no Git and serves no HTTP; its caller binds
every reference it passes in and commits the events it returns.

## Why it is separate

Report ingestion, work-item reconciliation, recovery and the projections all
apply the same rules: which reports form one issue, what closes a judgment
and what closes a factual failure, when a later report reopens a decision.
They are decided once, here, and tested over literal input with no run,
ledger or agent. The module receives nothing from the harness. Its contract
file names every type the exposed functions mention, so the parent can name
what it receives. The [architecture](../../../../docs/architecture/check-findings.md)
and the [principles](../../../../docs/check-findings.principles.md) govern
it; the Plan 12 [contract appendix](../../../../docs/plans/12-check-findings/contract-appendix.md)
fixes its schemas, events and worked stream.

## The contract

`src/interfaces/check-findings.ts` holds the Zod schemas and types: opaque
sources, owners, producers, obligations, actors, authorities and evidence;
reports; decisions and their actions; relations; commands; events
(`check-finding-event` version 1); state; rejections; and queries and views
(`check-finding-view/1`). Every ID is allocated from the replayed state:
`cf-0001` for a CheckFinding, `cfr-`, `cfd-` and `cfl-` for its reports,
decisions and relations.

## Identity

A report's ingestion key is its producer, attempt and report key. The same
key with the same `contentHash` is an exact replay, accepted with no events;
with another hash it is `report-key-conflict`. A trusted producer's
`issueKey`, scoped by owner and verification obligation, attaches a later
report to the one CheckFinding that holds it; a key that names more than one
is `ambiguous-issue-key`, never the first match. Without a key a report opens
a new CheckFinding, and a reviewer's `suggests` is only recorded. Prose,
paths and line numbers never form identity.

## Decisions

`decideCheckFindingChange(state, command)` takes `report`, `dispose`,
`relate` or `assess`, which is one assessment's relations and dispositions
accepted together or refused at the first failing position. A disposition
names the revision it considered; any other is `stale-revision`.

- The standing is `open`, `deferred` or `closed`, always with its reason.
  Planning or claiming a repair keeps it open. A pending user decision admits
  only the user's answer.
- An `assessment` CheckFinding closes by a fresh assessment, a superseding
  judgment or an accepted choice. A `check` CheckFinding closes only by a
  witness of the same producer, subject, obligation revision and selection,
  run completely and passing on the acceptance candidate, which is not the
  source the failure was observed on; a judgment cannot supersede it, and a
  required one cannot be accepted or deferred. An authorized obligation
  revision is its own decision and leaves it open for the new obligation.
- Reopening raises the revision and keeps every earlier decision. A same-key
  report reopens a CheckFinding a check verified, or one closed on another
  source; on the same source it adds evidence to an accepted choice. A
  deferral stays deferred.
- A relation names both CheckFindings at their current revisions, of one
  owner. The latest assessment of a pair is current. `same-issue` groups them
  under the earlier ID while each keeps its reports, decisions and
  obligation; the other relations group nothing.

## Replay and queries

`applyCheckFindingEvent` applies one accepted event and refuses one whose IDs
or revision do not follow (`replay-conflict`); `replayCheckFindingEvents`
folds a sequence from `emptyCheckFindingState()` or a given state.
`selectCheckFindings(state, query)` returns a page of summaries ordered by
ID, at most 100 (50 by default), with the selected total, the next cursor and
the owner's counts by standing and reason; or one CheckFinding's detail with
up to 200 reports and decisions and their totals. The `attention` selection is
every open CheckFinding and each deferred one the caller names as due; this
module never evaluates a revisit condition.

## Tests

`src/tests/` covers exact and conflicting replay, issue-key attachment and
its scopes, ambiguous keys, distinct same-file concerns, every witness
refusal, supersession without a code change, repair claims awaiting their
witness, user decisions, obligation revision, reopening, same-issue grouping
that keeps factual obligations, query bounds and attention, and the worked
stream of the contract appendix, replayed from its JSON lines into identical
state and views. A purity test verifies that the module imports only `zod`.
