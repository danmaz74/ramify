# Plan 34: real project-option work

The requested useful change is to refuse repeated `serve --project` options,
including mixed spellings and identical values. The target is a separate Git
worktree of this real repository, with its existing project configuration and
six configured audit checks. No target check was replaced or weakened.

## Source, target and bounds

- Harness checkout: `/home/app/ramify-plan34-breakpoints-implementation`, branch
  `feat/plan34-breakpoints-implementation`; production execution source
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
after admission, retries its command, tests finite timeout and stop, then kills
the actual lock-holding host PID and verifies interruption on restart without
replaying the pending engineer. Git/audit/provider answers remain transparent
scripts in this native lifetime witness.

## Useful-work outcome

Pending actual exercise. B18 remains outstanding until the requested parser
change, committed project verification and responsible semantic assessment are
recorded. Configured harness audit health and native tests are separate evidence.
