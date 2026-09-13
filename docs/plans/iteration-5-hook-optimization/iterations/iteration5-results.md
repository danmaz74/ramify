# Iteration 5 results: Answer queued racing hooks on publication

**Date:** 2026-09-13. **Outcome:** HO-13 to HO-16 pass. When a capture
publishes, the manager evaluates the covering rule again for the synchronized
requests queued while it ran. If the revision covers all of them and nothing
else is pending, they are answered from it and the paths they queued are
withdrawn, so no second update runs. A request that arrives after the session
advanced and before the context published is evaluated the same way.
`createFingerprints` sorts with a comparator that does not serialize, and its
output is unchanged. Direct work; no Studio workflow.

## What changed and why

1. **Request-owned paths** (`subs/daemon/subs/contexts/src/context.ts:23`).
   `LiveContext.requested` maps each queued path that only synchronized requests
   named to those requests. `check` records the owner when it adds a path, or
   adds itself when the path is already request-owned
   (`subs/daemon/subs/contexts/src/context-manager.ts:536`). A path the watcher
   queued first stays a known change and gets no owner. The entry for a path is
   removed when:
   - a watcher event names it (`:179`);
   - a cancelled background capture restores it (`:189`);
   - `maxQueuedPaths` clears the queue (`:183`, `:192`, `:539`);
   - a capture consumes the paths (`:342`);
   - the context is evicted or cooled (`:75`, `:99`).

   Without this map, the hook's own path would look like any other pending
   change, and the second update would still run.
2. **Covering on publication** (`coverQueued`,
   `subs/daemon/subs/contexts/src/context-manager.ts:474`). `analyze` sets
   `published` once a revision is admitted (`:404`), including a reused one.
   Its `finally` block calls `coverQueued` after `running` is cleared and settled
   entries are dropped (`:434`), before audit, sweep and idle scheduling and
   before `kick`. Every request that queued while the capture ran is in the
   queue at that point, including one that arrived during delivery or
   `releaseUnpublished`. No await separates the evaluation from clearing
   `running`. A covered request is delivered with `captureStarted: null`,
   `verified: true`, `reusedRevision: true` and zero reply timings, exactly as
   a request covered on arrival.
3. **Shared identity predicate.** `identityCovered` (`:455`) holds the per-request
   part of the old `covers()`: the published revision is the session's current
   one, the request needs no sweep, its invocation equals the context's, and
   every expected identity matches. `covers()` (`:463`) keeps the arrival
   conditions and calls it, so arrival coverage is unchanged.
4. **Advance-before-publish window.** No separate mechanism was needed. While
   the session has advanced and publication is pending, `context.running` is
   still set. An arriving request is therefore not covered: it queues its
   paths and waits. The evaluation after publication then answers it from the
   new revision when that revision covers it. It is never answered from the
   older published revision, and it is not refused.
5. **Fingerprint comparator** (`subs/daemon/subs/contexts/src/tokens.ts:33-71`).
   `compareObservations` orders the `[path, role, sha256, bytes]` tuples as
   their `JSON.stringify` texts compare, without building them:
   - `encodedUnit` maps each code unit to one number that orders its JSON
     encoding: a literal unit, a short escape, a `\u` escape (including lone
     surrogates), or the closing quote past the end.
   - No encoding is a proper prefix of another, so the first differing encoding
     decides, and the first differing string field decides the tuple.
   - Sizes are compared as their JSON number text followed by `]`, and only when
     all three strings are equal. That keeps, for example, `12` after `123`, as
     before.
6. **Contract text** (`docs/architecture/daemon.md:531`). The Fast incremental
   checks section had no covering rule. A bullet now states the rule and
   includes resolved decision 4's sentence: "The covering rule is evaluated when
   a request arrives and again when each revision publishes. A queued request
   whose expectations the new revision covers, with no other known change or
   required sweep pending, is answered from that revision without another
   update."

## The covering rule as implemented

**On arrival** (unchanged). A synchronized request is answered from the
published revision when all of these hold:

- no capture runs, or only a periodic sweep with no requests and no changes;
- no background work, queued path or required sweep is pending;
- synchronization is `synchronized`;
- `identityCovered` holds.

**On publication** (new). When a capture ends having admitted a revision and
was not aborted, let Q be the unsettled synchronized requests in the queue. All
of Q are answered from the published revision when all of these hold:

