# Plan 1 iterations

The [main plan](../main-plan.md) is the authority. These briefs split its
iteration table into executable work and fix the defaults its open decisions
leave to implementation. Each iteration runs in one session, in order, and
ends with a results note beside its brief.

| Iteration | Brief | Results |
| ---: | --- | --- |
| 0 | [pi spike](iteration0.md) | `iteration0-results.md` |
| 1 | [Skeleton and plan browsing](iteration1.md) | `iteration1-results.md` |
| 2 | [Jobs on a fake agent](iteration2.md) | `iteration2-results.md` |
| 3 | [The architect on pi](iteration3.md) | `iteration3-results.md` |
| 4 | [Map view, approval and the live trial](iteration4.md) | `iteration4-results.md`, then the completion report |

## Rules for every iteration

- Read [AGENTS.md](../../../../AGENTS.md), the main plan, the
  [harness principles](../../../harness.principles.md) and the results notes of
  earlier iterations before changing anything.
- Work only under `ramify-agent/`. Use the toolkit only through
  `ramify.ts/<entry>`, `node_modules/.bin/ramify` and generated files.
- A module is declared only in the iteration that gives it behavior, with a
  `README.md` whose first paragraph states its purpose. Every cross-module
  import goes through a `module.ramify` exposure.
- Tests live in the owner's `src/tests/`. Core tests use the scripted fake,
  never pi or the network.
- Exit gate: `npm run type-check`, `npm test` and `npm run check:self`, all
  run from `ramify-agent/`, pass. Report their output faithfully.
- Do not commit. Leave unrelated working-tree changes alone.
- The results note lists what was delivered, the exit evidence with the
  commands run, deviations from the plan with reasons, and what the next
  iteration must know. It does not restate the plan.
- What cannot be done in this environment, such as a login that needs a
  person, is recorded as not done with the reason. It is never simulated.

## Defaults for the open decisions

1. **pi in process**, unless the spike finds that Stop cannot be made
   certain in process. The agent port hides the choice.
2. **Fixture.** A copy of the reference example `examples/collection-review`
   with two plans added, kept inside ramify-agent as test data, since
   ramify-agent will leave this repository. It must not break ramify-agent's
   own check: its `module.ramify` files must not be discovered as stray
   modules and its source must not enter ramify-agent's compiler scope.
   Tests copy it to a temporary directory before running a job. The live
   trial in iteration 4 targets the toolkit repository or the reference
   example itself.
3. **Web stack.** React, Vite, Express and Zod, as proposed. Pin exact
   versions. The browser code gets its own compiler settings (DOM library)
   without leaving Ramify's view of the `web` module.
