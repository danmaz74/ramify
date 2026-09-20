# Capability map to first work brief: results

**Status:** Complete at the requested stopping point. All three briefs passed
artifact review after corrections. Implementation launches: **zero**. These
are planning results, not implemented features or passing feature tests.

## Request

Move three example requests out of the toolkit's real execution-plan location
and simulate decomposition to the first implementation brief with Sol agents.
Stop immediately before the first implementation invocation.

The examples are now isolated under [examples/](examples/), with their input
hashes preserved in [input-moves.json](evidence/input-moves.json). No example
remains under `/ramify/plans`.

## Method

Six fresh `gpt-5.6-sol` sessions simulated pi's planning roles: one capability
architect and one briefing architect per example. Each briefing session started
without the mapping agent's conversation. It received the request, corrected
capability map, protocol and relevant repository evidence. Correction turns
reused the agent that authored the affected artifact.

The coordinator acted as reviewer and driver; this was not an execution of an
implemented harness state machine. Map approval was explicitly a
`simulation-assumption`, allowing planning to continue without implying human
approval of architecture or implementation.

Actual invocations, prompts, corrections and stopping points are in
[run.json](run.json) and [trace.jsonl](trace.jsonl). Per-case `*.initial.*`
artifacts preserve the first outputs; `*.review1.*` preserve intermediate
briefs when a further protocol correction was needed. Unqualified output
filenames are the latest corrected handoff artifacts.

The coordinator refreshed the architect and all API views once through
`./dist/src/ramify materialize --view architect --view api --all`. The archived
[metadata](evidence/architect-meta.json) identifies revision
`rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4` and input
`input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`.
The snapshot describes 15 modules with measured production dependencies,
test references and metrics; it reports 366 truncated details, one unavailable
detail and 21 dynamic test titles. Agents recorded bounded source inspection
and requester-specific API evidence in their reports.

## Answer

| Example | Capability map | Selected first consumer | First iteration | Still outstanding afterwards |
| --- | --- | --- | --- | --- |
| Copy module ID | 4 capabilities, 1 owner, no cross-branch seams | `ramify/presentation/project-view` | Complete local copy interaction, including async failure, accessible feedback and stale-selection handling, with component evidence. | Real-browser clipboard/paste evidence and any remaining local defects. |
| Share explorer view | 5 capabilities, 2 owners, 1 cross-branch seam | `ramify/explorer` | Canonical address, delayed restoration, and Back/Forward/reload behavior in the existing browser consumer. | Copy-link control, clipboard fallback and complete copy/open acceptance; any consumer-proven presentation gap. |
| Dependency baselines | 10 capabilities, 8 owners, 6 cross-branch seams | `ramify/cli` | Compare-command grammar, human/JSON rendering and exit behavior against a provisional dependency. | Local save/list/delete behavior, real shared service, persistence, analysis, isolation, browser surfaces and final integration. |

The owner counts describe mapped capability reach, not modified modules or
scheduled agents. Every first brief has exactly one writable owner. A map
relationship or seam does not itself schedule a task or require a new contract:
existing available behavior may already satisfy it.

The first-work briefs are the principal deliverables:

- [Copy module ID](runs/copy-module-id/first-work-brief.md)
- [Share explorer view](runs/share-explorer-view/first-work-brief.md)
- [Dependency baselines](runs/dependency-baselines/first-work-brief.md)

Each directory also contains `capability-map.json`, `mapping-report.md`,
`map-review.json`, `execution-decision.json`, `briefing-report.md` and
`brief-review.json`, plus the exact prompts and correction requests.

## Findings from the actual runs

1. **Capability maps and execution decisions stayed separate.** The corrected
   maps contain capabilities, owners, relationships, reuse and seams. The
   separate execution decision selects a consumer, writable scope, work-item
   goal and first-iteration goal. No complete backlog was needed.

2. **A smaller provider is an attractive but wrong starting point.** The large
   case initially chose a pure comparison renderer because its context was
   smaller. The accepted map identified that renderer as a provider to the
   browser workflow. Review rejected that choice; the briefing agent then
   selected the terminal consumer and only its compare operation. Consumer-first
   selection needs an explicit check; boundedness alone is insufficient.

