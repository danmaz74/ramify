# Iteration 3: qualification

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

Iteration 2 complete. Owners: the browser-acceptance scripts and fixture
pages, the README, the dogfooding skill and the plan's results. The harness
and web source change only for defects the witness exposes, each recorded.

## Deliverables

- An export step: extend the HTTP debug test (or a sibling it shares its host
  with) so that, when an environment variable names an output file, it writes
  the actual `/debug` answers at each step (before the pause, paused, after the
  message is admitted, after it settled, after resume, at the end), the
  inspection at the pause and the exchange answer, each validated by its
  protocol schema. Without the variable the test is unchanged. The fake agent
  `serve` hosts never prepares an engineer, so no hosted run can pause.
- `subs/web/src/tests/browser-acceptance/plan35-debugger-main.tsx` and its
  HTML page: the real Plan and Run pages over a stub client that replays the
  exported answers in order and advances on each `start-run`, `debug-message`
  and `debug-resume` command it receives, as `plan21-projections-main.tsx`
  replays exported gate views.
- `scripts/browser-acceptance/breakpoint-debugger.ts`: run the export, build
  the fixture page with Vite, drive a real Chromium through `playwright-core`:
  check the breakpoint box, start, see the pause banner and badge, open the
  Debugger tab, read the prepared input, send a message, read the answer,
  resume, and see the terminal state. Assert each step from the page and the
  commands the stub received. Keep screenshots and the checks list under this
  plan's `evidence/` directory.
- A package script `test:browser:breakpoint-debugger` beside the existing
  browser acceptance scripts. It is run explicitly and its receipt is reported
  in the results, apart from the configured audit: the Vitest configuration
  discovers only `src/tests` and `subs/**/src` test files, so the runner and
  its fixture page are not registered in the native boundary registry.
- README: the UI scenario beside the CLI scenario under the breakpoint
  section. Dogfooding skill: the UI as an alternative to the CLI commands.
- Final configured full audit from the repository root, after a clean commit.

## Verification and exit

Own U13. Run the witness, the focused tests of iterations 1 and 2,
`npm run type-check`, `npm run check:self` and the final full audit. Commit
and write `03-results.md` with the candidate commit, the witness's evidence
paths, the audit receipt and any remaining limitation. Update the manifest's
statuses and the plan's status line.