- Q is not empty and the context is `warm` with no capture running;
- no conservative reconciliation and no required sweep is pending, and the
  watcher is not `unavailable`;
- background work is absent or `request`;
- every queued path is owned only by requests in Q, so no path came from a
  watcher event, a restored capture, or a request that expired, was cancelled or
  was released;
- `identityCovered` holds for every request in Q: the revision is the
  session's current one, the request needs no sweep, its invocation equals the
  context's, and every expected identity matches, including an absent file.

Then the queued paths are withdrawn, background work is cleared,
synchronization becomes `synchronized` and each request is delivered as covered.
Otherwise nothing changes and all of Q run in the next update as before.

The rule is all-or-nothing. A covered request is not answered while another
queued request's path is pending, because that path is a known change that may
affect the covered request's findings. The arrival rule already refuses
coverage while any path is queued.

A due periodic sweep does not prevent coverage; it starts after the replies, as
on arrival. An update that only verifies (`verify` equal) also passes through
publication, so requests queued during a running audit are evaluated when it
ends. No test covers that case.

## Tests per matrix row

| Row | Tests |
| --- | --- |
| HO-13 `covered-on-publication` | `subs/daemon/subs/contexts/src/tests/covering.test.ts:212` `covered-on-publication: hooks queued during the watcher update are answered from its revision with no second update`. A watcher update is held while two hooks queue: one for the watched write, one for another path the revision observes. Neither is answered, and two paths are pending. Releasing the capture answers both from revision 2 (cause `watch`, with its watch span) with `captureStarted: null`, `reusedRevision: true` and zero timings. After 1 s: one update, no sweep, `synchronized`, no pending paths. Control: an arriving hook is still covered on arrival. `subs/daemon/src/tests/session-counters.test.ts:78` `counts a hook covered on publication as a covered request with only the watcher update analysed`: through the daemon service, a racing hook changes the counters by `analyses` +1, `revisions` +1 and `coveredRequests` +1. |
| HO-14 `uncovered-after-publication` | `covering.test.ts:245` `... a queued differing expectation runs an update, and a covered companion waits with it`: a second update runs with both paths, and both requests are answered from revision 3 with `captureStarted: 100`. `covering.test.ts:268` (`it.each`) `... %s pending at publication runs an update`: during a request's update, (a) a watcher change to another path, (b) the watcher event for the hook's own path, or (c) a `tsconfig.json` change. In each case the hook is not answered at publication, a second update runs containing that path, (c) also sweeps, and the hook is answered with a real capture start. `covering.test.ts:297` `... a queued request from another invocation runs an update despite an equal identity`. `covering.test.ts:314` (`it.each`) `... a queued path of a request that expired/cancelled still runs, and a covered hook sharing it waits`. |
| HO-15 `advance-before-publish` | `covering.test.ts:338` `advance-before-publish: a hook arriving after the session advanced and before publication waits and is answered from that revision`. With `maxHotContexts: 0` and a held `releaseCompiler`, the session is at sequence 2 while revision 1 is still published. A hook with the new identity is neither refused nor answered in that window. It is answered from revision 2 as covered, with one update. Control: in a second window, a hook expecting the still-published identity is not answered from that revision. It runs an update and is superseded against revision 3. `covering.test.ts:375` `... a hook arriving from the publication event before its capture ends is answered from it`: a check made in the `revision-published` listener, while `analysisRunning` is true, is answered from that revision with no second update. |
| HO-16 `fingerprint-order` | `subs/daemon/subs/contexts/src/tests/tokens.test.ts:123` `fingerprint-order: createFingerprints output is unchanged with a non-serializing comparator`. It compares all five fingerprints with a copy of the former serializing implementation over 400 seeded random input lists. Their values are built from quotes, backslashes, short and `\u` escapes, space and `!` against the closing quote, non-ASCII units, paired and lone surrogates, and sizes including `12`/`123`, `1.5`, `-0` and `NaN`. It also checks every ordered pair of those pieces as path and hash suffixes in both input orders. The existing fixed-digest test at `tokens.test.ts:51` still passes. |

Mutation checks, reverted before the commit:

- Removing the `coverQueued` call fails HO-13, both HO-15 tests, the two revised
  expectations below and the service attribution test (by timeout).
