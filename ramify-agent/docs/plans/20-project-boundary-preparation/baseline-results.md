# Plan 20 baseline audit

Baseline source: `054a412ff2cbf4545e9ed01e77528bfdabaece3c`, a clean commit carrying the supplied plan, accepted scratch lifetime specification and spike deletion. The original `/ramify` checkout was not modified.

Command, from the worktree root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

The audit was started before iteration 1. After a 609-second shared test-lock wait, it ran against its captured isolated commit while iteration work proceeded. The full audit failed on one existing timing-sensitive test: 245 files passed, one failed and two skipped; 1,945 tests passed, one failed and seven skipped. Type checks, structural checks, web production build and patch integrity passed.

- Audit reference: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-04T08-27-26Z-054a412ff`.
- Report commit: `b3b312220466a5deabc6da73ca5af6de070fe41f`.
- Failing test: `CA08 CA11–CA15 CA17 CA25 CA30: real multi-owner migration, repair, handback and linked revision` in `subs/harness/src/tests/capability-acceptance.integration.test.ts`.
- Failure: ENOENT reading `capabilities/cap-002/task.json` immediately after observing `capability-delegated`.

The ledger publishes its committed event before materializing its record files (`appendLine` precedes `materializeLine`). The test now waits for the task-file projection it asserts against, without changing its assertions. The isolated failing case passed before the fix (64.58 seconds), confirming the baseline failure was timing-sensitive rather than deterministic. It passed after the fix (63.60 seconds):

```sh
npm test -- subs/harness/src/tests/capability-acceptance.integration.test.ts -t 'CA08 CA11'
```

This test also contained a scripted root-description write missed in iteration 1; it now uses `rootDescription`. The final full audit remains required; the focused pass does not replace it.
