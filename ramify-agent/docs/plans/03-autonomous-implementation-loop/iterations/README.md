# Plan 3 iterations

The [main plan](../main-plan.md) is the authority. These briefs split its
iteration table into executable work and fix the defaults its decisions leave
open. Each iteration runs in one session, in order, and ends with a results note
beside its brief.

The durable structures are named, never restated: they are defined in the
[core records proposal](../core-records.proposal.md). Where a brief names a
record, it means that record.

| Iteration | Brief | Results |
| ---: | --- | --- |
| 0 | [Pi and session lifecycle spike](iteration0.md) | [complete](iteration0-results.md) |
| 0B | [The ledger](iteration0b.md) | [complete](iteration0b-results.md) |
| 1 | [Extract `harness/evidence` and move jobs onto the ledger](iteration1.md) | [complete](iteration1-results.md) |
| 2 | [External commands and the check engine](iteration2.md) | [complete](iteration2-results.md) |
| 3 | [Agent port additions and the pi adapter](iteration3.md) | [complete](iteration3-results.md) |
| 4 | [The implementation run](iteration4.md) | [complete](iteration4-results.md) |
| 5 | [Initial analysis and work-item coordination](iteration5.md) | [complete](iteration5-results.md) |
| 6 | [Iteration assignments, engineers and the iteration gate](iteration6.md) | [complete](iteration6-results.md) |
| 7 | [The shell, mutations and hooks](iteration7.md) | [complete](iteration7-results.md) |
| 8 | [Global architect decisions](iteration8.md) | [complete](iteration8-results.md) |
| 9 | [Contract delegation and provider obligations](iteration9.md) | [complete](iteration9-results.md), in two parts |
| 10 | [Breaking work and gate integrity](iteration10.md) | [complete](iteration10-results.md) |
| 11 | [Protocol, web MVP and KPI projections](iteration11.md) | [complete](iteration11-results.md) |
| 12 | [Integrated trials and the completion gate](iteration12.md) | [complete](iteration12-results.md), in two parts; [completion report](../completion-report.md) |

## Rules for every iteration

- Read [AGENTS.md](../../../../AGENTS.md), the [main plan](../main-plan.md), the
  [core records proposal](../core-records.proposal.md), the
  [architecture](../../../architecture/autonomous-implementation-loop.md), the
  [harness principles](../../../harness.principles.md) and the results notes of
  earlier iterations before changing anything. Do not read
  `docs/.superseded/`.
- Work only under `ramify-agent/`. Use the toolkit only through
  `ramify.ts/<entry>`, `node_modules/.bin/ramify` and the files it generates.
- A module is declared only in the iteration that gives it behavior, with a
  `README.md` whose first top-level prose paragraph states its purpose. Every
  cross-module import passes through a `module.ramify` exposure.
- Tests live in the owner's `src/tests/`. Core tests use the scripted fake,
  never pi and never the network. Only iteration 0's probes, iteration 3's pi
  tests, which use the existing offline scripted provider, and iteration 12's
  live trials touch pi.
- Exit gate: `npm run type-check`, `npm test`, `npm run build:web` and
  `npm run check:self`, all run from `ramify-agent/`, pass. Report their output
  faithfully. `npm run check:self` must report complete coverage with no
  findings.
- Do not commit. Leave unrelated working-tree changes alone. Other sessions
  share this checkout.
- The results note lists what was delivered, the exit evidence with the commands
  run, the acceptance cases it owns with the tests that prove them, deviations
  from the plan with reasons, and what the next iteration must know. It does not
  restate the plan.
- What cannot be done in this environment, such as a login that needs a person,
  is recorded as not done with the reason. It is never simulated.
- Record the architect view revision and input identity the iteration worked
  from, and refresh the view before making any claim about the module tree.

## Cross-cutting requirements

These are not one iteration's work. The
[main plan's cross-cutting section](../main-plan.md#cross-cutting-requirements)
is the authority; the short form is:

1. **Every agent communication is validated JSON.** Any iteration that adds a
   submission union member or a harness tool defines its strict schema,
   validates the rules the schema cannot hold, changes nothing on failure,
   returns every error with its path to the same session, records each rejection
   as an observation, ends at the bound as `invalid-submission`, and adds the
   two tests the main plan names. No schema has a field for an ID the harness
   already knows.
2. **Every union value has a producer and a test**, or it is not offered. A
   prompt package offers only the members its iteration produces; each iteration
   extends `union-values.test.ts`.
3. **Measurements are captured when the observation happens**, never added after
   a trial.
4. **Records are immutable files committed by an event**; a projection never
   writes; status lives in the log and never in a snapshot.
5. **Each iteration leaves the project passing** and leaves the fixture project
   unchanged outside the temporary copies a test makes.

## Sizing

Each brief is written for one implementation context. Where an iteration both
changes something broadly and searches broadly, it is already split. If an
iteration turns out not to fit, split it at the seam its brief names and record
the split in the results note rather than widening the scope.
