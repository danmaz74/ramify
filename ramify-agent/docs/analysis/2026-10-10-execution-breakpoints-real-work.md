# Plan 34: real project-option work

The requested useful change is to refuse repeated `serve --project` options,
including mixed spellings and identical values. The target is a separate Git
worktree of this real repository, with its existing project configuration and
six configured audit checks. No target check was replaced or weakened.

## Source, target and bounds

- Harness checkout: `/home/app/ramify-plan34-breakpoints-implementation`, branch
  `feat/plan34-breakpoints-implementation`; initial host execution source
  `5261c98b21427cf0988028ab36b95d4aa4a8e271` (accepted iteration 3). Qualification
  test/document additions were developed separately while this server ran.
- Target: `/home/app/ramify-plan34-real-project-option/ramify-agent`, branch
  `feat/plan34-real-project-option`, base `5261c98b21427cf0988028ab36b95d4aa4a8e271`.
  Commit `6e64def4` adds `plans/serve-project-option/plan.md`. Setup used its own
  exact installed dependencies; toolkit root dependencies alone are linked.
- The reproducer parses `serve --project /intended --project=/other` and silently
  selects `/other`. The plan asks for a usage error and focused parser regressions.
- Independently hosted server: `http://127.0.0.1:4187`, actual root entrypoint
  `node --import tsx src/main.ts serve --project <target> --agent pi --model <model> --port 4187`.
- Aggregate bounds: 60 minutes from `2026-10-10T19:22:26Z`, at most 48 harness
  model invocations across supported-model attempts, plus normal captured limits.
  Caller wait is separately accounted. Polling uses finite slices. No performance
  benefit is inferred from retained usage or elapsed time.

## Attempts and retained evidence

1. `20261010T191957Z-34f2bb`, command `plan34-useful-start-1`, selected configured
   default `openai-codex/gpt-5.5`. Readiness reported the catalog/auth selection
   available, but invocation `inv-0001/outcome.json` refused before provider dispatch:
   session preservation supports only `openai-codex/gpt-5.6-sol` on
   `openai-codex-responses`. This attempt delivered no implementation.
2. The host was stopped cleanly and restarted with explicit supported model
   `openai-codex/gpt-5.6-sol`. Run `20261010T192226Z-208c34`, command
   `plan34-useful-supported-start-1`, completed four real provider invocations.
   `inv-0005/outcome.json` failed with upstream connection termination during
   catalog checking. This failed attempt remains failed evidence.
3. One fresh attempt, `20261010T192458Z-13aea2`, command
   `plan34-useful-supported-start-2`, keeps the same target, plan and model within
   the original aggregate bounds. It failed after seven invocations when the
   accepted analysis included optional `nonBehavioralAcceptance`, which the
   durable entry-assignment schema rejected. No engineer was dispatched.

The third attempt exposed a harness contract defect: the judge and catalog
resolution accept non-behavioral declarations, while `entryAssignmentsSchema`
omitted their optional field. The nearest catalog regression was extended to
parse resolved entries as durable assignments and preserve legacy absence.
It failed with the same unrecognized-key error before the correction. The fix
reuses the scenarios owner's schema without changing validation authority.
A clean restarted attempt uses corrected harness source; the target is unchanged.

Both supported starts outlasted the CLI's 10-second HTTP request cap. Clients
returned transport errors with stable command IDs and requested no cancellation;
the host continued independently. The run IDs were recovered from plan-scoped
queries. Retrying a start must use its identical ID/payload rather than duplicate
admission.

Full execution evidence is retained under the target's
`plans/serve-project-option/.harness/jobs/<run>/`, with session-operation packets
and native provider payloads in `plans/.harness/session-operations/`. Local client
receipts and host diagnostics use the unique prefix
`/tmp/plan34-breakpoints-implementation-04-real-`. These are our artifacts,
separate from other concurrent Plan 34 experiments.

## Qualification boundaries

The ordinary combined workflow exercises harness packet/control composition,
two pending explanatory exchanges, resume, a failed gate and distinct repair
pause, accepted gates, reviews and architect completion. External answers are
scripted under the ordinary process guard.

The registered Pi witness uses the installed adapter, serializer and session
engine, with scripted provider replies. It verifies exact input and retained
native history, an ordinary guard refusal and real rejected/accepted submission
verdicts through resumed continuation. This is a Pi port witness; it does not
alone establish delivery of the full harness packet or useful target work.

The registered process witness runs the actual hosting implementation in an
independent process and actual root CLI clients over HTTP. It kills a client
after admission, retries its command, tests finite timeout and stop, explicitly resumes another run from a separate
CLI client, then kills the actual lock-holding host PID while its resumed
engineer is admitted but blocked. It verifies interruption on restart without
replaying that engineer. Git/audit/provider answers remain transparent
scripts in this native lifetime witness.

## Useful-work outcome

**Unsuccessful; B18 remains incomplete.** No attempt reached the first engineer
pause. There are no caller interpretation/follow-up/proceed interventions,
engineer implementation candidate, target verification of that requested change
or architect completion. The target parser was not manually changed. The
responsible qualification agent assessed the retained run, readiness audit and
unchanged parser: the useful duplicate-project change was not delivered.
Configured harness audit health and native tests remain separate evidence.

## Continued qualification after interruption

Further supported-model attempts retained their real outcomes:

- `20261010T193407Z-7945ef` stopped after three invocations so preparation could
  correct the independently identified union producer inventory; it delivered
  no engineer change.
