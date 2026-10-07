# Iteration 1: atomic provider and layout adoption results

**Date:** 2026-10-07. **Status:** source implementation and full adoption
baseline complete; delivery-head applicability is retained in the Git-common
companion described below. **Source commits:**
`2f718f77102217da1720b39684ff76744aba34e8` for atomic adoption,
`4d4eb8de877db003810b8bd9d5cda719275a151a` for bounded compatibility,
and `6a187aead2087221c8ae42c04e77cc05ff2444a6` for the composition
evidence correction, on `feat/plan21-project-boundary-adoption`. The final
audit source is the clean `6a187aea` commit. The coordinator handles the
branch push after receipt review.

## Adopted source and published providers

The package and lockfile make one atomic move to exact registry packages
`ramify.ts@0.4.0` and `ramify-audit@0.7.1`. The respective lockfile integrities
are `sha512-Rs4uxaUKGiLAYvwJIyIlD3GglrFioMzl8vN6udGZNODX7SixB6MVBobpQM3Y2MpaBnVxw/WsuxaEXKrBYDb20Q==`
and `sha512-s2Hwp/6gI92igx2oRH15lG1lkSidQYrsDIdN3tvUZMIRmeqEOzyWqO+kjYHlIazw23uq1b5UpSkVvMh17tfLZw==`.
The second matches the [iteration 0 provider receipt](../provider-receipt.md).
There are no local tarball paths, provider deep imports or copied provider
implementations.

The agent's `module.ramify` is a marked `root module "ramify-agent"` and
declares `owned-unwired "docs"`. The harness declares three individual
`owned-nested-project` roots, exactly at `fixtures/capability-coordination`,
`fixtures/capability-coordination-nested` and `fixtures/collection-review`;
each fixture root is marked, while its child descriptions remain ordinary
modules. The test `rootDescription` helper now marks roots by default, and
intentionally unmarked targets are explicit negative fixtures. The audit
definition removes `enclosingProject` and uses `ignorePaths: ["docs/**"]`.
Scratch, compiler and runner exclusions remain in place.

The installed 0.4.0 probe identified browser TSX fixtures that imported web
testing helpers while living in auxiliary `scripts/`. Their three TSX entries,
HTML resources and asset declaration now live under the existing web owner's
`src/tests/browser-acceptance/` area. Script drivers remain analyzed auxiliary
source and still build/open those fixtures. Vite inputs, HTML URLs and
TypeScript includes were updated together. No testing helpers were exposed to
ordinary source.

Evidence's reader consumes installed `ramify.architect-view/3` and
`ramify.architect-module/3`, and reads ordinary and testing
`ramify.api-view/1` separately. It rejects missing/wrong metadata, module,
source-area or revision and malformed module entries. The new ownership query
calls the installed public CLI and decodes its `ramify.affected/4` answer,
including source identity, topology, exclusions and path selections. Contradictory
parent, owner or selection relationships refuse decoding; policy decisions are
left to iteration 3. The minimal audit type adaptation recognizes schema 4.

## Acceptance witnesses

- **PB3-A01:** the installed CLI recognizes the agent and all three marked
  fixture roots. A child-module materialization without `--root` selected the
  agent project root, with current architect and both source-area API views.
  An explicit unmarked target refused before work.
- **PB3-A02:** [real changed-check evidence](../evidence/iteration1-doc-changed-check.json)
  reports `.md`, `.ts`, `.mts` and `.mjs` docs as `not-analyzed`, owned by
  `ramify-agent` under `owned-unwired docs`; affected ownership selects no
  module. The same `.ts` extension in `scripts/browser-acceptance/run.ts` is
  `checked` auxiliary source. The [three fixture answers](../evidence/iteration1-capability-coordination-root.json)
  select their marked nested-project roots individually; see also
  [nested coordination](../evidence/iteration1-capability-coordination-nested-root.json)
  and [collection review](../evidence/iteration1-collection-review-root.json).
  Collection review's analysis check passes with partial coverage; the two
  capability fixture analysis checks fail. These artifacts witness root
  selection, not passing structural checks for the incomplete fixture trees.
  Ordinary owner write authority over `owned-unwired` docs awaits iteration 3.
