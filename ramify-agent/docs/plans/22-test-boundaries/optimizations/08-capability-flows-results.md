# Optimization 8: capability flow external boundaries

**Latest qualification:** committed prerequisite `6d0dfd7f` adopts target `f2968d17`
and passes 86 focused cases. See the appended prerequisite evidence below.

Implementation `1ecaf0d7`; base `323bdc13460f8c003f7cf61e8fd7062a805bc55a`. Adopted only committed Plan21
`cc27f03c80f8afe80010dd42cc9eae40d0dd5035` in qualified runtime candidate `7a8acd3a182df62e860c28516e6f98a2164bb92f`. The coordinator must run
the released full nested audit on the clean candidate before integration.

## Preserved behavior

All 29 original configured cases retain their exact titles. Twenty-eight ordinary
cases retain the real behavior relevant to each: RunService, validation, writer scopes, filesystem mutations,
source capture, durable ledgers, continuation and projection behavior while using
literal external answers. Eleven submission schema/report controls were already
in-process; their guarded file now also converts its one composed registration
flow. The actual CA30 Git object/index/worktree/untracked/deleted byte witness
moves unchanged to `capability-delegation.boundary.test.ts`; its entire callback is
byte-identical (SHA-256 `d66bb1d8f964b4e6d39b62bbfbb0d30877c4c07db8831a2dbbe5ed01356f00bf`). No additional real workflow is added.

[Evidence](08-capability-flows-evidence.json) maps each original file/title and
acceptance ID to its destination. Every adopted source line containing an
`expect` expression is present after normalizing the two HEAD assertions to use
the injected Git port. The expected request `acceptedBase` remains unchanged.
There were 217 lexical `expect(` occurrences in the original source, including
embedded examples. Plan21's adopted cleanup removes two obsolete assertions,
leaving 215; the optimization retains all 215 plus four process guards. This is
mechanical preservation evidence, not an automated semantic completion judgment.

Plan21 retired the `capability-assignment-interrupted` event assertion and the
`scope-tests` observation assertion, and removed the obsolete capabilityAssignment
selector. Its committed cleanup is preserved. No production, package pin, audit
policy, timeout, skip or retry changes belong to this optimization.

The new helper declares head/tree IDs, changes, candidate bytes, scratch facts,
source/index bytes, ownership and synthetic audit responses. Engineer turns
advance explicit fixture states; exact scratch write/edit steps advance unsafe
and repaired ignore states. Nothing computes Git/history/ownership answers from
live files. Branch creation, scenario publication, trailer lookup and gate commit
responses are consumed once; required preparation, source and audit answers are
checked at teardown. Version, ownership, materialization and frozen reads are
explicitly repeatable. Line/patch metrics and generated views are deliberately
unavailable. Synthetic configured audit answers exercise harness policy and
establish no actual provider publication or semantic acceptance claim.

Seven guarded helper controls cover a positive declared read, unknown Git,
unknown ownership, unknown frozen revision, unknown source bytes, exhausted run
branch creation, and unused required responses. Caught failures persist into
teardown. All ordinary setup/flow/teardown checks report zero process attempts.

## Qualification

From the ramify-agent package directory:

```sh
node_modules/.bin/vitest run subs/harness/src/tests/capability-assignments.test.ts subs/harness/src/tests/capability-delegation.test.ts subs/harness/src/tests/capability-consultation.test.ts subs/harness/src/tests/capability-submission.test.ts subs/harness/src/tests/capability-flow-boundaries.test.ts subs/harness/src/tests/capability-delegation.boundary.test.ts subs/harness/src/tests/composition.test.ts --reporter=json --outputFile=/tmp/plan22-capability-flows-reconciled.json
npm run type-check
npm run check:self
node_modules/.bin/vitest list --filesOnly --json
```

The reconciled focused run passed 47 cases, zero failed or skipped: the preserved
29, seven helper controls and eleven composition cases. All four type scopes
passed. Module check passed with zero errors/warnings and 313 analysis limits.
Configured discovery selected 261 files, including both new test files; discovery
is a listing, not a passing execution. Full nested audit is reserved for the
coordinator; its pass is required before merge.

| File | Baseline seconds | First passing qualification | Reconciled qualification |
| --- | ---: | ---: | ---: |
| assignments | 7.992 | 2.724 | 5.611 |
| delegation ordinary | 9.365 including actual CA30 | 4.135 | 9.035 |
| consultation | 1.220 | 0.687 | 1.210 |
| submission | 1.434 | 0.742 | 1.489 |
| retained actual CA30 file | original case 0.188 | 0.254 | 0.503 |
| strict controls | — | 0.021 | 0.025 |
| composition | — | 5.900 | 12.128 |

