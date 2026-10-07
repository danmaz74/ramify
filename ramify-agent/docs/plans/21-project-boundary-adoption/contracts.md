# Agent adoption contracts

These align provider adoption and architect reporting with the adopted
[principles](../../harness.principles.md) and responsibility decisions in the
[analysis](../../analysis/2026-10-07-agent-declarations-and-audit-responsibilities.md).
The [harness specification](../../harness.spec.md) still needs the separately
authorized alignment identified in [protected wording](protected-wording-proposal.md). P2–P5 refer to
[provider requirements](provider-requirements.md). Proposed record fields below
are agent-owned; they are not claimed provider exports.

## 1. Ownership and assignment authority

Keep the distinction between ownership, analysis and write permission.
Evidence obtains ownership from the installed Ramify CLI, initially the
ownership query `ramify affected --batch --root <project> --format json --path .`.
Decode the adopted version strictly and retain its source/revision identity.
Use explicit project roots so an unmarked target cannot climb into the enclosing
toolkit. An unavailable answer is an unavailable scope, not permission derived
from directory names or a stale architect view.

An ordinary assignment contains:

- one module;
- one `included` list of directories, each `{ directory, reason,
  instructions }`, each naming one whole tree (Dan, 2026-10-07). The
  ownership answer says what the directory is: an immediate child module's
  subtree or a declared owned-nested-project tree, and who owns it. The
  architect supplies neither kind nor owner, and a directory that is neither
  is refused;
- existing narrow contract/conformance/fake/exposure/consumer extras, validated
  against current ownership and the same exclusions;
- explicit bootstrap creation authority from accepted module registry entries.

The base module permits its owned source, auxiliary source, configuration,
documentation, scratch and owned-unwired trees, except declared
owned-nested-project trees. An included child subtree permits its modules'
ordinary owned contents, while each owned-nested-project tree beneath it still
needs its own entry. External trees, outputs, repository metadata, installed
packages and generated views are never writable through an enclosing
assignment, including a breaking or contract assignment. A single-file extra
cannot bypass a whole-tree inclusion rule.

Remove `outside-modules` from new assignment/submission schemas, test policies,
prompts and execution paths. Auxiliary source is assigned through its owner.
Keep legitimate contract extras; removing the obsolete purpose does not erase
contract/fake-injection restrictions or permit broad writes to another owner.

### Resolution, changes and containment

Capture an explicit scope revision, the ownership answer identity, the resolved
positive regions/files and excluded regions. A bare parent-directory prefix is
insufficient. The write guard evaluates hard exclusions before positive roots
and applies the same decision to explicit files. An owned-nested-project inclusion
opens only its named tree; it cannot open an external or generated descendant.

Reuse `resolveRealTarget` for existing paths and nonexistent paths through their
nearest existing ancestor. Test symlink aliases, escapes, sibling prefix
collisions and a nested excluded tree under an included child. Ask Ramify for
new/deleted candidate path placement, including reserved segment behavior;
do not copy provider reserved-name rules into another ownership classifier.
Batch changed-path queries at the gate, respecting provider limits and one
coherent source identity. An unknown or changing classification cannot pass.

A refresh may narrow current authority but never expands the captured assignment.
A new external declaration immediately prevents writes; removing an exclusion
does not silently open a formerly excluded tree. Bootstrap owners require the
accepted creation entry. Boundary or ownership changes needing broader authority
return to the issuing architect for a new recorded scope revision.

Guarded configuration remains separately authorized, including the effective
audit definition, workspace preparation, manifests/lockfiles and relevant runner
configuration. Keep harness-only files and captured requirements protected.
Guard the applicable files for included packages as well as the root. Do not
interpret an ignore-list edit as an ordinary harmless documentation change.
The final candidate guard checks all changed paths, covering shell writes that
the per-tool guard cannot intercept. No claim is made that arbitrary shell
commands are sandboxed.

## 2. Instructions, working directories and lifecycle

The issuing architect supplies a reason and instructions for every included
directory. For an owned-nested-project entry, brief the declaration, derived
owner, path, absence of Ramify source analysis, verification commands and
applicable project instructions.
For a nested project, use its root for its commands. Substantial independent
project work stays a separate run rooted there; inclusion is not an automatic
recursive engineer launch. Reads may expand deliberately without widening writes.

