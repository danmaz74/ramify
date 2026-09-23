# Iteration 3 results: neutral tool actions

**Date:** 2026-09-23. **Branch:** `feat/plan9-i3`. **Owners:** `harness/agent`,
`harness/agent/pi`, `harness`.

Every tool call now reaches the harness with a neutral action that the
executor classifies. Activity, read excursions and the write guard read that
action and never an executor's tool or argument names. The port's
`observations` became the executor's declared support.

## Final names

All of these are in
[`subs/harness/subs/agent/src/interfaces/port.ts`](../../../../subs/harness/subs/agent/src/interfaces/port.ts).
The module exposes it with `expose-src *` to the parent and to descendants,
so the harness and `pi` receive every name below.

- **`ToolAction`**, a union discriminated on `kind`:
  - `{ kind: 'read'; path: string; range: LineRange | null }`, where `null`
    means the whole file.
  - `{ kind: 'search'; pattern: string | null; path: string | null; glob: string | null }`.
    A null `pattern` is a listing. A null `path` is the working directory.
  - `{ kind: 'write'; paths: readonly string[] }`. The list is empty when the
    call names no path.
  - `{ kind: 'command'; command: string | null }`.
  - `{ kind: 'harness' }`: a harness tool, including the submission tool.
  - `{ kind: 'other' }`: a call the implementation cannot classify.
- **`LineRange`**: `{ start: number | null; count: number | null }`. `start`
  is the first line, counted from 1.
- **`ToolDefinition.action?: (input: unknown) => ToolAction`** is how a tool's
  author declares its action. The default is `{ kind: 'harness' }`. The shell
  ([`tools/shell.ts`](../../../../subs/harness/src/tools/shell.ts)) declares
  `command` from its `command` field.
- **`action: ToolAction`** is a new required field on the `tool-started`
  `AgentEvent`, on `GuardedCall` and on `SettledMutation`. The executor's
  `tool` and `input` stay alongside it, for display only.
- **`ExecutorSupport`** replaces `PortObservations`. `AgentPort.support`
  replaces `AgentPort.observations`. Each entry is an `Availability`:
  - the three observations it had: `usage`, `context`, `compaction`;
  - session control: `continue`, `fork`, `forkAtPoint`, `appendContext`,
    `exactSystemPrompt`, `guard`, `afterMutation`.

  The interface is flat: a later entry is one more key. pi and the scripted
  fake declare every entry available.
- **Scripted fake** ([`scripted.ts`](../../../../subs/harness/subs/agent/src/scripted.ts)):
  - A `tool` step gains `action?: ToolAction`. The action comes from the
    script first, then from the harness tool's declaration. Failing both, the
    fake classifies the port's own names from `path`, `pattern`, `glob`,
    `offset` and `limit`.
  - `ScriptedAgentOptions.toolNames` gives the port's built-ins the fake's own
    names, such as `{ read: 'Read', write: 'CreateFile' }`.
  - `ScriptedAgentOptions.support` declares what the fake lacks. A `continue`
    or `fork` it lacks degrades to `fresh` with the declared reason.
  - The write built-ins write to the one path their action names.
- **pi adapter** ([`pi-agent.ts`](../../../../subs/harness/subs/agent/subs/pi/src/pi-agent.ts)):
  - `builtinAction(tool, input)` maps pi's names to actions. It is exported
    for the module's tests only; `module.ramify` is unchanged. The mapping:
    - `read` with `path`, `offset` and `limit`;
    - `grep` and `find` with `pattern`, `path` and `glob`;
    - `ls` with `path`;
    - `edit` and `write` with `path`.
  - Inside `startPiSession`, `actionOf` resolves each call. The submission
    tool is `harness`. A harness tool uses its declaration. Every other tool
    goes through `builtinAction`.
  - The same action goes to `tool-started`, the guard and `afterMutation`.
- **Harness consumers:**
  - `activityOf` ([`jobs/activity.ts`](../../../../subs/harness/src/jobs/activity.ts))
    switches on `event.action`. The `Activity` records are unchanged:
    `search` keeps `tool` for display, and `command` is recorded only from a
    `command` action.
  - `decideWrite(scope, workingDirectory, action: ToolAction)`
    ([`guard/write-guard.ts`](../../../../subs/harness/src/guard/write-guard.ts))
    replaces the `input: unknown` parameter. `targetOf` reads the write's
    `paths`, and the `path`/`file_path`/`filePath` probe is gone.
  - The engineer's guard and `afterMutation`
    ([`work/engineer-equipment.ts`](../../../../subs/harness/src/work/engineer-equipment.ts))
    test `call.action.kind === 'command'` instead of the shell's name.
  - `PortEventRecorder.recordGaps` and `outcomeUsage`
    ([`run/port-events.ts`](../../../../subs/harness/src/run/port-events.ts))
    read `agent.support`. Only that rename touched `run/port-events.ts`.
    `run/service.ts`, run records, recovery and the run writer are untouched.

## Changes from the design

- **A write naming several paths is blocked as unresolved.** The guard
  records one decision per call, and the observation log drops a replayed
  `(invocation, callId, type)`. A multi-path write therefore cannot be
  recorded path by path without changing the observation. Such a call now
  fails closed with the reason "the call names N paths to write, and the
  guard judges one target per call". No executor has such a tool today.
- **A non-write action reaching the guard is also unresolved.** Before this
  change, a mutating harness tool other than the shell was judged by its
  input's `path`. None exists.
- **A pi `read` without a `path` is now `other`.** It used to record a read
  of `.`. Such a call fails pi's validation anyway.