- `20261010T193734Z-b27b76` used clean harness source `e8f97ea1` and target base
  `065bd824d7327126cb22a5bfe451583457a4afd9` (the useful plan plus recorded
  harness prerequisite fixes). The intentional chat-turn interruption killed
  its foreground hosting process during catalog invocation 7. Restart recorded
  that unfinished debugger run as interrupted before effect replay. Six
  preceding accepted submissions are evidence, not successful delivery.
- `20261010T194706Z-509b03` was a preparation-only transition to an independently
  hosted process, interrupted with zero model invocations.

The continuing host is detached with its own session/process group, PID
`1964655`, parent PID 1, verified working directory
`/home/app/ramify-plan34-breakpoints-implementation/ramify-agent`. Its receipt
is `/tmp/plan34-04-detached-host.json`; source is
`674f12f5` and the supported provider/model remains
`openai-codex/gpt-5.6-sol`. The aggregate deadline remains
`2026-10-10T20:22:26Z` and the 48-invocation limit spans all supported attempts.
The new start's stable command ID is `plan34-useful-detached-start-1`.

Qualification review also corrected a stronger restriction introduced during
iteration 2: unconfirmed settlement must block further exchanges, writers and
new gates, but an already held terminal failure can be returned once to ordinary
failure handling without another model call. The correction keeps the writer
barrier set, explicitly reports `settlementConfirmed: false`, and retains
unknown legacy/preflight confirmation as absent. The nearest B08 regression
verifies exact resume retry, one engineer invocation, terminal failure and no
successor gate. Its correction is committed in `07b78736`/`674f12f5`; the older
iteration-2 handoff is historical evidence rather than the final contract.

An earlier configured audit requested exact clean source `674f12f5` via the
installed full nested audit CLI and failed, as diagnosed below. `/tmp/plan34-04-final-audit-process.json` records
its detached producer; outputs are `/tmp/plan34-04-final-audit.json` and
`/tmp/plan34-04-final-audit.stderr`. The earlier audit of `07b78736` remains a
separate superseded request and is not final qualification.


## Final retained real attempt and diagnosis

Detached run `20261010T194909Z-7bc6cb` completed seven real model invocations,
then failed readiness at `2026-10-10T20:20:12.262Z`, before any engineer dispatch.
Its normal configured full audit requested and audited exact target source
`065bd824d7327126cb22a5bfe451583457a4afd9`. Discovery was complete, with no
unavailable or skipped projects. The audit report is committed at
`002f5cb8b20d681a2f69c15cb94ced40f56a8581`, run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-10T20-20-11Z-065bd824d`.
The failing check was `agent-tests`, command `agent-vitest`, with one failed
witness: `subs/harness/src/tests/run-commands.test.ts`, “the command schema >
the run serves start-run, Plan 1's stop-job, approve-analysis and the three
CheckFinding commands, and nothing else”. Its explicit old six-command
inventory omitted the two approved debugger mutations. The actual protocol
correctly exposed `debug-resume` and `debug-message`; readiness correctly
refused this red configured check. This is a qualification witness omission,
not evidence of a debugger runtime failure or useful implementation.

The same stale witness failed the harness source674 audit. A focused reproduction
confirmed the exact mismatch; its expectation was corrected to the explicit
eight authorized commands, retaining every negative command control. No target
check or source was changed to bypass readiness. The separate harness audit's
web timeline failure passed alone three times and is recorded as a known flake
in the iteration-4 receipt, preserving the failed report.

Supported attempts consumed 29 harness model invocations in aggregate
(5 + 7 + 3 + 7 + 0 + 7), within the 48-call cap. The original 60-minute deadline
expired at `2026-10-10T20:22:26Z` (22:22:26 Europe/Rome). No additional real
model calls or silent budget renewal were made. Actual invocation usage is
retained in each outcome record; no trustworthy monetary total was emitted,
so cost remains unavailable rather than inferred from token counts.

After verifying exact argv and working directory, the coordinator gracefully
closed only detached host PID1964655 with SIGTERM at 21:01:44 UTC; exit was
confirmed in `/tmp/plan34-04-host-cleanup.json`. Real target/run/session and audit
records remain retained. Completion of B18 requires a separately authorized
bounded real attempt with a qualified target baseline; it has not been replaced
by a scripted workflow or the native witnesses.


## Final harness qualification and coordinator judgment

The clean final harness candidate `8b791543441bbacecbf2dfa4daac9436c48c2e67`
includes the corrected explicit command inventory and an additional actual CLI
resume before host-crash witness. Its released full nested audit passed all six
configured checks, with complete 336/336 configured coverage, 335 passed files plus
one existing skipped file, 3002 passed tests plus two existing skipped tests,
zero failures, complete discovery and an empty complete failure ledger. Module
checking passed with partial coverage and 352 analysis limits; no complete static
coverage is claimed. The report is
`f7eefb037d38048b4a57194686782a065477bcf7`, run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-10T21-22-11Z-8b7915434`,
with local JSON `/tmp/plan34-04-complete-audit.json`. Source 674's failed report
remains failed evidence, and the superseded 092 waiting audit was canceled before
execution without signaling the foreign lease holder.

The coordinator independently reviewed this exact candidate and report and
accepted the implementation and B01–B17 qualification. Plan 34 and iteration 4
remain partially accepted because B18's useful target work was not delivered.
This green harness audit does not qualify the unchanged failed target readiness
baseline or substitute for real engineer interpretation, resumed implementation,
project-declared verification and responsible semantic assessment of a useful
candidate. The final docs receipt changes only declared ignored documentation;
its fresh CLI applicability result is retained separately, with reused evidence
attributed to its actual audited source.
