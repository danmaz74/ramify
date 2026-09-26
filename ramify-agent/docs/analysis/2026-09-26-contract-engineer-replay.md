# Contract engineer: interface design and replay investigation

Date: 2026-09-26. Status: investigation and controlled prompt experiment;
no production harness change.

The contract engineer owns interface design. The local architect coordinates
implementation using the resulting contract and impact findings. Moving interface
design into an architect preflight would put the remedy in the wrong role.

## What the original trial establishes

Run `20260926T052417Z-21d928` had contract invocations `inv-0008`, `inv-0011`
and `inv-0014` (iterations i02, i04 and i06). All returned `incomplete`.
The first invocation started fresh, at commit
`1803db6b72ea194730ad1a87d6cba459b35622e1`, with no retained source changes
from its requesting engineer. Its model was `openai-codex/gpt-6-sol`, with
`medium` thinking recorded in the raw Pi session.

The original prompt already instructs the engineer to read both sides and
existing consumers, preserve their guarantees, seek a compatible design and
report conflicts. It does not turn those instructions into a concrete design
and discovery procedure. Its procedure also tells the engineer to return
`incomplete` when an unnamed provider injection site is needed. In i02 it
returned after naming one producer, although its search had shown others.

The original need required populated diagnostic output, including empty values
for non-denial diagnostics. It did not prescribe mandatory additions to the
existing TypeScript interface. Later requests did prescribe mandatory fields.
The review's claim that the plan necessarily required a breaking shared-type
change is stronger than the evidence supports. A compatible design must be
investigated and demonstrated; it cannot simply be assumed possible either.

The actual breaking design made existing typed diagnostic fixtures fail to
compile. The contract checkpoint required a project-wide type check while the
contract role could not adapt other consumers. Better discovery can expose
this conflict earlier; prompt wording alone cannot remove it.