The default working/search directory remains the assigned owner's `src/`.
Auxiliary and documentation work uses its actual authorized location; do not
move source merely to satisfy the old scope helper. Ordinary and testing API
views remain distinct, revision-bound and refreshed through shared preparation.
Missing views and coverage limits remain explicit. Production-only search also
excludes separately declared testing modules, not just `src/tests/`.

Ordinary, capability and standalone engineers use the same authority and hook
rules. Preserve Plan 20's scratch lifetime, including nested suspension,
restart, newly added modules and tracked-file protection. An owned nested tree
does not become scratch and is never removed by scratch cleanup.

## 3. New runs and historical records

Introduce one new run-policy identity for the changed scope and acceptance
semantics, advancing `run-policy/6` only once. Update the capability policy,
assignment builders, schemas, prompt inputs, recovery and standalone records
together. Record which provider contract set the run captured.

A run recorded under an earlier policy is refused outright, naming its policy
version and the current one, before cleanup, preparation, agent launch or any
writer starts; the message says a fresh run is required (Dan, 2026-10-07).
No historical reader, decoder, inspection path, backward execution adapter or
automatic scope migration is kept for it: an old run cannot resume by
interpreting its positive `src/` roots as new whole-owner authority or by
silently dropping `outside-modules`, because nothing reads it. Remove the
existing historical decoders with the policy bump. Ordinary recovery within
the new policy restores the exact captured scope and pending effects.

## 4. Hook results

Evidence decodes the adopted `ramify.check` result, including each requested
path's `checked`, `not-analyzed` or `not-checked` disposition, owner/exclusion,
reason and covering identity where the provider supplies it. Keep the project
check result and per-path analysis facts separately in the harness record.

Exit 0 can accompany a path Ramify does not analyze. Show that path as
not analyzed, not as having passed source checking. An excluded-only request
may still return project findings; relay them. Mixed requests preserve every
path disposition. An unavailable/stale/deadline result never becomes a pass.
Remove the local configuration-filename shortcut where the provider now answers
the path; keep full checks at explicit gates or when the complete changed set
is unavailable, as the existing workflow requires.

Clear standing findings only when producer evidence covers the relevant
analysis and establishes their removal. Naming a file in the request is not
coverage. Test source deletion, mixed checked/unanalyzed changes, retained
findings at exit 2 and excluded-only writes. Remove outside-module warning
suppression and render current boundary violations and project warnings with
their actual severity. No boundary violation is downgraded into a coverage note.

## 5. Preparation and project policy

The audit child uses P3 to read the exact committed definition. Retain its blob,
source commit, normalized policy and declared preparation. The harness does not pass
scenario or required-test obligations to audit for certification; it cannot
replace the project's workspace section with a discovered manifest list.

Use declared `workspace` package directories, setup commands and required check
definitions. A package directory says what must be prepared, not whether it has
tests. Derive required test executions from those definitions. Remove
`discoverNestedPackages`, the depth limit, default filename readiness discovery
and inference from nested `package.json` test scripts.

Readiness verifies availability, runs the declared preparation in the run's
working tree, then requests a full audit of HEAD through the public provider,
which executes the configured suite in its own checkout or reuses applicable
full evidence (Dan, 2026-10-07). The preparation step stays because neither
a reused result nor the provider's isolated execution puts setup outputs or
generated files where engineers work. The baseline check and the final gate
are the same request; readiness has no check executor of its own, and records
the request/report identities and both source identities on reuse. Keep clean-tree
and Plan 20 scratch checks before run-owned mutations, bounded recovery,
environment scrubbing, cancellation, process settlement, workspace intent and
cleanup.
Do not repair configuration by broadening tests or automatically editing policy.
If `ramify-agent.json` setup declarations overlap the committed audit workspace,
translate the existing declarations once in the reviewed configuration migration;
new runs use the captured effective policy, never two competing setup sequences.
Unsupported declared preparation is an explicit environment/integration error.

## 6. Verification and configured discovery

Audit establishes the configured suite's execution health. The responsible
architect evaluates the implementation, actual tests, audit diagnostics and
recovery, then reports whether requirements are correctly implemented and
passing. Neither committed nor dirty execution certifies a registered obligation.

Use the public provider path for committed project checks, ordinary partial
impact, retained failures and explicit full gates. Required execution means
checks required by the project's captured configuration, not a harness mapping
from scenarios, declarations, assignment owners or `where` hints to test files.
Audit owns configured discovery, execution completeness and producer verdicts.
The harness stores complete results and diagnostics; it does not recompute
expected/run comparisons or synthesize coverage/causal conclusions.

