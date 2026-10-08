# Plan 23 independent fixture contracts

**Contract:** execution v1 on `d01a57bdbac6a56c29a893519f70297513824313`.
These fixed inputs and expected outputs precede implementation. Workers may add
cases; they cannot replace these expectations with their implementation's output.
External answers in ordinary tests are scripted. Exact native witnesses below
are registered together by iteration 14.

## F1: session preservation and settlement

Initial session P has exact role bytes `Role A\nGeneral task protocol.`, initial
`read` and `submit_orientation` definitions and turn-1 message `Orient A`.
The orientation submits `{ "orientation": "A" }`; record P's turn-1 boundary T1.
Append brief B with key `brief-b` after T1; call this checkpoint C1. Fork child L
from T1 and child R from C1. L inherits no B; R inherits B exactly once. Both
next tasks consume turn 2, while their session identities differ. Parent later
appends C and advances turn 2; neither child changes. Fork T1 while P's turn 2
is active. Persist and reopen actual temp storage with newly constructed objects.

Repeat Create and Fork keys with identical inputs: same identities and no new
payload/declaration. Repeat completed Continue with its original stale expected
point: same receipt, zero dispatch. Conflicting input under a key: conflict,
zero advance. Two Continues at C1: exactly one advances; other is conflict.
Standalone context and activation changes retain turn number. Fork the earlier
T1 never incorporates them. Changed description/schema under an existing tool
name is a conflict; identical definition rebinds once with fresh validator and
destination. Retain inactive historical write/submission declarations; calls to
them are refused before handler/effect/acceptance, including inherited tools in
read-only children.

Inject failure before intent, after intent/before dispatch, after dispatch,
after tool effect/before completion and after outcome commit/before publication.
Retry uses original task/environment/validator/destination and creates no new
turn. Current authority denial prevents execution; changed serialized policy
cannot masquerade as rebinding. An unknown external effect is not repeated and
provides no reusable point. Stop racing a delayed tool fences further dispatch
and acceptance; late callbacks cannot append after settlement. Terminal failed
or stopped Retry returns that outcome. No budget-return submission is invented.
For native requests compare exact initial instructions/tools and every inherited
serialized input item, including artifacts/order; child cache key may differ.

## F2: durable role, current tasks and input delivery

Every existing Role and renderer variant is covered, including local orientation,
assignment/completion/repair/qualification; selector/reselection; capability
architect/engineer; ordinary engineer/contract; reconciliation; code/scope/design
review; intake/principles/check catalog; failure analysis; NFR coordinator,
investigator/assessment/repair and standalone command. Use existing independently
named submission constants, rather than a renderer-derived expectation.

Fixtures have cwd A and B, candidate C0 and C1, declared limits 10 and 20,
goal `Deliver the status label` and requirement `Expose the current status`.
Initial role bytes are equal across its different tasks. Task messages name the
current environment, procedure and submission tool. Put the full schema in the
specialized tool once; count it in combined model-visible delivery, never only
the system text. Required `{{procedure}}`/`{{submissionTool}}` and known
`{procedure}`/`{submissionTool}` misspellings fail when unresolved. Quoted
`{"value": 1}` and code braces remain valid.

Brief revision r1 has sections goal=G1, requirement=R1 and catalog=K1. r2 changes
only requirement to R2. Fresh delivers G1/R1/K1; continued task bound to r1
appends R2 only; replay appends none. A child from a pre-r1 point receives all
required r1/r2 updates. Wrong/unknown inherited revision requires explicit
unavailable/full fresh recovery under the workflow, never a false delta.
Delivered manifest contains exact inherited/appended files and text identities;
an unused skill is absent. Read-only guidance names the actual supplied views,
coverage bounds and submission, with no shell or report.md requirement. Orientation
receives the stated goal/requirement. Review paths are one canonical list and
patch-first; inherited guidance never substitutes for current snapshot grounding.

## F3: mutation ordering and honest checks

Script commands A/B/C for the same worktree with controlled promises. Reserve log
IDs 1/2/3 before any await; delay A's check and request B/C. B's mutation cannot
start before A's check settles, and C follows B. A different worktree remains
independent. Read-only requests retain established concurrency.

Proven empty delta and pre-execution refusal: zero mutation-triggered checks.
Unknown delta: one complete check. Known changed `src/a.ts` with failed shell
exit: one required check. A completion submission always runs its separate
completion check. Incomplete/changed-input check with zero findings: not-checked,
no synthetic module violation/pass. Incomplete check with genuine finding V:
retain V and coverage reason. A delayed earlier result never clears a newer
finding. Error text names the supplied role's actual legal submission kinds.
Logs/run records live outside analyzed source or in prepared declared owned-unwired
space; no blanket global ignore rule is invented.

## F4: effective declared Cucumber configuration

Source default profile paths are `features/**/*.feature`, tags
`not @ramify-pending`, import `support/world.mjs` and `support/steps.mjs`, loader
`fixture-loader.mjs`, worldParameters `{ "marker": "declared-world" }`.
Features A and B are pending assigned scenarios; U is unassigned. Selected
config must execute A+B, not U, preserve loader/world/support and override pending
exclusion. Dedicated generated config has exact A/B paths, pending permitted,
empty inherited name filter and `dryRun:false`. Keep source config identity and
cwd/profile/argument/environment inputs. Multiple source profiles retain the
actually declared support combination before selecting A/B.

Negative control `cucumber-js features/A.feature` with discovered default source
profile resolves broader paths and excludes pending, so it is not verified focus.
`--help`, `--version` and `--dry-run` are distinct non-execution categories.
Unknown/dynamic source selection or failed config loading yields a limitation,
never a guessed working command. All relative paths resolve from supplied cwd;
absolute support imports stay absolute. The full configured audit remains broad.
Native witness checks effective selected URIs, executed A/B counters and declared
world/loader marker, plus the broader-path/default-profile negative control.

