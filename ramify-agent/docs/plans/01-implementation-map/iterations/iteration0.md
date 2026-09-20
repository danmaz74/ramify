# Iteration 0: pi spike

**Goal:** establish, with a throwaway script, whether pi can serve as the
first implementation of the agent port, before any harness code depends on it.

## Scope

- Pin one pi release as an exact dependency (the coding-agent SDK package,
  `@mariozechner/pi-coding-agent` or its current successor; confirm the name
  from its published documentation).
- Write the spike under `ramify-agent/spikes/pi/`, outside every module's
  `src/` and outside the root compiler scope, run with `tsx`. It is kept for
  reference and deleted by iteration 3.
- Confirm or refute each of:
  1. A session driven from Node with a **replacement system prompt** and a
     **restricted tool set** (read and search only).
  2. A **custom tool with a schema** whose call ends the turn and delivers its
     validated input to the caller.
  3. The **event stream**: tool calls with their arguments, notably file paths
     read and searches run.
  4. **Token usage** per message.
  5. **Login through an existing subscription**, and where credentials live.
     No API key is set in this environment; if login needs a person, record
     the exact steps and leave it unconfirmed.
  6. **Loading the skill** at `ramify-agent/skills/module-architect/` into the
     session, or the fallback of inlining it into the prompt.
  7. **Stop**: aborting a running session, and whether it is certain in
     process (open decision 1).
  8. The **session record** pi writes, and whether its location can be set to
     a job's `session/` directory.
- Items that need a live model and cannot run here are confirmed as far as
  the API and source allow, and marked so.

## Exit evidence

`iteration0-results.md`: per item, confirmed, not confirmed or confirmed from
source only, with the evidence; the pinned version; the decision on in process
or child worker; and any change the main plan needs. Type check, tests and
self-check still pass.