Remove harness filename discovery, test-area guesses, outside-module suite
loops and assignment/scenario coverage gates. Preserve configured runner roots,
multiple commands/configurations and legitimate host-only checks. Do not use
`--passWithNoTests` to reinterpret missing producer-required execution as a pass.
New eligible tests are included by the runner/provider on the next attempt;
which tests should exist is the architect's responsibility.

Every audit the harness requests runs over a committed tree: the candidate
commit of an iteration gate, a work-item gate or the final gate. The harness
requests no dirty audit and offers no harness-resolved scoped test run.
Remove the `run_scope_tests` tool from every engineer role and its scoped-test
timeout from the project configuration. An engineer inspects its work by
naming test files to the shell, whose whole-suite refusal stays; the audit at
its gate is the answer for the rest, including dependents' tests, and the
engineer's session continues with the gate's digest when that audit fails.
The briefing names what the engineer is judged on: the scenarios it must bind
and its assigned owners' test areas, as text. Agent-selected focused targets
do not become completion obligations. P4 review determines any actual
remaining public committed-execution gap; it does not assume an
assignment-selection API or a dirty path is needed.

Retain current cancellation, leases, process settlement and all execution
artifacts. No separate assignment-certification conclusion is required.
Analysis limitations alone do not force full execution. Provider partial/full
selection, configured completeness, carried failures and widening stay producer-owned.
An empty configured selection is recorded truthfully, with no implication that
an architect's requirement is implemented or unimplemented.

Scenarios are ordinary configured checks (Dan, 2026-10-07). The project's
committed audit definition declares its Cucumber commands like any other
check, with a committed profile that excludes `@ramify-pending`; the
provider narrows them by module ownership in partial audits and runs them all
in the full audit. Remove the harness scenario check, its quick and full
modes, the per-checkpoint selection table, identity-tag selection,
harness-written profiles and the `acceptance` section of `ramify-agent.json`,
including its support, mode, setup/teardown and readiness dry-run entries; a
project that wants a dry run declares one as a check. The harness keeps
writing feature files, the identity and pending tags and the scenario records,
and reads per-scenario results from the audit's raw runner output as
inspection context only. Step isolation per module is no longer a harness
run property: the project's Cucumber configuration and Ramify's `expose-test`
rules govern which step files load, and an ambiguous step is a producer
failure. An empty ownership-narrowed selection is recorded truthfully.

Every `.md` path follows the provider's inert affected selection, including
runtime prompts. Add no harness prompt-path override. Source-check dispositions
come from the separate check response. Empty impact does not remove required
architect reports or the final full-audit check.

## 7. Commit audits, reuse, nested projects and recovery

Use the public audit service and retain complete versioned results/artifacts.
Audit health comes from `composition.verdict`; never substitute a run-local
summary or failure-count calculation. The architect decides requirement
satisfaction separately. Recording a done declaration is not conditional on
an audit pass, and an audit failure cannot automatically retract it. Final gates request `mode: 'full', nested: true`.
Nested results preserve project root, source commit, run/tree/report refs,
executed/reused status and verdict. A nested failure or indeterminate discovery
prevents final success even when the enclosing project passed.

Explicit audit ignores may name external trees and both owned kinds. They never
open write authority or suppress provider nested discovery.

The provider discovers eligible tracked definitions, including those under
owned-unwired and owned-nested-project trees, and skips
external/output/generated boundaries with reasons.
Do not implement a second recursive walker or automatically add audit definitions
to fixture projects just to produce more nested runs. A nested project included
for work needs its declared final verification; missing required configuration
is an explicit readiness/acceptance failure.

Remove the blanket `force: true` and reuse refusal once producer-applicable
evidence satisfies the requested project audit policy. Request new execution only for a
concrete unmet configured execution requirement or explicit fresh-run acceptance witness. On reuse,
retain both requested source commit and audited source commit, the producer's
applicability explanation, original report refs and current request outcome.
Do not require newly executed command receipts for commands the provider reused,
inherited or did not select. Do not fabricate a new command duration or pass.
Full requests can reuse only full evidence eligible under the released policy;
a partial chain does not turn into a full audit through presentation.

Recover a completed result using its durable request/report identities, including
the nested result list. Do not rerun merely to reconstruct missing display data
or find a mutable latest ref. Preserve repository lease, workspace ownership,
process-group settlement and cancellation before replacement work. Machine lock
timeouts are unrun; focused tools retain their existing lock policy.

