# audit

Implements the harness's in-process adapter to `ramify-audit`, pinned at
version 0.1.0. It hides the library, its registered-executor and evidence
models, repository lease, isolated worktree, publication refs and Git
environment from the rest of the harness. The harness owns gate policy and
durable run state; this child receives a verified check plan and an
already-made commit, executes the audit, and returns the harness's own command
records.

`createAuditCheckExecution` requires a harness-owned workspace-ownership
recorder. Its callback completes before `git worktree add` is forwarded and
receives the intended temporary directory and worktree path, repository and
process identities, source commit, run and attempt. Plan 7 iteration 4 owns
the concrete durable record and cleanup lifecycle.

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

`ramify-audit` is unscoped and is installed from its private proxy registry,
which is why this package's `.npmrc` names that registry. The dependency is
exactly `0.1.0`; no other module imports it. The existing
`legacy-peer-deps=true` setting remains necessary for npm 10.9's Vitest peer
set resolver and does not remove or replace any runtime or test dependency.

## Tests

`src/tests/audit-conformance.test.ts` runs the real library against temporary
real Git repositories with global Git configuration disabled. It pins the
library behaviors that the adapter relies on: command and registered results,
workspace preparation, selectors, execution leases, cleanup after a killed
audit, publication identity and refs, same-second replacement, and the
all-or-nothing publication boundary.
