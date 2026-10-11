# Iteration 3 results: qualification

[Iteration](03-qualification.md) · [Acceptance](../acceptance.md)

Built the real-browser witness of the Debugger area over answers one scripted
breakpoint run exported, documented the UI scenario and ran the final
configured full audit. The candidate commit is `5a3aa6c9`, based on
`6625c841`, on branch `feat/plan35-debugger-ui` in the isolated checkout
`/home/app/ramify-plan35-debugger-ui`; this receipt is a subsequent
documentation-only commit. No push was performed. Harness and web source are
unchanged: the witness exposed no defect.

## What was built

- **Export step.** `subs/harness/src/tests/execution-breakpoints-http.test.ts`
  gains "U13: the actual debug answers of one breakpoint run, from the pause
  through a message, its answer and a resume to the end". Its `host()` helper
  now creates the app before the start, accepts a `before` reader of the routes
  and, with `toEnd`, scripts the local architect's completion request and the
  `wi-001.i01`, `wi-001` and final-verification checkpoints, so the resumed run
  completes. The other four tests host exactly as before. The new test reads,
  through the real route handlers, the plan list, plan document and empty run
  list before the start; the paused run list; the `/debug` answer and the
  drained `/events` pages when paused, after the message is admitted, after it
  settled, after the resume with text and at the end (`completed`); the
  inspection at the pause; and the exchange answer admitted and settled. Each is
  parsed by its protocol schema and asserted. With `PLAN35_DEBUG_EXPORT` naming
  a file it writes them there; without it it writes nothing. No process
  launches and no model.
- **Fixture page.** `subs/web/src/tests/browser-acceptance/plan35-debugger.html`
  and `plan35-debugger-main.tsx` render the real `App` with its hash routing
  over a `StubClient` subclass that replays the export. `start-run` shows the
  paused run and run list; `debug-message` shows the admitted answer and, after
  three debug-state reads, the settled one; `debug-resume` shows the resumed
  answer and, after three reads, the completed one. The receipt carries the
  exported run ID, so the Plan page navigates to it.
- **Runner.** `scripts/browser-acceptance/breakpoint-debugger.ts`, package
  script `test:browser:breakpoint-debugger`. It runs the export with
  `node_modules/.bin/vitest run subs/harness/src/tests/execution-breakpoints-http.test.ts -t 'U13: the actual debug answers of one breakpoint run' --maxWorkers=1`,
  validates the whole export with a schema composed of the protocol schemas,
  builds the fixture page with Vite, serves it on a loopback port and drives
  headless Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium`,
  `--no-sandbox`) at 1280x900 by the exact labels of iteration 2. It asserts
  each state from the page and from the commands the stub recorded, each
  command also parsed by `runCommandSchema`, and writes its checks and
  screenshots under `../evidence/`. `npm run type-check` covers it through
  `scripts/browser-acceptance/tsconfig.json`. It is run explicitly and is not a
  configured Vitest boundary, as the Codex review's finding 6 settled.
- **Documentation.** `README.md`, "Engineer breakpoints on a live server": the
  UI scenario after the CLI one (`npm run build:web`, the same `serve`, check
  the box, start, the banner, "Open the Debugger", read, send, resume; same
  live-server policy; Stop in the Overview; the witness command).
  `.claude/skills/ramify-agent-dogfooding/SKILL.md`: the UI as an alternative
  to `real-session` and the `debug` commands in the breakpoint bullet.

## U13 witness receipt

`npm run test:browser:breakpoint-debugger` at `3c471e5f`, the commit with every
code change (`5a3aa6c9` adds only its evidence), with a clean tree: "Plan 35 breakpoint debugger Chromium witness:
21 checks passed." `browser-results.json` records revision `3c471e5f`,
`dirtyAtStart: false`, no failure, and the fixture's SHA-256.

Evidence under `docs/plans/35-breakpoint-debugger-ui/evidence/`:

- `browser-results.json`: the 21 checks, screenshots, export command and fixture hash.
- `plan35-debug-answers.json`: the validated export the page replayed.
- `01-plan-breakpoint-checked`, `02-paused-banner`, `03-prepared-input`,
  `04-conversation-answer`, `05-after-resume`, `06-terminal` (`-1280x900.png`).

The checks, all passed:

1. the export holds the actual paused, admitted, settled, resumed and completed debug answers of one run, each valid
2. the export holds the inspection at the pause and the exchange answers
3. the run list names the breakpoint the run was started with, and was empty before the start
4. the Plan page offers the breakpoint unchecked beside the review stop, and the plan has no run yet
5. Start sends one start-run carrying the breakpoint selector
6. the banner names the pause with the harness summary, its pause ID and revision
7. the header shows the paused badge and the run page offers a Debugger tab
8. Open the Debugger selects the Debugger tab
9. the state panel shows the paused state, role, work item, iteration, goal, next action, task state, pause ID and revision with the harness summary
10. the prepared input is not read before it is requested
11. the prepared input shows the task message and the tools of the actual inspection, read once, as a preview
12. Send and Resume are enabled at the paused pending task
13. Send posts one debug-message with a fresh command ID, the current pause ID and revision and the verbatim text
14. the admitted message shows in the conversation, the composer is cleared and Send is disabled while the engineer answers
15. the settled exchange shows the person's text, the engineer's actual answer and its transcript chapter link
16. after the answer the pause is at its next revision and the earlier preview is historical
17. Resume posts one debug-resume with the current pause ID and revision and the text as its message
18. after the resume the banner and badge are gone, the resume is listed with its message, and both commands are disabled
19. the terminal state is shown and the conversation stays readable with Send and Resume disabled
20. the debugger reads nothing after the run ended, and no other command was sent
21. Chromium reports no page exceptions

## Final audit

From the repository root, on the clean committed candidate `5a3aa6c9`:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Exit 0. Invocation verdict `pass`, overall `pass`, executed mode `full`,
one project (`ramify-agent`, verdict `pass`, ran), discovery complete with no
skipped or unavailable project. ramify-audit 0.7.2 (the agent's installed
version), 585.7 s, audited at 2026-10-10T23:33:23Z, source tree
`fa9dda1c3760369d4414b2431607c91e5eebc410`. Report commit
`ecaf1b5dc8f0a4bd86bb5b5c8f8a6485f714ac81`, run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-10T23-33-23Z-5a3aa6c9f`,
no outstanding failures. Expected files: 343 expected, 343 run, none missing.

