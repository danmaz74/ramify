# To do

Work on the harness that is decided in outline and not yet started. Each item
came out of the real pi runs of 2026-09-21 and does not depend on the pending
Ramify changes (self-sufficient diagnostics, toolkit Plan 2E, and the
signature-companions error). An item leaves this list when it is done or
becomes a plan.

Check how a real model reacts to a changed text with one engineer session,
`npm run session -- --project <copy> --module <module-path> --prompt "<text>"`,
which takes about a minute.

## 1. Stop recording environment values

**Why.** Gate records and `job.json` store the complete environment of the
process. A session token reached commit `2d280f6` that way, in recorded trial
files, which blocks any push of `main`.

- [x] Record the names of environment variables only, never their values.
      `CheckCommand.env` is the sorted names and `envAdditions` the harness's
      own settings; a run recorded before that is read as the names its map
      held, under the same `ramify-agent.job/2`.
- [x] Build a child process's environment from an allowlist rather than from
      the whole of `process.env`. `childEnvironment` in
      `subs/harness/subs/evidence/src/run-command.ts` holds the one
      definition, and every child goes through it, `shell` included.
- [x] A test that a secret-looking variable set in the parent appears in no
      record and reaches no child. `recorded-environment.test.ts` and the
      allowlist test in `run-command.test.ts`.
- [x] The values are out of the recorded trial files: every recorded command
      there now names its variables only.
- [ ] Rewrite commit `2d280f6` so the recorded values are gone from history.
      This rewrites unpushed history and needs Dan's approval first.

## 2. Make the hook trustworthy

**Why.** In two real runs the hook appended text to 37 tool results, and 32 of
them were a false alarm. A model that learns to ignore the hook ignores the
one message that matters.

- [x] **No false `not-checked` after a shell call.** A `shell` call has no
      known changed set, so the changed check reports
      `not-checked (the changed set could not be established)` and "nothing
      was verified", although the complete check that runs with it passed.
      When the complete check passes, say nothing. When it finds something,
      report that. `subs/harness/src/hooks/post-write.ts`, the
      `paths === null` branch.
- [x] **A fresh Ramify check at `completion-proposed`.** The refusal knows
      only the findings an earlier hook check saw, so a violation written
      through the shell, or during a check that did not run, reaches the gate.
      Check the write scope when completion is proposed, while the session is
      still open and can act on the answer.
- [x] **Confirm a cleared violation.** An edit that removes a reported
      violation gets no text at all. Add one line saying the violation
      reported earlier no longer stands.
- [x] **The acceptance text.** An accepted `unsuitable` or `partial` report is
      answered with "Your work is complete." Word the answer by kind.
- [x] **Shorten the remedy line.** It is one 70-word sentence that says "drop
      the import" twice. Leave the per-code sentences alone: they go when
      Ramify's own messages are self-sufficient.

## 3. Say what failed when a gate fails

**Why.** In the T2 run a complete Ramify check failed at the gate on an import
in the engineer's own file. The local architect received only
"the gate returned to the local architect: outside-assignment at gate ga-0006",
read it as a write outside the assignment, narrowed the file list, and the
same failure came back.

- [x] **Carry the failure into both briefings.** The repair engineer's
      "The gate did not pass" section and the local architect's "The iteration
      you last assigned" section name the failing command and carry its
      findings, relayed verbatim, or the end of its output where it has no
      structured findings.
- [x] **Send a Ramify finding at the gate to the local architect.** With the
      check at `completion-proposed` (item 2), an engineer that was told of a
      violation cannot reach the gate with it. What still arrives is a finding
      in files the engineer did not touch, or a check that could not run.
      Neither is an engineer's repair round on the same brief.
- [x] **Attribute the cause from the finding's location, not only from exit
      codes.** `checks/gate.ts` derives `outside-assignment` from which
      commands failed and never from what they reported. Ramify's report is
      structured and names each finding's file, so it can be read without
      parsing test output.

## 4. Role-specific prompts in place of the module-architect skill

Now a plan: [Plan 6](plans/06-role-specific-prompts/main-plan.md). The list below is its outline.

**Why.** The skill predates the harness. It was written for an agent with a
shell answering open architecture questions. It is embedded whole in the
initial architect's and the global fork's prompts, tells them to run
`ramify materialize`, which the harness forbids, points them at reference
files outside the project (six reads each in T2, one of a file that does not
exist) and ends in a prose report template that no role uses. The engineer
prompt already has its own Ramify section; do the same for the other roles.

