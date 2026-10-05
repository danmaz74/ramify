# Measurement-recipe repair results

**Date:** 2026-10-05. **Status:** repaired in the recipes; changes are
uncommitted for the coordinator's review. The approved resident run on
`723d4698` exited 1 because five I2-29 workloads stopped at their first check.
The resident driver still required complete coverage, but the S100, S500 and
S1000 measurement setup exposes m001's literal `value`, which carries Plan 8's
nonblocking `signature-inferred` note. Phase 1 keeps that rule, so the note is
expected. No recipe was run, and the record below covers only what was run.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next`, base `723d4698` |
| Failed run | `/home/app/ramify-pb1-evidence/723d4698/measurements/` |
| Evidence | `/home/app/ramify-pb1-evidence/recipe-repair/` |

## Resident repair

- `scripts/measurements/signature-notes.mjs` (new) is the single definition of
  the expected notes per fixture: none for the reference and X100, and
  `signature-inferred:value` for S100, S500 and S1000. It also states that an
  edit removing the setup's named exposure of `value` leaves every fixture with
  no note. The fast assertions now import this module and no longer keep their
  own list.
- `resident-driver.mjs` gains `assertMeasuredOutcome`. A check must complete
  with check `passed`, or `failed` by exactly the denied count, and its
  coverage must hold exactly the pinned notes and nothing else. Coverage is
  therefore `partial` only for those notes.
- That rule now applies to every resident check. `reportCommand` takes the
  project and uses it for the cold CLI, the edit cycles, `cliReference` and
  `cliS100`. `Resident.check` uses it for the warm, plateau, many-context,
  slow-consumer and publication-peak checks. The plateau's own
  `coverage === 'complete'` line was removed, because `Resident.check` now
  covers it.
- A resident check that previously verified no coverage now verifies the full
  outcome.
- In `cold-warm-broad-*`, an even exposure cycle removes the setup exposure.
  It expects one denied import and no note, so coverage is `complete`.
- The fast recipe's `description` removal cycles had the same stale
  expectation. `completed()`, `coveringEdit()` and `scopedEdits()` (which feeds
  the `proportionalRelink` deferral) now pass the removal state. The source for
  this is `subs/analysis/src/companion-findings.ts` `exposedOriginals`: notes
  belong to exposed originals only.

## S100 driver check

`driver-check.mjs` uses the recipe's own driver functions on a materialized S100
fixture. The daemon ran in a private endpoint directory. The run made three
checks in that one daemon session; its output is in `driver-check.out`:

1. Cold CLI through `coldCommand`/`reportCommand`: accepted. Exit 0, outcome
   `completed/passed/partial`, 100 owners, one `signature-inferred` note on
   `value` in `subs/m001/src/interfaces/api.ts`.
2. `Resident.check` through the daemon API: accepted. Outcome
   `completed/passed/partial`, one coverage note.
3. CLI after `edit('exposure', 0)`: accepted. Exit 1, outcome
   `completed/failed/complete`, one denied import, no coverage entries.

The daemon was stopped by `Resident.close`. Its PID 433688 was confirmed gone,
and no process remained.

## Static review of the other recipes

Fixed (stale against this phase or Plan 8):

- `fast.mjs:85,106`: the derived `cold-open` and `checked-set-bounded` rows
  took every `hook-latency-*` row, X100 included. `verify-fast-evidence.mjs`
  requires exactly the four `fastFixtures` sources and their observations, so
  both derived instances would always have failed verification. When the
  report is complete, every instance would have failed. The rows now take the
  four fixtures' sources only.
- `fast-assertions.mjs`: the description removal state (see above).
- `plan2a-fixtures.mjs:106`: `daemon status` polling used the default 1 MiB
  `spawnSync` buffer. The S1000 status document is estimated near that size,
  and an overflow drops every sample silently. The buffer is now 64 MiB.

Left as found, for the coordinator:

- `plan2a.mjs:111`: a run reports exit 2 on R, T and S100 as passing. The
  reader and harness still fail it, so nothing passes falsely. This predates
  the phase.
- `plan2a.mjs:138-148`: in the plateau, a parse failure skips `poll.stop()`
  and `daemon stop`, and the stop's exit code is not checked. This is a
  robustness gap, not a stale expectation.
- `plan2a-fixtures.mjs:24`: the generated-name pattern misses
  `.ramify-architect*` and marker siblings. None are present.
- `plan2a.mjs:34`: the help text promises a process census that does not
  exist.
- The fast configuration row needs a not-checked reply. The contract also
  allows a checked answer once a published revision covers the edit, so this
  is a small race.
- S1000 acquisition takes 23–25 s against a 30 s deadline.
- Status polling now carries the full scope.
- No full fast archive exists yet. The readers' 30 s and 60 s timeouts are
  untested on one.
- Evidence identity hashes all of `dist/` and every measurement script. The
  run must follow the commit, with no rebuild or edit before the harness gate.
- The four I2-29 rows that passed on `723d4698` cannot be reused, because the
  recipe inputs changed.

Instance rows whose prose no longer describes what is asserted; they are left
byte-identical:

- `plan2a-instances.ts:98` `I2A-12:toolkit-scale` says "all eleven owners";
  there are 15 modules, and nothing asserts the count.
- `plan5-instances.ts:99` `I5-13:repeated-edit-plateau` says "Two hundred"
  cycles; the recipe runs 40.

Nothing pointed at a defect in the candidate.

## Verification

| Command | Result |
| --- | --- |
| `git diff --check` | clean |
| `npm run type-check` | exit 0 |
| `node --test scripts/measurements/*.test.mjs` | 10 files, 75 tests, 75 pass |
| `npm run check:self` | exit 0; 15 owners, 599 source files (598 + `signature-notes.mjs`), 41 limits, 0 denied |
| S100 driver check | three checks accepted, daemon gone |
| Locked: `resident-measurements`, `evidence-reuse`, `completion-composition`, `final-contracts` | 4 files, 15 tests pass |
| Locked: `npm run reference:cases` | 37 files, 393 tests pass |

## Coordinator review

The first measurement run on `723d4698` stopped under the user's stop rule
when the resident recipe exited 1; nothing was rerun, and its output stays in
the evidence directory. The coordinator reported the cause, a recipe
expectation that predates Plan 8, and the relay session approved this repair,
a new final candidate and a preflight of one cheap workload per remaining
recipe under the user's standing instruction; the user approved running the
measurements. The coordinator reviewed the shared note definition, the
outcome rule and the two further fixes the static review found (the fast
recipe's derived rows took a fifth source; Plan 2A's status poll could
overflow its buffer). No runtime source changed. The sample counts stay the
recipes' fixed ones, as settled earlier. The two instance rows whose prose is
stale are added to the handoff's table with the next documents commit.
