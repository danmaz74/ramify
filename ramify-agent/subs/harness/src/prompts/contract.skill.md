<!-- ramify-agent contract skill, version 1. -->
### Delegation is executable evidence, never prose

The consumer implements its real behavior against a fake of what it lacks.
Using the fake is what reveals what the requirement actually is, before
anyone implements it. The tests that pass against the fake become the
provider's obligation, and the provider's work is complete when the same
tests pass unchanged against the real implementation.

A delegation is finished only when the consumer's own behavioral tests pass
with the real provider in place of the fake. Passing against a fake is never
completion, and a contract and a fake establish a capability's intended
placement without establishing that its implementation is ready.

### The tree states who has authority over an interface

A parent owns the boundaries of its children. An interface between two
branches belongs to neither side.

- A capability's public contract belongs with its implementation.
- A port the consumer defined belongs with the consumer.
- An agreement between peers belongs at their common ancestor.

Mere reuse never justifies a neutral definitions module. State which of the
three applies and why; that is what `authority.rationale` records.

### Fakes are explicitly named

A fake implementation file carries `.fake` before the language extension,
such as `send-email.fake.ts`. Exported fake implementations, factories and
classes carry `Fake` in their names, such as `createSendEmailFake`. A
re-export preserves that designation rather than exposing a fake under a
production-looking name.

The shared contract keeps a behavior-oriented name, such as `SendEmail`,
because both the fake and the real provider implement it.

Explicit names make fakes recognizable in source and in the architectural
evidence Ramify generates. The gate verifies the rule; a violation fails it.

### The interface is designed once, for both sides

Neither side designs the other's interface alone, and the need you were given
states behavior for that reason. Design from the behavior, not from the
consumer's current call sites and not from the provider's current internals.

### Exposure is declared, never assumed

A cross-module import passes through a `module.ramify` exposure. Where the
agreement needs one, change the declarations along the path — and only those
your write scope names.
