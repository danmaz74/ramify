# Iteration 3 results: the architect on pi

**Date:** 2026-09-19. **Status:** done, including the real session, run with the
person's own Claude Code credentials on `anthropic/claude-sonnet-5`. See
[the real session](#the-real-session).

## Delivered

### Modules and declarations

| Module | Declaration | Change |
| --- | --- | --- |
| `harness/agent/pi` (new) | `module pi`; `expose-src createPiAgent, piReadiness, PiAgentOptions from "pi-agent.ts" to parent` | The port on pi. It is the only importer of `@earendil-works/pi-coding-agent`. |
| `harness/agent` | the port is now exposed `to parent, descendants`; adds `expose-sub * from pi to parent` | The port reaches `pi`, and `agent` relays `pi` to the harness. |
| `harness` | unchanged | `http/server.ts` builds the pi agent for `serve --agent pi` and the architect procedure by default. |
| `contracts/protocol` | unchanged | Adds the `api-view-materialized` event and the failure reason `evidence-unavailable`. |

`spikes/pi/` was already gone. It was never tracked, and nothing was left to
delete.

### `harness/agent/pi`

The adapter follows iteration 0's findings. See its
[README](../../../../subs/harness/subs/agent/subs/pi/README.md).

- **Prompt.** The system prompt is set exactly through an inline
  `before_agent_start` extension. All pi discovery is off: context files,
  extensions, skills, prompt templates and themes. Settings are in memory.
- **Tools.** The spec's built-ins (`read`, `grep`, `ls`), the harness's tools
  and the submission tool, as pi's allowlist.
- **Submission tool.** pi gets a schema that names the top-level fields and
  constrains nothing, so every call reaches `accept` and counts toward the
  bound of two corrections. The full JSON Schema is in the tool's description.
  - Accepted: the loop ends with `terminate`. If the model called another
    tool in the same turn, the loop would go on, so the adapter aborts it after
    that turn.
  - Rejected: pi receives a thrown error, which becomes an error result.
  - Final rejection: an error result that ends the loop. A `tool_result` hook
    marks it as an error.
- **Events.** Tool starts and ends are translated by call ID. Each assistant
  message is translated with its usage, as `{input, output, cacheRead,
  cacheWrite, total}`.
- **Stop.** `abort()`, then idle. Nothing is reported after Stop, and the
  harness still bounds the wait.
- **Session record.** pi's `.jsonl` goes into the job's `session/`.
- **Model.** `--model provider/id`, or else the first model pi has
  credentials for. `piReadiness` reports which model will run, or why none
  can; `serve` prints it.
- **Adapter tests: the durable approach.** A scripted model provider is
  written against the interface pi's `ModelRuntime.registerNativeProvider`
  publishes: `tests/helpers/scripted-provider.ts`. Its types come from pi's
  own declarations (`Parameters<ModelRuntime['registerNativeProvider']>[0]`),
  and it emits a duck-typed event stream. pi's agent loop consumes streams by
  async iteration and `result()`, with no `instanceof`.
  - The tests import nothing but pi's public package. There is no deep path
    into pi's private `pi-ai` and no second copy of it.
  - A real pi session runs: pi's loop, argument validation, the built-in
    `read`, `grep` and `ls` on disk, events, retries, abort and the session
    file.

### The mapping job on real evidence (`harness/src/mapping/`)

- **`MappingProcedure` is a per-job factory.**
  - `capture(projectRoot, plan)` builds the complete manifest before
    `job.json` is written. It runs `ramify materialize --view architect` and
    records the view's `revision`, its `input` identity and its coverage
    limits. The limits come from `_meta.json`'s exceptional counts and
    unavailable facts.
  - `forJob(context, hooks)` returns the job's `MappingJob`: `session`,
    `validate` and `changes`. It holds the API views the job materialized.
    The hooks record evidence and report changed inputs.
- **`architectProcedure`** (`architect.ts`):
  - **Versions.** The prompt's and the procedure's versions are
    `<declared>+sha256:<16 hex>`. The skill's version is a hash over all of
    its files. The Ramify version comes from `ramify --version`.
  - **System prompt.** `architect-prompt.md`, with the whole of `SKILL.md`,
    `feature-mapping.md` and the map's JSON Schema filled in.
    - The prompt bridges the skill's `ramify materialize` step: the view is
      already materialized, and `materialize_api_view` replaces
      `--view api --from`.
    - Command-only steps are recorded as limits instead.
    - The skill's references are read on demand, by absolute path.
  - **First message.** The captured plan, the view's revision, input and
    coverage limits, and the root module.
  - **`materialize_api_view {module}`.**
    - It takes a declared-name path or a directory and runs
      `ramify materialize --view architect --view api --from <dir>`.
    - It compares the input identity and snapshots both areas' views, then
      records an `api-view-materialized` event.
    - It answers with the view paths, the entry counts, the coverage and an
      `rg` command.
    - Materializations within a job are serialized, and the `ramify` child
      is killed on Stop.
  - **`changes`.** Before publication it hashes the plan again and
    materializes once more.
- **Validation** (`validate.ts`) applies exactly the plan's mechanical checks.
  - Every named module exists or is marked proposed.
  - Every reused symbol exists under its owner, by export name, exposure
    name or binding.
  - Every availability agrees with the requester's API view as this job
    materialized it:
    - `available`: every symbol is listed in the view, and `record` is a file
      of that view that lists one of them;
    - `unavailable`: the view has no coverage limits and lists none of the
      symbols;
    - `unknown` is never rejected;
    - only `unknown` may be stated for a requester this job never
      materialized.
  - The shape validator in `contracts/map` keeps the entry point, the seams
    and the proposed parents.
- **Failures.**
  - A start whose view cannot be materialized is refused as `unavailable`
    and creates no job.
  - A later materialization or read failure fails the job as
    `evidence-unavailable`.
  - A changed input identity fails the job as `inputs-changed` and stops its
    session, whether it is found at `forJob`, at `materialize_api_view` or
    before publication. Nothing is saved.
- **Entry.** `serve --agent pi [--model <provider/model>]`. The demonstration
  script now also calls `materialize_api_view`.
- **Real-session check.** `npm run real-session`
  (`scripts/real-session.ts`) exercises the harness only through its command
  line and HTTP. `scripts/` has its own `tsconfig.json`, and `type-check`
  covers it.

### Two findings about Ramify that shaped the design

1. **The input identity covers every directory listing in the project.**
   Toolkit source: `inventoryProject` walks all directories that are not
   excluded, including hidden ones, and the identity hashes the observed
   entries. A probe on a fixture copy found:
   - creating `plans/.harness/lock`, a job directory or `map/001.json`
     changed the identity;
   - appending to `plan.md` changed it too.

   The harness's own writes would therefore fail every job as
   `inputs-changed`, and every approval would look stale.

   **Fix.** Every directory the harness writes holds a `tsconfig.json` that
   selects no files: `plans/.harness/`, and each plan's `.harness/` and
   `map/`. A directory with its own configuration, outside module source and
   unselected by the root configuration, is an independent scope that the
   walk does not enter.
   - A plan's two directories are created before capture.
   - Verified: after a job completes and saves `map/001.json`, materializing
     again gives the manifest's input identity with dependencies measured
     (`mapping.test.ts`).
2. **After a structural change, a daemon context stops measuring
   dependencies.** Once a file or directory has been added, every later
   `materialize --view architect` in that context waited about 125 s and
   published `dependencies unavailable (wait-limit)`. This happened even at
   an unchanged revision, and three times in a row. Content-only source
   changes re-materialized in about 1 s with dependencies measured.

   **Fix.** The server runs Ramify with its own `RAMIFY_ENDPOINT_DIR` (a
   short `/tmp/ra-*`, since the socket path must stay under 100 bytes). It
   stops that daemon before each capture, so every job starts from a fresh
   context, and stops it on close. Nothing else shares it.

   This looks like a toolkit defect worth reporting. It was not investigated
   further, since this iteration stays within `ramify-agent/`.

## Exit evidence

All commands were run from `ramify-agent/`:

- `npm run type-check`: exit 0, no diagnostics. It covers the root, web and
  scripts configurations.
- `npm test`: 19 files, 136 tests passed (node 111, web 25). Empty stderr.
- `npm run check:self`: `Execution: completed; check: passed; coverage:
  complete`.
  - Scope: 8 owners, 66 source files, 3 resources (`styles.css` and the two
    prompt files) and 663 accesses.
  - Findings: 0 errors, 0 warnings and 0 analysis limits; 394 allowed,
    0 denied and 269 external.
  - Independent scopes: `fixtures/collection-review` and `scripts`.

| Brief item | Evidence |
| --- | --- |
| Invalid submission corrected once | `mapping.test.ts`, on real fixture views. The first submission names a nonexistent module and a symbol under the wrong owner, and both errors are returned. The second is accepted: `rejectedSubmissions: 1`, revision 1 saved. The shape-level case from iteration 2 still passes in `jobs.test.ts`. |
| Rejection after the bound | `mapping.test.ts`: three view-invalid submissions fail the job as `invalid-submission`, the fourth is never judged, and no revision is saved. |
| Availability contradicted by the requester's API view | Same test, with the exact errors checked. `createCatalogRouter` claimed `available` to `reviews` is not in `subs/workspace/subs/reviews/src/.ramify`. `recordIdSchema` claimed `unavailable` is listed in `…/external/…/vocabulary.ts.md`, and the view reports coverage limits besides. `validate.test.ts` covers the complete-view branches on constructed views. |
| Availability for a requester never materialized | `mapping.test.ts`: `available` stated for `catalog` without `materialize_api_view` is rejected, and the corrected map is accepted. Also covered in `validate.test.ts`. |
| Source change fails the job as inputs changed | `mapping.test.ts`, two cases, each with no `map/001.json` and no `output/map.json`. First: `router.ts` is edited during the job, and the next `materialize_api_view` fails the job at once; the late submission is refused. Second: `vocabulary.ts` is edited after the last materialization, the submission is accepted, and the check before publication fails the job. Iteration 2's plan-edit case still passes. |
| Manifest and prompt on real evidence | `mapping.test.ts`, first case. It checks: `job.json`'s view identity equals `.ramify-architect/_meta.json`; the four versions; the session's role, working directory, tools, skill, bridge, procedure, schema and plan; no unfilled placeholder; the `api-view-materialized` evidence; the saved map carrying the manifest; and no file outside the harness's directories and Ramify's views changed. |
| pi adapter without a network | `pi-agent.test.ts`, 13 tests. It checks: the exact prompt and tool list; a schema-invalid submission reaching `accept`; rejection then correction; a final rejection with no further model call; a loop stopped after acceptance; event translation with usage; a harness tool error; provider errors after retries; Stop while the model is streaming and while a tool ignores its signal; the session file; the no-credentials failure; and `~/.pi` untouched. |
| Real session saves a valid map | **Open**; see below. |
| Gates | As above. |

Manual checks:

- `serve --agent fake` on a scratch copy of the fixture ran two jobs over
  HTTP with the real procedure.
  - Job 1: the architect view was materialized, `api-view-materialized`
    recorded the root module's views (coverage 4 and 5), and revision 001 was
    saved.
  - Job 2 ran after the saved map: the receipt came after 2.6 s of capture,
    with a fresh daemon context and dependencies measured, and the job
    completed.
  - SIGTERM stopped the harness, its private daemon and the endpoint
    directory, and released the lock.
- `npm run real-session` without a login: the harness started, printed `pi
  cannot run a session yet: pi has no model with credentials…`, and the
  script exited 2 and removed its copy.

**Fixture observations.** Every materialization ran on a temporary copy; the
fixture has no `.harness`, `map`, `.ramify` or `.ramify-architect`.

- **Architect view:** 15 modules and dependencies measured. `_meta.json`
  reports `unknownShapes: 8`, `cut: 3` and `unclassifiedExercises: 1`, but no
  `coverage` key.
- **API views:** all 29 report `coverage` from 2 to 5, which is the missing
  `node_modules`.
- **Consequence:** `unavailable` can never be stated on the fixture, and
  `available` is definitive. Complete views are covered by `validate.test.ts`
  only.
- **Timing:** a cold materialization takes about 2.5 s, and a warm one under
  1 s.

## The real session

Run with the person's own Claude Code OAuth access token, supplied only as
`ANTHROPIC_OAUTH_TOKEN` for the command (never the refresh token, never
written to a file), and `--model anthropic/claude-sonnet-5`
(`npx pi --list-models` confirmed this exact catalog id, `provider/id`, is
available under that token). `npm run real-session -- --model
anthropic/claude-sonnet-5` on the `review-notes` plan (the reviewer-notes
feature).

**Attempt 1: failed as `invalid-submission`, a harness defect.** Duration
4m30s (18:46:31.839Z–18:51:02.018Z). Files read 20, searches 6, tokens 30 in
/ 23,503 out. All three submissions were rejected with the identical error
set: every top-level field (`summary`, `modulesTouched`, `reuse`,
`newCapabilities`, `seams`, `entryPoint`, `workItems`, `assumptions`,
`evidence`) was "expected object/array, received string". The session file
showed the model's own tool-call arguments held, for each field, a valid
JSON-encoded **string** of exactly the right nested shape (e.g.
`modulesTouched` parsed to a well-formed array once unescaped) — the content
was always correct, only its envelope was wrong. The model's own recorded
thinking on the second attempt said it should pass native JSON rather than
stringified values, then produced the same stringified shape anyway on both
retries, exhausting the two-correction bound.

Root cause: `permissiveSchema` (`pi-agent.ts`) erased every field's JSON type
down to `{}`, so the tool's formal parameter schema gave the model no signal
at all about which fields are nested objects or arrays versus scalars; the
full schema was only prose in the tool description, which the model did not
follow reliably. Giving each field's top-level `type` back to the schema
would fix the model's framing, but it also hands pi-ai's own
`validateToolArguments` (`@earendil-works/pi-ai`, `dist/utils/validation.js`)
a type to coerce against — for example it would silently turn a wrong-typed
number into a string before the harness ever sees it, which would violate
this module's principle that pi validates nothing and every reported error
is the harness's own (`pi-agent.test.ts`, "returns a rejection to the same
session, which corrects its submission").

**Fix.** `submissionTool`'s `execute` now unwraps a top-level field pi
delivered as a string when the real schema names it `object` or `array` and
the string parses to that shape (`unwrapStringifiedFields` in `pi-agent.ts`).
A value that fails to parse, or parses to the wrong shape, passes through
unchanged, so the harness's own schema still rejects it with the harness's
own message; the tool's declared parameter schema is untouched, so pi's own
validation still does nothing the harness would count. Two tests added to
`pi-agent.test.ts`: unwrapping a stringified array before it reaches
`accept`, and leaving an unparsable or wrong-shaped string alone through
rejection and retry to acceptance. `npm test`: 21 files, 160 tests (was 158).

**Attempt 2: succeeded.** Duration 2m28s (18:57:24.656Z–18:59:52.882Z).
Files read 23, searches 6, tokens 28 in / 14,336 out, **0 rejected
submissions** — accepted on the first `submit_implementation_map` call.
Revision 1 saved to `plans/review-notes/map/001.json` (only in the temporary
fixture copy; the tracked fixture itself stayed untouched). Summary: "Add an
in-memory note (≤500 chars, replaceable, cleared by rerun) to a completed
review run, returned by tRPC reviews.run and the MCP reviews.run tool, and
shown/edited under the findings in the browser review panel." Modules
touched: `collection-review/workspace/reviews` (heavy),
`collection-review/workspace/reviews/ui` (heavy),
`collection-review/workspace/reviews/ui/pure-ui` (light),
`collection-review/integration-tests` (light). 0 reuse findings, 1 seam.

Along the way (both attempts), the model twice misread a relative path as
`collection-review/collection-review/...` and self-corrected via `ls`
without spending a submission attempt; this is ordinary recoverable
model exploration, not a harness defect.

Note: this run authenticated by exporting the person's Claude Code OAuth
access token as `ANTHROPIC_OAUTH_TOKEN` for the command only (never the
refresh token, never written to a file, never logged); it never ran pi's
`/login`. `serve --agent pi` still calls pi's `ModelRuntime.create`, which
creates `~/.pi/agent/` with empty `auth.json` and `models-store.json` when it
is missing; `~/.pi` did not exist before this iteration's runs. The directory
was kept through the live trial (iteration 4), which reuses the same
authentication, and removed afterwards.

## Deviations

1. **Harness directories carry a `tsconfig.json` marker.** This includes
   `plans/<id>/map/`, where it sits beside the revisions. The plan did not
   foresee that the harness's writes enter the input identity; see
   finding 1. Without the marker, jobs and approvals cannot compare
   identities.
2. **A private Ramify daemon, restarted before each job's capture.** See
   finding 2. The cost is a cold start inside the start command: about
   2.5 s on the fixture, and about 15 s expected on the toolkit.
3. **Protocol additions.** The event `api-view-materialized` records each
   requester and its views' metadata as evidence, as the plan's step 3
   requires. The failure reason `evidence-unavailable` is for
   materializations that fail. A start without evidence is refused as
   `unavailable`.
4. **`procedure` is required by `JobService`.** The interim procedure moved
   to the tests as `shapeOnlyProcedure`, used by the lifecycle tests. The
   server's default is the architect procedure.
5. **The skill is inlined, not listed.** `SKILL.md` is put into the system
   prompt whole, rather than pi's `<available_skills>` block. This keeps the
   whole prompt owned and versioned by the harness, with no pi helper in the
   procedure. The references are still read on demand.
6. **The map's JSON Schema appears twice,** in the system prompt and in the
   submission tool's description, because the schema pi sees is permissive.
7. **pi's schema check is not counted.** pi still rejects a submission whose
   arguments are not an object, before `accept`, and that rejection is not
   counted toward the bound. Model tool calls always carry objects, so this
   is not expected to occur.
8. **pi's retry setting.** Provider errors are retried twice (pi's retry
   setting) before the session fails.

