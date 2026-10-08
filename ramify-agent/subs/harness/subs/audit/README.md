# audit

Implements the harness's in-process adapter to `ramify-audit`, pinned at
version 0.7.2. It hides the library, its evidence model, repository lease,
isolated worktree, publication refs and Git environment from the rest of
the harness. The harness owns gate policy and durable run state; this child
reads the project's committed audit definition, asks the installed provider
for the project's committed audit of an already-made commit, and returns
the provider's result in the harness's vocabulary.

`createConfiguredAudit` answers the `ConfiguredAuditPort`: `read` captures
the committed `ramify-audit.json` at a commit as a
`CommittedAuditConfiguration`, and `run` asks for the audit of a commit in
one of two modes. `project-default` leaves the mode to the provider, which
audits a Ramify project `ramify-partial` from its baseline and any other
project in full; `full` asks for a full audit. Readiness asks `full` of
HEAD; each committing gate asks of its candidate commit, `full` at the final
gate. The request is the one the provider builds from the committed
definition, so its checks, ignore list, preparation and check universe are
the project's own. The harness plans no command, walks no test file and adds
no check: the provider owns discovery, selection by ownership, completeness,
reuse and the verdict.

`sameAuditPolicy` compares two reads of the definition by everything except
the commit they were read at. A run captures the policy at `start-run`, and a
commit whose definition no longer has it is refused: the run never audits
under a policy it did not capture.

Neither mode forces a fresh run. Where the provider returns applicable
evidence of an earlier commit, every later change ignored by that record's
policy, the result keeps both source identities, the report refs and the
ignored changed paths. A completed result that does not answer the request
is `refused` and never a pass: evidence that is not schema-4 ramify-audit
evidence, of another project, definition or check universe, of another
commit, a partial chain for a full request, or a selected check without its
record. `configuredFullRecovery` names the provider failures that qualify a
bounded rerun: a timeout, a test-lock wait that expired, an environment
timeout of a setup command, or a retryable failure other than discovery.

Every request names ramify-audit's built-in `nodejs` workspace preparation
with the definition's declared package directories and setup commands; the
harness registers none of its own. `createConfiguredAudit` requires a
harness-owned workspace-ownership recorder. Its callback completes before
`git worktree add` is forwarded and receives the intended temporary
directory and worktree path, repository and process identities, source
commit, run and attempt. ramify-audit stops the whole process tree of a
setup command that times out or is cancelled, and refuses a setup command
that installs dependencies where the worktree's `node_modules` is linked to
the project's.

`testLockedRunner` serializes suite commands on the machine test lock,
announcing a wait and starting the command's timeout once the lock is
held; tests substitute a private lock. `dispatchHarnessCommand` runs one
command of a standalone session's in-place diagnosis through the
provider's parser over the current bytes, with the harness's process
runner.

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

`ramify-audit` is pinned to the exact version 0.7.2 from the private proxy
registry this package's `.npmrc` names, which also serves the other
dependencies. It is MIT-licensed. No other module imports it. The existing
`legacy-peer-deps=true` setting remains necessary for npm 10.9's Vitest peer
set resolver and does not remove or replace any runtime or test dependency.

## Tests

`src/tests/audit-conformance.test.ts` runs the real library against temporary
real Git repositories with global Git configuration disabled. It pins the
library behaviors that the adapter relies on: command summaries and runner
errors, the inherited environment, registered executors, publication
identity and refs, workspace preparation, every selected check running after
a failure, execution leases and cancellation, cleanup after a killed audit,
same-second replacement, the default mode, reuse of already audited code
unless forced, and evidence recorded under another ignore list never reused.
`src/tests/completed-audit.test.ts` covers which completed results answer a
gate and which are refused, and the captured audit policy.
`src/tests/workspace-preparation.test.ts` reads committed definitions without
executing anything, and `src/tests/test-lock.test.ts` covers the test lock.
