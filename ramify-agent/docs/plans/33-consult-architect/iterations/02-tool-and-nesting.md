# Iteration 2: advisory tool and one-level nesting

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 1 committed; R33-1 resolved. Owner: harness, consuming the existing
agent session API. Write boundary: consultation tool/executor, role task/procedure
binding, constructor equipment, normal/manual runtime wiring, consultation event
publication and the narrow runner fallback option. Neutral/Pi production changes
require a concrete demonstrated gap; no new messaging abstraction.

## Goal

All approved caller relationships work: engineer → local, engineer → capability,
and local → global, including engineer → local → global → local → engineer,
with ordinary awaited tools and durable logs.

## Read first

- Main contract and iteration 1 receipt.
- `subs/harness/src/steps/runner.ts`: start lock, signals, equipment hold,
  fresh fallback and outcome handling.
- `subs/harness/src/run/session-operations.ts`: exact forks/current tools.
- `subs/harness/src/prompts/tasks.ts`, `packages.ts` and relevant role prompts.
- `subs/harness/src/work/engineer-equipment.ts`, `steps/engineer.ts`,
  `steps/local-architect.ts`, `steps/construct.ts`, `steps/manual-hosts.ts`.
- `subs/harness/src/run/service.ts`: work turns, iteration invocation,
  capability assignment execution and coordinator prompts;
  `consultCapabilityConsumer` as a precedent, not a method to call unchanged.
- Harness ordinary API view for agent contracts; [testing rules](../../../testing.spec.md).

## Deliverables

- `consult_architect({ message })` with explicit advisory description, and
  `answer_architect_consultation({ answer })` with ordinary submission validation.
  Preserve exact message/answer strings; reject blank input without model dispatch.
- An `architect-consultation` task for existing local/capability/global roles, fork reason
  and dedicated short procedure. The original architect remains untouched.
  Bind only read-only equipment, current answer submission and the local fork's
  optional global-consultation tool. Do not reuse placement submission handling.
- Capability consultation uses the assigning coordinator's pinned point and
  role context, with the same advisory answer task. Its equipment omits plan
  update, capability action, consumer consultation and upward consultation.
  Preserve the normal capability coordinator's equipment outside this task.
- One tool factory reused by ordinary callers and local consultation forks.
  A global consultation never has the consultation tool active. No depth counter,
  thread manager or automatic escalation. Include needed facts in the local
  question; global does not magically inherit local exploration.
- Existing cancellation/idle hold wiring at each level, with absolute deadlines
  unchanged and already-aborted requests checked before fork/model dispatch.
  No new writer acquisition, source snapshot or view materialization.
- Explicit no-fresh-fallback behavior for this task at both missing-point and
  provider-history-loss boundaries. Other tasks retain their current fallback.
  Ordinary consultation failure returns a tool error; it does not request
  completion, mutate assignments or fail the entire run by itself.
- Persist start before dispatch, link the actual child, record answer acceptance
  and known caller result/error. Replayed completed tool effects reuse results;
  interrupted/unknown effects keep the existing recovery behavior. Do not add
  transparent consultation retries.
- Normal and same-run manual execution use the same tool declarations/binding
  inputs. Imported/unsupported sessions cannot accidentally activate an inherited
  consultation tool. Keep existing engineer capability consultation unchanged.

## Cases and verification

Own C05–C12. Script three independent session identities and drive actual
nested calls through the real neutral operations. Assert the caller continues
after a result; compare original architect checkpoints before/after. Use controlled
clocks and abort barriers for waiting/cancellation, not elapsed-speed assertions.

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/consultation-tools.test.ts subs/harness/src/tests/consultation-workflows.test.ts subs/harness/src/tests/steps-run.test.ts subs/harness/src/tests/plan23-task-prompts.test.ts subs/harness/src/tests/plan25-block-sessions.test.ts
npm run type-check
npm run check:self
```

External Git/CLI/audit/command answers and bulk stores stay scripted. No expected
failing committed tests; CLI inspection is still pending iteration 3.

## Exit and handoff

C05–C12 pass with durable direct/nested/error/interruption examples.
Commit and write `02-results.md`, including tool/procedure locations, fallback
compatibility evidence, exact transcripts/record examples and limits for inspection.

