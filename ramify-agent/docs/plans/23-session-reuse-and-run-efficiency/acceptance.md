# Plan 23 acceptance matrix

**Parent:** [main plan](main-plan.md). Cases are plan-local acceptance IDs.
Iteration ownership below is primary; iteration 14 verifies the complete joined
matrix. An implementation receipt names actual test files/titles and evidence.

## Fixtures

| Fixture | Independently specified inputs |
| --- | --- |
| F1 Session | Two siblings from turn 1; standalone brief/tool checkpoints; inactive inherited write/submission tools; injected failures before/after dispatch, effect and outcome commit |
| F2 Prompt | Every role/task pair, full and delta briefings, required/misspelled slots, literal JSON braces, unused skill, changed cwd/snapshot and rejected submission |
| F3 Mutation | Three overlapping command requests, empty/unknown/failed-but-mutating results, changed-input and genuine findings, delayed check completion and unique log IDs |
| F4 Cucumber | A broad default profile excluding pending, two selected pending features and one unselected feature, declared support/world/loader, help/version/dry-run and CLI path merging |
| F5 Catalog | Accepted intake, local keys, invalid typed references, retirement without addition, duplicate capability and non-behavioral registered-test acceptance |
| F6 Metrics | Known byte inventories and revisions, overlapping support/read/extra paths, missing role sizes, complete/partial/overlapping writer evidence, reverts, binary/rename/setup changes, zero-match broad search |
| F7 Trial | Status-badge prepared copies; setup and agent edits in the same `.gitignore`; engineer cwd in module `src/`; unchanged audited evidence requirements |

## Cases

