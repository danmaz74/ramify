# The review-notes trial with a real pi session (T2): not run

Not run because no pi login exists in this environment: `~/.pi` is absent and none of the provider variables pi reads is set, and no credential the person has not set up for pi was used.

**Checked on 2026-09-21**, at the start of iteration 12's part 2, as part 1
had checked earlier the same day:

- `~/.pi` does not exist, so pi has no stored login (`/login` writes it
  beneath `~/.pi/agent/`).
- None of the provider variables that the pinned `@earendil-works/pi-ai`
  reads is set in the environment (`ANTHROPIC_API_KEY`,
  `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`,
  `GEMINI_API_KEY`, `OPENROUTER_API_KEY` and the rest of its list). Only the
  variable names were checked; no value was read.

Plan 1's live trial authenticated pi with the person's own Claude Code OAuth
token, which the person exported as `ANTHROPIC_OAUTH_TOKEN` for that one
command. Taking a token from Claude Code's own store, or any other
credential the person has not supplied for pi, is not this iteration's to
do. **Nothing was simulated in the trial's place**, and the scripted agent
was not substituted for pi: the scripted-agent `review-notes` runs of
iterations 9 and 12 prove the delegation path (P1, P3, P4, T1), not what a
real model does with it.

## What the person must do to run it

From `ramify-agent/`, on a machine with a browser:

1. Log in to pi once: `npx pi`, then `/login`, choose a provider, complete
   the authorization, quit pi. Or export a provider key for the command
   only, as Plan 1 did.
2. `npm run trial -- prepare --plan review-notes`. It copies the fixture,
   runs `npm ci` in the copy, commits it and prints `Trial copy: <copy>`.
3. `npm run build:web`, then
   `npm run serve -- --project <copy> --agent pi [--model <provider/model>]`.
   It must print `pi runs <model>.`
4. Open the printed address, choose **review-notes**, press **Start**, and
   watch the Run page. Once `contract-registered` appears in the event feed,
   stop the harness with Ctrl-C and start it again with the same command:
   the run is `interrupted` on load (a run is never resumed in place), so
   start a second run of the same plan from the page, which reads the tree
   the first one left. Record both run IDs.
5. When a run ends, read its decisions, work items, checks and metrics on the
   Run page, stop the harness, then
   `npm run trial -- verify <copy> --run <run-id> --json verification.json`.
6. Copy `<copy>/plans/review-notes/.harness/jobs/<run-id>/` to `run/` in this
   directory, with `verification.json` and `verification.txt` beside it,
   gzip the complete-check logs, and delete this file.

`npm run real-session -- --project <copy>` runs the same start without a
browser and checks the login and the model cheaply first.
