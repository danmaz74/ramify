# Iteration 1: Contract package, probes and review points

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** none within this plan. Plan 1 is complete on `main`: the
batch engine, the installed `ramify check` executable, `npm run check:self`
over nine owners and the 308-instance `--plan 1` gate. **Owners touched:**
none; this iteration reviews documents and runs executable probes only.

## Goal

Turn the draft review package into the accepted contract that iterations 3 to
14 implement, settle the open review points, and measure with probes the
five platform behaviors the package assumes: Unix-socket framing, recursive
`fs.watch`, atomic record replacement, detached spawn under a start lock, and
the in-process full-recompute floor from which the warm latency targets are
scaled. No owner source, harness code or daemon code is written here.

## Read first

- Main plan in full, especially Resolved decisions, Required behavior and
  diagnostics (including Engine results and their delivery), Iteration
  sequence with its Probes table, and Risks and decisions to settle early.
- [contracts.md](../contracts.md), [owners.md](../owners.md),
  [scope.md](../scope.md) and [subcases.md](../subcases.md) in full; they are
  the objects of this review.
- [Daemon and analysis](../../../architecture/daemon.md): Context identity and
  retained state, Freshness, saves and overlays, Service operations and client
  behavior, Decisions still requiring review.
- [Processes and clients](../../../architecture/processes-and-clients.md):
  Launch, compatibility and shutdown. [Memory lifecycle](../../../architecture/memory-lifecycle.md):
  State ownership and bounds, Initial setup probe. [Quick testing](../../../architecture/quick-testing.spec.md):
  Real flows with direct adapters.
- Plan 1's [implemented contracts and Plan 2 starting requirements](../../done/iteration-1-project-verifier/iterations/iteration15-results.md#implemented-contracts-and-plan-2-starting-requirements)
  and its [probe record](../../done/iteration-1-project-verifier/probes.md) as
  the pattern for probe scripts and archived results.
- [Module-description principles](../../../model/module-description.principles.md)
  for the manual review of the two new declarations in owners.md.

## Deliverables

1. Review outcome recorded in the four package documents: each status line
   advanced from proposed to accepted, or the revised text with the revision
   noted. A signature, wire schema or activation change made during review
   lands in the package here, before any consumer exists.
2. RP-2 and RP-4 to RP-8 each recorded with the chosen alternative in the main
   plan's review-point table; RP-1 (bare `ramify.analysis/1` for `check`) and
   RP-3 (explicit stop mid-flight is `stopped`, exit 2, no fallback) are
   already decided there and are confirmed, not reopened. A choice against a
   recommendation revises the affected package document in this iteration.
3. The three scheduling decisions this revision records are confirmed or
   revised in the same table: iteration 4 follows iteration 3 because the
   contexts interface names the types iteration 3 adds; the message codec
   and the connect vocabulary land in iteration 5, the codec exposed through
   N2's codec line so root's quick environment may import it, and framing,
   discovery and the client follow in iteration 7;
   the socket host, `startDaemon` and every `ipc` instance land in iteration 8
   because real socket pairs need `startDaemon` over the quick service. A
   different decision revises iterations 4, 5, 7 and 8 before they start.
4. Probe scripts under `scripts/probes/`, in the scripts scope selected by
   `tsconfig.scripts.json`, each runnable with `npx tsx scripts/probes/<name>.ts`
   and archiving a JSON result under `scripts/probes/results/<name>.json`.
   The main plan's [Probes table](../main-plan.md#probes) names what each
   must establish; in short: `unix-socket-framing.ts` (length-prefixed frames
   over a socket pair, 1 MiB and 32 MiB frames, partial reads, `sun_path` over
   100 bytes, the `0700` directory rule); `fs-watch-recursive.ts` (recursive
   `fs.watch` on a reference copy, excluded subtrees, batching under 100 rapid
   edits, overflow and error events, close semantics); `atomic-record.ts`
   (temporary file plus `rename` as seen by a concurrent reader, `O_EXCL`
   lock creation under eight contenders, stale-lock detection by dead pid);
   `detached-spawn.ts` (detached `unref()` spawn, exit code propagation,
   `process.kill(pid, 0)` liveness, a second start against a bound socket);
   `warm-recompute.ts` (twenty in-process runs of the full Plan 1 pipeline on
   the reference and the 100-owner fixture, median wall time and per-stage
   split). Result files: `unix-socket-framing.json`, `fs-watch-recursive.json`,
   `atomic-record.json`, `detached-spawn.json`, `warm-recompute.json`.
5. `probes.md` beside the plan recording each probe's command, Node and
   platform, `typescript@7.0.2`, result file and the decision it informs.
   Linux results are required now; macOS results are added when a macOS run
   exists.
6. The [latency and memory targets](../scope.md#latency-and-memory-targets)
   revised once from the warm-recompute floor, as RP-7 requires. They are
   binding from this iteration's exit; iteration 13 asserts them.

## Matrix rows executed here

None. This iteration produces no executable acceptance evidence.

## Verification

```sh
npm run type-check                     # probes compile under tsconfig.scripts.json
npx tsx scripts/probes/unix-socket-framing.ts
npx tsx scripts/probes/fs-watch-recursive.ts
npx tsx scripts/probes/atomic-record.ts
npx tsx scripts/probes/detached-spawn.ts
npx tsx scripts/probes/warm-recompute.ts
ls scripts/probes/results/{unix-socket-framing,fs-watch-recursive,atomic-record,detached-spawn,warm-recompute}.json
git diff --check
```

- By hand: every exposure line and foreign type in owners.md against the
  description principles' review checklist; every contract in contracts.md
  against the main plan's proposed-contract table; the 176 rows of subcases.md
  against the acceptance matrix and the per-iteration counts.
- No quick, ipc or process evidence exists yet. Presenting the package does
  not approve an unresolved contract change.

## Exit criteria

- The four documents carry an accepted status or a recorded revision; RP-2
  and RP-4 to RP-8, the confirmation of RP-1 and RP-3, and the three
  scheduling decisions each have a recorded entry.
- Five probe results are archived under the named files, `probes.md` cites
  them, and the revised latency table names the measured recompute floor.
- The daemon and contexts declarations pass the manual description review.
- Accepted before iteration 3 starts. Iteration 2 may begin from the draft
  inventory.

## Handoff

Iterations 2 to 14 implement exactly these signatures, wire schemas,
declarations, budgets and activation stages. A later change to any of them
revises this package first. The probe results are inputs to iteration 13's
measurement recipe and to the budgets it asserts.
