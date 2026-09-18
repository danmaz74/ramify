# Iteration 4 results: Render the architect view

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `12adc75`, iteration 3's completed results.
The implementation commit is `8366239`. Build, type-check and `check:self` were run on that commit.

## Prerequisites

- Iteration 3 is complete, and its handoff held:
  - the projection types were in `interfaces/architect-view.ts`, exposed to root by A16;
  - modules came in tree order, symbols by module and name, and `destinations` and relay `to` lists in byte order;
  - `purpose.text` was uncut, and `counts.cut` counted cut details once per symbol plus every cut title;
  - suite and feature records were already split at 40 titles.
- Plan 6D's `DependencyDiagramFacts` and `analyzeDependencyDiagram` were unchanged. The renderer follows the unit
  precedence of `headlineOf` in `dependency-diagram.ts`.

## Built

### `analysis`

- `src/interfaces/architect-view.ts` gains C4's types as the contract names them:
  - `ArchitectDependencyReason` and `ArchitectDependencies`;
  - `ArchitectViewFile` and `RenderedArchitectView`.
- `src/architect-render.ts` (new) holds `renderArchitectView(input)`.
  - **Purity.** Its only runtime import is `byteOrder` from `modularity-context.ts`, which imports only types. It reads
    no compiler, filesystem or session module.
  - **Input check.** Measured facts whose `inputId` differs from the projection's throw. A symbol or test record naming a
    module the projection does not list also throws.
  - **Units.** The boundaries are grouped by consumer module and original identity `(owner, file, binding, kind)`:
    - a unit is behavioral when any boundary is, else unknown when any is, else non-behavioral;
    - each unit puts its consumer in one of the record's `behavioral`, `nonBehavioral` and `unclassified` lists;
    - `uses` of M and `usedBy` of O count, per (M, O) pair, M's units on originals whose `originalOwner` is O.
  - **Records.** Each symbol gives one `behavior.jsonl` line when `behavior` is not null, else one `supporting.jsonl`
    line:
    - keys are in the specification's order, optional fields are omitted, and `file` is last;
    - `as` holds at most four names, and each consumer list at most twelve, each with its `…More` count;
    - `sig`, `doc`, `cut` (`signature` and `overloads` give `sig`) and `detail` come from the projection's detail.
  - **Test records** hold `module`, `file`, then `suite` and `tests`, or `feature` and `scenarios`. `feature` is omitted
    when it is null.
  - **Order.** Behavior records go exposed first, then by behavioral and non-behavioral consumer counts descending,
    then by `name`, `file` and identity. Supporting records use the same order without the behavioral count. Test
    records keep the projection's source order within each file.
  - **`module.json`** is written by a small formatter, which the specification now describes. A present purpose and
    each nonempty `uses` or `usedBy` span lines; every other list and object stays on one line.
  - **`README.md`** holds these parts, in order:
    - the instruction block, in a `text` fence;
    - `Revision <revision> · input <input>`;
    - one map entry per module, indented two spaces per level.
  - **`_meta.json`** is one line. Its `cut` adds the purposes cut at 600 bytes to the projection's `counts.cut`.
  - **Result.** `files` are in byte order by path and include `_meta.json`. `records` counts the JSONL lines, and
    `bytes` their UTF-8 total.
  - `architectInstructions` exports the instruction block, which the test compares with the specification's text.
- `src/index.ts` exports `renderArchitectView`.
- `module.ramify` gains statement A17, `expose-src renderArchitectView from "architect-render.ts" to parent`. C4's types
  are covered by A16's `*`.

### Outside the owner

- Root `module.ramify` gains R11. It re-exposes every name of `interfaces/architect-view.ts`, `renderArchitectView`,
  `ExportKind`, `ExportBehavior` and `TestTitleLimits` from `analysis` to descendants, for `daemon` and
  `daemon/contexts`.
- `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` records A17 and R11 in its snapshot of the toolkit's
  descriptions.
