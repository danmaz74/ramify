# Iteration 0 results: contract and baseline

**Date:** 2026-10-06. **Checkout:** `/home/app/ramify-affected`, branch
`feat/affected-rule`. **Base revision:** `b04c86aa` (the plan commit, with the
coordinator's decisions). Uncommitted evidence is under
`/home/app/ramify-affected-evidence/iteration0/`.

## Commits

| Commit | Content |
| --- | --- |
| `ec586cb0` | `test(analysis)`: `subs/analysis/src/tests/affected-rule.test.ts`, the AR-00 characterization test with the recorded facts. |
| this commit | `docs(plan)`: this results file. |

No production source, `module.ramify`, protected document, `ramify-agent/` or
ramify-audit checkout changed. `git diff --stat b04c86aa -- '**/module.ramify'`
is empty.

## Audits

| Audit | Commit | Verdict | Run ref | Report commit |
| --- | --- | --- | --- | --- |
| Plan start | `b04c86aa` | `composition.verdict: pass` (`summary.overall: pass`) | `refs/audited/runs/2026-10-06T04-22-47Z-b4858aec3` | `7d0da898` |
| Gate | the commit of this file | recorded in the coordinator report; see [gate](#gate) | | |

The plan-start command was the gate command with `--full`. ramify-audit 0.4.0
answered by reuse: `reused.resolution: requested`, `auditedCommit: b4858aec`,
and the ignored changed paths were the plan's documents and `docs/roadmap.md`.
That audit ran all five checks: patch integrity, build, type-check, structure
(15 owners, 0 errors, 41 analysis limits) and the tests (297.8 s), all `pass`.
The brief did not ask for `--force`, so no fresh run was made. JSON:
`plan-start-audit.json`.

### Gate

The gate runs from the clean commit that adds this file. Its verdict and run
ref are in the coordinator report, because the commit cannot record its own
audit.

## Focused verification

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/analysis/src/tests/affected-rule.test.ts subs/analysis/src/tests/project-boundary-affected.test.ts` | 2 files, 6 tests passed |
| `npm run type-check` | passed (all four compiler scopes) |
| `npm run build` | passed (`build.log`) |
| `dist/src/ramify check --root . --batch` with the test | passed: 0 errors, 0 warnings, 41 analysis limits |

## AR-00: the characterization test

`affected-rule.test.ts`, describe block "AR-00 affected-rule baseline: path
seed selection on the extended topology", builds the extended topology and
the data variant in temporary directories and opens a real retained session
on each. Every query goes through the session's `affected` operation with the
production limits.

- **Base revision.** 30 single-seed queries: every examples-table row except
  `data/limits.json` and `../outside.ts`, with `notes/design.md` and
  `notes/new.md` asked separately. Then `../outside.ts` and the three combined
  queries. It asserts schema version, seeds (status, module,
  basis, exclusion), `changedModules`, `affectedModules`, `testModules`,
  selection and widening.
- **Data variant.** The `data/limits.json` row.
- **Iteration 1.** It changes the `rows`, `dataRow` and combined expectations
  in place, and adds `kind` and `selects` to the `owned`, `excluded` and
  `outside` helpers.

The fixture additions are as the contracts describe them.
`tsconfig.base.json` holds the compiler options, including
`resolveJsonModule`, and `tsconfig.json` extends it and holds `include` and
`exclude`. `subs/b/src/consumer.ts` names `prompt.md` by
`new URL('./prompt.md', import.meta.url)` and never imports it.

### Expected values that differed from the reasoned ones

Every base-revision value written from the 0.2.0 rule matched the engine
the first time, including the combined queries:

- notes plus api: changed app and app/a, affected app/b;
- README plus scratch: changed app and app/a, affected app/b;
- app/b plus `.devcontainer`: changed app and app/b, affected none.

One difference, a **finding** rather than a reasoning error:

- **The data variant widens.** The reasoned answer for `data/limits.json` was
  changed [app] and affected [], with `dependency-closure`. The engine answers
  the same changed and affected modules, but its selection is `all-modules`
  with widening `['partial-coverage']`, and `testModules` lists all five.
- **Why.** The JSON import adds one coverage note with code `resource-target`
  at `subs/b/src/consumer.ts:1:20`, "Cannot establish the accessed source or
  resource target". That code is not owner-known, so the revision's coverage
  is `partial`. The data file is root-owned and outside every `src/`.
- **Expectation.** The test now asserts the widened answer as a recorded fact.

## Recorded facts (step 3)

The test asserts every fact below. Content-read inputs are asserted with the
written bytes and their sha256. Existence probes are asserted as role
`dependency`, 0 bytes, and a hash that is not the sha256 of empty content.
A probe's hash is a signature, not content: it differed between the two
revisions for the same unchanged file.

### Captured inputs

| Path | Base revision | Data variant |
| --- | --- | --- |
| `tsconfig.json` | `configuration`, 183 B, `8848b18b…7985` | same |
| `tsconfig.base.json` | `configuration`, 172 B, `d1ce9ace…3879` | same |
| `package.json` | `dependency`, 30 B, `f2ca0663…7840` (content read) | same |
| `data/limits.json` | `dependency`, 0 B, signature hash (existence probe) | `dependency`, 13 B, `e5bf94e7…c29f` (content read) |
| `.devcontainer/devcontainer.json` | `dependency`, 0 B, signature hash (existence probe) | same kind of probe |
| `README.md` | `readme`, 39 B, `abbd7948…ba08` | same |
| `subs/a/README.md` | `readme`, 19 B, `da93614e…37be5` | same |
| `module.ramify` | `description`, 140 B, `602854ad…139c` | same |
| `scripts/run.sh` | `dependency`, 0 B, signature hash (existence probe) | same kind of probe |
| `notes/design.md` | `dependency`, 0 B, signature hash (existence probe) | same kind of probe |

Also recorded, not asserted: `subs/b/src/prompt.md` is inventoried with kind
`resource` and placement `src`, and captured with role `resource`, 35 B. Role
counts:

- base: directory 28, dependency 70, absent 27, readme 5, description 5,
  source 10, resource 1, configuration 2;
- data variant: the same, except absent 29.

### Contributors

- `indexes.contributors['data/limits.json']`:
  - base revision: absent (no key);
  - data variant: `['subs/b/src/consumer.ts']`.
- **Contributor keys outside every `src/`.** These are keys that are owned,
  not compiler source and not under an exclusion:
  - base revision: none. The 12 keys are the 10 inventoried source files,
    `subs/b/src/prompt.md` and the candidate `subs/a/src/api.js`.
  - data variant: exactly `data/limits.json`, of 13 keys.

  The brief calls these "the paths rule row 6 will select through
  contributors". In the contracts' rule the contributors decide row 7,
  `captured-input`; row 6 is `auxiliary-source`.

### Coverage of the data variant

There is one note:

```text
resource-target  subs/b/src/consumer.ts:1:20  Cannot establish the accessed source or resource target
```

The revision outcome is completed, check passed, coverage partial, with no
diagnostics. Every answer of this revision widens with `partial-coverage`.

### The toolkit's `package-lock.json`

From `dist/src/ramify check --batch --format json` (`toolkit-check.json`):
`{"path":"package-lock.json","role":"dependency","sha256":"102b8b8a…6099","bytes":0}`.
It is an existence probe, **not a captured input**, so it is `inert` under the
0.3.0 rule.

## Toolkit baseline (step 4)

All 15 answers come from one revision with inputId
`input/1:0f0fbc546ad8c22fd6ffc3ad6c8986d1baa3d04d5dfe431fcd9c303606801246`.
That revision is `ec586cb0`, which matches `b4858aec` in everything outside
docs except the new test file. Each answer is `ramify.affected-cli/2` with
`ramifyVersion` 0.2.0, batch mode, and exit 0. JSON is in `toolkit-answers/01.json`
to `15.json`. Every answer has `selection: all-modules`, widening
`["partial-coverage"]` and 15 `testModules`. Coverage is partial with 41
notes; their codes are unresolved-target, unsupported-commonjs,
excluded-target, nonliteral-target and resource-target.

Module IDs drop the `ramify/` prefix; `ramify` is the root.

| Path | Status | Module | Basis | Exclusion | Changed | Affected |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/agents/README.md` | owned | ramify | containment | owned-ignored `docs` | ramify | cli, daemon, explorer, integration-tests, service-api |
| `subs/presentation/subs/layout/README.md` | owned | presentation/layout | declaration | null | presentation/layout | explorer, integration-tests, presentation, presentation/project-view |
| `tsconfig.json` | owned | ramify | containment | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `package.json` | owned | ramify | containment | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `scripts/build-production.ts` | owned | ramify | inventory | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `scripts/probes/fixtures/synthetic-owners.ts` | owned | ramify | inventory | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `vitest.config.ts` | owned | ramify | inventory | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `scripts/probes/fixtures/compiler-api/consumer.ts` | owned | ramify | containment | owned-ignored `scripts/probes/fixtures/compiler-api` | ramify | cli, daemon, explorer, integration-tests, service-api |
| `subs/cli/src/tmp/x.ts` | owned | cli | containment | scratch `subs/cli/src/tmp` | cli | ramify, daemon, explorer, integration-tests, service-api |
| `.devcontainer/devcontainer.json` | owned | ramify | containment | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `CLAUDE.md` | owned | ramify | containment | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `tsconfig.scripts.json` | owned | ramify | containment | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `.` | owned | ramify | containment | null | ramify | cli, daemon, explorer, integration-tests, service-api |
| `subs/presentation/subs/project-view/src/tests/fixtures/dependency-models.json` | owned | presentation/project-view | inventory | null | presentation/project-view | explorer, integration-tests, presentation |
| `subs/presentation/subs/layout/module.ramify` | owned | presentation/layout | declaration | null | presentation/layout | explorer, integration-tests, presentation, presentation/project-view |

These match the contracts' "0.2.0 changed / affected" column: root + 5,
layout + 4, cli + 5. The two "unchanged" rows answer as listed.

### Toolkit captured inputs

There are 3834 inputs, by role:

| Role | Count |
| --- | --- |
| absent | 1888 |
| dependency | 961: 777 content-read, 184 existence probes |
| source | 600 |
| directory | 337 |
| resource | 17 |
| readme | 15 |
| description | 15 |
| configuration | 1 |

| Path | Role | Bytes | 0.3.0 consequence |
| --- | --- | --- | --- |
| `tsconfig.json` | `configuration` | 893 | captured input, all 15 |
| `tsconfig.build.json` | `dependency` | 0 (probe) | inert |
| `tsconfig.portable.json` | `dependency` | 0 (probe) | inert |
| `tsconfig.scripts.json` | `dependency` | 0 (probe) | inert |
| `package.json` | `dependency` | 5565 | captured input, all 15 |
| `package-lock.json` | `dependency` | 0 (probe) | inert |

Also relevant to the expected toolkit table:

- `.devcontainer/devcontainer.json` and `CLAUDE.md` are 0-byte existence
  probes.
- `vitest.config.ts` is `source`, 790 B, inventoried as auxiliary source.
- `docs/agents/README.md` is not an input.

## The four facts against the brief's expectations

| Fact | Measured | Matches |
| --- | --- | --- |
| `package.json` row | Captured with content (`dependency`, 30 B, content hash), so `captured-input` selecting all five. The toolkit's own `package.json` likewise (5565 B). | Yes. The contracts' row left both branches open; the measurement decides "captured with content". |
| `data/limits.json` row | Data variant: `dependency`, 13 B, content read; contributors `['subs/b/src/consumer.ts']`, so it selects `[app/b]`. | Kind, selects, changed and affected: yes. **Widening: no**, see below. |
| `.devcontainer` row | Existence probe, 0 B, signature hash; content never read, so `inert`. | Yes. |
| Toolkit `package-lock.json` | Existence probe, 0 B, so not a captured input and `inert`. | Yes. The plan named no fixed value; iteration 2's handoff takes "as iteration 0 recorded it". |

**Deviation in the contracts' "one seed per kind" table.** It says every
row has `widening: []`, `dependency-closure` and complete coverage, except
the outside seed. For the `captured-input (readers)` row, `data/limits.json`
in the data variant, it gives `testModules` app/b.

The data variant's coverage is partial, so under 0.3.0 that row should read:

- changed [app/b], affected [];
- `testModules` all five;
- `selection: all-modules`, `widening: ['partial-coverage']`, coverage
  partial.

The examples table row, which lists only selects, changed and affected, is
correct as written. The coordinator decides whether to correct the contracts
or the fixture before iteration 1. One fixture alternative is a data import
that Ramify can establish, if one exists; this iteration did not search for
one.

## Observations for iteration 1

- **Nested `package.json` probes.** The toolkit revision records 169 non-`dist`
  `absent` inputs named `package.json`, such as `subs/service-api/package.json`
  and `subs/presentation/src/package.json`. Under the governed-set rule, a
  captured input whose last segment is `package.json` governs every module.
  Creating any of those files would therefore select all 15 modules. This
  follows the rule as written, because a new nested manifest changes module
  format and resolution. It is listed so that the coordinator sees it.
- **The base revision's `data/limits.json`.** It is an existence probe
  (0 B) when nothing imports it, so in the base revision it is `inert`. Only
  the data variant reads it.

## Protected-document hashes

| Document | Before (`b04c86aa`) | After |
| --- | --- | --- |
| `docs/architecture/cli-invocation.spec.md` | `7386295542372967c25040735d89e8e9e5230323d4320e57490bf2c031f32e6a` | unchanged |
| `docs/model/glossary.md` | `fd3a1bad54fc8651ae6c33f7c19a75c8268ffc50b89f2342c574cc2ccc7747e0` | unchanged |

Both equal the baselines in [protected documents](../protected-documents.md).
No protected patch was applied.

## Flaky tests

None observed. The focused runs passed on the first attempt.

## Remaining gaps

- The data-variant widening deviation above needs a coordinator decision
  before iteration 1 writes its `/3` expectations.
- The plan-start audit was satisfied by reuse of the `b4858aec` full audit,
  not a fresh run on `b04c86aa`.
- Step 4 asked for the answers under the scratchpad. They are in the evidence
  directory, which the coordinator can read.
