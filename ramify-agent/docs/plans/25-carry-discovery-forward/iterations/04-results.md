# Iteration 4 results: NFR discovery and recorded comparisons

**Status:** implemented; focused checks passed; coordinator source review accepted.
**Date:** 2026-10-09.
**Source commit:** `8b1273d1c36917b69704291a32db6db51d5b2716`.
**Base:** iteration 3 receipt `cfdd2926bae3ed28a1c67d9ac17c314be0486fc3`,
with accepted source `71b084fd0b8c8a9983b3854b0de3c2ac433262b9`.
**Branch:** `feat/plan25-carry-discovery-forward`.
**Worktree:** `/home/app/ramify-plan25-carry-discovery-forward`.

## Delivered behavior

The NFR source brief captures `run-start` and `accepted-boundary` comparisons
against the same prepared candidate tree. Each comparison names its actual base,
target and filtered net changed paths once. The original source capture retains
its dirty qualification: a starting commit comparison does not include any
uncommitted starting bytes. Missing reliable history omits `run-start`; failed
diffs and unreadable authoritative candidate entries remain errors.

The strict `recordedRunBase` resolver uses the manifest source identity or existing
recorded invocation/gate recovery provenance. It never consults current HEAD.
The existing workflow `runBase` still retains its own current-HEAD fallback.
That fallback has no authority to create optional historical context.

Accepted assignments/results supply grouped module documentation, declarations,
source and owned-test locations and their explicit discoveries through iteration
3's `StartingPointGroup` and `support:starting-points` renderer. Captured assignment
ownership and gate test owners supply known module locations. Candidate entries,
existing snapshot path rules and `nonfunctionalSourceAllows` filter missing,
inaccessible, symlink, generated-view and run-record hints without live filesystem
probes. Exact path/note pairs retain their harness producer/work-item/iteration,
invocation and original source-boundary origins. No prose path extraction,
completeness check, discovery index or semantic finding was added.

Assessment and scoped investigation hints stay project-relative to their prepared
snapshot. Repair hints are filtered against that candidate and rendered using the
existing project-root workspace convention. The repair task carries its candidate
identity and keeps its guarded workspace tools and write scope. It does not
promise or acquire snapshot tools. Repair read authority remains the existing
project source authority; investigation uses its declared bounded source scope.
Subsequent assessment rebuilds both comparisons and hint filtering for the newly
prepared candidate, retaining prior pointer origins as historical metadata.

`boundedNonfunctionalTools` reuses captured candidate entries and comparison lists
inside the existing lazy snapshot-tool adapter. NFR `snapshot_diff` accepts only
captured comparison names. New tasks default to reliable `run-start`, otherwise
explicitly to `accepted-boundary`. Lists and per-path patches report actual
base/target identities. Shared source policies, limits, deleted-path handling,
read hashes, inspected paths, denials and exploration observations remain intact.
Ordinary reviewer tool declarations and iteration-base defaults are unchanged.
Existing CandidateSource Git uses `--no-renames`; rename-shaped evidence remains
paired delete/add paths, with no new rename protocol.

The assessment prompt starts from supplied locations and requests a relevant diff
when useful, without requiring an initial pathless diff. It retains every fixed
and NFR obligation, whole-tree discovery within source authority, uncertainty and
the assessor's independent semantic judgment. Candidate source is authoritative;
pointer notes, prior completion claims and green audits do not establish
satisfaction.

## Exact retry compatibility correction

The public legacy restart witness exposed an existing NFR recovery behavior:
recovery closed an unfinished coordinator invocation and created a fresh task,
instead of retrying its admitted session operation. The NFR recovery branch now
preserves only unfinished read-only coordinator operations with authenticated
original operation correlation. Existing interruption handling remains for missing
intents and repair writers.

The existing session-operation reader now also exposes the original immutable
task/packet/declarations through a narrow `originalOperation` hook. Owning NFR phase
correlation enforces the recorded candidate/snapshot binding and supplies the
explicit original invocation identity to the existing restore path. A recognized
legacy `{path}` diff declaration rebuilds the existing accepted-boundary tools
using that invocation's recorded base. The old packet and tool declaration/default
stay exact; a named comparison argument remains invalid on the old task. New
named operations retain their current comparison semantics on retry. Immutable
role/package, validator, authority, destination and declaration checks were not
relaxed; no alternate session/recovery store or hot schema fallback was added.

## Acceptance witnesses

The new `plan25-nfr-context.test.ts` contains 11 configured ordinary Node cases.
Its provider, Git and CandidateSource answers are scripted; actual task packets,
source tools, durable records and public run recovery execute in process.