## F5: submitted catalog references and semantic authority

Submit requirement key `req-a`, capability key `cap-a` and hypothesis key `hyp-a`;
references name local keys using allowed element kinds. Invalid requirement
reference `missing-key`, duplicate `cap-a`, or wrong-kind reference to `hyp-a`
fails before durable IDs are consumed. Errors name submitted keys. Retry valid
submission gets the same next issued ID it would have received without rejection.
Keep registry scenario `scenario-a` by ID; do not copy its Gherkin into elements.
Revise with retire `cap-a` and no additions: valid at every affected validator.

Agent-declared non-behavioral acceptance referencing a registered test is allowed;
unregistered/wrong-kind evidence is mechanically rejected. The harness does not
infer classification or whether that test proves the requirement. Trusted
architect completion reports remain semantic authority; missing reports and failed
configured audits block. No scenario-ID-to-executed-file relation is required.

## F6: arithmetic, unknowns and replay

Frozen baseline has owned source 100 bytes, API views 20, architect view 30,
support/plan 50: project-only B=120 and total B=200. A writer has source 40, API 10,
architect 15, support 20, brief 5: project-only S=50 and total S=90. Expected ratios
are 50/120 and 90/200, with units dimensionless; mean size uses bytes. Duplicate
support file identities and overlap with architect-view files add zero bytes.
An extra location holding an already counted 10-byte file plus a new 7-byte file
adds 7. Read-only scope bytes are reported separately and do not inflate S.
Missing support has known subtotal/explicit limit; missing B and B=0 are different
coverage reasons. An actual delivered zero is zero. Mixed revisions or policy v1
and v2 are unavailable, never averaged.

Two writers with known delivered weights 3 and 1 at S=90 and S=50 have weighted
mean (3*90+1*50)/4=80 bytes. A partial writer retains known weight/contribution
with its reason; unknown overlaps are not assigned. Complete attributable shell
snapshots count despite unguarded execution. Revert contributes zero delivered
lines; pure rename contributes zero text lines; binary contributes no invented
line count. Setup and pending-tag removal retain distinct exact delta identities.

Read calls r1/r2 read a.ts returning 10/6 bytes in 5/3 ms; r3 reads b.ts returning
4 bytes in unknown duration. Search s1 is project-wide with zero matches, returned
0 bytes in 7 ms; s2 searches outside declared scope, returns 2 bytes in 2 ms.
Expected: 3 reads, 2 unique files, 1 repeated read, 22 total observed returned
bytes, 2 searches, 1 broad search, 1 outside-scope search, 17 known tool ms with
r3 duration gap. Replay r1 and inherited r1 in a fork do not add a call. A changed
operation/invocation identity for a new r1 is a new read. Do not invent scanned
bytes from search glob. Parallel 10ms calls can have 10ms wall and 20ms summed
tool duration. First-action time requires the chosen recorded milestone.
Recorded 100 new input, 50 cached input and 10 output tokens at $2/$0.2/$8 per
million yield $0.0002/$0.00001/$0.00008, total $0.00029 estimated charges. Absent
usage/rates remain unknown; no Plan 4 score or strategy side effect is enabled.

## F7: setup attribution and actual cwd

Prepare a disposable collection-review status-badge copy. Record exact setup
commit and `.gitignore` addition `src/tmp/` with the setup identity/delta. Setup-only
case is accepted. Agent later appends `secret-source.ts` to the same `.gitignore`:
that added delta remains unauthorized; no file-wide exemption. Preserve recorded
project configuration and existing audited evidence obligations.

The literal `src/tmp/` is the root-only scripted attribution input. The established
runtime scratch rule is `**/src/tmp/`; the native witness records and verifies
that actual rule without changing scratch policy to match the scripted example.

Engineer cwd is the assigned module `src/`. A tool write uses `status.ts` relative
to that cwd; scope/catalog fields retain project-relative module paths. Never
prepend the module path twice. Fixture README offers requirements/context without
a supplied code solution, stale enforcement prose or broken links. Run output
is outside project or explicitly declared owned-unwired in the prepared copy.
Keep fixture changes recorded; do not run a performance comparison/live trial.

## Iteration 14 exact native witness reservations

| Path relative to ramify-agent | Native boundary and evidence |
| --- | --- |
| `subs/harness/src/tests/plan23-cucumber.boundary.test.ts` | Installed Cucumber effective configuration and executed pending A/B versus unselected U; profile-path-merge negative control; real world/support/loader marker |
| `subs/harness/src/tests/plan23-trial-attribution.boundary.test.ts` | Actual Git setup commit/delta versus later same-file agent edit and real module-src cwd; isolated prepared copy |
| `subs/harness/subs/agent/subs/pi/src/tests/plan23-transport.boundary.test.ts` | Installed native serialization and actual provider transport preservation; registered launch/transport boundary |
| `scripts/plan23-live-session.ts` | Live supported pi Continue/Fork/Add tools/process restore; exact credential-free outgoing request comparisons, accepted new submission and parent/child isolation |

Register exact titles and why scripting cannot prove them before native launch.
The live witness records pi/model/transport identities, source candidate and
configuration, operation/point lineage, preserved prefixes and all accepted
submissions. Offline serializer tests do not satisfy Q02. Missing login or an
unsupported transport leaves Q02 open. Q03 is the complete configured clean
committed full nested released audit; no narrowed discovery, new unintended
skips or scenario semantic veto. Audit health and architect judgment are separate.
