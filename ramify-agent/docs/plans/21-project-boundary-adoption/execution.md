# Execution and evidence

Use the isolated worktree `/home/app/ramify-plan21-project-boundary-adoption`
on branch `feat/plan21-project-boundary-adoption`, created on 2026-10-07 from
the Plan 20 worktree's head `4b0123564b02412d1db0416b81e11416d82baaf1` at
Dan's request, so Plan 21's history stays separate from the merged Plan 20.
Before starting, inspect its live branch, status and concurrent work. Preserve
the main checkout and all existing edits. This is agent work: the toolkit's
Studio workflow does not govern it. The expanded plan has twelve serial
iterations, 0–11, and one combined new-run policy transition. Source edits and
provider publication were not part of the planning task that created this
document. Dan later requested implementation with a subagent per iteration and
approved the bounded provider public export, qualification and publication on
2026-10-07; the published adoption pair is `ramify.ts` 0.4.0 and
`ramify-audit` 0.7.1, as [iteration 0](iterations/iteration0-results.md) records.

## Iteration discipline

Execute the [manifest](iterations/manifest.json) in order, one iteration at a
time. Follow the user's established implementation preference: one Sol agent at
high reasoning effort per iteration, directly coordinated. The coordinator
checks prerequisites, reviews the actual diff and results, and assigns only the
iteration's named capability and owners. A provider gap is resolved in its own
project before dependent consumer work proceeds.

Before each iteration inventory and hash all applicable `.principles.md` and
`.spec.md` files. Implementation agents read them but change them only after
the coordinator explicitly authorizes a named file and exact patch under the
[master procedure](../../../../docs/plans/project-boundary-sequential/main-plan.md#agent-coordination-and-protected-documents).
Preserve user edits. Repeat the rule when replacing or resuming an agent.
At handoff compare committed, staged, unstaged, untracked and renamed protected
files against the baseline and the authorized patches. Passing tests cannot
authorize a document change.

An iteration receipt `iterations/iterationN-results.md` records source and
provider identities, actual changes, acceptance case IDs, exact commands and
outcomes, artifacts, limitations, protected-file comparison and the next
iteration's prerequisites. Commit the implementation, then record its evidence;
audit evidence references the exact clean source it checked. If a documentation
receipt changes HEAD, use producer applicability or a further required audit,
never silently claim the old audit executed at the new commit.

During implementation, commit and push each accepted iteration and verify
`HEAD == origin/feat/plan21-project-boundary-adoption` after the push.
Do not describe local tracking refs as a remote check. The original
plan-authoring request implied no push or source commit; the later implementation
request invokes this serial delivery discipline.

## Checks

Run explicit focused files from `ramify-agent/` with its installed Vitest;
iteration briefs name the existing files to extend and any proposed new ones.
Use the project's lock setup. Never invoke the entire suite with `npm test`
or an unrestricted `vitest run`. After each source iteration run:

```sh
npm run type-check
npm run check:self
```

The check must use this checkout's installed exact Ramify pin. Refresh generated
views through that CLI; catalogs are not source or editable configuration.
No external web lookup substitutes for the installed package contract.

At iteration 0 establish full-baseline applicability for the committed source
with the current released audit, reusing applicable evidence with both source
identities recorded or running a new full audit if necessary. At
joint adoption establish a new full baseline under the adopted schema. The
final gate is, from the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Use the committed project definition. Gate on the provider's combined/composed
verdict, including nested results and discovery. If an applicable result is
reused, report reuse and both source identities. Use `--force` only where a
fresh execution is the specific acceptance case. A lock timeout, cancellation,
skipped required command or unavailable discovery is not a passing run.
After a lock timeout rerun the exact clean source when the lock is available.

Do not add a full audit for every ordinary iteration. Use focused checks and
the released audit's normal partial mode as required; full audits belong to the
baseline/adoption/final gates or an explicit provider widening. Analysis-limit
diagnostics alone do not impose another full audit.

## Responsibility and document alignment

Use the accepted responsibility boundary throughout iteration receipts, prompts
and runtime contracts. The architect declares correct implementation/passing
status; audit records configured test health; the harness trusts authorized
reports and checks structural completeness. A test or audit pass is never a
substitute for a missing architect report. A failed audit cannot erase a report.
Full final verification still requires its own applicable passing producer result.

Iteration 0 freezes the small declaration/continuation contract and exact
protected patches. Iteration 3 introduces the single new policy boundary for
both whole-owner authority and architect reporting; subsequent iterations fill
in that reviewed contract without another policy bump. Refuse old-policy runs
outright by version, before any mutation. Intermediate implementations
are qualification work; production enablement waits for iteration 11. The
mechanism is the branch: it is not merged into `ramify-agent`, and no run on
another project uses it, before iteration 11's receipt. The policy identity
introduced in iteration 3 names the complete Plan 21 contract; a run under it
from an intermediate commit is qualification evidence, never a production run.

Record each removed active inference/matching path and its replacement. Preserve
original requirements and useful diagnostic/authoring tools. Historical
readers go with the policy bump; a test may name an old event or policy
version only to prove the refusal.
The coordinator's plan-case/evidence review is implementation validation; do
not add equivalent runtime case-to-test-file enforcement.

## Acceptance environment

Reuse scripted agents, Git helpers and shared lifecycle fixtures for deterministic
assignment and recovery behavior. Use a real temporary Git project and the
installed published providers for ownership, discovery, preparation, reuse and
nested-audit conformance. This can run real harness workflows without spending
model calls; do not describe scripted agent behavior as live-Pi validation.
No new real-model call is required by this migration.

Keep adversarial fixtures small. Write their durable outputs under a recorded
evidence directory outside scratch, with relative paths in the receipt. Use
standard browser acceptance for changed projections at desktop and narrow
widths; preserve screenshots and the underlying provider records.

If a source defect or provider gap needs more work than the current iteration,
record the exact failing case and insert a bounded owner-specific prerequisite.
Do not weaken the case, silently widen the implementation scope or mark the
plan complete with an unmet required contract.
