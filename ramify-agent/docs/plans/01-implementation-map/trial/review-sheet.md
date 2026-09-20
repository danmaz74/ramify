# Live trial review sheet

**Status:** the trial ran on 2026-09-19 (Claude Sonnet 5, via the person's
Claude Code OAuth credentials); the trial record and the agent's own
observations below are filled in. **The reviewer's verdict is still open**:
the three-questions tables and "The reviewer's verdict" stay blank for a
person to fill in, against the saved map
([`trial-map-001.json`](trial-map-001.json)) and this project's principles.
Nothing in the trial record or the agent's observations is a verdict.

## What the trial is

A real architect session on pi maps a real plan for the toolkit. A person
reads the map in the browser and judges it against the
[harness principles](../../../harness.principles.md) with the main plan's three
questions.

| Item | Value |
| --- | --- |
| Target | The toolkit (`ramify.ts`), as a disposable `git clone` of its committed state, with 15 modules. |
| Plan | [`plan.md`](plan.md), copied to `plans/affected-modules/plan.md` in the clone. It asks for the roadmap's Plan 7, affected modules, as a feature request. |
| Withheld | `docs/plans/iteration-7-affected-modules/`, the toolkit's own draft of that plan, is removed from the clone in a commit of its own. It is the reviewer's reference, not the architect's. |
| Not withheld | The toolkit's `docs/roadmap.md` still has the Plan 7 brief, whose prerequisites paragraph names the owners in one sentence. Check the activity feed for reads of it. |

**Why the toolkit rather than the reference example.**

- The person who reviews knows the toolkit's architecture. Asking whether the
  heavy modules are right needs that knowledge. The reference example has no
  real pending plan.
- The plan is real and unimplemented, and its draft gives an independent
  answer to compare with.
- The toolkit's API views report complete coverage, as the dry run showed.
  So `unavailable` findings can be stated and checked, which the fixture never
  allows.
- The plan also names a module that does not exist yet: MCP, which Plan 4
  delivers. How the map treats it tests the proposed-module path.
- Cost: capture took about 18 s cold in the dry run, and each API view
  materialization takes a few seconds.

**Why a clone.** Mapping writes `plans/`, `.ramify-architect/` and
`src/.ramify/` views into the target. The clone keeps all of that out of the
working checkout. `npm run trial -- verify` shows that the clone's tracked
source, its 34 `module.ramify` files and `plan.md` were left unchanged.

## Commands

Run these from `ramify-agent/`, on a machine with a browser.

1. Log in to pi, once:
   - `npx pi` (pi 0.85.1, the pinned dependency);
   - type `/login` and choose **Claude Pro/Max** or **ChatGPT Plus/Pro
     (Codex)**. pi's documentation says Claude Pro/Max usage from a
     third-party harness is billed per token as extra usage. Choose knowingly;
   - complete the browser authorization. Without a browser, paste the final
     redirect URL into pi;
   - quit pi. Optionally check with `npx pi --list-models`.
2. `npm run trial -- prepare`. It prints the clone's path, `<clone>` below.
3. `npm run build:web`
4. `npm run serve -- --project <clone> --agent pi [--model <provider/model>]`.
   It must print `pi runs <model>.`
5. Open the printed address, choose **Affected modules**, read the Plan view,
   open the Map view and press **Start mapping**. Watch the Progress view. The
   page may be closed; the job continues.
6. When a revision is saved, read it on the Map page and fill in this sheet.
   Press **Approve** only if the answers below support it; otherwise
   **Regenerate** or stop here.
7. Stop the harness with Ctrl-C, then `npm run trial -- verify <clone>`. It
   must end with `The trial left the source, module.ramify files and plan.md
   unchanged.`
8. Keep the clone's `plans/affected-modules/` directory. It holds the map, the
   job's `job.json` and `events.jsonl`, and pi's session file. Copy the map
   into `docs/plans/01-implementation-map/trial/` beside this sheet.

Optional before step 4: `npm run real-session` runs the same kind of job on
the fixture copy without a browser. It checks the login and the model
cheaply.

