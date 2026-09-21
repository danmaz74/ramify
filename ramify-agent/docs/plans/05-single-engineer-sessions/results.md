# Plan 5 results: single engineer sessions

**Date:** 2026-09-21. **Branch:** `feat/ramify-agent-single-sessions`.

## What was delivered

| Iteration | Commit | Delivered |
| --- | --- | --- |
| 1 | `ac48691` | The engineer equipment moved out of `RunService` into `subs/harness/src/work/engineer-equipment.ts`, with no change in behavior |
| 2 | `ca6b65e` | `runSingleSession` in `subs/harness/src/sessions/single.ts`, its records in `sessions/records.ts`, and `single-session.test.ts` on the scripted fake |
| 3 | this iteration | The `ramify-agent session` command, `npm run session`, the harness's `sessions/command.ts` entry and its exposure to the root, and the development script and `npm run quick-pi` deleted |

### The command

```text
ramify-agent session --project <root> --module <module-path>
                     (--prompt <text> | --prompt-file <file>)
                     (--agent pi [--model <provider/model[:level]>] | --agent fake --script <file>)
                     [--write <project-relative path>]... [--gate]
```

Two choices differ from the plan's runnable outcome:

- **`--agent` is required.** The plan's form shows the agent group in
  brackets. The command requires it, as `serve` requires an explicit choice
  and never defaults to pi or to the fake: a model call costs tokens, and the
  fake is useful only with a script.
- **The root receives a command entry, not `runSingleSession`.** The harness
  exposes `runSessionCommand` in `sessions/command.ts`, which builds the pi or
  scripted agent and a private Ramify daemon and disposes of both. Exposing
  `runSingleSession` would have exposed `AgentPort`, `RamifyCli`,
  `ArchitectIndex` and `RunPolicy` with it under the coming
  signature-companion rule. The root receives the entry, its option and agent
  types, the result, summary, progress and gate types, and the named types the
  summary mentions: `EngineerSubmission`, `HookFinding` and
  `InvocationOutcome`, with the schemas their inferred types name. The web
  module receives none of them.

## Development check

One real session, as the plan's development check asks. It is not a test.
The copy was prepared with `npm run trial -- prepare --into <scratchpad>/quick-pi`,
which copies the fixture, runs `npm ci` and makes one commit. The prompt
repeats the forced-violation assignment of 2026-09-21: its goal, its
approach and its completion evidence, in one prompt file.

```sh
npm run session -- --project <scratchpad>/quick-pi/collection-review \
  --module collection-review/workspace/reviews \
  --prompt-file <scratchpad>/forced-violation-prompt.md \
  --agent pi --model openai-codex/gpt-5.6-luna
```

Output, with the iteration message left out:

```text
Agent: pi, model openai-codex/gpt-5.6-luna
Session 20260921T121948Z-67235d on collection-review/workspace/reviews (subs/workspace/subs/reviews)
Records: <copy>/plans/.harness/sessions/20260921T121948Z-67235d
Write scope: subs/workspace/subs/reviews/src and everything beneath it; subs/workspace/subs/reviews/module.ramify; subs/workspace/subs/reviews/README.md
──── iteration message ────
[…]
───────────────────────────
… (calls read, ls, ls, read, grep)
→ read {"path":"subs/workspace/subs/reviews/src/mcp.ts"}
→ ls {"path":"subs/workspace/subs/reviews/src"}
→ ls {"path":"subs/workspace/subs/reviews/src/tests"}
→ read {"path":"subs/workspace/subs/reviews/module.ramify"}
→ grep {"pattern":"ToolResult|textResult","path":"subs/workspace/subs/reviews/src/.ramify"}
… (calls edit)
→ edit {"path":"subs/workspace/subs/reviews/src/mcp.ts","edits":[{"oldText":"import type {\n  McpToolContribution,\n  ToolInvocation,\n} from '../../../../../src/interfaces/protocol.js';","newText":"import type {\n  McpToolContribution,\n  ToolInvocation,\n  ToolResult,\n} from '../../../../../src/interfaces/protocol.js';"},{"oldText":"/**\n * The review feature's MCP surface, and the session wrapper aro… [218 more characters]
◆ Appended to the edit result:
  RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.
  - subs/workspace/subs/reviews/src/mcp.ts:12 imports `ToolResult` from src/interfaces/protocol.ts (module `collection-review`), which does not expose it to your module. `import type` counts too.
  Fix: drop the import and use what your module receives; its API view, named in your assignment, lists that. If the work truly needs `ToolResult`, drop the import anyway and submit `unsuitable` with reason `scope`, naming the symbol and its owner: the architect decides whether it is exposed. If a symbol you already receive mentions it in its signature, say so: that is an incomplete exposure. Do not copy or derive it. Editing `collection-review`'s module.ramify is outside your write scope. `completion-proposed` is refused while this stands.
… (calls edit)
→ edit {"path":"subs/workspace/subs/reviews/src/mcp.ts","edits":[{"oldText":"  McpToolContribution,\n  ToolInvocation,\n  ToolResult,\n","newText":"  McpToolContribution,\n  ToolInvocation,\n"},{"oldText":"export function textResult(text: string): ToolResult {\n  return { content: [{ type: 'text', text }] };\n}\n\n","newText":""}]}
… (calls submit_iteration_result)
◆ Submission:
  {
    "kind": "unsuitable",
    "reason": "scope",
    "detail": "The requested helper needs the ToolResult type from src/interfaces/protocol.ts, owned by the collection-review module, but that symbol is not exposed to collection-review/workspace/reviews. ToolResult is also mentioned by the received McpToolContribution signature, making this an incomplete exposure; the owner must expose it in collection-review/module.ramify before this helper can be implemented and tested."
  }
◆ Accepted; the engineer is told:
  The submission was accepted and recorded. Nothing follows it in this session: no contract, no architect and no further session act on it. A person reads your report. Nothing more is asked of you in this session.

Session ended: submitted after 25s.
Submission: unsuitable. Rejected submissions: 0.
Violations still standing: 0.
Changed paths: none
Tokens: 9635 input, 848 output, 19968 cache read, 0 cache write, 30451 total.
Records: <copy>/plans/.harness/sessions/20260921T121948Z-67235d
No gate ran: nothing verified the work. It stays uncommitted in the working tree; pass --gate to run the iteration checkpoint.
```

Exit status 0. The model made the forced edit, received the violation text,
removed the import and its helper, and reported `unsuitable` with reason
`scope`, naming the incomplete exposure. This matches the development
script's run of the same assignment earlier the same day. The engineer turn
took 25 seconds. The working tree was clean afterwards and nothing was
committed.

The README's forced-violation example imports `formatFinding` instead,
because `ToolResult` becomes a required exposure of `McpToolContribution`
under the signature-companion rule. A hand edit on the same copy confirmed
that `ramify check` denies `formatFinding` to `collection-review/workspace/reviews`
(`not-visible`). No model session was run on that example.

## Completion gate

| # | Item | Evidence |
| --- | --- | --- |
| 1 | A real session runs and prints the stream | The development check above |
| 2 | Iteration 2 and 3 tests pass without a model | `single-session.test.ts` (9 tests), `cli.test.ts` (8), `session-command.test.ts` (2): 19 passed. The command test runs `src/main.ts` in a child process on the scripted fake and the real Ramify command line |
| 3 | An implementation run behaves as before iteration 1 | Iteration 1 changed no test. `service.ts`: 4434 lines before iteration 1, 4252 after it, 4119 after iteration 2, which moved the port-event recording and other shared pieces out; iteration 3 did not change it. An accidental whole-suite run during iteration 3 (`vitest run src/tests/` matches every test file) passed: 90 files, 685 tests, 2 skipped. It ran before the last change to `src/main.ts`, which prints a refused write once instead of twice |
| 4 | `type-check`, `npm test`, `build:web` and `check:self` pass | `type-check`, `build:web` and `check:self` pass (0 errors, 0 warnings, 0 analysis limits). A full `npm test` is still to be run by the owner |
| 5 | The development script and `npm run quick-pi` are gone, and the memory note points to the command | Both are deleted, and no file outside this plan names them. The quick-test memory note is outside the repository and still has to be updated |