| ID | Iteration | Required behavior and negative control | Fixture |
| --- | --- | --- | --- |
| B01 | 0 | Exact clean base, concurrent-change disposition, fixed contracts and disjoint write sets recorded; stale generated symbols never treated as available APIs | All |
| S01 | 1 | Create/fork/retry preserve unique identities; sibling turn N+1 is session-qualified; duplicate operation cannot create another session | F1 |
| S02 | 1 | Continue adds exactly one turn; appends/tool changes make checkpoints without turns; turn boundary excludes later appends | F1 |
| S03 | 1 | Restart at intent/input/effect/outcome boundaries recovers original inputs; completed retry returns outcome despite stale original expected point | F1 |
| S04 | 1 | Same-session advances serialize/CAS; stale point and conflicting key fail; fork old settled point while parent is active | F1 |
| S05 | 1 | Stop targets active operation, fences late submissions and preserves effect evidence; unresolved tool effect exposes no reusable boundary | F1 |
| S06 | 1 | Fresh handlers use original task/validator/destination; policy changes cannot widen Retry; unknown effects are not blindly repeated | F1 |
| S07 | 7 | Actual outgoing initial instructions/tools and complete inherited input prefix stay equal for Continue/Fork/new tool | F1 |
| S08 | 7 | New declaration once; same definition rebinds; changed schema/description conflicts; inactive inherited calls have no effects or accepted submission | F1 |
| S09 | 7 | Initial preservation failure dispatches zero requests; failure after a valid request dispatches no next request even when an extension throws | F1 |
| S10 | 7 | Restored provider artifacts, appended role instructions and tool ordering survive restart; no default prompt injection or compaction/removal rewrite | F1 |
| S11 | 7 | Unsupported transport reports unavailable; parent immutable and child IDs do not alter inherited metadata | F1 |
| P01 | 2 | Every role/task renderer fills required slots, catches known single-brace errors, preserves literal code/JSON and names its actual submission | F2 |
| P02 | 2 | Durable system role plus current task; full schema exactly once; changed cwd/limits/snapshot never require replacing the head | F2 |
| P03 | 2 | Full fresh packet, revision-bound continued delta, complete post-fork updates; no loss or duplicate unchanged sections | F2 |
| P04 | 2 | Manifest contains only delivered/inherited instructions; read-only role uses supplied views/current submission and retains unknown coverage | F2 |
| P05 | 2 | Orientation gets required text; no duplicate hypotheses/entries; correct command/import wording and no empty boilerplate | F2, F5 |
| H01 | 3 | Refused/proven unchanged commands skip mutation checks; unknown changes and failed commands with changes retain required checks | F3 |
| H02 | 3 | Shared-worktree mutation/check ordering avoids races; log reservations are unique despite overlapping requests | F3 |
| H03 | 3 | Incomplete/changed-input is not a fabricated violation or pass; genuine findings survive incomplete checks; completion checks remain required | F3 |
| H04 | 3 | Violation response names current role's legal outcomes; existing authorization and post-check boundaries stay intact | F3 |
| H05 | 4 | Focused config preserves declared support/loader/world and selects exactly assigned features with pending enabled | F4 |
| H06 | 4 | Default-profile path merging is not accepted as focus; help/version/dry-run are distinct and never execution evidence | F4 |
| C01 | 5 | Invalid submission-local references fail before ID assignment and errors identify submitted keys; retry consumes no hidden IDs | F5 |
| C02 | 5 | Catalog supports retirement without replacement, correct typed references and scenario IDs without duplicate Gherkin | F5 |
| C03 | 5 | Non-behavioral acceptance can name a registered test; harness validates structure without deciding semantic classification | F5 |
| M01 | 6 | Actual role support/brief counted once and architect view separate; project-only and total ratios use corresponding baselines | F6 |
| M02 | 6 | Partial writers retain known contribution and reason; complete attributable shell snapshots measured; uncertain overlaps stay partial | F6 |
| M03 | 6 | Extra/read overlaps deduplicated with read scope separate; nested/bootstrap limits explicit; mixed revisions/policies rejected | F6 |
| M04 | 6 | Weighted mean bytes and dimensionless ratio labeled correctly; missing/zero baseline and delivered-zero remain distinct | F6 |
| M05 | 6 | Reads, observed bytes, repeated reads, broad/zero-match/outside-scope searches and elapsed durations aggregate with coverage and replay deduplication | F6 |
| W01 | 8 | Local/capability architect and engineer/contract continuing tasks preserve orientation and update task/tool without head replacement | F1, F2 |
| W02 | 8 | Same high-level operations work loaded or after restart; standalone session command and first-task starts retain their fresh contracts | F1 |
| W03 | 9 | Initial/re-selection forks use their requesting point; engineer consultation branches without adding exploration to the parent | F1 |
| W04 | 9 | Scope review forks assignment; reconciliation forks completion/handback; later parent activity cannot change either source | F1 |
| W05 | 9 | Design review uses matching orientation identity or new orientation; current snapshot evidence required; code review stays fresh | F1, F2 |
| W06 | 9 | Global forks receive accepted briefs through recorded point; dependent questions see prior decisions; brief append is replay-safe and model-free | F1 |
| W07 | 9 | Every fresh/continue/fork site matches C3; missing parent and budget limit follow only explicit recovery, with no runtime strategy selection | F1 |
| W08 | 10 | NFR receives requirements, commits, changed paths and bounded reads excluding run/Git history; irrelevant temporal sentence omitted | F2 |
| W09 | 10 | Capability briefing, validation and guards share the supported policy; unsupported authorizations cannot be advertised or executed | F2, F3 |
| W10 | 10 | Accepted intake reaches initial architecture; review has canonical changed paths, patch-first reading and exact harness binding annotations without hiding diff | F2, F5 |
| W11 | 10 | Focused command/setup reaches engineer; changed-input is accurate end to end; architect reports and configured audit remain separate gates | F3, F4 |
| M06 | 11 | Every invocation role has declared size or explicit limit, current task manifest, and linked session/turn/operation/point | F1, F6 |
| M07 | 11 | Enriched observation capture needs no extra model call or exploration; truncation/replay qualifies results without corrupting durable sessions | F6 |
| M08 | 11 | Cached/new/output charges and elapsed/exploration milestones use recorded identities/rates, with unknowns explicit and no strategy side effects | F6 |
| V01 | 12 | API/web show supplied component units, subtotals, coverage, time/charges and broad searches; client performs no independent recalculation | F6 |
| V02 | 12 | Session view distinguishes siblings, turn/checkpoint points, retry/stopped/failure and explicit fresh recovery without exposing pi file management | F1 |
| T01 | 13 | Trial accepts exactly attributed setup changes but detects unauthorized agent changes in the same file | F7 |
| T02 | 13 | Fixture uses actual module cwd; solution/stale README inputs removed; run records cannot cause analyzed-tree churn | F7 |
| Q01 | 14 | Actual installed Cucumber selects/executes pending focus only, actual Git trial attribution agrees, and boundary witnesses are registered | F4, F7 |
| Q02 | 14 | Real supported pi Continue/Fork/add-tool/restore accepts new submission with prefix equality and isolation evidence | F1 |
| Q03 | 14 | Full configured audit passes on the clean integrated candidate; no new skips, reduced discovery or scenario-semantic veto | All |

No row is satisfied by asserting that a prompt contains the implementation's own
output. Use fixed expected boundaries, request prefixes, selected files, outcomes
and arithmetic. Render assertions are appropriate for text delivery, but execution
and authorization claims require exercising the corresponding behavior.
