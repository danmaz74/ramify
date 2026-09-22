# Iteration 3 results: the fixture guard

**Date:** 2026-09-22. **Status:** complete. Branch `feat/plan8-baseline-i3`.

`fixtures/collection-review` is the target project 49 test files copy, and
every one of them assumes it satisfies Ramify's rules. Until now nothing
asserted that on its own: the tests that ran the real checker over the fixture
did so on the way to another assertion, so Ramify's signature-companion rule
could land and leave the fixture failing unnoticed, as KI-4 (BF-1) records.
One harness test now has the fixture as its whole subject.

## Where the guard is, and why

`subs/harness/src/tests/fixture-check.test.ts`, one test:

> the collection-review fixture satisfies Ramify's rules > a fresh copy checks
> with no error and no warning beyond its configuration files

The harness owns the fixture and every helper that copies it, so its own
`src/tests/` is where the guard belongs. The path matches the ordinary node
project's `subs/**/src/**/*.test.ts` include in `vitest.config.ts`, so a
plain `vitest run` picks it up with no environment variable and no opt-in.
`fixture-trials.test.ts` also drives the real checker over the fixture, but
its suites are `describe.runIf(selected…)` behind `RAMIFY_AGENT_TRIAL`, each
trial first runs `npm ci` in a prepared copy, and their subject is a whole
implementation run rather than the fixture. They are not a guard.

## How it invokes the real checker

The guard uses only what the harness already has:

- `copyFixture()` (`subs/harness/src/tests/helpers/fixture.ts`) makes a private
  copy in a temporary directory, so the guard never changes the fixture.
- `realRamify()` (`subs/harness/src/tests/helpers/runs.ts`) is the installed
  `ramify` command line with a daemon of its own, started from this package's
  root so the daemon's compiler helper outlives the copy. `dispose()` stops it.
- `RamifyCli.checkComplete(root)` runs `ramify check --batch --root <copy>
  --format json`: the independent, deadline-free session a gate runs. No fake,
  no stub and no scripted executor takes part.

What it requires of the answer:

- Every entry of the report's `diagnostics` is rendered as
  `<code> <file>:<line> <message>` through the harness's own `findingsOf()`,
  and that list must be empty. Vitest prints the received list on failure, so
  a drift names its code and location in the failure message itself.
- `summary.errors` and `summary.denied` are 0.
- `outcome` is `checked`, exit code 0, `execution: completed`,
  `check: passed`. Exit 2 is not checked and is never a pass, so the guard
  states the passing tuple rather than only the absence of errors.
- The warnings are exactly the two the fixture's compiler configuration
  entails, named rather than counted.

### The two named warnings

The plan asks for zero errors and zero warnings; acceptance row BR05 asks for
zero errors. The fixture's own `tsconfig.json` includes `vite.config.ts` and
`vitest.config.ts` alongside `src` and `subs/**/src`, and those two files lie
outside every module's `src/`. Ramify warns about compiler-selected source
outside a module without failing the check, so a complete check of the
corrected fixture reports `0 errors, 2 warnings`. The same two warnings appear
in the retained trial evidence from Plan 3
(`docs/plans/03-autonomous-implementation-loop/trial/status-badge-tone/run/invocations/inv-0003/hooks/002.json`),
so they are a standing property of the fixture and not a drift.

Requiring zero warnings would mean changing the fixture, which this iteration
must leave untouched. The guard instead freezes the warning set:

```text
outside-module-source vite.config.ts
outside-module-source vitest.config.ts
```

Any other warning, and any change to these, fails the guard. That enforces
"no unaccounted warning", which is what the requirement is for. Should a later
iteration drop the two configuration files from the fixture's compiler
configuration, the named list becomes empty and the guard requires literally
zero warnings.

## Runtime

Measured on the corrected fixture, from `ramify-agent/`:

| Run | Test time | Wall time |
| --- | ---: | ---: |
| First | 4.63 s | 6.22 s |
| Second | 4.45 s | 5.26 s |