| Check | Outcome |
| --- | --- |
| `agent-tests` (Vitest) | pass: 343 files (342 passed, 1 skipped), 3060 tests (3058 passed, 2 skipped, 0 failed) |
| `agent-typecheck` | pass |
| `agent-structure` (`check:self`) | pass |
| `agent-web-build` | pass |
| `agent-scenarios` (Cucumber) | pass: 0 scenarios |
| `patch-integrity` | pass |

The skipped file and tests are existing opt-in skips; none is new. No failure
or flake occurred.

## Checks before the audit

All focused; no other full suite.

| Command | Outcome |
| --- | --- |
| `npm run test:quick -- subs/harness/src/tests/execution-breakpoints-http.test.ts subs/web/src/tests/debugger.test.tsx subs/web/src/tests/run-page.test.tsx subs/web/src/tests/plan-page.test.tsx` | 4 files, 66 tests passed |
| `npm run type-check` | passed |
| `npm run check:self` | passed: 0 errors, 0 warnings, 355 analysis limits (354 before; the new fixture page) |
| `npm run build:web` | built (the existing chunk-size warning only) |
| `npm run test:browser:breakpoint-debugger` | 21 checks passed |

## Decisions the plan did not state

- **No before-pause answer.** The export starts at the pause: the scripted run
  reaches it within one start, so an answer read before it would be racy. The
  stub answers the paused state right after `start-run`, and the "working
  toward its next breakpoint" state is witnessed after the resume instead.
- **A completing run.** The export test scripts the local architect's
  completion request and the checkpoints a completed run needs, behind a
  `toEnd` option of the shared host, so the terminal answer is an actual
  `completed` run; the existing tests keep their scripts.
- **Advancing by reads.** An intermediate answer (admitted, resumed) is replaced
  after three debug-state reads, about two seconds at the page's one-second
  poll, rather than by a timer or a page hook.
- **Exported events.** The run's projected events are exported at each step so
  the Overview renders the actual events beside the Debugger area.
- **One viewport.** The witness runs at 1280x900 only; the prepared-input
  screenshot is a viewport shot, the others full-page, with the long sections
  closed again after the prepared-input check.
- **The export test always runs.** U13's export case runs in ordinary
  discovery as a meaningful test of the full path; it only writes with the
  variable set, so it adds no skip.

## Remaining limitations

- The witness replays answers in a fixed order; it does not exercise
  refusals, lost replies or failed reads in a browser (U11 covers them on
  JSDOM).
- The page sends its own command IDs, while the replayed interventions carry
  the exported run's IDs (`message-plan35`, `resume-plan35`); the conversation
  does not show command IDs, and the checks compare text, pause and revision.
- At 1280 wide a long "Next action" value wraps beneath its label in the pause
  facts (`03-prepared-input`); cosmetic, unchanged.
- The Pi scenario is documented, not run, as the plan states.
