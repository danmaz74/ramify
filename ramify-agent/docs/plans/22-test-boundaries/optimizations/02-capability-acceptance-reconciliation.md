# Optimization 2 reconciliation and temporary Plan 21 compatibility

**Date:** 2026-10-08. The isolated optimization branch merged the committed
Plan 21 target `fd9bd91f82629ccc5523fc575b569e434e0af30d`, producing
`72bb060ddfbd54cdc27a16bac93f3326b5c17ab2`. This retains the committed
iteration 9 delivery, cleanup/crash-fixture follow-up and baseline receipt.
Optimization source remains from `18b7eccf89acb0a83589b69874ec3eb5870fb017`.

The coordinator requested compatibility verification with the target's current
unfinished Plan 21 edits. Its read-only `git diff --binary` snapshot contained
24 tracked files and 99,639 bytes, SHA256
`f606a9365add67f2874d0b9d021c08b9beeaac74499a4465c5aacd84c35c7377`.
The patch applied cleanly only to this isolated branch. The target's untracked
`project-boundary-audit.integration.test.ts` was outside that Git diff and was
not copied or qualified by these checks. No target files were written.

On the temporary copied snapshot:

- The same seven-file focused command from the [optimization receipt](02-capability-acceptance-results.md)
  passed **37 cases, zero failed/skipped**. All twelve ordinary variants still
  attempted zero child processes and retained their behavioral assertions.
- The named CA20 real process crash/settlement case passed **one selected case**:
  `node_modules/.bin/vitest run subs/harness/src/tests/capability-recovery.test.ts -t 'registered real process group survives a service crash' --reporter=json --outputFile=/tmp/plan22-acceptance-plan21-compatibility-ca20-corrected.json`.
  The other 17 cases were filtered. An initial selector omitted “service” and
  selected no cases; its successful command exit is not passing test evidence.
- `npm run type-check` passed. No whole suite or full audit ran.

After the checks, the target's copied-patch bytes and SHA256 remained identical,
while its committed HEAD had advanced to
`1f2785f5c6dbfed794c0d52d4ae62e34de33bcb8`. That newer commit was not part
of this snapshot and was reported to the coordinator. Exact reverse application
of the copied patch succeeded, leaving the isolated worktree clean at the
committed reconciliation merge. Neither the copied unfinished changes nor their
patch contents are committed here.

[Reconciliation evidence](02-capability-acceptance-reconciliation.json) records
source identities, patch hash, selected titles and outcomes. These checks
establish compatibility for that exact temporary snapshot only. The coordinator
owns final integration against the target's current committed and working state.
