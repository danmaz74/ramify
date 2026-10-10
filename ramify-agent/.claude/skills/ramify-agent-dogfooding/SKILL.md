---
name: ramify-agent-dogfooding
description: Implement real plans on real projects using ramify-agent from a Claude Code or Codex session, progressively improving the harness when actual work exposes defects. Use for agent-led dogfooding and live implementation, rather than fixture trials or retrospective-only analysis.
---

# Real-plan dogfooding with ramify-agent

Deliver useful implementation with the harness. Fix concrete harness problems
as they surface, then continue the real plan. Retain successful work for normal
review and integration; an unsuccessful attempt may be discarded.

## Establish the working setup

Identify the target project, plan and intended deliverable using the user's
choices. Read the target's instructions and plan prerequisites. Create or reuse
its designated worktree and perform ordinary project setup. Preparation belongs
to you; `trial prepare` creates a fixture and is not this workflow.

Check the prerequisites for the selected mode:

- **Git and ignores:** a committed HEAD; dependencies and generated Ramify views
  ignored as appropriate for the project. A parent commit is needed only when
  a configured check uses it, such as `git diff --check HEAD^ HEAD`.
- **Ramify project and tools:** valid module declarations, installed project
  dependencies and a working Ramify CLI that can materialize the target module's
  views. Follow project setup rather than copying fixture configuration.
- **Full-run configuration:** valid `ramify-agent.json` for readiness and a
  `ramify-audit.json` committed at the starting revision, with the real project's
  checks. See the [configuration reader](../../../subs/harness/src/run/project-config.ts)
  and its owning schema. A standalone session does not require all full-run
  setup, but an existing audit configuration must be readable from its commit.
- **Full-run plan:** the chosen plan must be discoverable at
  `plans/<plan-id>/plan.md`, with supporting links/files available in the worktree.
  A standalone session instead takes your assignment prompt.
- **Pi access and model:** a working pi login and the chosen model available
  to the harness process; see [the README](../../../README.md). Respect the
  user's model, time and cost bounds. Check these before making model calls.

Identify the harness executable/checkout and revision, including local changes.
Distinguish it from the target worktree, especially during self-development.
Keep a short working note at `docs/analysis/<date>-<plan>-dogfooding.md` in the
harness checkout, unless the user chose another destination. Record both
checkouts, branch/base, deliverable and execution IDs there as work progresses.
Keep this note outside the target worktree when the projects differ, and outside
authoritative run records. Reuse an existing note for the same work.

Continue authorized steps and in-scope repairs without asking again for every
model call or retry. Broader work, publication and destructive cleanup still
require their own authorization.

## Choose an available mode

Choose the next useful piece of the real plan and the harness behavior it can
exercise. Read [Exercising the harness through a real plan](references/exercising-the-harness.md)
for the handoffs to inspect: plan intake, context selection, implementation,
capability delegation, reviews and completion. Use the paths the work actually
needs; there is no requirement to exercise every mechanism on every plan.

Check the selected version's CLI help and package scripts. Prefer actual command
behavior over stale examples. Run these examples from the harness package
directory with absolute paths. Set `RAMIFY_MODEL` to the selected provider/model;
omit `--model` only when intentionally using the configured default.

- **One engineer assignment:**

  ```sh
  npm run session -- --project /path/to/target-worktree \
    --module declared/module/path --prompt-file /path/to/assignment.txt \
    --agent pi --model "$RAMIFY_MODEL"
  ```

  Give a concrete goal, plan pointers, constraints and expected evidence. The
  command constructs an assignment from your prompt. The engineer normally
  writes only the assigned owner's ordinary contents; repeat
  `--write <project-relative-path>` for authorized additions, with a directory
  selecting one whole immediate child module or declared owned nested project.
  Guarded configuration still needs its own authority. A scope refusal may mean
  the assignment needs correction, not that the harness is broken. `--gate`
  performs in-place diagnosis, not a full run's committed configured audit.
  This exercises engineer equipment and submissions. You supply decomposition
  and follow-up; the session does not run architects, capability delegation,
  automatic reviews or committed gates.

- **A complete run, without the UI:**

  ```sh
  npm run real-session -- --project /path/to/target-worktree \
    --plan actual-plan-id --model "$RAMIFY_MODEL"
  ```

  This script starts `serve` and drives its command protocol. Always supply
  project and plan: their defaults select fixture work. Ignore its fixture-only
  `trial verify` suggestion; verify the real project with its own checks.

