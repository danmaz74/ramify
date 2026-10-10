# Iteration 3: qualification

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

Iteration 2 complete. Owners: the browser-acceptance scripts and fixture
pages, the README, the dogfooding skill and the plan's results. The harness
and web source change only for defects the witness exposes, each recorded.

## Deliverables

- `scripts/browser-acceptance/breakpoint-debugger.ts`: with `serve --agent
  fake` hosting a prepared fixture copy (as `npm run trial -- prepare` makes
  one) and the built web UI, drive a real Chromium through `playwright-core`:
  open the plan, check the breakpoint box, start the run, wait for the pause
  banner, open the Debugger tab, read the prepared input, send a message, read
  the answer, resume, and wait for the run's terminal state. Assert each step
  from the page and from the harness's own debug query. Keep the recorded
  evidence under this plan's `evidence/` directory. If the fake agent's
  demonstration script cannot reach an engineer pause, fix the script in the
  smallest way that keeps its existing demonstrations and record why.
- A package script `test:browser:breakpoint-debugger` beside the existing
  browser acceptance scripts. Register the witness where the testing
  specification requires for a real process and browser.
- README: the UI scenario beside the CLI scenario under the breakpoint
  section. Dogfooding skill: the UI as an alternative to the CLI commands.
- Final configured full audit from the repository root, after a clean commit.

## Verification and exit

Own U13. Run the witness, the focused tests of iterations 1 and 2,
`npm run type-check`, `npm run check:self` and the final full audit. Commit
and write `03-results.md` with the candidate commit, the witness's evidence
paths, the audit receipt and any remaining limitation. Update the manifest's
statuses and the plan's status line.