- **`thinking` is not declared yet.** The declared support leaves out
  `thinking` and streaming. Iteration 4 adds `thinking` as one more key, with
  whatever shape its visibility needs. `forkAtPoint` is declared now, because
  both implementations already fork at the point a ref names.
- **`BuiltinTool` and `WriteTool` keep their names.** They are the port's
  vocabulary for the built-ins a spec enables, so `SessionSpec.builtinTools`
  still lists `read`, `grep`, `ls`, `edit` and `write`. An implementation
  maps each one to its own tool; the fake's `toolNames` shows how.

## Remaining tool-name dependencies outside the pi adapter

This grep, run over `subs` and `src` excluding tests and the pi module, finds
no harness logic that reads an executor's tool or argument names:

```sh
grep -rnE "'(read|grep|find|ls|edit|write|bash|Read)'|file_path|filePath|'pattern'|'glob'|'offset'|'limit'|\['path'\]|\.tool ===|\.tool !==|toolName ===|tool === " subs src --include='*.ts' --include='*.tsx'
```

Every remaining hit is one of these:

- The port's built-in names: the `BuiltinTool` and `WriteTool` types, and the
  `builtinTools` lists in `engineer-equipment.ts`, `run/service.ts` and
  `sessions/single.ts`.
- The `ToolAction` and `Activity` kinds `read` and `write`.
- The scripted fake's own default names and classification. The fake is an
  executor implementation.
- `bash` as the program the shell and the process-group wrapper spawn.
- `sessions/single.ts` comparing `event.tool` with `engineerToolName`. That
  is the harness's own submission tool, used to filter progress display.

Other uses of a tool name as data, never matched against an executor's names:

- `PortEventRecorder.callId(tool)` keys calls by the harness's own tool names
  (`shell`, `run_scope_tests`).
- `kpi/guarding.ts` groups guard and activity lines by whatever name was
  recorded.
- The standalone session's progress output shows the executor's name and
  input.

## Exit evidence

[`neutral-actions.test.ts`](../../../../subs/harness/src/tests/neutral-actions.test.ts)
(ST05) runs one engineer turn twice through a full scripted run: the real
module tree, write guard, excursion watcher and observation log, with a
scripted `GitService`. The turn has three reads (two into another module),
one search, one write outside the scope, and one write and one edit inside
it.

- **First run:** the port's own names, which are pi's (`read`, `grep`,
  `write`, `edit`), with actions the fake classifies itself.
- **Second run:** an executor whose read tool is `Read` with `file_path` and
  whose other tools are `Grep`, `CreateFile` and `ReplaceText`. Their inputs
  are named otherwise too, and the script supplies each action.

Both runs record the same reads, searches, excursions, guard decisions and
mutations. The comparison sets aside the project directory and the tool
names kept for display. In both runs:

- the excursion is recorded once, on first entry;
- the outside write is `blocked-scope` and left the file unchanged;
- the two inside writes are allowed and happened.

The other new tests:

- [agent `tool-actions.test.ts`](../../../../subs/harness/subs/agent/src/tests/tool-actions.test.ts)
  covers the fake's classification, declared and scripted actions, renamed
  tools that are enabled, guarded and hooked by their action, and a renamed
  tool the spec did not enable.
- [pi `tool-actions.test.ts`](../../../../subs/harness/subs/agent/subs/pi/src/tests/tool-actions.test.ts)
  covers pi's classification, including a `file_path` it does not guess at,
  the action on events, the guard and the hook through a real pi session on
  the scripted provider, and pi's declared support.
- [`port-observations.test.ts`](../../../../subs/harness/subs/agent/src/tests/port-observations.test.ts)
  now covers declared support and a start that degrades with its declared
  reason.
- [`write-guard.test.ts`](../../../../subs/harness/src/tests/write-guard.test.ts)
  takes actions and adds the unresolved cases: several paths, a non-write
  action and a blank path.

Commands, run from `ramify-agent/`:

```sh
npx vitest run subs/harness/src/tests/read-excursions.test.ts \
  subs/harness/src/tests/write-guard.test.ts subs/harness/src/tests/observation-log.test.ts \
  subs/harness/src/tests/neutral-actions.test.ts subs/harness/src/tests/unguarded-write.test.ts \
  subs/harness/src/tests/iterations.test.ts subs/harness/src/tests/shell-tool.test.ts \
  subs/harness/src/tests/hook-checks.test.ts subs/harness/src/tests/single-session.test.ts \
  subs/harness/src/tests/late-writes.test.ts subs/harness/src/tests/module-creation.test.ts \
  subs/harness/src/tests/run-bounds.test.ts subs/harness/src/tests/writer-settlement.test.ts \
  subs/harness/src/tests/engineer-submission.test.ts \
  subs/harness/subs/agent/src/tests subs/harness/subs/agent/subs/pi/src/tests
# Test Files 26 passed (26); Tests 178 passed (178)
npm run type-check      # passes (root, web and scripts compiler scopes)
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 87 analysis limits (87 before this iteration)
```

## Open items

- **Iteration 4** builds on `ToolAction` and `ExecutorSupport`. Its likely
  additions are a `thinking` entry in `ExecutorSupport` and the message
  events. A tool-call block in the transcript can carry the same `action` as
  `tool-started`.
- **Multi-path writes.** Judging a write that names several paths needs
  either one guard observation per path or a per-call observation that
  lists several targets. Until then such a write is blocked as unresolved.
- **Declared support is not recorded.** The harness reads only the three
  observation entries. Recording an executor's declared support with each
  session could follow `session-opened` in iteration 1.
- **The glossary has no entries for tool action or declared support.** Add
  them if later iterations name them in their documents.