- `docs/architecture/architect-view.spec.md` fixes the formats it left open. See [Deviations](#deviations).

### Tests

- `src/tests/architect-render.test.ts` (new) has 23 tests.
  - A `beforeAll` computes the `architect` fixture's real projection from an in-process session, with the fixed
    `inputId` `input/1:architect`.
  - It computes the real dependency facts with `analyzeDependencyDiagram` over that revision's `report()`, and sets
    their `inputId` to the same value. It first checks that both real `inputId`s equal the revision's.
  - Synthetic projections cover bounds, precedence, ordering, cuts and counts that the fixture cannot reach.
- `src/tests/fixtures/architect-view-measured.txt` and `architect-view-unavailable.txt` (new) are the golden files. Each
  holds every rendered file under a `==> path <==` line, and the test compares the whole text byte for byte. Setting
  `RAMIFY_UPDATE_GOLDEN=1` rewrites them.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV12 | See the AV12 witnesses below | pass |
| AV13 | See the AV13 witnesses below | pass |
| AV14 | See the AV14 witnesses below | pass |
| AV15 | See the AV15 witnesses below | pass |
| AV16 | See the AV16 witnesses below | pass |
| AV17 | See the AV17 witnesses below | pass |
| AV18 | See the AV18 witnesses below | pass |

Golden witnesses:

- **Boundaries.** A test first asserts the fixture's eight boundaries, which are the ones `iteration3-results.md`
  lists.
- **Golden files.** Both dependency states render exactly the golden files.
- **Specification example.** On the toolkit, `createProjectBinding`'s record is byte-identical to the specification's
  `behavior.jsonl` example. See the [toolkit measurement](#toolkit-measurement-deliverable-6).

AV12 witnesses:

- **File set.** In both states the paths are exactly `_meta.json`, `README.md` and the four module files at the root
  and in `alpha/`, `beta/`, `checks/`, `core/`, `core/engine/` and `gamma/`, in byte order. That is 30 files for 7
  modules.
- **Empty files.** Every file ends in a newline. The empty record files the test names, such as `beta/tests.jsonl`,
  `gamma/tests.jsonl` and the root's `tests.jsonl`, are `"\n"`.
- **Totals.** `records` equals the JSONL line count and the projection's 18 symbols plus 4 test records (22). `bytes`
  equals the UTF-8 total.

AV13 witnesses:

- **Field order.** Every fixture record in both states has its keys in the specification's order, with `file` last and
  no `null`. Supporting records carry `kind` and never `shape`.
- **Exact records.**
  - `default` has `binding: "boot"`.
  - `begin` has `as: ["launch"]` and two `reexposed` entries, nearest first.
  - The stylesheet has `kind: "resource"` and `detail: "unsupported-declaration"`, and no `sig`.
  - `Config` has no `value`.
- **Bounds.** A synthetic original has six exposure names, 15 behavioral consumers and 13 unknown ones:
  - it gives `as` with four names and `asMore: 2`;
  - `behavioral` with twelve and `behavioralMore: 3`;
  - `unclassified` with twelve and `unclassifiedMore: 1`.

  A supporting original with 15 consumers gives `nonBehavioralMore: 3`. Twelve consumers give no count.
- **Cuts and details.**
  - `signature` plus `documentation` gives `cut: ["sig","doc"]`, `overloads` gives `["sig"]` and `documentation` gives
    `["doc"]`.
  - An unavailable detail gives `detail` and no `sig`. A described detail gives no `cut`.
- **Test records.** Their key order is exact, and a feature without a `Feature:` title omits `feature`.

AV14 witnesses:

- **Fixture consumer lists** (measured):
  - `Engine`: `behavioral` `fixture/alpha` and `fixture/core`, `nonBehavioral` `fixture/beta`. alpha's behavioral
    boundary through `engine` and its non-behavioral boundary through `core` form one behavioral unit.
  - `loose`: `unclassified` `fixture/gamma`.
  - `run`: `behavioral` `fixture` and `fixture/beta`.
  - `begin`: empty lists, still present.
  - `Config`: `nonBehavioral` `fixture/core/engine`.
- **One list each.** No record lists a module twice, and no record lists `fixture/checks`.
- **Module pairs.** Every module's `uses` and `usedBy` equal a hand-written expectation, and `fixture/checks` has none.
  For example, `core/engine` has four `usedBy` entries, alpha and core behavioral, beta non-behavioral and gamma
  `unknown: 1`.
- **Precedence (synthetic).** One original is imported through two modules:
  - behavioral plus unknown boundaries give `behavioral`;
  - non-behavioral plus unknown give `unclassified`;
  - two non-behavioral boundaries give `nonBehavioral`.

  The consumer's `uses` counts one unit per original. The relaying module, which owns nothing, has no `usedBy`.
- **Unavailable dependencies.** No record has a consumer field or `…More` count, and no `module.json` has `uses` or
  `usedBy`. `_meta.json` names each of the five reasons.
- **Supporting disagreement.** A supporting original with a behavioral unit lists that consumer in `behavioral`. See
  [Deviations](#deviations).

AV15 witnesses (synthetic, symbols given in reverse):

- **Measured.** Behavior records read gamma (2 behavioral), beta (1 behavioral, 2 non-behavioral), alpha (1, 0), then
  internal epsilon (3) and delta. Supporting records read eta (2), Zeta (1), then internal theta; a behavioral use of
  Zeta does not reorder it.
- **Unavailable.** Records go by name within each role: alpha, beta, gamma, delta, epsilon; `Zeta` before `eta`.
- **Ties.** Two `default` originals are ordered by file.
- **Module pairs** go by behavioral, non-behavioral and unknown count, then by identifier.
- **Test records** go by file, keeping source order within a file.

AV16 witnesses:

- **Instruction block.** `architectInstructions` equals the block extracted from the specification's agent
  instructions. The README opens with it in a `text` fence, then the revision line.
- **Map.** The fixture's map equals 16 expected lines:
  - tree order, two spaces per level, with `[ui]` and `[testing]`;
  - `(no README purpose)` for `engine`;
  - the counts lines;
  - `headline: run` and `headline: Engine, begin, loose`.

  Unavailable dependencies give `uses ? · used by ?` and no numeric `uses`.
- **Purpose cut.** 598 ASCII bytes, then `é`, then `z`, is cut after `é` to 600 bytes:
  - `module.json` gives it with `"cut": true`;
  - the map gives the same text followed by `…`;
  - `_meta.json` gives `cut: 1`.

  599 bytes followed by `é` loses the `é`. Exactly 600 bytes is kept whole, with no `cut`.
- **Headline.** Ten exposed behavior records give eight names in significance order and `, … +2`. Exactly eight give no
  `+N`. Internal and supporting records never appear.

AV17 witnesses:

- **Metadata.** `_meta.json` is byte-exact in both states, with `dependencyReason` after `dependencies`.
- **Exceptional counts.** All six counts appear when nonzero, and none appears when zero.
- **`module.json`.** Every `module.json` has the fixed key order and `revision`.
  - `core/module.json` equals a whole expected document.
  - `engine` has `purpose` `missing` and `unknown: 1`.
  - The root has `dir: ""` and `parent: null`.

AV18 witnesses:

- **Determinism.** A `structuredClone` of the input renders identical bytes and an equal result in both states.
- **No host values.** No file holds the fixture root, `tmpdir()`, the working directory, the toolkit path, an ISO
  timestamp or the process id.
- **Input mismatch.** Measured facts with `input/1:other` throw, naming both inputs.
- **Imports.** The renderer's only runtime import is `./modularity-context.js`, whose imports are all types.

Mutations were each restored from a copy after their run. Each of these made at least one test fail:

- no `…More` counts;
- internal before exposed;
- an uncut purpose;
- no input check;
- per-boundary instead of per-unit counting;
- no consumer-count ordering;
- unsorted test records;
- zero exceptional counts kept;
- a headline bound of nine;
- unknown before behavioral precedence. This one first passed: the fixture has no unit with both classes, so the
  synthetic precedence test was added and now fails under it.

## Toolkit measurement (deliverable 6)

- **Method.** A scratch script, not committed, opened an in-process session over this worktree at `8366239`:
  - it used the CLI's capabilities and the resident's analysis limits, with `maxReportBytes` raised to 128 MiB;
  - it queried `architectView` with the plan's limits;
  - it ran `analyzeDependencyDiagram` over the same revision's `report()`;
  - it rendered both dependency states.

  The renderer did not throw, so the analyzer's `inputId` equalled the projection's.
- **Inputs.**
  - Open took 4.8 s, the projection query 0.8 s and the analyzer 6.2 s.
  - The projection is 1,185,127 bytes: 15 modules, 1,281 symbols and 282 test records.
  - The facts hold 495 boundaries, with complete coverage.
- **Rendered view.**

  | | Measured | Unavailable |
  | --- | ---: | ---: |
  | Files | 62 | 62 |
  | Records | 1,563 | 1,563 |
  | Total bytes | 730,402 (0.70 MiB) | 681,126 (0.65 MiB) |
  | `README.md` bytes | 9,259 | 9,284 |
  | Largest `behavior.jsonl` | `analysis/`, 50,251 bytes | `analysis/`, 45,739 bytes |
  | Render time | 9.6 ms | 4.3 ms |
  | Byte-identical re-render | yes | yes |

  Per file kind, measured:

  | Kind | Files | Bytes | Lines | Mean characters | Max characters |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | `behavior.jsonl` | 15 | 219,113 | 544 | 401.8 | 793 |
  | `supporting.jsonl` | 15 | 324,623 | 737 | 439.1 | 809 |
  | `tests.jsonl` | 15 | 154,062 | 282 | 545.2 | 2,586 |
  | `module.json` | 15 | 22,987 | — | — | — |

- **Metadata.** `_meta.json` records `cut: 346`, `detailsUnavailable: 1` and `dynamicTitles: 19`; no purpose was cut.
- **Budgets.**
  - **View size, met.** 0.70 MiB against the 8 MiB budget.
  - **Mean behavior record, exceeded.** The target is at most 300 characters, recorded as evidence. The measured mean is
    **401.8 characters** (364.5 without dependencies), with a median of 379, a 90th percentile of 572 and a maximum of
    793. By field, a behavior record averages:
    - `sig` 118.6 and `doc` 78.4 characters;
    - `file` 50.9, `module` 31.1 and `name` 24.3;
    - the fixed `shape` and `role` keys 37.0;
    - the two always-present consumer lists 37.2;
    - `tags` 12.3, `reexposed` 6.0, `to` 2.8 and `cut` 1.9.

    Records with a `doc` average 454.8 characters (324 records); those without average 323.6 (220). Exposed records
    average 465.2.
  - The hand-made prototype averaged 641. Nothing was changed to meet the target: the record shape and bounds are the
    specification's.
- **Reference project**, by the same script:
  - 62 files and 123 records, 82,241 bytes;
  - `README.md` 7,895 bytes;
  - 41 behavior records averaging 486.7 characters (437.5 without dependencies).

## Verification

```sh
npx vitest run subs/analysis/src/tests/architect-render.test.ts          # 23 passed
npx vitest run subs/analysis/src/tests/architect-view.test.ts            # 12 passed
npm run type-check                                                       # clean
npm run build                                                            # built
npm run check:self   # passed: 15 owners, 409 source files, 14 resources, 5965 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

These were run on the committed tree. Additional focused runs cover the paths this iteration touched:

```sh
npx vitest run subs/analysis/src/tests/architect-view-session.test.ts                  # 9 passed
npx vitest run subs/analysis/subs/descriptions/src/tests/descriptions.test.ts          # 31 passed
npx vitest run src/tests/project-view-reports.test.ts                                  # 2 passed
```

- **Repeated runs.** `architect-render.test.ts` passed on each of four runs.
- **`check:self`** ran twice with an owned `RAMIFY_ENDPOINT_DIR`, `/tmp/rp2b4-ep`, created with mode 0700. Each time,
  the daemon was stopped with `dist/src/ramify daemon stop` and `daemon status` answered `not running`. Its PID (365568,
  then 367677) was gone, and the directory was removed.
- **Full suite.** The full test suite was not run.

## Deviations

- **Type location.** C4 places its types "in `analysis`", and the iteration names `src/architect-render.ts`. The types
  are in `interfaces/architect-view.ts` beside C3's, so A16's `expose-src *` covers them. Only the function is in
  `architect-render.ts`.
- **Additional export.** `architectInstructions` is exported from `architect-render.ts` for the test. It is not exposed.
- **Supporting `behavioral`.** The specification said `behavioral` is never present in `supporting.jsonl`, and also that
  each consumer appears in exactly one list.
  - If the dependency facts classify a consumer's use of a supporting original as behavioral, the renderer lists it in
    `behavioral` rather than hide or move it.
  - The shared classification rule does not produce this, and none occurs on the fixture, the toolkit or the reference
    project.
  - The specification now says so.
- **Formats the specification left open.** The specification was edited in the worktree to fix them:
  - **README.**
    - The instruction block is a `text` fence, as the specification shows it.
    - The revision line reads `Revision <revision> · input <input>`, and a blank line follows the fence and the
      revision line.
    - Map entries are list items indented two spaces per level, the root at the first column.
    - Tags are separated by `, `.
    - A cut purpose is followed by `…`.
    - The headline's rest is `, … +N`.
  - **README counts.** `exposed` and `internal` count `behavior.jsonl` records by role, `unknown` shapes included, and
    `supporting` counts `supporting.jsonl` records. The headline takes the first eight exposed `behavior.jsonl` records.
    So an exposed `unknown` original, such as the fixture's `loose`, appears in the headline.
  - **`module.json`.**
    - The root has `"dir": ""` and `"parent": null`.
    - `symbols.unknown` counts `unknown` behavior records, which the role counts include.
    - `tests.suites` counts `tests.jsonl` records, so a split suite counts once per record.
    - `uses` and `usedBy` are ordered by behavioral, non-behavioral and unknown count descending, then by identifier.
      This follows the specification's example, which lists `ramify/daemon` before `ramify/analysis/model`.
    - The line layout is described.
  - **Records.**
    - `value` is omitted when false.
    - Names tie by `file`.
    - Test records hold `module`, `file`, then the titles, as the specification's examples show; `file` is not last
      there.
    - `feature` is omitted when null.
  - **Metadata.** Keys follow the example, with `dependencyReason` after `dependencies` and `dependencyScope` in both
    states. `cut` counts cut details once per symbol, cut titles and cut purposes.
- **Detail cuts.** `sig` and `doc` are cut by the projection's detail limits, which the query sets to 240 and 280 bytes
  and four overloads. The renderer does not cut them again; it cuts only purposes.
- **Pair owner.** `uses` and `usedBy` use the boundary's `originalOwner`, which equals `original.owner` under declared
  ownership.

## Limitations

- **Mean behavior record.** The toolkit's mean behavior record is 401.8 characters, above the 300-character target. The
  target is evidence, not a bound, and the record shape is unchanged. `sig` and `doc` make up about half of each
  record. Iteration 7's hit-cost measurement decides whether H1's thresholds hold regardless.
- **Test record length.** The longest `tests.jsonl` line on the toolkit is 2,586 characters. The bound is 40 titles of
  240 bytes, so a record's length is constant in project size but can reach about 10 KB.
- **Compiler printing.** The golden files depend on the compiler's printed signatures:
  - a default-exported function prints as `function default(): void;`;
  - an optional parameter prints as `Config | undefined`.

  A TypeScript upgrade that changes printing changes the golden files, which `RAMIFY_UPDATE_GOLDEN=1` rewrites for
  review.
- **Documentation.** The owner README and the architecture index do not describe the renderer yet. Iteration 7 owns
  documentation.

## Handoff

- **Iteration 5** receives `RenderedArchitectView` for `PublishInput.architect`:
  - **Files.** Paths are relative to the view root, use `/`, and imply nested directories such as `core/engine/`. The
    array is in byte order, so `README.md` and `_meta.json` come first. The publisher must still write `_meta.json`
    last.
  - **Recognition.** Every `_meta.json` starts with `{"schema":"ramify.architect-view/1",`, which the recognition rule
    reads.
  - **Size.** `bytes` is the UTF-8 total. The toolkit's view is 0.70 MiB, far below `maxArchitectBytes` (64 MiB), and
    has 62 files.
- **Iteration 6** receives the renderer:
  - **Imports.** `renderArchitectView` is imported from `subs/analysis/src/architect-render.ts`, and the types from
    `subs/analysis/src/interfaces/architect-view.ts`, where A16 and A17 expose them. R11 re-exposes both to root's
    descendants, with `TestTitleLimits` from `analysis/typescript`'s `interfaces/source.ts` for `ApiViewQueryLimits`.
  - **Call.** Call `renderArchitectView({ revision, projection, dependencies })`:
    - `revision` is the published revision identifier, the same one the API view's `_meta.json` names;
    - measured `facts` must be the dependency answer for the same revision, since a different `inputId` throws;
    - an unavailable wait maps to one of the five `ArchitectDependencyReason` values.
  - **Speed.** Rendering is pure and fast: 10 ms for the toolkit.
- **Iteration 7** receives:
  - **Measurements.** The toolkit and reference render measurements above.
  - **Budgets.** The mean-record measurement to record against the budget.
  - **Golden files.** `src/tests/fixtures/architect-view-*.txt` serve as an expectation for comparison.