## 8. Agent layout and public access

Mark the agent root and three fixture roots in the same dependency-adoption
commit. The common `rootDescription` helper creates marked roots; generators,
bootstrap targets, examples and tests that intentionally exercise refusal must
state their intent. Never mark ordinary child descriptions as roots.

At the agent root, declare `owned-unwired "docs"`. In the harness description,
declare these three project roots individually; the `fixtures/` parent is not
a project root:

```ramify
owned-nested-project "fixtures/capability-coordination"
owned-nested-project "fixtures/capability-coordination-nested"
owned-nested-project "fixtures/collection-review"
```

Set `ignorePaths: ["docs/**"]` in the agent audit definition and remove
`enclosingProject`. Docs retain ownership, are never analyzed and select no
modules regardless of extension, including archived code examples. Ordinary
owner scope covers owned-unwired docs, subject to protected-document rules;
owned nested projects require explicit inclusion with reason and instructions.
P1 is withdrawn. Verify docs receive not-analyzed dispositions and empty seed
selection; compiler source under `scripts/` remains analyzed auxiliary source.
Preserve compiler/runner exclusions for scratch and fixtures and repair actual
script import/exposure issues. Audit ignores govern reuse independently of
analysis and write authority.

Keep cross-owner operations in existing owners:

| Owner | Supplies |
| --- | --- |
| Evidence | Ramify CLI decoding, ownership/dispositions, generated-view reading, Git facts |
| Audit | Public provider configuration, configured execution/diagnostics, preparation and complete audit evidence |
| Harness | Assignment authority, authorization, durable workflow, explicit obligation registration and trusted architect declarations |
| Web | Projection of harness facts, including nested projects and not-analyzed paths |

Search the receiving module's generated API view before adding imports. Add
named exposures and every required signature companion in the owning declaration;
do not create a broad public surface to silence check failures. Runtime Ramify
library imports remain disallowed for Node owners; CLI and generated files are
the integration surface, with package types/schemas only as project rules permit.

## 9. Registration and architect declarations

Preserve accepted initial-plan acceptance IDs, original delegated requirements
and their provenance. The responsible architect chooses the granularity of
additional independent tracking: default to one delegated outcome; separately
register a scenario or required test only when useful. Ordinary implementation,
regression and extra edge-case tests never become obligations automatically.
Registration choices cannot erase an approved requirement. Existing original
capability examples remain visible and immutable through revisions; they need
not each become a new independent reporting object merely because they exist.

Use current architect submissions, assignments and run records. A declaration
identifies registered obligation IDs and the responsible architect's judgment
that they are correctly implemented and passing. It may include one optional
short `where` string per obligation. The harness validates identifier existence,
actor authority and structural/idempotency constraints; then records and trusts
the judgment. It does not inspect files, resolve paths, match test results or
use an audit pass as corroboration. Missing `where`, an absent path or a
nonexistent symbol is never a reporting/completion rejection.

The declaration records author/invocation provenance using the existing durable
submission discipline. Reuse the current scenario/capability identities and
state projections rather than inventing another general registry or parallel
state machine. Iteration 0 freezes the concrete fields/events, permitted timing
and how an architect explicitly revises its judgment. The engineer reports work
and tests but cannot provide the final architect declaration. Review findings
inform the architect; no new mandatory per-obligation reviewer is introduced.

## 10. Scenario state, delegation and agent judgment

Every registered obligation, a scenario or a registered test, has one of three
states, each entered by one accepted submission and never by the harness on
its own (Dan, 2026-10-07):

| State | Meaning | Entered on |
| --- | --- | --- |
| `pending` | Registered and defined in text; nothing binds it | registration |
| `bound` | An engineer declared its step definitions or test exist; the declaration names the fakes the binding relies on, possibly none | the engineer's accepted completion proposal |
| `done` | The responsible architect reported it correctly implemented and passing | the architect's accepted declaration |

"Implemented with fakes" is `bound` with a non-empty fakes list. Passing is
never a state: it is the audit's evidence for the latest candidate commit,
shown beside the state. Remove `declared`, `implemented`, `scenario-due`,
`scenario-implemented` and `scenario-withdrawn`, the open-requirement
derivation of fake-backed passes, gate-pass-driven promotion, repair-exit
automatic withdrawal, cited-test-file/execution matching and provider/consumer
test-file coverage conditions. The pending tag comes off at `bound`, fakes or
not, so the audit exercises the binding from the next candidate commit on.