The original four-file aggregate was 20.011 seconds. First passing ordinary
aggregate was 8.288 seconds; reconciled aggregate was 17.345 seconds. These runs
share a host with concurrent Plan21 work and qualification, and the adopted
production source changed. Timing varies with load; no controlled full-audit
speedup is claimed. Zero ordinary process attempts is the hard invariant.

## Retained authoring failures and resources

The evidence lists each failed focused artifact and its hash. Failures identified
hoisted mock initialization, missing explicit feature/diff/hook answers, omitted
injected ports in the inherited-directory negative fixture, and an overstated
scratch read count. Correcting each declaration retained original assertions.
The first combined qualification passed 46 cases and failed consultation because
`exchange-answered` preceded durable exchange revision 2 publication. The case
now uses the existing bounded `until` helper to observe that file before reading
it, retaining the original null/answer/content/session assertions. No fixed delay,
production edit or weakened outcome was introduced. The passing 47-case artifact
and final reconciled result are separately retained.

Testing API discovery used normal installed `ramify materialize --from
subs/harness/src/tests`, then searched the generated testing child catalog.
That query used a shared `/tmp/ramify-1000` resident daemon. Its project compiler
session remains a discovery resource: the public CLI exposes daemon-wide stop
only, so the shared daemon was preserved. This is distinct from fixture process
leaks. Ordinary test launches are refused; the retained CA30 Git commands settle
normally. Future discovery should use an owned endpoint.

Global automatic process enforcement, runner partition and remaining consumer
migrations remain future cuts. Full audit execution and responsible architect
semantic review remain coordinator responsibilities.

## Qualification prerequisite: complete log reads and settled fixture cleanup

The coordinator preserved a released nested baseline failure at
`/tmp/plan22-opt08-adopted-baseline-failure.json` (SHA-256
`4465f6a9b7b6068aa47f033cd0bf421669317aa78d48ef06a03a2570e47f14ae`), source `cc27f03c`, report
`e51b822e3688930f52245c1d9e4927a6c61839fa`. Its original recovery case
“a crash after immutable analysis evidence is staged leaves no accepted analysis
and a fresh run can use changed evidence” polled a live append-only log through
`runEventsOnDisk`, which parsed an unfinished final JSON string. Cleanup then
removed its fixture before closing the resumed service; ongoing blob writes
produced a secondary `ENOTEMPTY` failure. These failures belong to the adopted
baseline; the artifact remains a failed audit, not passing delivery evidence.

The other baseline failure was the protocol fixture's missing documentManifest.
Plan21 committed its repair in `0108a28d`; only committed target `f2968d17fa2f0657112ef8edab474537473f964a`
was adopted. No unfinished target work was copied or edited.

Coordinator-authorized test-only prerequisite `6d0dfd7f8f56cd834c5ee76d55b1d2193b254d93` changes the event-reader
helper to reuse the ledger owner's already exposed `readJsonLines`. An existence
check preserves the helper's `ENOENT` refusal. The reader defers an unterminated
final append, rejects malformed newline-completed records, and leaves file bytes
untouched. Recovery cleanup reverses ownership order, settling services before
removing their fixtures, while collecting all cleanup and boundary-check errors.
The entire original recovery test body section is byte-identical; its 35 cases,
titles, assertions and timeouts remain unchanged.

Four guarded controls in `subs/harness/src/tests/run-event-reader.test.ts` verify complete written records, both
malformed and valid JSON tails without a newline, corruption of a completed line
even when valid records follow, and missing-file refusal. Configured runner
listing includes that file and selects 262 files. These controls make
no Git or process calls. Reader completion does not establish crash durability.

Focused qualification ran the previous seven cut8/composition files plus the
complete recovery file and reader controls. Artifact
`/tmp/plan22-capability-flows-prerequisite.json` passed **86 cases, zero failed or
skipped**: 47 previous cut8/composition, 35 recovery and four new controls. All
four type scopes passed; module check again reported zero errors/warnings and
313 analysis limits. After that pass, the helper comment and one control title
were corrected to say complete/written, without changing executable behavior.

The full released pre-merge nested audit remains unrun by this subagent. The
coordinator must execute it on the combined clean candidate after serializing
with Plan21's active audit. No merge, target edit or push was performed.