Sources: [feature constraints](../../../plans/self-explaining-denials/plan.md),
[contract principles](../harness.principles.md#horizontal-work-uses-separate-agents-joined-by-a-contract),
[contract procedure](../../subs/harness/src/prompts/contract.procedure.md),
[contract system prompt](../../subs/harness/src/prompts/contract-engineer.system.md).
Original run records are under
`/tmp/ramify-sed-gpt6sol-reuse-20260926/plans/self-explaining-denials/.harness/jobs/20260926T052417Z-21d928/`.
The detailed role review is in the trial harness checkout at
`ramify-agent/docs/analysis/2026-09-26-self-explaining-denials-session-review/contract-engineer.md`.

## Improvements to test

| Improvement | Where it belongs | Evidence motivating it |
| --- | --- | --- |
| Separate behavioral requirements from representation; compare compatibility alternatives and explain the chosen interface. | Contract skill and procedure. | The run moved from missing output fields to changing a shared type, without a demonstrated comparison of designs. |
| Finish impact discovery before returning at the first blocked edit; group findings by owner and state coverage gaps. | Contract procedure and incomplete report guidance. | i02 saw several producers but reported one. |
| Check each relevant compiler project and report those that did not run. | Contract procedure initially; a diagnostic tool could make complete execution reliable. | i06 stopped at the first failed project in an `&&` chain, hiding the reference-harness fixture. |
| Require consumer evidence for the new behavior and meaningful conformance cases. | Contract skill and procedure; actual test selection belongs to the harness. | Existing CLI tests passed without exercising the new evidence fields. |
| Make `run_scope_tests` include the conformance suite it promises. | Harness tool and test-selection contract. | The tool selected only CLI tests; the registration gate separately adds submitted conformance paths. |
| Carry the engineer's design, impact findings and created artifacts directly into follow-up contract work. | Submission/continuation protocol and briefing. | An ordinary engineer had to restate injection locations between contract attempts; `incomplete` has only prose arrays. |
| Support an explicit decision when the required interface really needs a breaking migration. | Contract lifecycle and module-scoped implementation coordination. | The chosen mandatory-field change could not pass the global type check before other owners adapted. Weakening the gate is not established as a remedy. |

The registered-consumer list comes from harness requirements and obligations.
It is not an inventory of every existing source use. Global read access was
already available, so wider read permission is not the missing capability.
Useful evidence delivery and discovery instructions may still help.

## Experiment

Replay the first contract invocation, before later failures or discovered paths
can enter the brief. Use two isolated trees at its starting commit:

1. Original captured system prompt and brief.
2. The same inputs with an additional design/discovery procedure. The addition
   names no trial-specific files, expected interface, or later failures.

Both use the original model and thinking level, context policy, write scope,
submission validator, shell, write guard, post-mutation checks and scoped-test
implementation. The runtime source is extracted from committed trial harness
revision `c4af2a4ee7d14f58391e72a334dc0d38ad2b557b`; its installed dependencies
are reused. Production and ongoing Plan 14 work are not experiment inputs.

Evaluate the actual design and findings, rather than rewarding an `established`
label. Assess:

- Whether the proposed interface satisfies the output requirements and explains
  compatibility with existing values and consumers.
- Whether it discovers producer, consumer, fixture and transport impacts in
  the first invocation, with evidence and explicit uncertainty.
- Whether it supplies meaningful consumer/conformance evidence and accurately
  distinguishes executed checks from skipped or unselected checks.
- Whether a blocked result gives an actionable design and affected-owner
  report, including any artifacts created, without violating scope.
- Turns, elapsed time and reported token usage as costs of the result.

This is a small diagnostic comparison, not statistical proof. Model sampling
is not deterministic. Absolute paths change and generated views are rebuilt
from the starting source. A 15-minute outer bound replaces the original
60-minute invocation bound. The probe stops after the submission: it does not
register a contract, commit changes or exercise the subsequent contract gate.
Any `established` submission therefore remains an unverified proposal here.

Experiment files and complete session records:
`/tmp/ramify-contract-replay-20260926/`. The runner is `replay.mts`; the prompt
change is `prompt-addition.md`; each arm has `project/` and `records/`.
The [prompt addition](2026-09-26-contract-engineer-replay/prompt-addition.md),
[runner snapshot](2026-09-26-contract-engineer-replay/replay.mts), and result
manifests are also retained beside this report. The runner snapshot uses the
absolute experiment paths; it is an experiment artifact, not a portable CLI.

## Results

Both sessions completed with valid `incomplete` submissions, without source
edits, rejected submissions or timeouts.

| Observation | Original prompt replay | Improved prompt replay |
| --- | --- | --- |
| Turns / session elapsed | 5 / 33.4 seconds | 9 / 125.7 seconds |
| Input / output / cache-read tokens | 31,187 / 867 / 79,104 | 47,599 / 2,831 / 252,032 |
| Producer discovery in final report | Only `evaluate-accesses.ts`. | All four Analysis construction sites implicated in the trial, plus publication, copying and delta paths; also recognized CLI construction. |
| Other consumers and typed fixtures | No useful impact inventory. | Root batch test and daemon contexts tests; reference-harness consumers. Missed `scripts/reference-harness/context-cases.ts`; CLI fixture reporting was general. |
| Interface reasoning | Identified provider injection location. | Proposed preserving existing source compatibility while normalizing produced output; explained ownership and signature companion exposure. |
| Concrete interface / fake / conformance | None. | None. Precise representation explicitly deferred until the blocked seam becomes writable. |
| Executed checks | None. | Seven existing CLI test files and all four compiler projects, on the unchanged tree. No new behavior or candidate compatibility demonstrated. |

The historical original invocation took four turns and 21.1 seconds and also
returned only the `evaluate-accesses.ts` injection-site blocker. Its behavior
was reproduced by the control arm.

The revised prompt improved the report substantially, but did not complete the
contract engineer's design responsibility. In particular:

- It considered optional TypeScript members with guaranteed populated outputs,
  but supplied no interface, normalization contract or executable witness.
  This is a design hypothesis, not verified compatibility. The proposal to
  retain existing related locations alongside role-labelled evidence also
  needs checking against the requirement for a role on each related location.
- It still treated write access to a production injection site as a reason to
  postpone the precise interface, although interface/fake/conformance locations
  were already writable. The original procedure's immediate-return instruction
  remains in tension with the appended discovery instructions.
- Running all compiler projects on the unchanged tree established a baseline.
  It could not reveal incompatibilities caused by a proposed type change; the
  missed reference-harness fixture illustrates that remaining gap.
- It correctly reported that the existing CLI tests were not evidence for the
  requested behavior. This improves interpretation of test output, while the
  conformance-selection defect still needs a harness change.

Evidence: [control result](2026-09-26-contract-engineer-replay/baseline-result.json),
[revised-prompt result](2026-09-26-contract-engineer-replay/improved-result.json),
[actual selected tests](2026-09-26-contract-engineer-replay/improved-checks.json),
[compiler exits](2026-09-26-contract-engineer-replay/improved-typecheck.log).
Each result includes the full submission and token usage. Cache-read tokens
represent repeated context and must not be interpreted as newly read source.

## Recommended next change and experiment

First revise the contract procedure itself, rather than adding another general
reminder. Make the engineer produce a concrete interface and compatibility
argument before declaring that integration is blocked. Require evidence for the
proposed representation, distinguish checked baseline from checked candidate,
and report remaining integration work by owner. Replace the immediate return
at an unnamed injection location with completion of design and impact discovery.
Do not require speculative implementation that cannot be kept coherently.

Replay that procedure from the same i02 state. Success means a reviewable
interface with a demonstrated compatibility strategy or a complete breaking
impact report, even if integration legitimately remains blocked. A larger
report alone is insufficient. Do not tell the model the missing fixture's name
or prescribe a particular interface in the experimental prompt.

Then test harness changes independently: discover/register draft conformance
suites for the scoped test tool, preserve design/artifact/impact/check evidence
in incomplete results, and return that evidence directly to subsequent contract
work. If a breaking change is necessary, coordinate its implementation across
module scopes while keeping interface design with the contract engineer. The
current global type-check gate and restricted contract edits need a coherent
migration path; changing their lifecycle warrants a separate experiment.

This pair of runs is evidence for a specific procedural weakness and a useful
prompt effect. It does not establish a production fix or prove that the proposed
compatible interface can satisfy the feature plan.