The engineer's binding declaration carries, per ID, an optional `fakes` list
of the fake class names it relies on; the fake-naming rule already fixes those
names. An engineer that rewires a consumer to the real provider lists the ID
again with no fakes, through the same idempotent path. The harness records
the list with provenance and shows it to the architect; it never cross-checks
it against the source. A binding declaration for an obligation already `done`
records the new fakes list and leaves the state `done`: only the responsible
architect's revision moves it back to `bound`, through the same declaration
path. The architect's done report is accepted whatever the list says, since
a fake may be permanent. There is no
harness-driven withdrawal: removed step definitions fail in the audit as
undefined steps, and the architect assigns repair.

Architect judgments alone drive semantic implementation status. Preserve raw
results and useful navigation context. Do not generate composition diagnoses
from comparisons of local and integration test runs or infer repair
responsibility from failure paths/counts.

Agents determine appropriate executable translations and configured-suite
inclusion. Feature generation/eligibility changes must apply explicit agent
decisions rather than audit-derived scenario state. Scenario results come from
the configured Cucumber checks' raw output, associated by identity tag for
display: retain raw runner diagnostics, not requirement-to-result mappings in
the harness. Freeze the smallest compatible rendering contract in iteration 0;
don't delete useful authoring tools by default.

A completion proposal is structurally complete only when it declares every
scenario its assignment names, where the declaration rules already accept the
ID. A proposal missing one is a rejected submission naming the missing IDs,
under the existing per-turn bound, and the turn returns to the engineer; no
candidate commit, audit or review runs on it. Partial work remains the
honest exit and is never rejected for an undeclared scenario. The harness
verifies declared IDs structurally; it still judges nothing about whether
the declared binding is correct, which the gate's audit and the architect do.

An integration scenario's work item is due when every sub-scenario is `done`;
the done reports are the only trigger, and there is no separate readiness
decision. A local or fake-backed success never supplies
a broader consumer completion declaration. The responsible capability architect
assesses the original behavioral need, appropriate tests and real integration
before handback. The harness checks authorized actions, required reports and
existing non-test workflow boundaries, not cited files or passing owner tests.
The requesting engineer/parent architect's broader obligations remain open
until their responsible architect reports them done.

Original examples and approved requirements survive capability plan revisions
as immutable context of the request. Remove the per-example coverage record,
its `unresolved`, `exercised` and `corrected` states and its evidence and
test arrays (Dan, 2026-10-07): handback is the capability architect's done
report on the registered obligation, with optional `where` text, and
anything it wants to say about an example is free text in that report.
Optional human-readable references remain supporting context. Coverage
records of an old-policy run are refused with that run and never reinterpreted
as declarations.

## 11. Incomplete requests, reassessment and recovery

An architect's completion/handback request that omits a done report for a
registered required ID of its own is a rejected submission naming the
outstanding IDs, under the existing per-turn rejected-submissions bound,
exactly as an unknown ID is rejected today; the same turn continues. The
architect may report work it forgot to declare, coordinate unfinished work
or explain a blocker. An authorized done report resolves the gap without
harness reassessment or evidence matching. No continuation brief, outstanding
question or clarification flow exists.

Use existing invocation/work/recovery bounds; add no clarification counter.
Exhausting the rejection bound ends the session as a rejected-submissions
result carrying the outstanding IDs, not a semantic verdict about code.
Persist declarations and registration decisions through existing
effects/ledger mechanisms. Duplicate/replayed submissions have the same
idempotent behavior as other architect actions; restart cannot launch a
second writer.

Supply relevant current source/change information, audit diagnostics and review
findings through existing readable tools and briefs. The architect decides
whether earlier judgments need revision. Changed source or a failed audit must
not automatically retract a declaration or reset all status. Source provenance
is inspection context, not a requirement invalidation rule. Do not require the
architect to reread the entire project at every turn.

## 12. Final verification and projections

Completion requires the registered architect reports and the separate final
full audit of the captured configured suite, with required nested project
results. The final audit's producer verdict remains truthful even when all
architect declarations say done. A failing full audit prevents successful
final verification without altering those declarations. There is no extra
per-scenario execution/evidence gate at finalization.

Briefs, public harness records and web show architect declaration/provenance,
optional `where` text, outstanding reports and audit results as separate facts.
Forward location hints to final agent inspection; don't validate or execute them.
No web-side status recomputation, fabricated causality or audit-based semantic
completion badge is permitted.