- [ ] One short shared block for every role: what a Ramify project is,
      exposing and receiving, what the architect view and the API view are
      for, and that the API view decides what a module may import.
- [ ] Each role gets only the guidance for its own decision, phrased for its
      tools and its submission: discovery and decomposition for the initial
      architect, placement for the global fork, decomposition and access for
      the local architect.
- [ ] Remove the embedded skill, the reads outside the project, and the
      skill directory from the prompt package's hash. Keep
      `skills/module-architect/` in the repository for standalone use.
- [ ] Materialize an API view for the initial architect. It now records that
      accessibility "cannot be verified", and that uncertainty travels into
      the hypotheses it delivers.
- [ ] Give both architects the plan's text. They now receive anchors into the
      plan and have to search `plans/` for the file.
- [ ] Afterwards, rerun the T2 plan (`review-notes`) on
      `openai-codex/gpt-5.6-sol:high` and keep that run as the recording for
      the replay fake.

## 5. A load-sensitive test

- [ ] `composition.test.ts`, the union-producer test: under heavy parallel
      load (24 test files at once, 2026-09-21) the `stop` scenario produced no
      `ended = stopped` invocation, so two union values had no producer. It
      passes alone, at `HEAD` and on the working tree. The scenario stops the
      run when the writer is acquired while the engineer waits 60 s; find what
      the invocation ends as when the machine is slow, and make the scenario
      deterministic.


## 6. Clean up raw run data

**Why.** Raw output makes up most of a run's size and becomes irrelevant some
time after its plan is done. The largest trial run on disk (32 invocations)
held 62 MB. Post-write hook outputs took 28 MB and gate logs 25 MB. pi session
files and shell outputs took about 3 MB each, and the structured records
about 2 MB. Transcripts, once recorded, add about as much as pi's files. The
[retention section](analysis/2026-09-23-session-transcripts-live-view.md#retention)
of the session-transcripts analysis has the measurement and a proposal.

- [ ] Decide the rule. Either by run, a week after a final run ended, or by
      plan, a week after one of the plan's runs completes. The harness has no
      plan-completed state, so the by-plan rule needs one defined.
- [ ] Keep the structured records and prune only raw output: hook outputs,
      gate logs, shell outputs, pi session files and transcripts. Touch only
      final runs, and never a run holding a live or suspended session.
- [ ] The harness prunes, as the only writer: when the server opens,
      periodically while it serves, and through a command with a dry run.
- [ ] Write a retention record per pruned run, so the web shows what was
      pruned and when instead of a missing file. Allow a run to be kept.
- [ ] Decide whether transcripts outlive the raw check output, and whether to
      compress before deleting.

## 7. Notify a person when a run waits for them

**Why.** A work item whose CheckFinding requests a person's decision waits
before its gate until a person answers, and the run advances no further
meanwhile. Dan decided on 2026-09-24 that the wait has no time limit. Since
Plan 12's follow-up, the web marks a waiting run in the header, the tab title,
the plans list, the run list, the run page and the execution map. Nobody
learns of it without looking at the web.

- [ ] Notify the person when a run starts waiting for their decision, with a
      link to the request. Choose the channel and whom it reaches.
- [ ] Later, notify other events that need a person: a review stop, a failed
      or stopped run, an unresolved high-risk signal.
- [ ] Keep no timeout: a waiting run waits until answered or stopped.

## 8. CheckFindings after Plan 12

**Why.** Plan 12's open items were decided on 2026-09-24 (see its
[results](plans/12-check-findings/results.md#decisions-on-open-items-2026-09-24));
these are the ones decided in outline and left to the follow-up plan, beside
the deferrals that plan already lists (cross-run waivers, revisit conditions,
the execution map's badge).

- [ ] Offer the reconciliation fork the revocation of a waiver it or a lower
      authority made, as the principles allow; the harness's rank rule
      (`mayRevoke`) exists and is tested pure. The user's path stays as it is.
- [ ] Evaluate revisit conditions, so a deferred signal can come due. A
      condition is prose today; decide what a condition may name (a gate, a
      work item, a file) before any heuristic, since a guess manufactures
      attention.
- [ ] Give the approved-requirement credibility rule something to match: a
      ground that names a requirement record a person approved. The records
      live in the run's state directory, which no audited candidate holds.
- [ ] Replace the design review's fixed guidance selection (principles files
      and the READMEs on the way to a changed path) with a relevance
      judgment, once the live-model trial says what the fixed selection costs.
