# Plan 25 execution rules

[Main plan](main-plan.md). **Status:** proposed; implementation not started.

## Base, ownership and handoff

Use an isolated clean committed checkout containing completed Plans 23/24. Record
branch/base/head and dependency receipts. Preserve unrelated planning-checkout
edits. Execute iterations serially; no parallel shared prompt/runtime/protocol
writes. Former Plan 26 has been incorporated; do not run its old manifest.
The six iterations in this plan are the only implementation sequence. Reconcile
any intervening reviewer-diff changes before touching shared callers.

Harness owns discovery record transport and block delivery. Existing agent/pi/ledger session contracts remain.
No new cross-module implementation import is required. Discover any unexpected
foreign API via the generated consumer view before proposing a boundary change.
Paths in briefs are relative to `ramify-agent/`.

Each source iteration has a commit and `iterations/<NN>-results.md` recording
behavior, commit, checks and limits. Update the manifest only after the owning
checks run. No merge, push or publication is requested by plan authorship.

## Verification

Run focused ordinary tests from `ramify-agent/` with
`npm run test:quick -- <exact file filters>`. Script all external boundaries under
the [testing specification](../../testing.spec.md). Run type-check and check:self
for source handoffs. Run baseline and final configured audits from the clean
committed repository root, respectively:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

No direct whole-suite run. Existing native witnesses stay in configured final
qualification; scripted payload checks introduce no new native exemption.
Keep historical manifests/receipts unchanged. Update current specs only after
integration. Final evidence joins cases, commits and audit identity/coverage.
No live benefit trial or performance comparison is an acceptance gate.

## Acceptance and scope

Preserve the original discovery and instruction case IDs in acceptance.md; the
manifest assigns each case to one owning iteration. Later qualification reruns
relevant regressions and joins prior receipts. Tests for block history must pass
through task/session construction as well as the pure resolver. Run the single
final audit only after all discovery, NFR and delivery work is integrated.

Current source specifications are implementation deliverables. Plan consolidation
changes only planning artifacts and the document index. Do not edit runtime code,
user work or historical trial evidence during this planning task. Product/semantic
authority, review concurrency and provider cache routing remain unchanged.
