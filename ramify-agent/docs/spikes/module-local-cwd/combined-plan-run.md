# Combined module-local cwd plan run

**Date:** 2026-09-25. **Status:** completed isolated spike; not merged.

## Setup

The single candidate was `spike/module-local-cwd-combined` in
`/tmp/ramify-cwd-combined`, at commit `ee1f8f10`. It combines the engineer and
local-architect session changes. The main checkout and the separate spike
worktrees were not used for this plan run.

The harness ran the fixture's `review-notes` plan with real pi sessions using
`openai-codex/gpt-6-sol` in a fresh copy at
`/tmp/ramify-cwd-combined-trial/collection-review`. The saved run is
`20260925T085633Z-0c82a1` under that copy's
`plans/review-notes/.harness/jobs/` directory. It started at 08:56:33 UTC and
completed at 09:37:11 UTC.

## Result

The run reached `job-completed`: 3 of 3 work items completed, 0 requirements
open, 49 invocations and 12 gate attempts. The final gate, `ga-0012`, passed
the project tests (20 files, 85 tests), type check, Ramify check and scenario
check. All six plan scenarios were marked implemented. The saved project is on
branch `ramify-agent-run/20260925T085633Z-0c82a1` at commit
`34766a12c14ad332c6706fa2f5d772ae854f53bb`.

`npm run trial -- verify /tmp/ramify-cwd-combined-trial/collection-review --run
20260925T085633Z-0c82a1` exited 0. It found 21 changed files, all inside a
recorded write scope, none unaccounted for, and a clean Git status.

The reviews module's local architect and engineers received
`subs/workspace/subs/reviews/src` as their working directory. Their first
relative reads of `../README.md`, `../module.ramify`, local source and
`.ramify/` views resolved there. The UI module's local architect and engineer
likewise received and used `subs/workspace/subs/reviews/subs/ui/src`. A later
reviews engineer updated two explicitly authorized root tests while still
starting in the reviews module. These observations are in the saved session
transcripts and briefings.

The run exercised recovery paths as well: the first MCP gate caught outdated
root tool-list assertions, and reviews identified cross-session MCP access and
browser scenario coverage issues. The local architects assigned corrections;
the subsequent gates and final plan gate passed. No recorded failure was
caused by the module-local working directory.

This is one full autonomous run of one fixture. The directory and prompt
changes are bundled, so it cannot isolate their individual effects or
establish an efficiency improvement. The scenario gate ran the fixture's
configured scenario checks; this record is not evidence of a separate manual
browser exercise.
