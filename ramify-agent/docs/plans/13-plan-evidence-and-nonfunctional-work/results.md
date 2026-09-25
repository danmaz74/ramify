# Plan 13 implementation results

## Iteration 1 — contract alignment and exact capture records

**Starting revision:** `4adc79f4d22319801ed383760b7fab14d09a632d` on
`feat/plan13-evidence-nonfunctional`. The execution worktree had no dirty
files before this iteration. The reviewed plan, analysis, glossary and
principles input edits were already in the starting commit. The main
`/ramify` checkout was not changed.

The [contract appendix](contract-appendix.md) fixes owner operations,
exposures, exact document and passage identity, immutable byte storage,
catalog order, selection append recovery, assessment and candidate binding,
deviation origins, event order and old-run reads. Exactly two untagged harness
children now own the new domain schemas: `plan-evidence` and `nonfunctional`.
The harness owns composition records and a `run-policy/4` default of three
non-functional rounds. Earlier `run-policy/3` records and single-plan
references remain readable; absent non-functional evidence projects
`unavailable`. The web's exhaustive role display map was extended for the
three recorded roles. Completion wording in the harness principles,
CheckFinding principles, acceptance architecture and glossary now separates
automated completion from revision-bound merge readiness.

**Baseline before edits:** `npm run worktree:prepare` completed. From
`ramify-agent/`, `npm run type-check`, `npm run build:web` and
`npm run check:self` passed. The self-check covered 10 owners and 471 files,
with 0 errors, 0 warnings and 287 analysis limits. The existing full
`ramify-agent/audit/ramify-agent-suite.request.json` audit ran in the clean
worktree on the starting commit: run
`88cb2514-2fdf-49ce-bf2e-cd64fefd665f`, source tree
`b7c344292c09dce5d621d9738099dfa2a198cd08`, overall **pass**, all five
checks passed in 217.137 seconds. Its machine report is
`/tmp/plan13-coordination/baseline-audit.json` and published audited run ref is
`refs/audited/runs/2026-09-25T12-30-30Z-4adc79f4d`.

**Focused iteration evidence:** Five Vitest files passed, 56 tests total:
exact multi-document manifest and passage fixtures, changed hash and invalid
passage rejection, stable catalog ID checks, assessment coverage and candidate
tree identity, an old single-plan record and terminal event replay, run policy
and protocol regressions. `npm run type-check` and `npm run build:web` passed.
The exact focused command, run from `ramify-agent/`, was:

```sh
npx vitest run subs/harness/subs/plan-evidence/src/tests/contracts.test.ts subs/harness/subs/nonfunctional/src/tests/contracts.test.ts subs/harness/src/tests/plan-evidence-compatibility.test.ts subs/harness/src/tests/run-policy.test.ts subs/harness/src/tests/protocol-contract.test.ts
```

`npm run check:self` passed across 12 owners and 478 source files, with 0
errors, 0 warnings, 0 denied accesses and 297 analysis limits. The increase
in owner count is the two new children. The harness's generated foreign API
view was refreshed with `node_modules/.bin/ramify materialize --view api --from subs/harness --root .` (revision 1, two targets, 744 entries).
The complete suite was run only by
the baseline audit before source edits; no post-edit full audit is claimed.

**Handoff to iteration 2:** Use
`plan-evidence/src/interfaces/contracts.ts` for captured document, passage and
catalog validation, `runLayout.documentManifest` and
`runLayout.documentBytes` for the immutable files, and the appendix's
byte-file effect and recovery order. Extend `run/inputs.ts` and plan discovery
without changing the old root-plan read path. Record the actual principles
scan in the same manifest's `principlesScan`. New cross-module imports require
a refreshed generated API view. Catalog extraction and incorporation
acceptance are iteration 3 consumers; the added records/events are schemas
only until those paths are implemented. PE01 and PE14 have schema/replay
evidence here; filesystem discovery, semantic judgment, live candidate
binding, browser behavior and final merge readiness remain unverified until
their assigned iterations. No CheckFinding was opened in this iteration.