## Trial record

| Field | Value |
| --- | --- |
| Date | 2026-09-19 |
| Model (`pi runs …`) | `pi runs anthropic/claude-sonnet-5.` (Claude Sonnet 5, direct Anthropic provider, authenticated with the person's Claude Code OAuth access token exported as `ANTHROPIC_OAUTH_TOKEN` for the command only) |
| Clone commit (`job.json` `manifest.source.commit`) | `3593eae42a297370e54a965536a5fc2cfb021704`, not dirty |
| Architect view input (`manifest.architectView.input`) | `input/1:76051bf26f7b8f68482433eedd1611dc55bf4074954f783c82bb3729112d3696` (revision `rev/1:b36f8c6c-6886-4f4c-aec2-a3f61ccd5a04:1`) |
| Job ID, revision | `20260919T190102Z-637d1a`, revision 1 |
| Duration, files read, searches | 5m55s (19:01:02.397Z–19:06:57.768Z); 7 file reads, 27 searches |
| Tokens in / out | 48 in / 34,624 out (sum of each turn's non-cached `input`/`output`; cache read/write not counted) |
| Rejected submissions, with their errors | 2, both self-corrected within the bound: (1) `modulesTouched.0..4.proposed: Invalid input: expected object, received null` — the model sent JSON `null` for non-proposed modules' optional `proposed` field instead of omitting the key; (2) `reuse.1.availability.record: "subs/daemon/src/.ramify/children/subs/contexts/src/interfaces/contexts.ts.md" is not a file of subs/daemon/src/.ramify; cite the generated file that lists the symbol` — a citation to a plausible-looking but wrong path, corrected to `subs/daemon/src/.ramify/children/subs/daemon/subs/contexts/src/interfaces/contexts.ts.md`. Accepted on attempt 3 of 3. |
| API views materialized (requesters) | `ramify/daemon/contexts`, `ramify/daemon`, `ramify/cli` (each `src` and `src/tests`) |
| Did it read the roadmap's Plan 7 brief? (activity feed) | No. Only 7 `read` calls occurred, all on `.ramify-architect/**` (`_meta.json`, `README.md` ×2, three `module.json`); `docs/roadmap.md` was never read. The rest of its evidence came from 27 greps over `.ramify-architect/` and the three materialized API views. |
| `npm run trial -- verify` result | `HEAD unchanged`; 1641 tracked files + `plan.md` compared, 34 `module.ramify`, 0 changed, 0 added; `git status outside plans/: clean`. "The trial left the source, module.ramify files and plan.md unchanged." |

## The three questions

Answer each against the map. Use the reference only after answering from
your own knowledge first. The reference is the draft `owners.md` and
`main-plan.md` of `docs/plans/iteration-7-affected-modules/` in the toolkit
checkout.

### 1. Are the heavy modules right?

The principle: the map identifies which modules take most of the work, and
new modules are rare.

| Module in the map | Map's weight | Your weight | Right? Why |
| --- | --- | --- | --- |
| | | | |

- Missing modules the work needs:
- Modules named that the work does not need:
- How the map treats MCP, which does not exist yet (proposed module, assumption or not found):

### 2. Were the reuse findings real?

For each finding, open the cited record, then check the claim in the
requester's `src/.ramify/` view in the clone.

| Capability | Symbols and owner | Requester | Availability claimed | Real? (exists, and the availability is right) |
| --- | --- | --- | --- | --- |
| | | | | |

- Existing behavior the map missed:

### 3. Are the seams plausible?

A seam is a capability whose consumer lies in a different branch from its
owner. Neither side designs the other's interface.

| Capability | Owner | Consumer | Plausible? Would a contract be written here? |
| --- | --- | --- | --- |
| | | | |

- Seams the map missed:

## The reviewer's verdict

- Approve, regenerate or reject:
- Would you plan the next iterations from this map?
- What the architect prompt or feature-mapping procedure should change:

## The agent's observations

Kept apart from the verdict below, which stays blank for the person.

**Heavy modules the map named.** `ramify/analysis` and `ramify/daemon` were
marked heavy, with `ramify/daemon/contexts` (a child of `daemon`) also heavy,
and the proposed new module `ramify/mcp` (sibling of `cli` under the root)
heavy too. `ramify` (root) and `ramify/cli` were marked light. Everything
else (`explorer`, `integration-tests`, `presentation` and its two children,
`service-api`) was left untouched and drawn collapsed. This matches the
plan's own shape: the query logic belongs in `analysis` (owns the retained
facts) and is served per-revision by `daemon/contexts`, with `daemon` adding
the wire capability and `cli`/`mcp` as thin callers — four owners doing real
work, two thin callers, nothing untouched touched. The `ramify/mcp` proposal
reused the project's own `dispatch` required-importer tag from its README
context rather than inventing a tag name.

**Reuse findings.** 4 total: 3 `available` (`RetainedSession` of
`ramify/analysis` for `ramify/daemon/contexts`; `ContextManager` and
`createContextManager` of `ramify/daemon/contexts` for `ramify/daemon`;
`connectDaemon` of `ramify/daemon` for `ramify/cli`), each with an import
spelling and a view-record citation resolved from a materialized API view.
The fourth, the same `connectDaemon` for the not-yet-existing `ramify/mcp`,
was correctly marked `unknown` with the reason that `mcp` has no API view to
materialize — exactly the rule that only `unknown` may be stated for a
requester the job never materialized. The submitted map cited real,
`materialize_api_view`-backed evidence throughout; nothing was asserted
`available` without a materialized view of that requester.

**Seams.** 4, all crossing branches under the module tree's own reading:
`analysis` → `daemon/contexts`, `daemon` → `cli`, `daemon` → `mcp`, and
`daemon/contexts` → `cli`. Each pairs a capability's owner with a consumer
in a different branch, matching the seam definition mechanically enforced by
`validateMapSubmission`.

**Tool errors and retries.** 2 rejected submissions out of the bound of 3,
both self-corrected without exhausting it:

1. Attempt 1 sent JSON `null` for the optional `proposed` field on every
   non-proposed touched module, instead of omitting the key
   (`modulesTouched.0..4.proposed: expected object, received null`). This is
   a plausible, very common way to render "no value" in JSON and cost one of
   the two corrections; the schema accepts only a present object or an
   absent key (`.optional()`, not also `.nullable()`). Not fixed here, since
   it resolved within budget and the fix belongs to `contracts/map`'s
   shared schema, touching every consumer of `touchedModuleSchema`.
2. Attempt 2 cited a plausible but wrong generated file path for a reuse
   record; the model used `ls` to find the real path and corrected it on
   attempt 3.

Separately (iteration 3's real-session runs on the fixture, not this trial),
the same model twice misread a relative path as doubling the project's own
directory name and self-corrected with `ls` before any submission — the
same general pattern of a recoverable, self-corrected misstep that costs
tool calls but not a submission attempt.

**Materializations.** Three requesters' API views were materialized
(`ramify/daemon/contexts`, `ramify/daemon`, `ramify/cli`, each `src` and
`src/tests`), matching the reuse findings' owners/requesters exactly — the
model did not claim availability for a requester it skipped materializing,
and did not over-materialize requesters it never cited.

**Prompt/procedure gap worth noting.** The stringified-field defect fixed in
iteration 3 (see that iteration's results) did not recur here — 0 rejections
were about field envelopes. The `proposed: null` pattern above suggests a
second, smaller gap: the architect prompt or the map's JSON Schema could say
explicitly that an absent optional field must be omitted, not set to `null`,
to save the one correction round-trip this cost.

**Cost.** 5m55s wall time, 7 file reads, 27 searches, 48 input / 34,624
output tokens (non-cached), across three submission attempts. Materializing
the three requesters' API views added visible latency between reads but no
failures. Did it read the roadmap's Plan 7 brief itself? No — see the trial
record table; it worked entirely from `.ramify-architect/` and the
materialized API views, plus the plan text it was given.
