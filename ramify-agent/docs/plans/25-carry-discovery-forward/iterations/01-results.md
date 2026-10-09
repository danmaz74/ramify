# Iteration 1 results: reusable instruction delivery

**Status:** implemented; focused checks passed; coordinator source review accepted.
**Date:** 2026-10-09.
**Source commit:** `e1678996ca8e8f1402ffec817e187cdb01ff48a6`.
**Base:** iteration 0 receipt commit `4312ee3c`, with source `5306bf94`.
**Branch:** `feat/plan25-carry-discovery-forward`.
**Worktree:** `/home/app/ramify-plan25-carry-discovery-forward`.

## Delivered behavior

Every supported role/task pair now selects an explicit procedure family. Main
local-architect assignment/completion/repair and main engineer tasks reuse their
respective bodies; orientation, reconciliation, qualification, reviewer and
catalog turns, and inline procedures have intentional distinct mappings. Each
current task selects its role, kind, objective, procedure key and exact framed
SHA-256, and current submission tool, and supersedes previous task selection.
Missing or wrong selected bodies fail validation before dispatch. Pinned same-role
body conflicts and immutable same-name submission-schema conflicts remain errors.

Environment delivery uses nine declared field blocks, in `TaskEnvironment` order.
Nested object properties render deterministically; array order remains significant.
Whole fields replace atomically, including null, empty lists and empty objects.
Procedure and briefing sets use invariant framing on their first and replacement
delivery. Explicit structural withdrawals use remove metadata and canonical
withdrawal framing; selector forks retain omitted known sections. Role prose now
explains inherited effective blocks plus current selection and explicit updates.

Session starts select the actual point's recorded context, derive an occurrence
from its current predecessor and durable operation ID, and write `/2` intents and
manifests. A → B → A creates a new A occurrence while preserving equal A content
hashes; an unchanged task following replacement adds no reusable block. Current
cwd, active tools, authority, validator and destination bind independently.
A genuine committed failed point retains its context; a prepared intent or a
failure with no committed reusable point establishes no delivered ancestry.

Retries use the original retained packet/task/context, including `/1`. `/2`
intents capture an optional request hash to preserve non-restore request conflicts;
source/mode/cwd/logical-session changes and policy/declaration changes also fail.
Legacy non-restore task reuse compares the exact original current-task component,
so an objective merely appearing as a substring cannot pass. Explicit restore
ignores newly loaded package bytes while requiring the original executable bindings.
No historical intent, message, manifest or hash is rewritten.

Named appends preserve unique append identity alongside logical section key/effect,
and record their actual framed provider addition. Immutable proposals are captured
per source point; a rejected CAS permits the existing one-point retry. Only the
accepted proposal becomes the replay correlation. Original admitted engine append
inputs cover legacy unframed appends and restart before the harness records
completion. Ad hoc prose remains uninterpreted history. Legacy procedure/environment
representations and named briefing bodies receive the new framing once, with no
synthetic inherited field messages or new-source provenance attributed to old bytes.

## Acceptance witnesses

All selectors below are configured ordinary Node tests; no process exemption was
added. Independently authored framing, family/tool and hash expectations accompany
actual session operations rather than resolver-only evidence.

| Cases | Witness |
| --- | --- |
| P01, P02, P09 | `plan25-task-packets.test.ts`: complete fresh packet, fixed field order, exact physical hashes and selector; assignment → completion adds only briefing-state/task. |
| P03, P04 | Packet cases cover canonical nested object order, preserved arrays, changed fields only, null/empty replacements; session cases cover structural withdrawal, repeated omission and reintroduction. |
| P05, P06, P07 | Packet cases cover orientation → main → reconciliation → main, procedure A/B/A, missing/wrong-hash selection, pinned-role conflicts, and independently named expected families/tools for all 30 supported role/task pairs. Existing specialized-schema conflict tests remain passing. |
| P08, S01, S02 | Session cases and existing fork/prompt tests cover exact goals/requirements, retaining selectors, old-point isolation, role-changing forks, ordered briefing history and current tools/cwd/policy/validator/destination. |
| S03 | Session and continuing-work tests cover accepted and unfinished replay, restart, prepared-intent resume, policy/request conflicts, original `/1` bytes and a shortened legacy-objective rejection. |
| S04 | Session cases cover prepared-only and committed pre-dispatch failures, successful continuation from a genuinely committed failed point, and a provider failure with no reusable point. Existing settlement/CAS/interruption regressions remain passing. |
| S05, S07 | Session cases exercise full start A/B/A and named append A/B/A across restart, unique physical/logical identities, idempotent replay, ad hoc history and a concurrent stale proposal. Existing two-appends/active-operation conflict behavior remains passing. |
| S06 | Independently assembled legacy packet/intent and actual engine operation preserve original bytes/hashes/provenance; migration creates nine appended field messages while retaining one physical inherited environment entry. A legacy named append introducing a new logical section migrates once. Existing context-selection runtime cases retain ordinary fresh fallback. |