| Cases | Witness and expected outcome |
| --- | --- |
| D8, D12, I05 | Actual two-work-item ordinary/restarted runs capture original A, accepted B and B's prepared tree. Historical A→B source changes and accepted B→B emptiness are distinct. Assignment/result, owned-test and unchanged-caller pointers carry both work-item origins, with excluded/missing hints omitted. |
| D9 | Distinct A→C and B→C patches cover modification, addition, deletion and paired rename deletion/addition. Both named lists and patches carry their base/target; arbitrary refs/names are rejected. Patch truncation and shared inspection/read/denial/action records remain bounded and truthful. |
| D9, I05 | Bounded source tools filter both comparisons and deny out-of-scope patches/reads and generated/run inputs. Search uses the captured allowed entries. Reusing captured entries/comparisons adds no lazy discovery calls. Available-only defaults/schema are explicit. |
| D10 | No recorded original boundary yields only accepted-boundary and no current-HEAD substitution. Recorded invocation/gate recovery and manifest precedence remain usable. Failed diff and candidate-entry reads reject instead of becoming empty history. Actual dirty original capture retains its qualification. |
| D12 | A repair run gives its engineer usable workspace pointers/current candidate without unavailable snapshot tools; the next full assessment rebuilds comparisons and candidate hints for the repair tree while preserving historical origin B. A current pending coordinator operation resumes as one invocation; a missing intent closes the interrupted invocation and follows the ordinary fresh path. |
| D12, retry compatibility | A hand-authored `/1` intent/manifest, role prefix, source brief and legacy tool declarations pass through public run recovery with deliberately different original requested system/prompt bytes. The same invocation, immutable intent and original requested-input hash remain; executable default is accepted-boundary, named input is rejected, and historical patches are not silently substituted. |
| D13, I05 | Actual assessment packets retain both complete NFR/fixed texts, stated conditions, broader inspection and independent judgment. Repair reassessment retains every obligation despite the narrower repair package. Prior accepted pointers never become satisfaction evidence. |

Existing required NFR lifecycle, repair, recovery, submission and ordinary review
tool regressions also pass, including repair-writer interruption controls.

## Checks and evidence

Commands ran from `ramify-agent/`. Evidence is under
`/home/app/ramify-plan25-evidence/`. All `iteration04-*.log` display files are bounded
below 64 KiB. The complete ownership-check output is retained under
`iteration04-raw/`; `iteration04-log-bounds.json` records its bytes and SHA-256.

| Check | Outcome and evidence |
| --- | --- |
| Required five selectors, new NFR witness and affected Plan 25 block-session/discovery-delivery regressions | Passed: 8 files, 65 tests, direct command exit 0; `iteration04-final-tests.log`. The exact selected command appears in that log. |
| Final NFR witness alone | Passed: all 11 tests; `iteration04-nfr-final-witness.log`. The final combined run includes the same cases. |
| Hand-authored legacy control | Passed before final integration; `iteration04-legacy-fourth.log`. Earlier filtered runs mark the other tests skipped by that selector, not passing; the final combined run executes all 11 cases. |
| `npm run type-check` | Passed across project, web, scripts and browser-acceptance compiler scopes; `iteration04-final-typecheck.log`. |
| `npm run check:self` | Passed: 12 owners, 700 source files, 50 resources, 13,737 accesses; 0 errors/warnings and 328 nonblocking analysis limits; `iteration04-final-check-self.log`. |
| Configured discovery | `vitest list --filesOnly --json`; `iteration04-configured-discovery.json`. All eight selected files are configured ordinary Node tests; `iteration04-checks.json`. |
| Process guard | Exact final time window/cwd: eight per-file receipts, zero allowed launches and zero refused attempts; `iteration04-process-guard.json`. No native exemption was added. |
| Coordinator source review and `git diff --check` | Passed; coordinator accepted the implementation and final focused verification before source commit. |

Development failures and their corrected reruns remain in the bounded evidence.
Fixture corrections covered role-turn selection, exact preview counts, environment
JSON spacing and the actual prepared-operation crash hook. The legacy executable
control exposed the coordinator interruption behavior corrected above; retained
intent bytes alone were insufficient evidence. Initial type-check errors involving
a missing `posix` import and the gate-test-owner object were corrected. No failure
was counted as passing or classified as a flake. An early combined log capture
was copied before its completion summary; the final run directly reports exit 0
and complete counts, without relying on a following bookkeeping command's exit.

No direct whole suite, configured audit, native/live provider or paid performance
run occurred. These checks establish deterministic delivery/access/recovery
behavior and project source conformance, not provider cache hits, latency, cost
or semantic NFR satisfaction.

## Iteration 5 handoff

- Candidate-bound discovery and named comparison implementation is complete.
  Join D8–D10/D12–D13/I05 evidence to the earlier receipts in qualification.
- New tasks use run-start when reliably recorded; legacy admitted tasks retain
  their original accepted-boundary default/declarations on exact retry.
- Combine the ordinary orientation → selection → assignment/result/review → NFR
  workflow, update current source specifications, and join all case/commit evidence.
- Run the final configured full nested audit and required native/live qualification
  on the exact clean integration candidate under iteration 5's contract.

All source and receipt writes stayed in this isolated committed worktree. The
independent uncommitted reviewer work in `/ramify` was not copied or modified.
No merge, push or publication occurred.
