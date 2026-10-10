# Exercising the harness through a real plan

The [principles](../../../../docs/harness.principles.md) make bounded reasoning,
adaptation and integration the point of the workflow. Judge whether the harness
helps agents deliver the intended behavior with manageable assignments. A
schema-valid response, small prompt or passing audit alone does not show that.
The [specification](../../../../docs/harness.spec.md) defines the mechanical
contracts; agent judgment remains responsible for meaning and completion.

## Choose work and decide what to observe

Read the real plan and target instructions. Identify the next useful deliverable,
its likely owner and the requirement that will tell you whether it works. Pick
one or two uncertainties worth watching, such as whether the engineer discovers
an existing API or whether a provider change reaches its consumer correctly.
Supply normal plan inputs and constraints. Do not pre-solve the particular
decision whose harness support you want to assess.

Choose the available surface:

- **Standalone `session`:** you choose the owner, goal, write scope and follow-up.
  Use it to assess engineer instructions, API discovery, guarded tools, mutation
  hooks and submission feedback while obtaining a useful implementation slice.
  A `capability-needed` submission ends the session; it does not dispatch a
  capability architect. Inspect and address that need before the next assignment.
- **Full `real-session` run:** give it the real plan when you want the harness to
  perform decomposition and carry the work through its orchestration. Observe
  the relevant stages below. Its server protocol also supports an optional
  analysis review stop, but the script does not expose that option; consult the
  [run protocol](../../../../subs/harness/src/interfaces/protocol/runs.ts) if that
  pause is needed. It is an analysis approval boundary, not arbitrary stepping.

Current standalone sessions cannot independently invoke the extractor,
context selector, architect or reviewer. Follow the main skill's mode guidance
when finer control becomes available. Do not call private runtime methods or
manufacture execution records to simulate a supported step.

If moving from sessions to a full run, first review and retain the useful work
under the target's normal commit discipline. Start from that baseline and make
the remaining plan clear. This starts a new run; it does not import the earlier
session as an accepted full-run iteration.

## Inspect the handoffs the plan actually reaches

| Part of the harness | How to exercise it through real work | What the supervising agent should judge |
| --- | --- | --- |
| Intake and initial architecture | Let a full run consume the plan, linked guidance and project architecture. Inspect the catalog, entry assignments and scenarios before attributing later failures to implementation. | Were requirements preserved, specifications considered, owners and existing behavior identified? Did forecasts remain hypotheses rather than unnecessary scheduled work? |
| Local planning and context selection | Follow one work item into its outline, selected requirements and actual engineer briefing. | Is the goal achievable within the scope? Are the relevant constraints and navigation pointers available? Missing context, irrelevant bulk and artificial splitting of simple subtree work are concrete findings. |
| Engineer equipment | Give a real bounded change through `session` or a full-run iteration. Inspect API reads, tool and hook feedback, submission and diff. | Can the engineer find usable APIs and module guidance, make authorized edits and understand rejections? Separate an incorrect scope from a broken guard. An accepted completion proposal still needs verification and review. |
| Discovery and capability delegation | When a consumer actually needs behavior elsewhere, follow its request through qualification, placement if needed, owner assignments and handback in a full run. | Was reuse considered? Did the request preserve usage, constraints and partial work? Were the real provider and requesting consumer verified together before the parent resumed? Fakes and provider-only checks cannot establish integration. |
| Gates and repair | Inspect the committed candidate, configured audit evidence and any repair assignment at a reached gate. | Did failures reach the agent with enough information to act? Did the repair fix the problem while preserving the requirement? A standalone `--gate` diagnoses setup/types/Ramify only; it does not exercise committed audit orchestration. |
| Reviews and reconciliation | Follow code, scope and design reviews of an accepted iteration, then the issuing architect's handling of findings. | Did reviewers inspect the right candidate and applicable guidance? Are findings substantive and supported? Does reconciliation resolve them without silently weakening the goal? Reviewer output is evidence for the architect's decision. |
| Completion and nonfunctional assessment | Follow reached scenario reports, final candidate assessment and final audit; inspect deviations or outstanding decisions. | Do the responsible architects' claims match delivered behavior, including real composition? Does assessment address relevant nonfunctional requirements? Automated test health and semantic completion remain distinct. |

For example, a plan to add a new export action might naturally exercise local
planning and engineering, then reveal a missing serializer in another owner.
Follow that real request into provider work and consumer integration. Do not
add a contrived dependency merely to force the capability path to run.

## Keep a small, useful evidence trail

For each important finding, retain the requirement, invocation/assignment,
actual decision or error, resulting diff/check and your intervention. Inspect
the delivered briefing and relevant tools before blaming the model. If required
context was omitted, fix its selection or delivery; if it was present but
misunderstood, investigate the instructions or assignment. Retry useful work
after a concrete correction; exact reproduction is unnecessary.

Standalone evidence is under `plans/.harness/sessions/<id>/`: `session.json`,
`submission.json`, `outcome.json`, `observations.jsonl` and `transcript.jsonl`.
Full-run evidence is under `plans/<plan>/.harness/jobs/<run>/`; begin with events
and the affected work item/invocation. Follow record references rather than
reading every transcript. [Session observations](../../../../docs/metrics/session-observations.md)
explains actual prompt delivery, inherited context, tool observations and usage.

Record what ran, what succeeded, what required your help and what was not
exercised. Preserve available timing and usage for the user's assessment; do not
invent a benchmark or infer efficiency from prompt size. Continue delivering
the plan while improving the specific harness behavior that obstructed it.
