# Iteration 8: The `inspect` service operation and the resident path

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 7 (root's batch `runInspection`, the three CLI
commands, the renderer and `InspectDocument`). Nothing from Plan 5; this
iteration answers over Plan 2's merged context manager. **Owners:** root's
service vocabulary and assembly, `subs/daemon/` and `subs/cli/`.

## Goal

Answer the same three queries from the resident daemon: a validated `inspect`
operation over a context's published or synchronized revision, answered by the
injected query function, mirrored by the client, and reached by the three
commands with the terminating-command fallback rule. Every answer names the
revision it was computed from; the detail tier stays unavailable on this path
until iteration 9.

## Read first

- [contracts.md](../contracts.md): Root, the service operation and the batch
  operation (`InspectParams`, `InspectOutcome`, `RamifyService.inspect`, the
  `resident-assembly.ts` line); Daemon, validation and binding
  (`InspectionEngine`, `DaemonServiceOptions.inspection`, the validator's
  rules, the `service.ts` mapping, the mirrored client method and the
  advertised capability); CLI, arguments, document and exits for the
  `mode` and `revision` members this path fills.
- [scope.md](../scope.md#freshness-and-revisions) in full; the resident row of
  [Detail tiers](../scope.md#detail-tiers-and-availability); the rebase rule
  in [Coexistence with Plan 5](../scope.md#coexistence-with-plan-5).
- [owners.md](../owners.md): the Root, Daemon and CLI sections and the
  iteration 8 rows of the activation manifest.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 5;
  [Exits](../main-plan.md#exits) and the [Error table](../main-plan.md#error-table);
  [Freshness and revision guarantees](../main-plan.md#freshness-and-revision-guarantees);
  matrix row I3-11;
  [Coexistence with Plan 5](../main-plan.md#coexistence-with-plan-5) for the
  append rule on `service.ts`, `validation.ts`, `connection.ts`,
  `connect-daemon.ts` and `quick-environment.ts`.
- [subcases.md](../subcases.md): the I3-11 rows.
- `probes.md`: P3-2's snapshot retention, which fixes how often
  `snapshot-not-retained` is expected on each fixture.
- [Daemon and analysis](../../../architecture/daemon.md): Service operations
  and client behavior; Freshness and saves; Revisions and atomic publication;
  DA12 and DA15. [Quick testing](../../../architecture/quick-testing.spec.md):
  Real flows with direct adapters, QT03 and QT04.
  [Processes and clients](../../../architecture/processes-and-clients.md): PC03.
- Source: `src/interfaces/service.ts`, `src/resident-assembly.ts`,
  `src/client.ts`, `src/tests/quick-environment.ts` and
  `src/tests/resident-cli.test.ts`; `subs/daemon/src/{validation,service,connection,connect-daemon}.ts`
  and `src/interfaces/daemon.ts`; `subs/cli/src/{inspect-commands,check-command,command-support}.ts`.
- Plan 2's [contracts](../../done/iteration-2-resident-verification/contracts.md)
  for `Freshness`, `ContextRevision`, `ServiceResult`, `RunControl`,
  `UnavailableReason` and the fallback policy reused unchanged.

## Deliverables

1. `src/interfaces/service.ts` appended with `'inspect'` in
   `ServiceOperation` and `ServiceCapability`, `InspectParams`,
   `InspectOutcome` and `RamifyService.inspect`. No Plan 2 member is
   reordered or renamed.
2. `subs/daemon/src/interfaces/daemon.ts` appended with `InspectionEngine`
   and `DaemonServiceOptions.inspection`; `src/resident-assembly.ts` passing
   `inspection: { answer: answerInspection, resolve: resolveConsumer }`, so
   `daemon` and `cli` still import no analysis value.
3. `subs/daemon/src/validation.ts` accepting `inspect` with `token`,
   `requestId` and `freshness` as for `check`, an optional boolean
   `lastValid`, and `query` as a record whose `kind` is one of the three
   strings, whose `from.path` is a nonempty string and whose remaining
   members have the declared types; anything else is `invalid-request`.
4. `subs/daemon/src/service.ts` implementing `inspect`: call the context
   manager's `check` with the token, freshness and a derived `requestId`;
   take the report of a `reported` outcome; map `pending`, `superseded`,
   `cancelled` and unavailable outcomes to `not-answered`; answer
   `snapshot-not-retained` for a null `report.snapshot` and
   `evicted-revision` for a named revision no longer retained; otherwise call
   `options.inspection.answer` with the context's root and
   `maxListedSymbols`. An invalid current model answers from the last valid
   revision only with `lastValid: true`, and is otherwise
   `invalid-revision`. `dispatchServiceRequest` gains the case; no transport,
   codec or record changes.
5. `subs/daemon/src/connection.ts` and `src/connect-daemon.ts` mirroring the
   method; the welcome advertising the `inspect` capability;
   `src/tests/quick-environment.ts` in root mirroring it in process.
6. `subs/cli/src/inspect-commands.ts` extended with the resident path: open or
   reuse the context as `check-command.ts` does, send one `inspect` request
   with `published` freshness by default and `synchronized` with an empty
   `expect` for `--fresh`, print the answer with `Mode: resident` and the
   revision identity, and map outcomes to the exits. These are terminating
   commands, so an unavailable daemon after exhausted recovery takes the
   visible batch fallback with `mode: 'batch fallback'`, while `stopped` never
   falls back. Every resident row's detail view is `unavailable` with reason
   `not-extracted`, stated once in the summary line.
7. Tests: `subs/daemon/src/tests/validation.test.ts` and
   `src/tests/service.test.ts` extended; root
   `src/tests/resident-cli.test.ts` extended for the three commands and the
   fallback rules; `src/tests/quick-environment.test.ts` extended.
   Harness: the `inspect-service` capability with the I3-11 handlers in
   `scripts/reference-harness/inspect-service-cases.ts`, `quick` instances
   through root's quick environment with its real driver and `ipc` instances
   over the real socket under a unique `RAMIFY_ENDPOINT_DIR`, each stopping
   its daemon in `finally`.
8. Before exit, the branch rebases onto `main` and resolves any additive
   conflict with Plan 5 by keeping both additions, reordering and renumbering
   nothing.

## Matrix rows executed here

- I3-11: `inspect-operation-validated`, `published-answer-no-analysis`,
  `synchronized-answer`, `revision-qualified`, `evicted-revision-explicit`,
  `unknown-context`, `quick-equals-batch`, `ipc-serialization`,
  `resident-cli-fallback-rules`, `resident-details-unavailable-before-join`,
  `snapshot-not-retained-explicit`.

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/daemon/src/tests/validation.test.ts \
  subs/daemon/src/tests/service.test.ts src/tests/resident-cli.test.ts
npm test
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
(cd examples/collection-review/subs/workspace/subs/reviews/src \
  && node ../../../../../../dist/src/cli-entry.js available)
node dist/src/cli-entry.js available --root examples/collection-review --fresh --format json
npm run reference:verify -- --plan 3 --iteration 8        # requires 2 to 8
npm run reference:verify -- --plan 1 && npm run reference:verify -- --plan 2
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kinds: `quick` for the service flows and `ipc` for
`inspect-operation-validated` and `ipc-serialization`; a quick run does not
satisfy an `ipc` instance, and `process` evidence waits for iteration 10.
`quick-equals-batch` compares resident and batch answers over identical
inputs after normalizing run identifiers, timing and host metadata. Expected
intermediate failures: the unfiltered `--plan 3` gate and the `inspect-join`,
`inspect-measure` and `completion` capabilities.
`resident-details-unavailable-before-join` records this iteration's state,
not a defect; iteration 9 replaces it.

## Exit criteria

- `inspect` is validated, dispatched, mirrored and advertised, answers a
  published revision without analysis, and names the revision in every answer.
- The three commands answer from the daemon, fall back visibly when the daemon
  is unavailable after exhausted recovery, and never fall back after `stopped`.
- Resident and batch answers agree for identical inputs after normalization.
- Every I3-11 instance ran and asserted its own expectation.
- The branch is rebased onto `main`; Plan 1's and Plan 2's gates,
  `check:reference` and `check:self` pass unchanged.

## Handoff

Iteration 9 replaces the `not-extracted` detail state on this path with
details from Plan 5's retained session at the answering revision, and obtains
the report from the compact history's projection instead of the whole report.
Iteration 10 drives these commands through the compiled daemon and the
installed executable and measures them.
