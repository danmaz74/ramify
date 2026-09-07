# Reference project: contract map

**Date:** 2026-09-07. **Current through:** iteration 1.

This is the living record of every symbol the reference project exposes: its
owner, its defining file, its kind, its tags, the statements that carry it, and
the modules whose source imports it. The
[implementation plan](implementation.md) proposes each iteration's declarations;
this map records what was built and wins on any disagreement with the plan.
Every iteration ends by updating it.

Paths in the table are relative to `examples/collection-review/`. "Owner" is the
module identifier, so `workspace/contracts` is the owner rooted at
`subs/workspace/subs/contracts/`.

## Exposed symbols

| Symbol | Owner | Defining file | Kind | Tags | Exposing statement(s) | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `recordIdSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `RecordId` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `revisionSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Revision` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `revisionChainSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `RevisionChain` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `revisionScopeSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `RevisionScope` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `findingSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Finding` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `inspectionReportSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `InspectionReport` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `reviewStatusSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `ReviewStatus` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `observationSchema` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | schema (value) | `[browser]` | C1, W1 | — |
| `Observation` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |
| `ObservationCallback` | `workspace/contracts` | `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts` | type | `[browser]` | C1, W1 | — |

No module's source imports the vocabulary across an owner boundary yet, so the
importer column is empty throughout. `contracts`' own
`src/tests/vocabulary.test.ts` reads `inspectionReportSchema` from its owner's
`src/interfaces/`, which is a same-owner import and needs no exposure.

## Exposing statements

| Id | Owner | Statement |
| --- | --- | --- |
| C1 | `workspace/contracts` | `expose-src * from "interfaces/vocabulary.ts" tagged [browser] to parent` |
| W1 | `workspace` | `expose-sub * from contracts to descendants` |

C1 is an interface-file wildcard, so the seventeen rows above are its expansion,
not seventeen declarations. An export added to `vocabulary.ts` joins the
contract, and W1's child-contract wildcard relays it onward, without either
description changing.

W1 makes the vocabulary visible in every proper descendant of `workspace`,
which is every other owner except the application root. The root receives
nothing from this chain: C1 exposes to `contracts`' parent only, and `workspace`
does not expose the vocabulary upward.

Each symbol's tags are `[browser]` exactly. `contracts` declares no header tags,
so its ordinary source has no required-importer tags and its bindings default to
the empty set; C1's clause adds the owner's promise that the vocabulary and the
schema library behind it are browser-safe. That promise is what will let the
browser-classified shell and view owners value-import the schemas, while the
absence of `ui` and `dispatch` keeps the vocabulary importable by the untagged
core owners as well.

## Iteration log

### Iteration 1 — package, tree, descriptions, documentation

All fourteen owners exist on disk with a `module.ramify` and a `README.md`
whose first top-level paragraph is prose. The example installs, type-checks,
tests, and builds on its own, and `dev:web` serves the static shell.

Added to the map: the seventeen `vocabulary.ts` exports carried by C1, and the
`workspace` relay W1. Nothing else is exposed yet; the other twelve owners
declare a header and no exposure statement.
