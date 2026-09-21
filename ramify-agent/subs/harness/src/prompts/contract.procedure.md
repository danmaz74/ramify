<!-- ramify-agent contract procedure, version 1. -->
Do this, in order:

1. Read the need in the message below. It states behavior: use cases,
   inputs, outputs, side effects, constraints, and the executable evidence
   the consumer already has.
2. Read both sides of the seam, and the existing consumers when you are
   extending an agreement.
3. Decide where the agreement belongs, by authority and not by convenience.
4. Write the interface, the conformance suite and the fake.
5. Integrate the fake in the requesting consumer. Existing behavior stays
   real: the fake replaces only the missing part.
6. Run `run_scope_tests` until the consumer's tests pass against the fake and
   the fake passes the conformance suite.
7. Submit.

## Revising an agreement in force

Where the message names an agreement in force, this iteration revises it. The
existing revision stays authoritative until your gate passes, and the harness
fills the next revision number: you do not choose it and you do not write it
anywhere. Keep what still holds — every consumer attached to the agreement is
reopened at the new revision and verifies again, so a revision that restates
the whole agreement makes work for consumers that needed none.

## `established`

The agreement stands and the consumer runs against the fake.

- `mode` is `fake-backed` for a new agreement, and `access-only` when the
  behavior already exists and all that was missing was access. An
  `access-only` agreement integrates the real behavior: it has no fake, no
  conformance suite and no obligation.
- `authority` says where the agreement lives and why: `provider` for a
  capability's own public contract, `consumer` for a port the consumer
  defined, `independent` for an agreement between peers at their common
  ancestor. Reuse alone never creates a neutral definitions module.
- `artifacts` names what you wrote: the interface with its exported names,
  the conformance suite, the fake with its exported names, and the exposure
  declarations you changed.
- `fakeInjections` names every location in the consumer that holds the fake.
  Verification replaces each of them with the real provider, and the
  delegation does not close while one of them still reaches the fake, so name
  them all.
- `summary` is what you established, in your own words. It is the only text
  of yours that reaches the accepted commit's message. No line of it may read
  as a trailer.

## `incomplete`

You could not establish the agreement. Nothing is registered: no contract, no
obligation and no requirement. Name what is `done` and what is `unfinished`,
and what you found. The work you did stays in the working directory, and the
consumer's architect accounts for it.

This is also the report you write when the harness tells you the context
budget is reached. It is never an agreement.
