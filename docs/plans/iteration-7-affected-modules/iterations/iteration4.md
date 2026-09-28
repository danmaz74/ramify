# Iteration 4: Real invocations, self-check, results and audit gate

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** iteration 3 on the branch, `npm run build` done.
**Owners:** documentation and evidence only; source fixes only for defects
found by the real invocations, recorded per file.

## Goal

Prove the command on the two real projects, record the evidence and timings,
run the plan's gate, and write the completion report.

## Read first

- [Acceptance](../acceptance.md): rows A7-12 and A7-13, the timing sample and
  the final gate.
- [Main plan](../main-plan.md): verified state item 6 for the baseline
  timings, review and completion list.
- `ramify-agent/audit/README.md` for how audit requests are recorded, and
  [`audit/plan7-affected-modules.request.json`](../../../../audit/plan7-affected-modules.request.json).
- The [roadmap](../../../roadmap.md) Plan 7 row and section.

## Deliverables

1. Real invocations on the toolkit checkout with an isolated endpoint:
   `--path subs/analysis/src/affected-query.ts`, the module seed `analysis`,
   `--path package.json`, each with `--format json`; record the exact command,
   the selection lists and the elapsed time. Assert the expected owners from
   the toolkit's manifests independently before reading the answer.
2. Real invocations on `ramify-agent/` (its own Ramify project): one path
   seed inside a harness sub-module and one `--batch` run; confirm coverage is
   complete despite its `signature-inferred` notes.
3. Timing sample per acceptance.md: five resident invocations per project and
   one batch per project, elapsed wall time each, in a table.
4. Gate: `npm run type-check`, `npm run check:self`, then the audit request
   from the checkout root with `--cwd .`; record the run reference and the
   exit status. A failing check is recorded as failing with its output; fix
   the defect and rerun once, or stop and report.
5. `iteration4-results.md` as the plan's completion report: evidence per case
   ID, timings, the audit run reference, remaining limits. Update the roadmap
   Plan 7 row and section: status implemented on the branch, link the
   report, name the deferred items from decision 7.

## Matrix rows executed here

A7-12 and A7-13.

## Verification

```sh
npm run build
npm run type-check
npm run check:self
ramify-agent/node_modules/.bin/ramify-audit audit --request audit/plan7-affected-modules.request.json --cwd . --json
```

The audit is the only full-suite run. If `ramify-agent/node_modules` is
absent in the execution checkout, run `npm run worktree:prepare` first.

## Exit criteria

- Every A7-12 instance has recorded output and elapsed time.
- The three gate commands pass and the audit run reference is recorded.
- Roadmap and completion report updated; no source change without a named
  defect and its test.