## Checks and retained evidence

Commands ran from `ramify-agent/`. Evidence lives under
`/home/app/ramify-plan25-evidence/`. Log files are bounded to less than 64 KiB;
where output exceeded that bound, the complete original is retained under
`iteration01-raw/`, with paths/digests in `iteration01-log-bounds.json`.

| Check | Outcome and evidence |
| --- | --- |
| Required five-file selection plus session-store, block foundation, observation integration, context-selection delivery/runtime and review-diff delivery regressions | Passed: 11 files, 237 tests; `iteration01-final-tests.log`. Includes all five requested selectors, reconciled against configured discovery. |
| Exact legacy-objective retry correction | Passed: `plan25-block-sessions.test.ts` and `plan23-continuing-work.test.ts`, 2 files, 40 tests; `iteration01-final-retry-tests.log`. |
| Final legacy named-section migration correction and actual contract-engineer package fixture | Passed: both new Plan 25 test files, 2 files, 43 tests; `iteration01-final-migration-tests.log`. |
| `npm run type-check` on final source | Passed across project, web, scripts and browser-acceptance compiler scopes; `iteration01-final-typecheck.log`. |
| `npm run check:self` on final source | Passed: 12 owners, 696 source files, 50 resources, 13,565 accesses; 0 errors/warnings, 328 nonblocking analysis limits; `iteration01-final-check-self.log`. |
| Configured discovery | `vitest list --filesOnly --json`; retained in `iteration01-configured-discovery.json`. Both new files and every selected regression belong to the ordinary Node project. |
| Foreign API discovery | Refreshed harness consumer view through installed `ramify materialize --from subs/harness`; generated `children` view confirms exposed `AppendSessionContextInput`. `iteration01-api-discovery.log` and materialize/stop logs retain evidence. Isolated daemon endpoint was stopped; no exposure changes. |
| Process guard | Final test windows retain 15 per-file executions, zero allowed calls and zero refused attempts; `iteration01-process-guard.json`. |
| Root `git diff --check` and source review | Passed; coordinator accepted source `e1678996`. |

Intermediate failures are retained separately. Initial prompt/continued-work
assertions expected repeated fields or unframed hashes. A development run also
caught an out-of-scope append variable and the capability package set's absence of
a contract-engineer fixture. That failing run was stopped after an affected
workflow remained waiting; it is not passing evidence. A later affected-regression
run identified three obsolete framing/version assertions in context-selection and
observation tests. All were corrected and their passing focused replacements are
listed above. No failure was treated as a flake or silently retried.

The iteration 0 baseline outcome remains unchanged. No new baseline, direct whole
suite, full configured audit, native witness, paid/live provider or performance run
was performed. Integrated final audit and combined discovery qualification remain
iteration 5's gates; this receipt makes no cache, latency or cost claim.

## Iteration 2 handoff

- New runtime writers use `ramify-agent.harness-operation/2` and
  `ramify-agent.delivered-inputs/2`; both versions remain readable. `/2` intent
  `requestHash` is optional for foundation fixtures and required in new writes.
- `BriefingRevision.sections` accepts structural `effect: 'set' | 'remove'` for
  caller-selected withdrawals; omitted effect is an ordinary set. Existing
  canonical bodies remain separate from rendered physical block text.
- `HarnessSessionOperations` owns occurrence selection and actual-point ancestry;
  callers supply sections, not revision counters. Named appends accept the existing
  fourth `briefingSectionKey` argument and retain its logical identity.
- Optional discovery sections can use the same `brief:<section key>` delivery.
  Procedure/environment framing and manifest hashes describe actual physical
  messages, while superseded text remains in the provider prefix.
- Submission pointers and schema/package changes remain iteration 2's write scope.
  No discovery fields were introduced here. Current same-name tool immutability
  must be preserved; legacy retries keep their original validator/schema identity.

The dirty `/ramify` checkout was preserved. No merge, push or publication occurred.
