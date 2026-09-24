# Plan 12 execution results

## Starting evidence

**Starting commit:** `6da00866d4f41e468dcd305b54a43154862ded66` on branch `feat/plan12-check-findings`, worktree `/tmp/ramify-plan12-check-findings`. It contains the committed [CheckFinding architecture](../../architecture/check-findings.md) and [principles](../../check-findings.principles.md), and Plan 11's merged execution map (`cab2a90`). **Dirty files:** none. The worktree was prepared with `npm ci`, `npm run build` and `npm run worktree:prepare` at the repository root.

| Check | Result | Boundary and limit |
| --- | --- | --- |
| ramify-audit, `audit/ramify-agent-suite.request.json` from the repository root | Pass, overall `pass`, 173 s | All five checks pass: patch integrity, agent type-check, agent suite (161 files passed, 2 skipped; 1277 tests passed, 7 skipped), agent `check:self`, parent daemon case. Run ref `refs/audited/runs/2026-09-24T11-26-24Z-6da00866d`; Git note on `6da0086`. The request still carries Plan 8's claim ID `plan8-baseline-repairs`. |
| `npm run type-check` in `ramify-agent/` | Pass (inside the audit) | Harness, web and script scopes. |
| `npm run check:self` in `ramify-agent/` | Pass (inside the audit): 0 errors, 0 warnings, 190 analysis limits | 9 owners, 389 source files. The limits are `signature-inferred` coverage. |
| `npm run build:web` in `ramify-agent/` | Pass | Vite chunk-size advisory only. |

No baseline failures are carried into the plan.