## What iteration 4 must know

- **Approval can compare identities as the plan says.**
  - Materialize the architect view, read `_meta.json`'s `input`, and compare
    it with `identity.manifest.architectView.input`. Also hash `plan.md`.
  - Use `RamifyCli.materialize` and `readArchitectMeta` in
    `harness/src/mapping/`. The server owns the `RamifyCli`; pass it to the
    approval code.
  - Writing `map/<n>.approval.json` into the marked `map/` directory does not
    change the identity.
  - Do not restart the daemon for an approval. The context stays valid,
    since the harness's writes are invisible to it.
- **Stale approvals.** A plan edit changes both the plan hash and the input
  identity. A source edit changes the identity. Test both on a fixture copy,
  as `mapping.test.ts` does, with `privateRamify()` and `dispose()` in
  `afterAll`.
- **Live trial.**
  - Do the real session first, since the same login serves both.
  - On the toolkit, materialization is slower (about 9 to 17 s), and hit cost
    is high (architect-view spec, "Trial results"). The trial's target needs
    `plans/<id>/plan.md` at its root. Use a copy of the toolkit or of the
    reference example; mapping writes `plans/`, `.ramify-architect/` and
    `src/.ramify/` there.
  - The reference example with `npm ci` would give complete views, which the
    fixture cannot.
- **Map page data.**
  - The saved map's `identity.manifest` holds the view's revision, input and
    coverage limits, and the versions.
  - The job's `api-view-materialized` events hold the requesters' view
    metadata.
  - The snapshot still says only `architectView: 'materialized'`.
- **The module tree for the Map page** can come from
  `.ramify-architect/**/module.json` through `loadArchitectIndex`. Each entry
  has its module, directory and parent.
- **pi.**
  - `serve --agent pi` prints readiness; a job without credentials fails as
    `agent-failed` with the login hint.
  - The model defaults to the first one with credentials; pass `--model` to
    choose.
  - The prompt and procedure versions change with any edit, by hash, so a
    trial's manifest names exactly what the architect read.
- **Module candidates in `harness/src/`.** `mapping/` now has a dependency
  worth hiding (the Ramify CLI and view formats in `ramify-cli.ts` and
  `views.ts`) and a second consumer coming with approval. It is the strongest
  candidate for extraction; record it in the completion report.
