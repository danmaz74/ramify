# Execution, gates and evidence

**Status:** execution policy. Iteration 1's baseline gate ran at `33d8a739`
and was red; see [its results](iterations/iteration1-results.md#baseline-gate).

## Checkout and preparation

Execute iterations directly in the isolated toolkit worktree
`/home/app/ramify-pb1`, created from the reviewed plan/specification revision.
Preserve unrelated dirty work in the original checkout. Record source commit,
source tree, configuration blobs, dependency lock digest, tool versions and
plan review revision before work. Keep the checkout and evidence outside
`/tmp`, which does not survive a container restart.

Do not run today's `npm run worktree:prepare`: it installs `ramify-agent`
dependencies, outside this phase's scope. Prepare the checkout with:

```sh
npm ci
npm --prefix examples/collection-review ci
npm --prefix site ci
```

The example install is always required: the audit links the example's
dependencies from the checkout and fails without them. Install the site
packages only when a check of the iteration requires them. Do not launch
toolkit-targeted harness runs. Studio may manage
plan artifacts, but execution must use preparation/checks that respect this
scope; the existing agent-installing preparation is not an acceptable shortcut.

Set a task-specific `RAMIFY_ENDPOINT_DIR` for every scripted resident run. Stop
the daemon using that checkout's built CLI in `finally` and fail cleanup if its
owned process survives. The audit executable is borrowed read-only from its
existing install, identified by version and digest; its checks run candidate
source and dependencies, never the original checkout's build.

## Protected principles and specifications

The phase coordinator owns this procedure under the
[master policy](../project-boundary-sequential/main-plan.md#agent-coordination-and-protected-documents).
Execute it directly; the developing agent harness is not responsible for
enforcing it. Protect project-owned files ending in `.principles.md` or
`.spec.md` throughout the toolkit scope. Do not inspect or change audit/agent
documents to establish this phase's baseline.

Before assigning each iteration, inventory protected paths and record their
source revision and content hashes. Capture existing user edits in the baseline
and preserve them; their presence does not authorize further changes. Prepare
a standalone comparison check before iteration 1's adoption edits. Retain the
baseline and comparison output with the iteration's existing evidence and
review record, using the external receipt policy below. No separate status tree
or new harness capability is required.

Every implementation brief, replacement assignment and resumed assignment
must include the following instruction and the relevant authoritative revision:

> Read the relevant principles and specifications. Do not change any
> project-owned `.principles.md` or `.spec.md` file unless the coordinator has
> authorized the named file and exact patch. Report a contract conflict with
> its justification and proposed wording before changing the document.

The change request and approval record must identify:

- The protected path and section, existing rule, baseline revision/hash and
  exact proposed patch.
- The conflicting requirement and why the current contract cannot satisfy it;
  implementation inconvenience or failing tests alone is insufficient.
- The accepted decision the patch expresses, or the unresolved policy decision
  that needs the user, and the consequences for behavior and acceptance tests.
- The authorizing coordinator, the user's decision when required, and affected
  task briefs, implementation reviews and acceptance receipts.

The coordinator may authorize a specification correction that expresses an
already accepted decision. A principles edit requires a foundational change
or necessary clarification; foundational changes and new behavioral policy
return to the user before authorization. Review the exact wording and document
kind, rather than treating the plan's desired outcome as general permission
to edit an authority. Approval is bound to the baseline and exact patch; changes
beyond it require renewed review.

Iteration 1 took the user's accepted R1–R6 decisions and obtained authorization
for the exact specification-adoption patches before applying them (commit
`6d0c66f0`). Implementation status stays pending. No principle edit is expected; a need discovered during adoption uses
the same change-request procedure. Later status or wording changes to protected
documents also require a documented reason and specific authorization.

At every handoff, compare against the iteration's baseline across committed
changes since its start, the index, the working tree and new untracked protected
files. Include additions, deletions and both old and new rename paths. Match
actual patches to approvals; a filename allowlist alone is insufficient. The
coordinator reviews the full authorized diff for meaning and checks that tests
continue to enforce the intended contract. Record either `no protected changes`
or each approval and the actual reviewed diff identity and outcome.

Unexpected or unreviewed changes leave the handoff unaccepted until resolved.
Preserve unrelated user work while correcting only the implementation agent's
unauthorized changes. Test passes cannot override this check. Repeat it after
subsequent edits or staging and immediately before final candidate acceptance;
revision binding below still applies.

After adoption, supply affected agents with the new authoritative revision and
updated briefs, identify earlier implementation or acceptance evidence requiring
recheck, and invalidate affected receipts. A replacement or resumed coordinator
reads the baseline, approvals and review record before accepting further work.

## Before the first implementation iteration

Iteration 1 adopted the reviewed contracts and qualified verification readiness.
The [planning probe](evidence/full-audit-preflight.json) established a
minimal executable full-mode path for audit 0.3.2. Iteration 1 rechecked the
actual executable, then ran the toolkit's committed full audit and explicit
reference command in the execution checkout.

That baseline at `33d8a739` was red, as
[iteration 1 results](iterations/iteration1-results.md#baseline-gate) record:
the toolkit test in `subs/analysis/src/tests/evaluate-accesses.test.ts` fails
when the environment sets `FORCE_COLOR`, and nine reference instances assert
expectations that predate current behavior. A baseline-repair slice, outside
the numbered iterations and the manifest, repairs these failures before
iteration 2 and passes the gate below on its committed candidate.

Every gate runs from the toolkit checkout, retaining stdout, stderr and exit
code externally:

```sh
PB1_CHECKOUT=/home/app/ramify-pb1
PB1_AUDIT_BIN=/ramify/ramify-agent/node_modules/.bin/ramify-audit
"$PB1_AUDIT_BIN" audit --cwd "$PB1_CHECKOUT" --full --force --json
npm run build
flock /tmp/ramify-audit-tests.lock npm run reference:cases
```

`reference:cases` reads the built `dist/`, so `npm run build` runs in the
checkout first; an unbuilt checkout fails instances for that reason alone.
The reference command is not part of the audit definition, so it takes the
audit's machine test lock explicitly. Every `reference:cases` run in this
plan uses that form; a bare run can overlap another session's suite.

Use the absolute executable above only when that install is still present and
matches the recorded artifact. An identical install in an external tools
directory is allowed; installing it inside `ramify-agent/` is not. The gate
records the actual path/version/digest. `--full` is mandatory; default mode and
partial fallback are not substitutes. `--force` ensures this candidate's checks
actually execute. The committed audit configuration must be the candidate's.

Confirm a successful audit result says requestedMode/executedMode `full`, and
that all required checks completed. An audit pass alone is insufficient: its
current definition omits the reference harness.

## Iteration gates

Every iteration gate audits the clean committed candidate with
`ramify-audit audit --cwd <checkout> --full --force --json` and runs the locked
`reference:cases` command on the same inputs, after `npm run build`, as above.
Run a gate once per slice; repeat only after changed inputs, failures or an
invalidated receipt justify it.

No gate uses the partial audit. Iteration 1 found that the installed audit
decodes the candidate's affected answer strictly, requiring version 1, and
stops reading it by iteration 8 at the latest; with the
[schema versions](contracts.md#schema-versions) placed as they are, it stops at
iteration 3. A full audit takes about four minutes.

R6 fixes the reference harness's location, commands and test inventory, not
its expected values. A slice that changes an output the harness asserts
updates the harness's expected values for that output in the same slice,
including schema identifiers, warning codes and report fields. Each new
expectation is reasoned independently from the contracts, never copied from
the candidate's output, and no case is deleted or skipped. Such a slice's
write scope includes those expectation files beneath `scripts/reference-harness/`.

An iteration is accepted only when every required check of its gate passes.
If a slice cannot pass because a later slice supplies the behavior it needs,
revise the slices before execution so that the dependent changes land in one
candidate; do not accept a slice with a failing required check.

## Focused verification and interim gates

Each iteration lists tests and expected outcomes. New test paths in this plan
are proposed deliverables, not currently runnable commands. Type checks and
focused tests can run before committing. Run a focused file/directory under its
named configuration; do not use `--passWithNoTests`. Independently expected
cases include positive controls, denials, invalid/unavailable outcomes and
failure retention. Two implementations agreeing does not establish correctness.

Each accepted slice records what it implements and what later slices still
lack. Preparing declarations/types before activation may leave whole-tree
acceptance incomplete without breaking the existing baseline. A self-check
finding is a failing required check under [iteration gates](#iteration-gates),
whether or not a later slice was expected to remove it. Failures are repaired
in their owning slice.

## Direct-verification fallback

Fallback is allowed only when the old audit infrastructure cannot execute or
represent the toolkit gate. Preserve its failed attempt, exact limitation and
raw evidence first. An executed failing toolkit check is a toolkit failure,
not permission to bypass it; repair that behavior and rerun it. Do not modify
audit/agent or restore old toolkit schemas.

In an isolated clean checkout at the same candidate commit, run every required
command from that commit's `ramify-audit.json`, in declared dependency order and
with its timeouts, environment and runner configuration. Today's ordered set is:

```sh
git diff --check HEAD^ HEAD
npm run build
npm run type-check
flock /tmp/ramify-audit-tests.lock npm test -- --maxWorkers=4
npm run check:self
flock /tmp/ramify-audit-tests.lock npm run reference:cases
```

This is the only place a full suite runs outside the audit, and only under
the conditions above. Both test commands hold the machine test lock. The
reference command remains additional. Execute commands serially and retain
each result even after failure. Gate receipts live under the external directory
`/home/app/ramify-pb1-evidence/<candidate-sha>/<iteration-or-final>/` during execution,
then are copied into a durable content-addressed handoff archive. Do not rely on
temporary files as the final delivery. Record a direct gate as `verificationKind:
direct`; never report it as an audit pass. The receipt includes exact config
blob/digest and every command's stdout/stderr artifact digest, exit code, timeout
status, duration and parsed test summary where available.

## Final gate

Iterations 20–21 require every case in [cases.json](cases.json). Beyond the
ordinary full-audit and reference-command gate, execute the full reference
acceptance chain on the same candidate build:

```sh
npm run check:reference
npm run reference:verify -- --plan 1 --format json
npm run reference:verify -- --plan 2 --format json
npm run reference:verify -- --plan 5 --format json
npm run reference:verify -- --plan 2a --format json
npm run diagrams
npm run site:build
```

Existing gates' instance counts and correctness results stay binding. Their
timing predicates follow the [budget policy](budgets.md#policy): run the
missing or affected resident, fast and materialization workloads, retain raw
observations and cleanup results, and record each earlier timing target as met
or missed. A gate command that fails only on a timing predicate is recorded
as a missed target, with its correctness instances shown passing separately;
it does not fail the final gate. Any other failure does. Apply only the
explicitly adopted evidence-reuse policies; changed interpretation, source
placement or inputs invalidate affected receipts. Migration does not justify silently
dropping a gate instance or substituting catalogue validation for execution.
Site preparation must consume the candidate artifact as described in iteration
19; build the toolkit before the site. Where explorer data/rendering changed,
run the existing real toolkit browser workflow via
`npm run measure:project-explorer -- --only toolkit`, with its owned endpoints.

Archive new PB1 CLI/process, installed-package, watcher and incremental witnesses
alongside these gates. Full suites run through the audit when it works, with the
explicit reference command alongside it; use the direct path only for the
documented infrastructure fallback. No audit nested flag or new policy field is
required here.

## Revision binding and closing work

Every receipt distinguishes source commit/tree, audited configuration revision,
report commit/ref and package artifact digest. Store final receipts externally
or in audit evidence refs so writing a receipt does not silently change the
qualified source tree. If reports or fixes create another source commit, verify
that candidate again, or identify the prior revision and the limits of reuse.
An audit of one revision cannot certify a different merged tree.

Acceptance defects return to the named producing iteration; invalidate all
dependent tests/receipts affected by the changed contract or code. After the
final candidate gate, create and qualify its local package artifact and handoff.
Commit/merge/publish actions follow the authority of the execution task; this
planning request does not perform them. Between Phase 1 merge and Phase 2's
first audit release, toolkit commit gates remain full and separately execute
the locked reference command under the same fallback policy.
