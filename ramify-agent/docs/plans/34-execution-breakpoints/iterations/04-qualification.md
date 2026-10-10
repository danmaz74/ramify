# Iteration 4: qualification and real work

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

Iterations 1–3 complete with the decisions and documentation consistent.
Owners: harness/root tests, exact native boundary registrations, user docs,
dogfooding skill guidance and qualification records. Actual target changes
stay in an agent-created worktree of the selected project. Do not change Plan
31's status or unrelated source as part of qualification.

## Deliverables

- A combined scripted workflow covers explanatory turns, resume, accepted
  result handling, ordinary gates/reviews and a later repair or capability-task
  engineer breakpoint. It proves that the new control path composes with normal
  completion and failure handling.
- Register exact native test files and reasons in
  `src/tests/test-boundaries.json`. Verify actual CLI client/server separation,
  disconnection, stop and the selected restart behavior. Separately verify Pi
  native history/input preservation through fresh and continued exchanges,
  using an actual adapter and suitable scripted provider where sufficient.
  Do not require remote model spend in ordinary configured tests.
- Run the real-plan exercise in the main plan with an available authenticated
  Pi model and explicit project/model bounds. Have the caller ask one question,
  follow up and supply a proceed message. Judge the useful implementation as
  well as harness behavior. If setup or authorization is unavailable, record
  that qualification as outstanding rather than treating scripted checks as it.
- Finish README and specification changes; update real-plan dogfooding guidance
  to describe commands that now exist. Record the target plan, source commit,
  model, run/receipt IDs, delivered conversation evidence, cost where available,
  resulting commit and project verification in a dated `docs/analysis/` note.

## Verification and exit

Own B16–B18; review evidence for every earlier case. Run focused ordinary and
registered boundary tests, type checking and module checks. Then run the
configured full nested audit on the clean committed final candidate using the
main plan's command. No additional direct whole-suite run is needed.

Write `04-results.md`, clearly separating configured audit health, native
boundary evidence and the real implementation's outcome. A failed target result
is useful diagnosis but does not fulfill B18's useful-work objective. Record and
fix harness defects within scope, rerun affected checks, and retain any unmet
requirement as incomplete. No timing/token benefit claim is required.
