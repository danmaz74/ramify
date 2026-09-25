# Engineer module source cwd spike: validation

Implementation commit: `6f12653ec3cd3ae7411706f90c680487d32c3804` on `spike/engineer-module-cwd` at `/tmp/ramify-engineer-cwd`. This is an isolated spike; the main checkout was not changed.

## Behavior exercised

- An ordinary run starts the agent port and shell in the first assigned base module's `src/`. A standalone session starts in the selected module's `src/`. A root module uses the project's `src/`. An explicitly authorized bootstrap creates its missing `src/` before the invocation; an unexpected missing `src/` refuses a standalone start. Contract engineer sessions retain the project root cwd.
- Built-in relative read, edit and write paths, guarded writes, shell commands, and read activity use the same cwd. Guard observations, mutation paths, hook changed paths, and excursion activity retain project-relative path records. Scope and denied-file authority are unchanged.
- Scripted fixture tool inputs were updated at their call sites. Contract fixture helpers use project-relative paths for contract engineer calls and explicit module-local or absolute paths for ordinary engineer calls. Project command and Git paths remain project-relative.

## Evidence

| Check | Exact command | Result |
| --- | --- | --- |
| Base regression | `npx vitest run subs/harness/src/tests/single-session.test.ts -t 'relative reads, writes, and shell start in module src'` in `/tmp/ramify-engineer-cwd-base/ramify-agent`, with the new test copied onto base `a015ce0d` | Failed: port `workingDirectory` was the project root, expected the nested module `src/`. The unchanged fixture first failed because no expected changed-path checks ran; allowing that expected mismatch exposed the cwd assertion. |
| Candidate focused regression | `npx vitest run subs/harness/src/tests/single-session.test.ts` | 11 passed at the first complete focused run; later missing-src coverage was added. |
| First complete harness run | `npx vitest run subs/harness/src/tests --maxWorkers=4` | 43 failed, 985 passed, 17 skipped. The failures exposed scripted inputs that still assumed the project root cwd. Log: `/tmp/ramify-engineer-cwd-harness-tests.log`. |
| Intermediate complete harness run | Same command after fixture migration | 12 failed, 1,023 passed, 13 skipped. Log: `/tmp/ramify-engineer-cwd-harness-final.log`. |
| Final complete harness run | Same command after explicit fixture path migration | 133 files passed, 2 skipped; 1,041 tests passed, 7 skipped. Log: `/tmp/ramify-engineer-cwd-harness-green.log`. |
| TypeScript | `npm run type-check` in `/tmp/ramify-engineer-cwd/ramify-agent` | Passed after final test migration. |
| Ramify self check | `npm run check:self` in `/tmp/ramify-engineer-cwd/ramify-agent` | Passed with 0 errors, 0 warnings, 285 analysis limits; coverage partial. Log: `/tmp/ramify-engineer-cwd-check-self.log`. |
| Patch formatting | `git diff --check` | Passed before commit. |

The final complete run proves the scripted harness paths and process-backed checks in that suite. It does not establish a live model's navigation quality or the interrupted external audit/checkpoint receipts from the separate evaluation; those are recorded in the spike's parent report.
