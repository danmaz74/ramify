# Iteration 14: Self-check, relocation, completion report

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iterations 11, 12 and 13 (`equivalence`, `lifecycle`,
`resident-measure`; every earlier capability). **Owners:** any owner whose
real violation the self-check finds; the independent scripts scope; plan and
roadmap documents; the development guides' command lists.

## Goal

Turn the resident checker on the eleven-owner toolkit, prove the completed
package works relocated with its own daemon, confirm Plan 1's gate on the
same build, run the unfiltered Plan 2 gate, and close the plan with the
completion report Plans 3 to 6 start from.

## Read first

- Main plan: Validation and completion conditions; Deliverable and
  completion boundary; Exposure rules for the resident owners; matrix row
  I2-30; the self-checking risk row; harness item 8.
- [owners.md](../owners.md): Unchanged owners; Package entries and their
  runtime closures; Manual description review.
- [Tooling roadmap](../../tooling-architecture/README.md): Plan 2: Resident
  verification (Required evidence and next-plan inputs); Information to
  preserve between plans; authoring rule 9.
- Plan 1's [iteration 15](../../done/iteration-1-project-verifier/iterations/iteration15.md)
  and its [completion report](../../done/iteration-1-project-verifier/iterations/iteration15-results.md)
  as the report's pattern; `scripts/reference-harness/relocation.ts` and
  `self-cases.ts`.
- [Development testing guide](../../../development/testing.md): Commands
  currently available, Report what ran.

## Deliverables

1. Self-check: `npm run check:self` over the eleven-owner toolkit, resident
   under a harness-owned `RAMIFY_ENDPOINT_DIR`, reports every owned file with
   no findings or limits; real violations are fixed in their owners, nothing
   is exempted.
2. Independent negative: a temporary contexts probe importing root's
   `RamifyService` type is visible through R6 yet denied
   `required-importer-tag` for `dispatch`, detected by the same engine.
3. Final declarations: `npx tsx scripts/validate-final-contracts.ts` compares
   all eleven `module.ramify` files with owners.md and links every exposure to
   a real export; all eight package entries resolve from a packed install
   (`npm pack`), `./client` within its closure.
4. Relocation: Plan 1's relocated smoke run, with its `--batch` invocations,
   extended with a daemon-backed `ramify check` and `ramify daemon stop`
   inside the relocated install, with an isolated endpoint directory and no
   enclosing repository.
5. Regression: `npm run reference:verify -- --plan 1` passes on the Plan 2
   build with 305 Plan 1 records byte-untouched and the two tree-shape
   expectations harness item 1 names carrying their eleven-owner and
   eight-entry literals; the unfiltered
   `npm run reference:verify -- --plan 2` requires all 176 instances and
   passes; the process suite has a recorded macOS pass; no daemon survives
   either gate.
6. Documentation: the roadmap's Plan 2 row and section advanced from draft
   to the delivered scope with links to the evidence; command documentation
   and the testing guide's command list updated, including the resident
   default of `check:self` and `check:reference` and the `RAMIFY_ENDPOINT_DIR`
   convention; MCP, overlay and explorer claims stay false.
7. The completion report `iteration14-results.md` beside this file: executed
   capabilities and instance outcomes by evidence kind; the client API and
   `./client` closure; lifecycle and error tables; codecs and wire schema;
   revision and freshness guarantees, including revision-addressed reads and
   unpublished delivery; per-platform transport details; final budgets and
   measured values; the direct-service harness and controlled ports; the
   runnable concurrency and recovery fixtures; known limits
   (`unsupported-commonjs`, event replay, compiler-state deferral, the
   reserved `retired` disposition); and Plan 3's starting requirements.

## Matrix rows executed here

- I2-30: `self-check-eleven` (eleven owners, every owned file catalogued, no
  findings or limits); `self-negative-contexts` (visible through R6; denied
  `required-importer-tag` for `dispatch`); `declarations-final` (eleven
  declarations match owners.md; every exposure links); `package-entries`
  (all eight resolve from a packed install; `./client` within its closure);
  `relocated-resident` (daemon-backed check and stop in the relocated
  install; isolated endpoint directory); `plan1-regression` (all 308 Plan 1
  instances pass on the Plan 2 build, 305 byte-untouched and three on the
  revised literals; no daemon survives).

## Verification

Every command in the main plan's validation section, in order, under one
exported `RAMIFY_ENDPOINT_DIR` that the last command's `daemon stop` empties:

```sh
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run build && npm run type-check && npm test
npm run reference:cases && npm run check:reference && npm run check:self
npm run reference:verify -- --plan 1
npm run reference:verify -- --plan 2
npm run measure:resident
npm run reference:report
npm run diagrams && npm run site:build
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kind: `process` for every I2-30 row, over the toolkit copy `T` and
the reference copy `R`. `check:reference` and `check:self` run resident; the
exported `RAMIFY_ENDPOINT_DIR` keeps their daemon out of the user's
directory and the final `daemon stop` ends it.

## Exit criteria

- Every checkbox in the main plan's completion list holds with cited
  evidence; both plan gates pass on one build.
- The completion report exists beside this file and answers every item of
  the roadmap's Plan 2 handoff row.
- The roadmap links the delivered plan and its evidence.

## Handoff

Plan 3 begins from the implemented context, generation, revision and
freshness contracts, the client, the codec, the direct-service harness and
the measured limits this report records, not from the roadmap's proposed
names.