- **Engineer breakpoints on a full run:** host the target independently, then
  attach a short-lived client. The hosting process selects the model; attached
  clients cannot override it. Use the installed model supported by the selected
  adapter and its session preservation implementation.

  ```sh
  npm run serve -- --project "$TARGET" --agent pi --model "$RAMIFY_MODEL" --port 4180
  npm run --silent real-session -- --project "$TARGET" --plan "$PLAN" --server "$SERVER" --break before-agent:engineer --command-id start-1 --timeout-ms 3600000 --json
  ./node_modules/.bin/tsx src/main.ts debug inspect --server "$SERVER" --plan "$PLAN" --run "$RUN" --pause "$PAUSE" --json
  ./node_modules/.bin/tsx src/main.ts debug message --server "$SERVER" --plan "$PLAN" --run "$RUN" --pause "$PAUSE" --expected-revision 1 --command-id explain-1 --message-file /tmp/question.txt --json
  ./node_modules/.bin/tsx src/main.ts debug resume --server "$SERVER" --plan "$PLAN" --run "$RUN" --pause "$PAUSE" --expected-revision 2 --command-id resume-1 --message-file /tmp/proceed.txt --json
  ./node_modules/.bin/tsx src/main.ts debug wait --server "$SERVER" --plan "$PLAN" --run "$RUN" --after "$CURSOR" --json
  ```

  Take `RUN`, `PAUSE`, the expected revision and `CURSOR` from each result, as
  the README's scenario shows. The first pause follows planning and a passing
  readiness audit, so the launcher needs a long `--timeout-ms`; after a timeout,
  `debug wait` from the returned cursor instead of starting again.
  Supply any instruction not to edit or submit in the question itself. The
  engineer keeps ordinary tools, scope and submission authority. Follow-up
  messages use the returned current revision and retain the logical session.
  If chat remains pending, explicitly say “now implement” in the proceed file.
  An accepted result is held until resume and refuses replacement messages.
  Each new engineer operation, including repair or capability work, can pause
  again. Inspect current state before acting on a retained historical receipt.
  Waiting defaults to 20 minutes; raise `--timeout-ms` for a long wait.
  A timeout or client exit does not cancel the command. Retry the identical
  command ID and payload, or wait using the returned cursor. Server loss
  interrupts unfinished debug-enabled runs instead of replaying them.

- **Step/operator modes:** consult
  [Plan 30](../../../docs/plans/30-harness-steps/main-plan.md),
  [Plan 31](../../../docs/plans/31-operator-driver/main-plan.md) and the actual
  help/schema. Until then, use an adequate existing mode and name the limitation;
  implementing those plans is not a prerequisite to dogfooding.

## Advance the plan and repair problems

Assign meaningful work, inspect submissions and changes, verify, then choose
the next assignment. Use terminal output and files; UI freshness is unnecessary.
Direct agent work can fill an in-scope gap, with its contribution recorded.
At a consequential handoff, compare the actual input, the agent's decision and
the downstream result with the plan. Record concrete omissions, unnecessary
work or successful behavior, with evidence references. If you supply missing
context or make a decision yourself, name that intervention: useful delivery
can still expose a harness weakness.

The harness writes its own execution records. Respect its project lock: a live
server excludes a standalone session on that project. Stop and settle execution
before switching modes or editing its target files directly. When playing an
operator turn, use its active tools so the guard, hook and judge apply.

When progress fails or the result is wrong:

1. Inspect the relevant submission, guard/tool error, gate result and changed
   files. Check assignment scope and project setup before diagnosing a harness
   defect; distinguish implementation mistakes and inadequate instructions too.
2. For a harness defect, retain the failing command, invocation and relevant
   evidence in the working note. Make a narrow fix in the harness checkout,
   following its [testing specification](../../../docs/testing.spec.md): focused
   regression checks, scripted external operations in ordinary tests and
   registered witnesses for native claims. Preserve guards and validation.
3. Start the corrected harness process and retry the smallest useful assignment
   or available step, then continue the plan. Use a new invocation/run when
   required; exact replay is unnecessary. Never patch old execution records to
   force recovery. If the obstacle repeats without a new explanation or fix,
   stop the costly repetition and report the blocker with completed work intact.

## Review and hand off

Review the implementation against the plan and run the target project's required
verification on the retained candidate. Qualify harness fixes separately under
its configured audit discipline. Passing tests establish test health; the
responsible architect/agent judges semantic completion.

Report the deliverable, target branch/worktree and commits, direct versus harness
contributions, verification, remaining defects and harness-fix revisions. Link
execution evidence and record available elapsed time/usage/cost. An unrun check
or discarded attempt is not successful delivery. Retain useful work for normal
integration; discard only authorized work after preserving useful evidence.

Use the adjacent [postmortem skill](../ramify-agent-postmortem/SKILL.md) when
detailed retrospective analysis is needed, not after every assignment. Improve
this skill when requested and supported by actual use.