The time is one private daemon start, its bounded warm-up check, and one
complete check of the copy. A bare `ramify check --batch` over the fixture
against an already-warm daemon takes 1.4 s. The guard is in the same order as
the harness's other real-checker tests, whose timeouts run from 120 s to
600 s; its own timeout is 300 s.

## Verification

All three from `/tmp/ramify-plan8-i3/ramify-agent`, after the root
`npm install` and `npm run build` the plan's precondition requires.

`npx vitest run subs/harness/src/tests/fixture-check.test.ts` — **pass**:

```text
 RUN  v4.1.11 /tmp/ramify-plan8-i3/ramify-agent

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  19:26:34
   Duration  5.26s (transform 536ms, setup 0ms, import 710ms, tests 4.45s, environment 0ms)
```

`npm run type-check` — **pass**, no output beyond the three `tsc --noEmit`
invocations:

```text
> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json
```

`npm run check:self` — **pass**, exit 0:

```text
Execution: completed; check: passed; coverage: partial
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 8 owners, 276 source files, 13 resources, 4803 accesses
Findings: 0 errors, 0 warnings, 87 analysis limits; 3418 allowed, 0 denied, 1385 external
```

The 87 analysis limits are ramify-agent's standing `signature-inferred` notes;
this iteration adds no source file that is exposed, so the count is unchanged.

## The hand-verified negative case

Verified once by hand and not kept as a test. In the worktree's fixture,
`subs/workspace/subs/reviews/subs/ui/subs/pure-ui/module.ramify` exposes the
view and the props its signature names:

```text
-expose-src ReviewResult, ReviewResultProps from "review-result.tsx" tagged [ui, browser] to parent
+expose-src ReviewResult from "review-result.tsx" tagged [ui, browser] to parent
```

With that one companion removed, the guard fails and names both the missing
companion and the import that can no longer see it:

```text
 ❯ |node| subs/harness/src/tests/fixture-check.test.ts (1 test | 1 failed) 4354ms
     × a fresh copy checks with no error and no warning beyond its configuration files 4353ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |node| subs/harness/src/tests/fixture-check.test.ts > the collection-review fixture satisfies Ramify's rules > a fresh copy checks with no error and no warning beyond its configuration files
AssertionError: expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "not-visible subs/workspace/subs/reviews/subs/ui/src/review-panel.tsx:7 collection-review/workspace/reviews/ui/pure-ui:review-result.tsx#ReviewResultProps: not-visible",
+   "exposed-without-companion subs/workspace/subs/reviews/subs/ui/subs/pure-ui/module.ramify:9 `ReviewResult` is exposed to parent without `ReviewResultProps`, which its signature names (subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx:37:4). Expose `ReviewResultProps` to parent, or remove it from the signature.",
+ ]

 ❯ subs/harness/src/tests/fixture-check.test.ts:64:20

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Duration  5.19s (transform 556ms, setup 0ms, import 733ms, tests 4.35s, environment 0ms)
```

`exposed-without-companion` names the declaration line, the companion that is
missing, the signature position that names it and the correction. That is
enough to repair the drift without rerunning anything.

The fixture was then restored with `git checkout -- ramify-agent/fixtures`.
`git diff -- ramify-agent/fixtures` is empty, and the guard passes again on
the restored fixture, as the verification output above records.

## Acceptance

**BR05** — a test in the ordinary suite checks a fresh fixture copy with the
real checker and requires zero errors: met, with the warning set frozen to the
two the fixture's compiler configuration entails.

**KI-4 (BF-1)** — the fixture's 23 companion exposures are now enforced by a
test of their own, so the fixture cannot drift from Ramify's rules unnoticed.

## Not done here

- The full suite was not run. Focused test files and `type-check` only, as the
  assignment directs; full verification is iteration 6's audit.
- The guard reports the fixture's `coverage: partial` without asserting on it.
  The fixture carries no `node_modules`, so 96 coverage notes — mostly
  `unresolved-target` on external imports — stand. They are nonblocking
  analysis limits, not findings, and requiring `complete` would mean
  installing the fixture's toolchain, which is what makes the trials opt-in.
