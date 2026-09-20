# Iteration 4 results: map view, approval and the live trial

**Date:** 2026-09-19. **Status:** done. The live trial ran, with the
person's own Claude Code credentials on `anthropic/claude-sonnet-5`, and
produced a real, saved map, reviewed here for what the agent observed; the
**person's verdict against the principles is still open**. See
[the live trial](#the-live-trial).

## Delivered

### Declarations

| Module | Change |
| --- | --- |
| `contracts` | `expose-sub * from map to parent, descendants`. The protocol carries saved maps and approvals, so `protocol` receives `map`. |
| `contracts/protocol` | adds `expose-src * from "interfaces/maps.ts" tagged [browser] to parent` |
| `contracts/map`, `harness`, `harness/agent`, `web`, root | unchanged |

No module was added. `harness/src/maps/` is a new directory.

### Contracts

- **`map`:** `mapApprovalSchema` is the record
  `map/<n>.approval.json` (`ramify-agent.map-approval/1`). It holds the plan
  ID, the revision, the SHA-256 of the map file, and the manifest's plan hash
  and input identity. It also holds `approvedAt`.
- **`protocol`:**
  - **Queries** (`interfaces/maps.ts`, `paths.ts`):
    - `GET /plans/:id/maps` lists the saved revisions, newest first. Each is
      readable (with its job, hash and approval) or unreadable (with a
      message).
    - `GET /plans/:id/maps/:revision` returns the map, its hash and its
      approval.
    - `GET /project/modules` returns the architect view's module tree with its
      revision and input identity. Before any materialization it answers
      `unavailable` with the reason.
  - **Event:** `map-approved` holds the accepted command and the approval
    record. It is the only event that may follow a terminal event, and only
    `job-completed`, once.
  - **Error code:** `inputs-changed` (409) is the stale refusal of an
    approval.
  - **Command:** `approve-map` keeps its iteration 2 payload
    `{planId, jobId, revision}` and expects the job's version.

### Harness

- **Approve** (`jobs/service.ts`). The checks run in this order:
  1. The job exists (`not-found`).
  2. The expected version is the job's (`stale-version`).
  3. The job completed with that revision, the revision has no approval, and
     `map/<n>.json` still has the hash the job saved (`conflict`).
  4. The manifest names a materialized view (`unavailable`).
  5. `MappingProcedure.approvalChanges` hashes `plan.md` and runs
     `ramify materialize --view architect`, without a daemon restart. Any
     difference from the manifest refuses the approval as `inputs-changed`,
     with every reason.

  On success, the harness appends `map-approved` and then writes the record
  with `writeFileExclusive`. The record is never rewritten.
- **Recovery:** a job whose `map-approved` event has no record file gets it
  written from the event. `RecoveryReport.approvals` lists these, and `serve`
  prints them.
- **Log rules** (`jobs/log.ts`):
  - A job's terminal event is its first terminal-type event, not its last
    event.
  - `append` and `open` refuse anything after it except one `map-approved`
    after `job-completed`.
  - A log that breaks this is skipped at load with a warning.
- **`maps/revisions.ts`** reads revisions and approval records. It lists only
  files named as the harness names them (`001.json`).
- **`views.ts` `loadModuleTree`** reads only the `module.json` files.
- **Regenerate** is `start-mapping` again. Nothing new was needed.

### Web

- **Map tab** (`map-view.tsx`):
  - The latest job's progress. It is folded into a `<details>` block once the
    job has completed; it stays open while the job runs or when it failed,
    stopped or was interrupted.
  - Regenerate, disabled while a job runs.
  - The revisions, as links with their approval state, and the chosen
    revision (the latest by default).
- **Approve** fetches the job's version (new `getJob`) and sends
  `approve-map`. It resends once at the reported version on `stale-version`.
  An `inputs-changed` refusal is shown with its reasons.
- **Map content:**
  - `map-document.tsx` shows the summary, the modules touched, reuse, new
    capabilities, seams, the entry point, work items, assumptions and
    evidence, and the identity with the manifest.
  - `module-tree.tsx` opens the branches that hold touched modules. Every
    other module is one muted line with `+N beneath`. Weights are badges, and
    a proposed module is drawn under its parent.
  - A touched module that is absent from the tree is listed apart.
  - When the tree was drawn from a later source state than the map's, a note
    says so.
- **Route:** `#/plans/<id>/map/<n>` selects a revision.
- **Feed:** the activity feed describes `map-approved`.

### Live trial preparation

- The trial plan is [`trial/plan.md`](../trial/plan.md): the roadmap's Plan 7,
  affected modules, written as a request.
- The review sheet is [`trial/review-sheet.md`](../trial/review-sheet.md).
  It records the target choice, the commands and blank tables for the three
  questions.
- `npm run trial -- prepare | verify <clone>` (`scripts/live-trial.ts`):
  - **`prepare`** does these steps:
    1. It clones the toolkit's committed state into a temporary directory.
       `git clone` of a local path only reads it.
    2. It withholds `docs/plans/iteration-7-affected-modules/` in a commit
       of its own. That draft is the reviewer's reference, not the
       architect's.
    3. It links `node_modules`.
    4. It adds `plans/affected-modules/plan.md`.
    5. It records the SHA-256 of every tracked file and of the plan.
  - **`verify`** compares these hashes, HEAD, and `git status` outside
    `plans/`.

## Exit evidence

All commands were run from `ramify-agent/`.

- `npm run type-check`: exit 0, no diagnostics. It covers the root, web and
  scripts configurations.
- `npm test`: 21 files and 158 tests passed; iteration 3 had 136.
- `npm run check:self`: `Execution: completed; check: passed; coverage:
  complete`.
  - Scope: 8 owners, 73 source files, 3 resources and 776 accesses.
  - Findings: 0 errors, 0 warnings and 0 analysis limits; 478 allowed,
    0 denied and 298 external.

| Brief item | Evidence |
| --- | --- |
| Approval writes the record once | `approval.test.ts`, on real fixture views. The record equals the map file's SHA-256 and the manifest's plan hash and input identity, with `approvedAt` the receipt's time. `map-approved` follows `job-completed`, the job stays `completed`, and its version grows by one. A later materialization still gives the manifest's input identity, so writing the record changed nothing Ramify observes. |
| Once only | Same file. An identical retry returns the original receipt. A new command is refused with `Revision 1 was already approved at …`. A reused ID with a different revision is `conflict`, and a stale expected version is `stale-version` with the current one. The record's bytes and the single `map-approved` event are unchanged. |
| Stale refusal after a plan change | `plan.md` is appended after mapping. The result is `inputs-changed`, naming `plans/review-notes/plan.md changed since the map was made` and the new input identity; no record is written and the version is unchanged. |
| Stale refusal after a source change | `vocabulary.ts` is edited after mapping. The result is `inputs-changed` with only the input identity reason; no record and no event. |
| Other refusals | A revision the job did not save, an unknown job, a map file edited after saving, and a manifest without a materialized view (`jobs.test.ts`) are refused. A log with an event after `job-completed` is not loaded (`recovery.test.ts`). |
| Recovery | The event is written and the record deleted, as after a crash between the two writes. The reopened service writes the record byte for byte, reports it, and returns the original receipt to a retry. |
| Queries over HTTP | `approval.test.ts` covers these. The module tree is `unavailable` before the first job and lists 15 modules after it, with the manifest's input. It also checks the revision list and a single revision before and after Approve, a second approval (409 `conflict`), `maps/2` (404), `maps/first` (400), an unknown plan (404), and a stale approval (409 `inputs-changed`). |
| Map page in a real browser, approved | See below. |
| Fixture unchanged | `fixtures/` contains no `.harness`, `map`, `.ramify` or `.ramify-architect` after every run; all tests and the browser check used copies. |
| Trial's map and review sheet | **Met for the map; the person's verdict is open.** A real session on the toolkit clone saved revision 1 (job `20260919T190102Z-637d1a`); see [the live trial](#the-live-trial). The sheet's trial record and agent observations are filled in; the three-questions tables and the reviewer's verdict are blank for a person. |

**Browser check** with Playwright MCP, on a scratch copy of the fixture after
`npm run build:web`:

- **Server.** A scratchpad script started `startServer` with the scripted
  fake. The fake read, called `materialize_api_view` for `reviews` and
  submitted the fixed review-notes map from `mapping.test.ts`. Its summary
  says it is a scripted fake test map; one proposed module was added to show
  how one is drawn.
- **Stopping.** The server was stopped only by its process IDs, with
  SIGTERM, and it released the lock.
- **Screenshots** in [iteration4-evidence/](iteration4-evidence/):
  - `iteration4-map-unapproved.png`, the whole page:
    - `reviews` is heavy, and `reviews/ui` is light;
    - the proposed `reviews/notes` is drawn under `reviews`;
    - untouched branches show `+N beneath`;
    - the reuse finding shows as available, with its import spelling;
    - the identity shows the manifest.
  - `iteration4-map-approved.png`: Approve was clicked, and the page shows
    "Approved" and "Revision 001 (latest) · approved".
  - `iteration4-stale-refused.png`:
    1. Regenerate saved revision 002.
    2. `plan.md` was then edited on disk.
    3. Approve on 002 was refused with both reasons.
  - `iteration4-earlier-revision.png`: revision 001 was selected at
    `#/map/1`.
- **Console:** the only console error is the browser's log line for that
  409.
- **Saved files.** The saved map and its approval record are
  `iteration4-evidence/fake-produced-map-001.json` and
  `fake-produced-map-001.approval.json`, both produced by the scripted fake.

**Trial dry run** on the toolkit, with the scripted fake:

- `npm run trial -- prepare` into the scratchpad made a clone at commit
  `70bafd2…`. It compared 1641 files, 34 of them `module.ramify`.
- `serve --agent fake` on the clone completed a demonstration job:
  - The capture took about 18 s cold, from the start request to the receipt.
  - The manifest's view limits were `cut: 366`, `detailsUnavailable: 1` and
    `dynamicTitles: 21`.
  - The root's API views reported complete coverage.
- The module tree listed the 15 toolkit modules. Approve took about 3 s.
- `npm run trial -- verify` printed `0 changed, 0 added`, `git status outside
  plans/: clean` and `The trial left the source, module.ramify files and
  plan.md unchanged.`
- **Negative control:** a line appended to `subs/cli/module.ramify` was
  reported as changed. The file was then restored.
- The demonstration map is not a trial map, and it was discarded with the
  clone.

## The live trial

Run with the person's own Claude Code OAuth access token, exported as
`ANTHROPIC_OAUTH_TOKEN` for the command only (never the refresh token, never
written to a file), and `--model anthropic/claude-sonnet-5`.

1. `npm run trial -- prepare`: cloned the toolkit's committed state at
   `3593eae42a297370e54a965536a5fc2cfb021704` (not dirty) into a scratch
   directory, withheld `docs/plans/iteration-7-affected-modules/`, linked
   `node_modules`, and recorded a 1641-file baseline (34 `module.ramify`).
2. `npm run build:web`: 430 kB bundle, as before.
3. `npm run serve -- --project <clone> --agent pi --model
   anthropic/claude-sonnet-5`, in the background; printed `pi runs
   anthropic/claude-sonnet-5.`
4. In the browser (Playwright): chose **Affected modules**, read the Plan
   view, opened **Map**, pressed **Start mapping**, and watched Progress to
   completion — about 5m55s. Read the completed map on the Map page.
   **Did not press Approve or Regenerate**; approval and the review verdict
   are the person's.
5. Stopped the harness by sending `SIGTERM` to only the process group this
   run started (never a blanket node kill), then `npm run trial -- verify
   <clone>`: `HEAD unchanged`; 1641 files + `plan.md` compared, 0 changed,
   0 added; `git status outside plans/: clean`. "The trial left the source,
   module.ramify files and plan.md unchanged."

**Outcome: job `20260919T190102Z-637d1a` completed and saved revision 1.**
Two submissions were rejected and self-corrected within the bound of three
(a `proposed: null` vs. omitted-key mismatch, then a wrong file citation
fixed via `ls`); the third was accepted. 7 file reads, 27 searches, 48 input
/ 34,624 output tokens. Three requesters' API views were materialized
(`ramify/daemon/contexts`, `ramify/daemon`, `ramify/cli`), matching the
map's reuse findings exactly. The map named `ramify/analysis`,
`ramify/daemon`, `ramify/daemon/contexts` and a proposed `ramify/mcp` as
heavy; `ramify` and `ramify/cli` as light; 4 reuse findings (3 available, 1
correctly `unknown` for the not-yet-existing `mcp`); 4 seams. Full detail,
including the agent's own observations on heavy modules, reuse and seams,
is in the [review sheet](../trial/review-sheet.md); **the person's verdict
there is still blank**. The saved map, the job's manifest/events and two
screenshots are in
[docs/plans/01-implementation-map/trial/](../trial/):
`trial-map-001.json`, `trial-job.json`, `trial-events.jsonl`,
`trial-map-unapproved.png`, `trial-job-activity.png`.

## Deviations

1. **The approval is also an event in the job's log.** The plan names only the
   record file. A command needs a receipt with a sequence number, and a retry
   needs the command recorded where the index is rebuilt from, so
   `map-approved` is appended to the log of the job that saved the revision.
   The event is written first and the file second, the same order as
   publication, and a restart completes the file.
2. **A new error code, `inputs-changed`**, for the stale refusal. None of the
   existing codes said "the plan or source changed".
3. **The protocol receives `map`.** Its revision query returns whole maps,
   validated by `implementationMapSchema` on both sides.
4. **The module tree is the architect view as last materialized,** not
   necessarily the map's. The page says when the two input identities
   differ. The plan leaves freshness out of scope.
5. **The trial clone withholds the Plan 7 draft,** so that the reviewer can
   compare the map with an answer the architect did not read. The roadmap's
   brief remains; the sheet asks whether it was read.
6. **Approve holds the command mutex while it materializes.** It takes a few
   seconds on the toolkit, and a Stop sent meanwhile waits.

## For the completion report

- `mapping/` has a second consumer, approval, besides the job's run.
- The trial's cost is now measured on both sides: the harness's dry run
  (above) and the real session's 5m55s, 48 input / 34,624 output tokens
  (non-cached) on `anthropic/claude-sonnet-5`.
