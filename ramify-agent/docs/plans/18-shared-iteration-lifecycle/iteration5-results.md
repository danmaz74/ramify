# Iteration 5 implementation evidence

Status: implemented in the integration checkout; full-project audit and live
acceptance are still pending. This is focused evidence, not a claim that every
SI/AE case is accepted.

## Delivered changes

- `780f9446` prepares current ordinary/testing foreign API views and briefs
  their source area, revision, coverage and unavailable reasons. Failed refresh
  does not reuse stale files. The common engineer preparation is used by both
  assignment paths.
- `f11c408f` and fixture correction `617e212f` add the shared read-only
  `inspect_git` tool: status, diff, log and show. Fixed operations cannot pass
  arbitrary Git options, mutate refs/index/source, invoke external diff tools
  or escape the project. Status discovers untracked files for ordinary reads.
- `606d9b71` removes model-authored candidate/configuration hashes from editable
  capability coverage. Historical recorded values remain readable.
- `1927ebe0` forwards complete provider evidence through durable decoding and
  public gate queries to an expandable browser report. Counts, qualifications,
  diagnostics and artifact references remain the producer's values. Output
  tails remain available separately. Common capability iteration results show
  their commit, gate and review coverage without implying task handback.
- `5ac3f220` removes the unused bespoke capability candidate verifier and scope
  probe helper. The integrated service removes the history replay tool and
  supplies current common result/gate/review locations.

## Focused verification

The API preparation tests use real generated views in a small Ramify fixture:
only CLI starts prepared; Analysis and Model begin cold. Ordinary/testing
symbols are searched independently, a changed public API is refreshed, failed
refresh discards stale leftovers, and a missing testing view is distinguished
from an absent testing source area. Six preparation/briefing tests passed, including an included-child scope
that prepares a grandchild owner and a broad scope that stays exact.
Log: `/tmp/plan18-api-final.log`.
This verifies the preparation boundary; production dispatch and live prompt
observations remain separate acceptance evidence.

The Git test uses a real repository containing committed, staged, unstaged,
deleted and untracked changes. It compares the real index bytes, refs and
working files before/after inspection. The focused test passed after removing
its accidental dependency on the user's Git identity.

The gate projection and browser tests passed 46 tests across
`run-projections.test.ts`, `capability-tasks.test.tsx` and `run-page.test.tsx`.
They include a diagnostic longer than 20,000 characters followed by another
independent failure, producer counts, an unavailable artifact qualification,
and an accepted iteration whose task still has no handback. The projected
provider payload is checked for exact equality rather than reconstructed
failure totals. Log: `/tmp/plan18-ui-tests.log`.

These are service/component checks. They do not establish a served-browser
live repair, complete artifact retrieval after every cleanup boundary, or
SI15/AE18. The final acceptance report must bind those observations to the
frozen runtime, provider pin and single real-Pi run.
