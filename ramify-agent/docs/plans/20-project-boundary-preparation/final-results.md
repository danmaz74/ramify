# Plan 20 final results

Implemented on `feat/plan20-project-boundary-preparation` in `/tmp/ramify-plan20-project-boundary-preparation`, branched from `ramify-agent` at `33d8a739`. Each iteration used a separate GPT-6 Sol subagent at high reasoning effort. The original checkout was left untouched. The supplied plan, accepted specification update and spike deletion were captured in prerequisite commit `054a412f`; implementation changed no principles or specifications.

The harness recognizes both root header forms, centralizes test root descriptions, prepares Git-verified scratch, protects candidate and commit boundaries, and cleans scratch according to open-iteration lifetime. Fixtures moved beneath the harness after the current-pin probe passed. Pins remain `ramify.ts` 0.1.0 and `ramify-audit` 0.3.2; committed root headers retain the current syntax.

## Acceptance map

| Case | Evidence |
| --- | --- |
| PB-A01 | [Iteration 1](iteration1-results.md): shared reader tests compare both root spellings, names, tags, child paths and root test areas. |
| PB-A02 | [Iteration 1](iteration1-results.md): root writers use `rootDescription`; follow-ups `40db526f` and `99ed8374` cover scripted root writes in capability tests. Remaining literal declarations name child modules. |
| PB-A03 | [Iteration 2](iteration2-results.md): real Git rule decisions, overriding rule source/line, absent directories and nested project roots. |
| PB-A04 | [Iteration 2](iteration2-results.md): append-only byte preservation, general rule addition and duplicate avoidance. |
| PB-A05 | [Iteration 2](iteration2-results.md): all three discovery walks skip scratch manifests and tests. |
| PB-A06 | [Iteration 3](iteration3-results.md): readiness removes untracked scratch and refuses unchanged or newly staged indexed paths before deletion. |
| PB-A07 | [Iteration 3](iteration3-results.md): failed baseline leaves ignore files unchanged and the retry passes readiness. |
| PB-A08 | [Iteration 3](iteration3-results.md): one setup commit, no-op for effective rule, root-only rule extension, pre/post commit recovery. |
| PB-A09 | [Iteration 3](iteration3-results.md): root and nested conflicts refuse run/session work with ignore files restored. |
| PB-A10 | [Iterations 3](iteration3-results.md) and [4](iteration4-results.md): sessions verify scratch, report harness changes and preserved indexed paths, and never commit. |
| PB-A11 | [Iteration 4](iteration4-results.md): creation before engineer startup, bootstrap scopes, and child modules introduced after setup. |
| PB-A12 | [Iteration 4](iteration4-results.md): repair turns, correction work, nested suspension and service restart preserve open scratch. |
| PB-A13 | [Iteration 4](iteration4-results.md): accepted, partial, unsuitable, exhausted and close-event recovery; superseded cleanup verified through the shared production helper and durable result record tests. |
| PB-A14 | [Iteration 4](iteration4-results.md): repairable ignore/index gate failures and a real Git/audit witness whose audited commit contains no scratch file. Unsafe capability requests are refused in-session before source capture and accepted after repair. |
| PB-A15 | [Iteration 4](iteration4-results.md): indexed paths survive cleanup, untracked siblings are removed, and subsequent readiness refuses the preserved path. |
| PB-A16 | Full audit of this clean final commit, retrieved through the report reference below. [Iteration 5](iteration5-results.md) records the accepted fixture layout and focused checks. |

## Final audit reference

The stable local reference `refs/plan20/final-audit` points to the provider's full audit report commit. It is published only after the following command completes with a passing composed verdict on this clean commit:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --json
```

Read its exact source commit, command results, test counts and verdict without modifying the audited files:

```sh
git show refs/plan20/final-audit:reports/audit/summary.json
git show refs/plan20/final-audit:reports/audit/agent-tests.txt
```

This separate report reference avoids a post-audit documentation commit. The provider also retains its normal project-scoped run and tree references.

## Recorded limits

- [Baseline audit](baseline-results.md): one existing capability task-projection race failed; the test now waits for the record file it reads, and its focused rerun passed. All failures and reruns remain recorded separately from final evidence.
- The pinned checker reports nonblocking analysis limits (316 at the last iteration check), despite zero structural errors and warnings.
- Moved fixture source is excluded and treated as an independent project, but a fixture-source change widens partial audit selection to all real modules under the current pins.
- Superseded scratch cleanup has shared production-helper and record-generation evidence, rather than a new end-to-end superseded contract-revision run.
- A target project remains responsible for its compiler exclusions. Provider-dependent root syntax, ownership selection, adapters and audit policy remain deferred as the plan specifies.