- Removing the owner check fails both expired and cancelled cases.
- Answering only the covered subset instead of all-or-nothing fails the
  differing-expectation test.
- In `tokens.ts`, each of these fails HO-16: comparing strings directly,
  ignoring lone surrogates, or comparing sizes numerically.
- Two conditions have backup: the owner removal in `watchEvents` and the
  background and watcher conditions. A watcher event also sets background
  `watch`, so removing either alone passes the tests.

## Revised expectations

Both revisions follow from resolved decision 4. In each test, a request queued
behind a capture is now answered from that capture's publication.

- `subs/daemon/subs/contexts/src/tests/context-manager.test.ts:201-214`
  `sweep-cadence`. A hook queued during a held required sweep was answered after
  a second update. The sweep's publication now covers it: the reply has
  `captureStarted: null` and the update count stays 1 (was 2) at `:203`, `:207`
  and `:214`. The cadence assertions are unchanged.
- `subs/daemon/subs/contexts/src/tests/covering.test.ts:143-149`
  `covered-during-periodic-sweep`. The control hook, not covered by the revision
  from before the sweep, still waits for the sweep. That sweep's publication
  covers it, so it is answered as covered and the update count is 0 (was 1).

No other expectation changed.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 9 files, 116 tests passed |
| `npx vitest run subs/daemon/src/tests` | 13 files passed; `connect.test.ts` 5 failed, which also fail on the base with `git stash` (`Missing or incomplete daemon build`, no `dist/`) |
| `npm run type-check` | exit 0 |
| `git diff --check` | clean |

The cucumber-viz commit audit runs on the worktree after the commit.

## Deviations and limits

- **Contract text placement.** `docs/architecture/daemon.md` had no covering
  rule to extend. The bullet states the rule briefly before decision 4's
  sentence.
- **Measurement assertion now stale, not changed.**
  `scripts/measurements/fast-assertions.mjs:241` `racing hooks wait for an
  uncovered identity` requires a racing body cycle to leave `coveredRequests`
  unchanged. A hook that reaches `check` while the watcher's update runs is now
  a covered request, as HO-13 intends, so a real run would fail that
  assertion. Decision 7 excludes live runs, and the iteration hands racing-hook
  attribution to the measurement successor, so the script and
  `fast-evidence.test.mjs:154` were left unchanged. The service counters still
  separate covered answers (`captureStarted: null`, `verified`) from analysed
  ones.
- **Expired, cancelled or released requests keep their paths.** A path queued
  by a request that has since settled still runs an update, even when its
  identity is covered. A covered hook sharing that path waits for that update.
  This keeps the existing rule that a waiter's queued changes still run.
- **Still two updates.** A hook that reaches `check` before the watcher's batch
  is delivered starts its own update. The watcher event then queues a known
  change and a second update runs. The same happens when the watcher's
  duplicate event for the hook's path arrives while its update runs. This is
  the watcher-latency deferral (target 6).
- **Arrival during a running capture still waits.** Coverage is not attached to
  the running update, per decision 4; the request waits for publication. A
  running idle audit still refuses arrival coverage, but its queued requests
  are evaluated when it publishes.
- **Owners outside the list.** `subs/daemon/src/tests/session-counters.test.ts`
  gains the attribution test; no `daemon` source changed.

## Handoff

- **Covering rule.** As stated above: on arrival unchanged; on publication, all
  unsettled queued synchronized requests are answered as covered, with paths
  withdrawn, when the revision covers each of them and every queued path is
  owned only by them, with no conservative, required-sweep, non-request
  background or unavailable-watcher state. Otherwise they all run in the next
  update.
- **Attribution.** A publication-covered reply has `captureStarted: null`,
  `verified: true`, `reusedRevision: true` and zero timings. The daemon counts
  it in `coveredRequests`, and its revision is the racing update's
  (the reply's `freshness.acknowledged` precedes the revision's `publishedAt`). The measurement successor
  can use that order to tell a publication-covered hook from one covered on
  arrival. It should replace the racing assertion above: expect `analyses` to
  grow by one and `coveredRequests` by one per racing cycle, except when the
  hook arrived before the watcher's batch.
- **State.** `LiveContext.requested` is private, and `OpenOutcome`,
  `ContextStatus` and `FreshnessRecord` are unchanged. `invocationKey` and
  `projectKey` are unchanged.