3. **Task completion and iteration completion require precise result semantics.**
   The medium case retained copying as local continuation. The large case
   initially called a passing compare-only iteration `goal-reached`, despite
   remaining terminal operations and a fake provider. That would prematurely
   complete the work item. Review required `partial-with-needs` with iteration
   completion, local continuation and external needs in the payload.

4. **The outcome vocabulary should be supplied, not authored anew.** Initial
   briefs invented labels such as "iteration complete", "external need" and
   "blocked", or gave no closed result set. The initial protocol asked for an
   outcome protocol but did not enumerate the five outcomes. Correction had
   to supply them explicitly. A further check separated crashes, timeouts and
   malformed submissions from semantic outcomes. This is a prompt-contract
   weakness exposed by the spike, not evidence of an implemented parser bug.

5. **Local relationships must not create contract tasks.** All three initial
   maps called some same-owner relationships seams; the large case also called
   a parent/child relationship a seam. Correction retained the relationships
   and restricted seams to different module branches. This guard can be
   mechanical once the map references canonical owners.

6. **Requirement preservation needs review.** The initial large map omitted
   baseline storage's input/view/watcher isolation requirement. Review added
   the relevant project-input capability and preserved uncertainty about the
   actual storage path. The later brief also generalized an existing CLI flag
   incorrectly; current source supports human output by default and explicit
   `--format json`, not explicit `--format human`.

7. **Need-to-know handoff does not happen automatically.** The medium brief
   initially required its engineer to read the whole global request. Review
   removed that dependency and retained the applicable requirements in the
   brief itself. It also caught a directory path where a canonical scope ID
   was required and a nonexistent prompt reference. These are useful automated
   artifact checks for a future harness.

8. **The first brief is executable as an invocation, not as existing tests.**
   Every first consumer still has to establish executable evidence. The large
   case can use provisional consumer-local fakes to discover missing behavior,
   but it cannot yet issue a proven provider obligation. Future tests and fake
   call logs must be labeled as evidence to create, never existing evidence.

## Proposed process refinements

Keep the two planning stages. Give them fixed output schemas and an
authoritative outcome fragment rather than having each agent rewrite the
control protocol. Validate canonical owner IDs, ancestry, references and
existing read-first paths mechanically. Check request coverage and the
semantic choice of the first consumer explicitly before marking a brief ready.

Preserve the distinction among the global feature, the current work-item goal
and the next iteration's goal. The latter may finish while the work item
remains partial. A need-free local continuation must be representable without
inventing an external provider merely to obtain another iteration.

Keep new provider tasks uninstantiated at this stopping point. Their useful
contracts and executable obligations will come from the initial consumer's
actual implementation evidence, not from filling in the capability map.

## Not verified

No production implementation, new executable test, fake, provider contract or
module declaration was authored by the spike agents. Implementation launches
remain zero. No feature test, build, type check, browser trial, real pi session,
runtime retry or durable harness replay was executed.

Brief readiness is a reviewed planning result. It does not establish that an
iteration fits a real context budget, that its future implementation will pass,
or that later provider and integration tasks will be complete. The synthetic
map-approval gate is not a real user's architectural approval.

The toolkit target's tracked files were unchanged at the boundary checks.
Two separate pi-adapter source/test files changed elsewhere in the shared
workspace while the spike ran; the hash audit cannot establish their author.
All planning agents confirmed writes were confined to their allowed artifacts,
and the coordinator left those files untouched. The observation is recorded
in [concurrent-changes.json](evidence/concurrent-changes.json), rather than
claiming the entire shared workspace was unchanged.

The final [boundary check](evidence/source-boundary-check.json) records the
checked file counts and observed changes. Input hashes, artifact references,
canonical owners, cross-branch seams and read-first paths were validated.
JSON and JSONL parse checks and local Markdown links were checked. The exact
verification summary is in [artifact-validation.json](evidence/artifact-validation.json).

## Next step

Review these first-work briefs and the exposed protocol gaps. The experiment
stops here, before handing any brief to an implementation agent. A later,
separately authorized execution could test whether the prepared iteration
actually produces useful consumer evidence and executable provider needs.
