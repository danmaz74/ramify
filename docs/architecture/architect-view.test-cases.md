# Architect view: agent test cases

**Date:** 2026-09-18. **Status:** companion to the
[architect view specification](architect-view.spec.md). These are the tasks
that test hypothesis H1: that one denoised, searchable directory is enough for
an architect agent using only `Read` and `rg`. The cases run on the Ramify
toolkit itself. Every key below was derived from the toolkit source at commit
`764984b` on 2026-09-18 and must be re-derived from the materialized view at
the trial revision before scoring, as [maintenance](#maintaining-the-keys)
describes.

The agent under test never sees this document.

## Procedure

**Prerequisites.**

1. The architect view is materialized for the toolkit at one revision, by the
   first implementation or by a throwaway generator that follows the
   specification's record shapes. `_meta.json` records
   `"dependencies":"measured"`; a run with dependencies unavailable can score
   the discovery and placement cases only.
2. The specification's instruction block is present in the file the harness
   loads: `AGENTS.md` for Codex CLI, `CLAUDE.md` for Claude Code.
3. The scorer has the explorer open on the same revision for the refactoring
   keys.

**Harness.**

- *Claude Code:* one subagent per task with a tool allowlist of `Read`,
  `Grep` and `Bash` restricted to `rg`. The task text is the whole prompt
  after the preamble.
- *Codex CLI:* one fresh session per task with shell access; the preamble
  states the restrictions, and the scorer records violations from the
  transcript instead of preventing them.

Each task is a fresh context. Tasks are not batched into one session, because
the second task would benefit from the first task's reading.

**Preamble**, identical for every task and harness:

```text
You are the architect agent for the Ramify project at <root>.
Use only file reading and rg. Do not read files under src/ or subs/.
The generated architect view is at .ramify-architect/.
Answer the question below, name the module and symbol for every claim,
and name the file and line of the evidence you used.
```

An optional second pass omits the third preamble line for two discovery
tasks, to measure whether the instruction block alone sends the agent to the
view. That measures the instruction, not the view, and is reported
separately.

**Recorded per task.**

| Measure | How |
| --- | --- |
| Tool calls | Count from the transcript. |
| Searches | `rg` invocations, and how many were narrowings of a previous one. |
| Hit lines | Lines returned by all searches, summed. |
| Hit bytes | Bytes returned by all searches, summed. |
| README opened | Whether `.ramify-architect/README.md` was read. |
| Source read | Any read or search under `src/` or `subs/`. |
| Verdict | Pass, partial or fail against the case's key. |

**Pass criteria** for the core set, from the specification: every core case
receives the verdict pass against its key; no task needs more than three
narrowing searches; no task reads the source; no task returns more than 300
hit lines or 64 KB in total. A partial verdict on any core case fails the
run. A negative case passes only when the agent says that nothing exists,
and does not present a distractor as the answer.

## Core set

The eight tasks the specification names. D1 and D2 have their terms in a
symbol name; D3 and D4 have them only in a test title or documentation
paragraph.

### D1: name hit, internal role

**Prompt.** The CLI needs to write several large JSON reports to stdout in
order, with a limit on how many bytes may be in flight at once. Does anything
in the project already do this? Name the symbol and its module, and say
whether other modules can use it today.

**Key.** `createPublicationQueue` in `ramify`, file
`src/publication-queue.ts`, role `internal`: the root module exposes none of
its own functions to descendants. Its documentation paragraph reads
"Serialize complete CLI publications with finite byte admission, including
the publication currently flushing to stdout." Its consumer lists are expected
empty, since its uses are same-owner.

**Pass.** Names the symbol and module, and says it is not available to other
modules without an exposure. **Fail.** Says other modules may import it, or
proposes writing a new one.

### D2: name hit, exposed and re-exposed

**Prompt.** Is there an existing way to start the resident explorer web
server for a project? Which modules are allowed to call it?

**Key.** `startExplorerWebProcess` in `ramify/service-api`, role `exposed`,
`to` parent, re-exposed by `ramify` to descendants. `ensureExplorerWebProcess`
in the same module is the launcher that reuses a running process; either
answer passes when the difference is stated. The record's `tags` field carries
`dispatch`, so a caller needs that tag; `behavioral` is expected to list
`ramify`.

**Pass.** Names one of the two symbols, the module, and that the root's
re-exposure makes it available to descendants carrying `dispatch`.
**Partial.** Names the symbol but describes availability as "any module".

### D3: test title and documentation only

**Prompt.** When the daemon goes away, does anything reconnect the explorer
to it automatically, with increasing delays? Where is that implemented?

**Key.** `createProjectBinding` in `ramify/service-api`, role `exposed`. No
behavior record's name contains reconnect, retry or backoff. The evidence is
in `tests.jsonl`, title "RS03: a connection failure retries on the 1, 2, 5,
10, 30 s backoff and becomes ready when the daemon returns" in
`project-binding.test.ts`, and in `supporting.jsonl`, `bindingBackoffMs` with
the paragraph "Retry delays after a connection failure; the last one
repeats." The behavior record's paragraph is "Own one project's daemon
connection, context and subscription, and keep them valid."

**Pass.** Names `createProjectBinding` and the module. **Bonus.** Names
`bindingBackoffMs` as the delay table.

### D4: test title only, no word in the source

**Prompt.** A burst of file changes should be handled as one update rather
than one update per file. Does the daemon already coalesce or debounce
watcher events? Which symbol owns that behavior?

**Key.** `createContextManager` in `ramify/daemon/contexts`, role `exposed`,
`to` parent only: `ramify/daemon` receives it and re-exposes only the
contexts vocabulary and controlled test ports, so no `reexposed` entry is
expected. The non-test source of the module contains neither "debounce" nor
"coalesce". The evidence is in `tests.jsonl`: "debounces 0/50/90ms events to
190ms and coalesces every distinct path" in `context-manager.test.ts`, and
"flushes debounce and combines named paths from concurrent hooks in one
update" in `covering.test.ts`. `spanBatches` in the same module, role
`internal`, paragraph "The earliest receipt and latest flush of two batch
spans.", is a supporting detail.

**Pass.** Names `createContextManager` and the module, with the test title
as evidence. **Fail.** Answers that no such behavior exists.

### P1: placement in an existing module

**Prompt.** We want a rule that every module's README purpose paragraph is at
most 600 characters, reported as a project issue during a check. Which
existing module should own it, and why? If none fits, say so.

**Key.** `ramify/analysis/project`. Its purpose paragraph says it selects and
acquires one project and validates its physical ownership layout; it owns
`readPurpose` (internal) and the `ModulePurpose` and `ProjectIssue`
vocabulary. **Partial.** `ramify/analysis`, with the reason that it composes
validation; the scorer notes that the README reading already lives one level
down. **Fail.** `descriptions`, which parses the declaration language, or any
module outside `analysis`.

### P2: placement with two candidates

**Prompt.** Add rendering of the behavioral dependency diagram to a static
SVG file, for inclusion in reports. Which module should implement the
rendering, and which should own the command that triggers it?

**Key.** Rendering in `ramify/presentation/project-view`, which owns the
dependency graph model, `ModuleGraphRadial` and the explorer's rendering,
using `ramify/presentation/layout` for geometry; the command in `ramify/cli`.
**Also acceptable.** `ramify/presentation`, when the agent cites its existing
static renderers `ModelDiagramSvg` and `TreeDiagramSvg` and explains why the
dependency graph would join the teaching diagrams. **Fail.** Rendering in
`daemon`, `analysis` or `service-api`, or the command anywhere but `cli`.

The answer must cite module purposes and existing symbols; a placement with
no evidence is a fail whatever the module.

### R1: incoming use of one module

**Prompt.** List every module that depends on `ramify/analysis/model`. For
each, say whether its dependency is behavioral, meaning it calls, constructs
or passes the model's functions, or only non-behavioral, meaning types, data
or forwarding. What does that suggest about separating the model's behavior
from its declarations?

**Key.** The reference is `usedBy` in `analysis/model/module.json` and the
`behavioral`/`nonBehavioral` lists of its records, checked against the
explorer at the same revision under the production filter. On 2026-09-18,
by import statements, which approximate the classification: `ramify` (root;
value imports in `batch.ts` and `resident-assembly.ts`), `ramify/analysis`
(both kinds), `ramify/cli` (type imports only, so non-behavioral),
`ramify/presentation` (two files), `ramify/presentation/project-view` (type
imports only) and `ramify/service-api` (type imports only). Behavioral use
is concentrated in `analysis` and the root.

**Pass.** The module list and the behavioral/non-behavioral split match the
view; the conclusion follows from them. **Fail.** A module missing or
invented, or a conclusion that contradicts the split.

### R2: exposed but unused

**Prompt.** Which of `ramify/service-api`'s exposed behavior-capable symbols
are not used by any other module? Should they stay exposed?

**Key.** The view records production use only, as `dependencyScope` in
`_meta.json` says. On 2026-09-18, `reusableExplorerProcess` and
`probeExplorerReadiness` have no consumer outside `service-api` at all, and
`createProjectExplorerModel`, `createExplorerRouter` and
`readExplorerProcessRecord` are used only by `ramify/integration-tests`, a
module tagged `testing`, whose references the view does not record. All five
therefore have empty consumer lists. The others are used by `ramify` or
`ramify/cli`. The reference is each record's consumer lists.

**Pass.** Names the five symbols and says that withdrawing an exposure is
the architect's decision, noting that the root re-exposes what it received
from `service-api`. **Bonus.** Notes that the view is production-scoped, so
use from a testing module would not show. **Fail.** Lists a symbol that has
a production consumer.

## Extended set

Run after the core set when time allows; they probe roles, distractors and
negatives that the core set does not.

### D5: documentation only, internal, with a distractor

**Prompt.** We want to show each module's purpose in a report. Does something
already read a module's purpose paragraph from its README? Could the
`explorer` module use it?

**Key.** `readPurpose` in `ramify/analysis/project`, role `internal`,
paragraph "Only an unindented paragraph block can supply an owner's
purpose.", suite "README purpose" in `tests.jsonl`. It is not available to
`explorer`. The type `ModulePurpose` from the same module is exposed and
re-exposed by the root to descendants; that does not make the function
available. `describeSymbolDetails` in `analysis/typescript` mentions a first
documentation paragraph, but of a symbol, not a README.

**Pass.** Names `readPurpose`, its module, its internal role, and answers no.
**Bonus.** Describes what would have to change: `analysis/project` exposing
it to its parent, `analysis` re-exposing it to its parent, `ramify`
re-exposing it to descendants. **Fail.** Answers yes because `ModulePurpose`
is available, or names `describeSymbolDetails`.

### D6: negative with a distractor

**Prompt.** Does the project already compute the lowest common ancestor of
two modules in the module tree?

**Key.** Nothing does. `ancestorsOf` in `ramify/presentation/project-view`,
paragraph "Ancestors of a module, root first, excluding the module.", is a
building block, not the capability.

**Pass.** Says no; may name `ancestorsOf` as a starting point. **Fail.**
Presents `ancestorsOf` as the answer.

### D7: clean negative

**Prompt.** Is there an existing parser for `.gitignore` files anywhere in
the project?

**Key.** Nothing. No export name or test title contains "gitignore".

**Pass.** Says no within two searches, without reading the source.

### D8: internal role, terms in documentation and tests

**Prompt.** Does anything already replace queued outbound frames that have
not yet been handed to the socket, to handle backpressure?

**Key.** `createOutboundWriter` in `ramify/daemon`, role `internal` (absent
from the daemon's declaration), paragraph "One connection's encoded outbound
frames, including writes still owned by Node. Only frames not yet handed to
the socket can be replaced.", and the title "counts socket-owned bytes
during real backpressure and coalesces only unsent frames" in
`outbound.test.ts`.

**Pass.** Names the symbol, module and internal role.

### P3: no fitting module

**Prompt.** We need a stdio MCP adapter that exposes the daemon's check and
status operations to MCP clients. Is there a module it belongs in, or is a
new one justified?

**Key.** A new root child, tagged `dispatch` like `cli` and `service-api`,
reusing `connectDaemon`, which `ramify/daemon` exposes and the root
re-exposes to descendants. No existing purpose paragraph covers an MCP
transport: `cli` is the command line, `daemon` the resident process,
`service-api` the explorer's service model. **Partial.** Placing it in `cli`
with the argument that both reach the daemon through a connector.
**Fail.** Placing it in `daemon` or `service-api`.

### R3: outgoing use of one module

**Prompt.** What does `ramify/daemon/contexts` depend on outside its parent
`daemon`, and how much of that is behavioral?

**Key.** The reference is `uses` in `daemon/contexts/module.json`. On
2026-09-18, by import statements: `ramify/analysis` (12 lines),
`ramify/analysis/project` (5) and `ramify/analysis/typescript` (1). The
behavioral share comes from the view.

**Pass.** The module list matches `uses`; the behavioral counts are quoted
from it, not estimated.

## Reporting

One table for the run, one row per task:

```text
| Task | Harness | Tool calls | Searches (narrowing) | Hit lines | Hit bytes | README | Source read | Verdict | Notes |
```

Followed by the totals the specification asks for: tasks found, maximum
narrowing searches, source reads, and the hit-line mean. A run passes H1 when
the core set meets the pass criteria on both harnesses. A failed case is
reported with the searches the agent ran and the line it should have found,
so the record design or the map, not only the case, can be judged.

## Maintaining the keys

- Discovery keys name symbols, roles and paragraphs. Before a run, confirm
  each against the view: `rg -n '"name":"<symbol>"' .ramify-architect/`. A
  renamed or newly exposed symbol changes the key, not the case.
- Refactoring keys are the view's own consumer lists and `uses`/`usedBy`
  counts, which the specification requires to agree with the explorer. The
  2026-09-18 import counts above are orientation, not the reference.
- Placement keys are judgments. Change them only with a reason recorded
  beside the case.
- The set should keep at least one task of each kind: name hit, test title
  only, documentation only, internal role, distractor, clean negative,
  placement in an existing module, placement in a new module, incoming use,
  outgoing use.