- **PB3-A03:** `check:self` exits 0 with zero errors, warnings or denials across
  12 owners, 583 files, 55 resources and 11,580 accesses after the follow-up. The real negative
  auxiliary-import control is denied. Ramify records 319 nonblocking analysis
  limitations and partial coverage; these are diagnostics, not silent absence
  of a foreign API.
- **PB3-A04:** current architect and separate ordinary/testing API materializations
  share the revision and selected root. Reader tests refuse wrong/missing
  architect metadata, wrong/missing API module and revision, wrong API source
  area, malformed entries and contradictory ownership identities.
- **PB3-R03, adoption-baseline half:** the released 0.7.1 CLI ran full audits
  against exact clean implementation commits. Its final schema-4 report,
  composition and configured expected-file completeness are recorded below;
  the final nested audit belongs to iteration 11.

The earlier focused Vitest run passed six files and 31 tests. Its expanded
nine-file, 67-test run passed 66 and failed one registered-executor
expectation that conflicts with the new provider's unsupported-discovery
contract. After updating that test, its focused rerun passed **one selected
test**; 18 other tests in that file were skipped, not counted as passing.
The old assertion of partial
reuse and carried failure for a registered `npm test` executor was **replaced**:
local tests can pass while expected-file discovery is unsupported, yielding
`indeterminate`, and a later requested partial falls back to full with
`baseline-indeterminate`. Configured-runner partial/carry behavior is witnessed
by the separate iteration 0 provider fixtures; agent integration belongs to
iteration 9. `npm run type-check` and `npm run check:self` both exited 0.

Earlier focused verification used installed Vitest on the evidence reader,
project boundary, registered executor, HTTP and Pi agent files. The original
exact file argument list and name filter were not retained, so the preceding
counts are historical focused evidence rather than a reproduced command.
The final released audit below runs the configured complete suite. After the
composition correction, these exact commands exited 0 from the package root:

```sh
cd ramify-agent
./node_modules/.bin/vitest run subs/harness/src/tests/composition.test.ts
npm run type-check
npm run check:self
```

The focused composition run passed seven tests. `check:self` reported 12
owners, 583 source files, 55 resources, 11,580 accesses, zero findings and
319 nonblocking analysis limits. The composition correction moves
`audit-unselected` from a claimed registered-executor producer to an explicit
gap: the current legacy executor falls back to full mode when configured
discovery is unavailable. The provider's empty-selection witness is in
iteration 0; agent consumer behavior remains PB3-T05 for iteration 9.

Browser relocation was verified with three Chromium drivers. The current
[Plan 11 result](../evidence/iteration1-browser/plan11/browser-results.json)
passes 47 checks and has seven screenshots; the fresh
[Plan 13 result](../evidence/iteration1-browser/plan13/plan13-readiness-browser-results.json)
passes 14 checks and has five screenshots; the
[Plan 14 result](../evidence/iteration1-browser/plan14/catalog-review-browser-results.json)
passes 13 checks and has two screenshots. Plan 11 first lacked a generated
`dist/` directory in this fresh worktree, then exposed a stale fixture-client
shape; the directory and client were repaired before its final passing run.
Plan 13's historical saved fixture (SHA-256
`c0d28e5e63f7ddd6a5b37b31f4adfd6f3a42e31197b3883547448d85b37c7d64`)
failed with `Cannot read properties of undefined (reading 'join')` and an
empty root element. That failure is retained in the
[failure record](../evidence/iteration1-browser/plan13-stale-fixture-failure.json),
not relabeled as a pass. A fresh current projection (SHA-256
`b499cb076852310b8b8a5eb8465470e9245853716edfc0bb9130132dcdb8b42f`)
passed the same browser assertions. Historical tracked evidence files were
restored; new output is in the iteration 1 evidence directory.
The browser drivers are reproducible from the package root after `npm run
build:web` with the installed `tsx` CLI:

```sh
npx tsx scripts/browser-acceptance/run.ts
PLAN13_READINESS_FIXTURE=docs/plans/21-project-boundary-adoption/evidence/iteration1-browser/plan13/plan13-readiness-fixture.json npx tsx scripts/browser-acceptance/plan13-readiness.ts
npx tsx scripts/browser-acceptance/plan14-catalog-review.ts
```

## Full baseline and handoff

From the repository root, the released provider ran the committed project
definition with this exact command:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --json
```

It exited 0 against clean source
`6a187aead2087221c8ae42c04e77cc05ff2444a6`, source tree
`2d5f8ecd8cabf10e5c050087e226d44f44829a80`. Producer
`ramify-audit` 0.7.1 published evidence schema 4, run ID
`4557c927-9f92-48e4-bc1e-157ed8d7f83a`, report commit
`f2e4fbcc8778b4e124560cef6b03eb4eeca125d8` and run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-07T12-15-41Z-6a187aead`.
The audit's overall result and combined composition verdict are both `pass`,
with zero outstanding failures. The full configured expected-file record is
`runner-configured-files/1`: 254 expected, 254 run, none missing, status
`complete`, from `vitest.config.ts`. Its Vitest command passed 252 files and
2,000 tests, with zero failures; two optional files and seven optional tests
were skipped. The skipped tests remain unrun. Structural check, type check,
web build and patch integrity all passed. The local complete JSON is
`/tmp/ramify-plan21-i1-audit-6a187aea.json`; stderr is empty.

The first released full audit of `2f718f77` produced schema-4 report
`d1cf9336569995219b51b29f2664387c7b3bdcc9`, run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-07T11-32-06Z-2f718f771`,
and failed composition.
Runner discovery was **complete**: 254 configured expected files, 254 run,
none missing; the configured Vitest command reported 1,989 passed, 10 failed
and 7 skipped tests across 254 files. The seven skips are optional legacy
fixture-acceptance/trial cases under `RAMIFY_AGENT_FIXTURE_ACCEPTANCE` or
`RAMIFY_AGENT_TRIAL`; they are recorded as skipped, not passing. Patch
integrity, type check, structural check and web build all passed. The ten
failures in six files exposed cached architect-revision comparison after a
fresh API materialization, the current `ramify.measure/2` format, stale
synthetic view metadata, and prior provider assumptions in fixture and audit
conformance tests. The initial report remains a failed diagnostic, never a
substitute for the final baseline.

The bounded `4d4eb8de` follow-up compares API views with the newly published
architect revision, retains an explicit unavailable answer if that publication
cannot be read, reads `ramify.measure/2` including unavailable API-view bytes
without zeroing them, and aligns the synthetic fixtures and existing test
expectations with current provider behavior. The reuse conformance witness
now requests full mode and an explicit `docs/**` ignore policy. Missing
architect/API metadata and wrong current revision have explicit refusal
controls. Its first eight-file focused run passed seven files and 40 tests,
with one synthetic fixture failure diagnosed and corrected; the final
three-file focused run passed 10 tests. `npm run type-check` and `npm run
check:self` passed again after the source edits. An attempted full audit of
`4d4eb8de` started and was then interrupted: the local JSON file is zero
bytes, and no corresponding provider run ref was published. It has no
completed verification result, verdict or report identity. The clean
final full audit above checks all configured files at `6a187aea`.

The protected `.principles.md` and `.spec.md` inventory contained 16 files.
All 16 entry hashes match committed, index and worktree content after the
implementation commit. No protected file was edited, staged, deleted or
renamed. The two frozen harness specification patches remain reserved for
iterations 5 and 6. The remaining adapter/policy work is scoped to later
iterations; this iteration establishes provider compatibility and the clean
baseline only.

The documentation-only receipt commit follows the audited source. The
released provider's `check-branch HEAD --project-root ramify-agent --cwd .
--json` applicability response, both source identities and final protected
comparison are retained after that commit in the worktree's Git common
directory as `plan21-iteration1-handoff.json`. This companion leaves the
delivery HEAD unchanged for the applicability query. Later ordinary
iterations use focused checks and the released provider's normal partial
mode; their own briefs name any additional full gate.
