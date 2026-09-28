# audit

Implements the harness's in-process adapter to `ramify-audit`, pinned at
version 0.2.1. It hides the library, its
registered-executor and evidence models, repository lease, isolated worktree,
publication refs and Git environment from the rest of the harness. The harness owns gate policy and
durable run state; this child receives a verified check plan and an
already-made commit, executes the audit, and returns the harness's own command
records.

`createAuditCheckExecution` requires a harness-owned workspace-ownership
recorder. Its callback completes before `git worktree add` is forwarded and
receives the intended temporary directory and worktree path, repository and
process identities, source commit, run and attempt. Plan 7 iteration 4 owns
the concrete durable record and cleanup lifecycle.

Every request names ramify-audit's built-in `nodejs` workspace preparation;
the harness registers none of its own. It links the installed dependencies
of the project root and of each nested package whose tests a gate runs into
the worktree, then runs the project's setup commands there in order, never a
build the project did not declare, each command's output captured under the
attempt's `setup-output/`. The gate's leading `setup` checks are forwarded as
those commands rather than run as audit checks, and each is announced as the
preparation starts its process. Their records come from the preparation's
evidence, or, when it stopped at one, from its failure details: the commands
before it passed, the one that stopped it failed with its exit code or not
verified with the preparation's own error code, and every later command not
run. A preparation failure that names no setup command is the audit's own
failure, recorded with its code and message. This needs the `nodejs`
preparation of ramify-audit 0.1.1 or later, which takes `setupCommands`.

ramify-audit stops the whole process tree of a setup command that times out
or is cancelled; the command's record carries how, in words, as `stopped`,
and `outputIncomplete` where its output streams stayed open after it ended,
both read from the preparation's `termination` and `outputIncomplete`, which
0.1.1 and later record. A setup command that installs dependencies (`npm ci` and the
like) where the worktree's `node_modules` is linked to the
project's is refused before it runs: its record is not verified with the
runner error `setup-command-unsafe-with-linked-modules` and a message naming
what the project must change, which the gate attributes to infrastructure.
Readiness refuses such a command first. An audit whose worktree HEAD moved
during it fails with `source-revision-moved`, which is infrastructure too;
the message says where the audit found the move and which checks had
completed.

Every request sets `force: true`. ramify-audit 0.2 otherwise answers a
request for code it already audited with that earlier audit, running and
publishing nothing, and keeps the earlier commit as the summary's
`sourceCommit`. A gate needs its own checks run over the commit it just made,
so reuse is never harmless here. A completed result that still carries
`reused`, or whose `summary.sourceCommit` is not the requested commit, is the
audit's own failure: every command is recorded not verified with the runner
error `audit-reused` or `audit-result`, which the gate attributes to
infrastructure, and nothing of that result is read as the gate's verdict.

A setup command's environment is ramify-audit's: the inherited one without
`NODE_OPTIONS`, plus the command's declared `env`. It is not the allowlist
the harness builds for the commands it spawns itself.

A `scenarios` check runs through the harness's `runScenarioCheck`, as the
in-place runner runs it, with the audit's path mapping: the runs start in the
worktree, the configured commands' paths are rebased into it, the profiles
and message streams stay in the attempt's directory outside it, and printed
worktree paths are restored. ramify-audit's own Cucumber summary
(`CUCUMBER_SUMMARY_FILE`) is not used; the check's outcome is the harness's
reduction of the message streams, and the audit records its summary.

## Why it is separate

An audit is one implementation of the harness's gate-execution port. Correctly
using it requires keeping its selector, check IDs, workspace path mapping,
registered executors, repository lease, publication transaction and recovery
behavior together. Keeping those details here lets the harness compose an
audit without importing the external package or understanding its temporary
workspace and evidence formats. It is a child rather than a root sibling
because only the harness consumes it and the harness remains responsible for
the gate and every durable record.

## Dependency

`ramify-audit` is pinned to the exact version 0.2.1 from the private proxy
registry this package's `.npmrc` names, which also serves the other
dependencies. It is MIT-licensed. No other module imports it. The existing
`legacy-peer-deps=true` setting remains necessary for npm 10.9's Vitest peer
set resolver and does not remove or replace any runtime or test dependency.

## Tests

`src/tests/audit-conformance.test.ts` runs the real library against temporary
real Git repositories with global Git configuration disabled. It pins the
library behaviors that the adapter relies on: command and registered results,
workspace preparation, selectors, execution leases, cleanup after a killed
audit, publication identity and refs, same-second replacement, the
all-or-nothing publication boundary, and reuse of an existing audit unless the
request forces a new one. `src/tests/completed-audit.test.ts` covers how the
adapter refuses a reused or mismatched completed result.
