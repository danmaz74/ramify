# Plan 21 final results

**Date:** 2026-10-08. **Status:** awaiting-protected-patch-approval. Every
iteration (0–11) is complete and every acceptance row has its witness; the
final full nested audit passes on the delivered source. Plan 21 is not
marked complete because the two authorized `docs/harness.spec.md`
corrections are not applied and await Dan's approval
([below](#protected-file-review)). This receipt makes no new real-Pi trial
claim; Plan 18's historical live-trial gaps remain separately described.

## Identity

- **Agent:** `ramify-agent` 0.0.0 (private), project root `ramify-agent/` of
  the repository, branch `feat/plan21-project-boundary-adoption`.
- **Delivered source:** `f2968d17fa2f0657112ef8edab474537473f964a` (tree
  `154c2229b7a0b9db5b2b325ecdbb3aa7a3602685`). Iteration 11's source commits
  and the concurrent Plan 22 commits are listed in its
  [receipt](iterations/iteration11-results.md).
- **Run policy:** `run-policy/7`, unchanged since iteration 9.
- **Toolchain:** Node 22.23.3, Vitest 4.1.11, playwright-core 1.63.0,
  Chromium 154.0.8037.92.

## Providers

Exact pins in `ramify-agent/package.json`, resolved by `package-lock.json`
from `npm.braimax.com`:

| Package | Version | Integrity |
| --- | --- | --- |
| `ramify.ts` | 0.4.1 | `sha512-EU91GS5iq8WcqOv4vUmjTVTLB7a5hWtY6usyaNiGHhNLO6UlTt0gVVqZJcP5BWidDYLgZYdCUdrBM9FKPIxPXQ==` |
| `ramify-audit` | 0.7.2 | `sha512-pHIKSEIeYOD1Lwz045wx2x1cu1pl6YwCTY9sZWV9tGSt2H8sOJ/HV+ezYmcUakh1POi+4FvPxyb09fuGbNnrug==` |

No provider capability was missing and no provider prerequisite is
unresolved. Provider adoption and contracts are recorded in iterations
[0](iterations/iteration0-results.md) and [1](iterations/iteration1-results.md),
the [provider receipt](provider-receipt.md) and the
[contract review](provider-contract-review.md).

## Final audit

`ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json`
from the repository root on clean `f2968d17`:

- `completed`, invocation verdict `pass`, overall `pass`; requested and
  executed `full`, fresh (no reuse), 385.6 s;
- request `24e18305-12c7-4322-b7b8-b01a954ea11b`, run
  `7c665598-d088-4631-80da-cba4cc20342e`;
- report commit `2444954766cacd45866bbef2c47100c29a1feb51`, run ref
  `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T07-22-49Z-f2968d17f`,
  tree ref
  `refs/audited/projects/ramify-agent-f25e9a298228/by-tree/154c2229b7a0b9db5b2b325ecdbb3aa7a3602685`;
- six checks passed; expected files 259/259 `complete`; 258 files passed and
  1 skipped (opt-in `fixture-trials`); 2,006 tests passed, 2 skipped;
- [projection](evidence/iteration11-audit/final-audit.json). The earlier
  failing audit of `cc27f03c` is kept beside it
  ([projection](evidence/iteration11-audit/final-audit-1-failed.json)).

## Nested-project results

- **The agent's own audit:** nested discovery complete; one eligible project,
  `ramify-agent`, `pass`, `ran`. The three harness fixtures are
  owned-nested-project trees with no `ramify-audit.json`, so none is a nested
  audit project (a known limitation below).
- **F4** ([iteration 10](iterations/iteration10-results.md)): root, `engine`
  and `engine/tools` audited, the external `vendor/lib` definition skipped
  with its reason, a failing grandchild failing the gate, reuse across an
  ignored documentation change, cancellation settling as not verified, and
  nested readiness.
- **F5** ([iteration 11](iterations/iteration11-results.md)): W1's final gate
  `ga-0005` failed on `subs/workspace/subs/reviews/subs/notes/report` (report
  `f92d4c5a`) over a passing root; the repaired run's `ga-0006` passed both
  projects (report `7250f402`); the failed record remains separately
  retrievable. W2's final gate audited `.` with complete discovery.

## Browser artifacts

- Iteration 11, real F5 runs served by `startCliServer` with the built web
  client: 43 checks at 1440x900 and 480x700 and 16 screenshots in
  [evidence/iteration11-browser](evidence/iteration11-browser/iteration11-browser-results.json).
- Iteration 10, real F4 gate projections:
  [evidence/iteration10-browser](evidence/iteration10-browser/iteration10-browser-results.json).
- Earlier witnesses: [iteration 1](evidence/iteration1-browser).

## Case-to-evidence table

Each row links the receipts that witness it; iteration 11's own witness is
named. Every row passed; none is left unrun.

| ID | Iterations | Evidence |
| --- | --- | --- |
| PB3-A01 | 1 | [1](iterations/iteration1-results.md) |
| PB3-A02 | 0, 1, 3 | [0](iterations/iteration0-results.md), [1](iterations/iteration1-results.md), [3](iterations/iteration3-results.md) |
| PB3-A03 | 1 | [1](iterations/iteration1-results.md) |
| PB3-A04 | 1 | [1](iterations/iteration1-results.md) |
| PB3-P01 | 2 | [2](iterations/iteration2-results.md) |
| PB3-P02 | 2 | [2](iterations/iteration2-results.md) |
| PB3-P03 | 2, 9 | [2](iterations/iteration2-results.md), [9](iterations/iteration9-results.md) |
| PB3-P05 | 2 | [2](iterations/iteration2-results.md) |
| PB3-P04 | 2, 3, 9 | [2](iterations/iteration2-results.md), [3](iterations/iteration3-results.md), [9](iterations/iteration9-results.md) |
| PB3-S01 | 3 | [3](iterations/iteration3-results.md) |
| PB3-S02 | 3 | [3](iterations/iteration3-results.md) |
| PB3-S03 | 0, 3, 11 | [0](iterations/iteration0-results.md), [3](iterations/iteration3-results.md); 11: W1 assignments include the report tree |
| PB3-S04 | 3 | [3](iterations/iteration3-results.md) |
| PB3-S05 | 3 | [3](iterations/iteration3-results.md) |
| PB3-S06 | 3 | [3](iterations/iteration3-results.md) |
| PB3-S07 | 3 | [3](iterations/iteration3-results.md) |
| PB3-S09 | 3 | [3](iterations/iteration3-results.md) |
| PB3-S08 | 3, 11 | [3](iterations/iteration3-results.md); 11: W1 repair keeps scratch; W2 suspension keeps it, removal after partial closure |
| PB3-H01 | 4 | [4](iterations/iteration4-results.md) |
| PB3-H02 | 4 | [4](iterations/iteration4-results.md) |
| PB3-H03 | 4 | [4](iterations/iteration4-results.md) |
| PB3-H04 | 4 | [4](iterations/iteration4-results.md) |
| PB3-T01 | 9 | [9](iterations/iteration9-results.md) |
| PB3-T02 | 9 | [9](iterations/iteration9-results.md) |
| PB3-T03 | 9 | [9](iterations/iteration9-results.md) |
| PB3-T04 | 9 | [9](iterations/iteration9-results.md) |
| PB3-T05 | 1, 9 | [1](iterations/iteration1-results.md), [9](iterations/iteration9-results.md) |
| PB3-T08 | 9 | [9](iterations/iteration9-results.md) |
| PB3-T07 | 9, 11 | [9](iterations/iteration9-results.md); 11: W1 repair continues the engineer session |
| PB3-T06 | 0, 9 | [0](iterations/iteration0-results.md), [9](iterations/iteration9-results.md) |
| PB3-E01 | 9 | [9](iterations/iteration9-results.md) |
| PB3-E02 | 9 | [9](iterations/iteration9-results.md) |
| PB3-E03 | 9 | [9](iterations/iteration9-results.md) |
| PB3-E04 | 9 | [9](iterations/iteration9-results.md) |
| PB3-E05 | 10, 11 | [10](iterations/iteration10-results.md); 11: W1 failing and repaired nested final gates |
| PB3-E06 | 10 | [10](iterations/iteration10-results.md) |
| PB3-E07 | 10, 11 | [10](iterations/iteration10-results.md); 11: W1/W2 gates in Chromium, both widths; brief lines |
| PB3-E08 | 10 | [10](iterations/iteration10-results.md) |
| PB3-R01 | 3, 11 | [3](iterations/iteration3-results.md); 11: W2 resumed coordination; reader removal `3ac150e9` |
| PB3-R02 | 9, 11 | [9](iterations/iteration9-results.md); 11: W1/W2/W3 production wiring; W3 makes no commit |
| PB3-R03 | 1, 11 | [1](iterations/iteration1-results.md); 11: final full nested audit of `f2968d17` |
| PB3-D01 | 0, 5, 11 | [0](iterations/iteration0-results.md), [5](iterations/iteration5-results.md); 11: W1 registers `test-001` |
| PB3-D02 | 5 | [5](iterations/iteration5-results.md) |
| PB3-D03 | 6, 11 | [6](iterations/iteration6-results.md); 11: W1 failed final gate keeps `done` |
| PB3-D04 | 5, 6, 11 | [5](iterations/iteration5-results.md), [6](iterations/iteration6-results.md); 11: W1/W2 `where` persisted, briefed and shown |
| PB3-D05 | 5, 6, 11 | [5](iterations/iteration5-results.md), [6](iterations/iteration6-results.md); 11: `capability-historical-resume` and run-policy refusal suites |
| PB3-D06 | 6 | [6](iterations/iteration6-results.md) |
| PB3-D07 | 6 | [6](iterations/iteration6-results.md) |
| PB3-D11 | 6, 11 | [6](iterations/iteration6-results.md); 11: W1 binding-less proposal rejected |
| PB3-D12 | 6, 11 | [6](iterations/iteration6-results.md); 11: W1 run 2 rebinding and revision |
| PB3-D08 | 7, 11 | [7](iterations/iteration7-results.md); 11: W2 handback without cited files |
| PB3-D09 | 7 | [7](iterations/iteration7-results.md) |
| PB3-D10 | 7, 11 | [7](iterations/iteration7-results.md); 11: W2 handback leaves `sc-001` pending |
| PB3-C01 | 7, 8, 11 | [7](iterations/iteration7-results.md), [8](iterations/iteration8-results.md); 11: W1 and W2 forgotten reports rejected |
| PB3-C02 | 8, 11 | [8](iterations/iteration8-results.md); 11: W1 run 2 partial then reassignment |
| PB3-C03 | 8 | [8](iterations/iteration8-results.md) |
| PB3-C04 | 8, 11 | [8](iterations/iteration8-results.md); 11: W2 interruption and resumption |
| PB3-C05 | 8 | [8](iterations/iteration8-results.md) |
| PB3-C06 | 8, 11 | [8](iterations/iteration8-results.md); 11: W1 run 2 reassessment briefing |
| PB3-R04 | 11 | 11: W1 and W2 together |

## Known limitations

- **Pending protected patches** (below): the specification still carries
  the pre-migration verification paragraph and outcome sentence.
- **Flakes recorded, not hunted:** `run-recovery.test.ts` "a crash after
  immutable analysis evidence is staged…" (a polling helper reads a
  half-written `events.jsonl` line, then `ENOTEMPTY` on cleanup; failed once
  in the first final audit, three isolated passes) and
  `session-timeline.test.tsx` "a live session's timeline grows…" (failed once
  under load, three isolated passes).
- **Writer-settlement race:** closing the service within milliseconds of
  `writer-acquired`, before the agent's script starts, once ended a run
  `writer-unsettled`.
- **Ordinary runs do not resume** after interruption (`job-interrupted`);
  only capability coordination and nonfunctional phases do, as designed.
- **No nested project in the agent's own audit** (fixtures have no audit
  definition; committing one would nest it in the agent's audit).
- **Gate view `provider`** is an unbounded `z.unknown()` copy.
- **`agent-scenarios`** runs 0 scenarios.
- **Discovery after an included module is removed** is not verified, and a
  failed contract sub-session's dirty interface is committed only at the
  work-item checkpoint (iteration 3).
- **`acceptance-incomplete`** has no driven test (iteration 8).
- **Plan 22's static `case-inventory.json`** still holds renamed CA24 titles.
- **No real-Pi trial** was run for this migration.

## Protected-file review

The 16 tracked `.principles.md`/`.spec.md` files match the iteration 11
entry baseline in the worktree, at HEAD and on the filesystem; none is
staged, untracked or renamed. Iteration 11 edited no protected file.
Earlier protected changes, all authorized and recorded in
[protected wording](protected-wording-proposal.md): Dan's harness principles
clarification and the two applied `harness.spec.md` scope hunks of
2026-10-07.

Two further `ramify-agent/docs/harness.spec.md` patches were authorized by
the previous coordinator for later iterations and are **pending Dan's
approval**; they are not applied:

1. the replacement of the whole body of "Verification Follows Scope And
   Audit Policy" with the [proposed verification paragraph](protected-wording-proposal.md#proposed-verification-paragraph);
2. the replacement of one sentence of "A Small Closed Set of Outcomes Is the
   Whole Protocol" with the [authorized outcome-protocol sentence](protected-wording-proposal.md#authorized-outcome-protocol-sentence-2026-10-07).

The live `harness.spec.md` SHA-256 is
`f3635d7e25b8b6d175e543197be9c7d12356048f92266fbf1c5df6431ff948bc`, equal to
the baseline both patches were prepared against. The implementation already
follows the behavior both patches describe; applying them is the remaining
condition for marking the plan complete.

## Handoff

The coordinator reviews this receipt, pushes the branch and verifies
synchronization. After Dan approves and the coordinator applies the two
patches, the plan and manifest can be marked complete; the patches change
documentation only and do not affect the audited source.
