# Dan's to-do

What only Dan can decide or do, collected on 2026-09-21. Work that an agent
can carry out without a decision is in [todo.md](todo.md). An item leaves this
list when it is decided; the decision goes where it belongs (a plan, the
glossary, a commit).

## Blocking

### 1. Let the token be removed from history, and do not push until then

Commit `2d280f6` holds a Claude Code session token in recorded trial files. It
is on three branches: `main`, `ramify-agent` and
`feat/plan8-signature-companions`. The values are being removed from the
current files, but history keeps them.

- [ ] Do not push `main` or either branch.
- [ ] Say when no other session is working on those branches. The rewrite has
      to cover all three at once and would break a session working on one.
- [ ] Afterwards, consider whether the token should be treated as exposed
      anyway. It is a session token and may already have expired.

### 2. Review the three agent results when they land

- [ ] **Environment recording.** Accept the allowlist for child processes, and
      decide whether the engineer's `shell` tool keeps a broader environment
      for a project's own tooling.
- [ ] **`extend` removed** (done, uncommitted). Accept:
      the flag `changesExistingSymbols` on decisions and hypotheses; no record
      version bump, because no record on disk says `extend`; the flag informs
      and drives nothing. Decide: bump the three prompt package versions or
      leave them at `/1`; should the flag require a contract iteration to
      read the existing consumers, or feed `outline.breakingChanges`; should
      the registry entry carry it; reword the two "extend" lines in
      `additional-to-evaluate.md`; leave Plan 3's iteration records, which
      still list `extend` as evidence, as history.
- [ ] **Hook fixes and gate briefings.** Read the new texts a model will see.
      Decide whether a completion may proceed to the gate when the fresh
      Ramify check at `completion-proposed` could not run.

## Decisions on plans

### 3. Plan 6, role-specific prompts

[Plan 6](plans/06-role-specific-prompts/main-plan.md).

- [ ] D2: a condensed decomposition text of about 1.5 kB for the local
      architect only, drafted for review in iteration 1.
- [ ] D3: keep the prompt manifest's `skill` field and record `null`, rather
      than remove a protocol field.
- [ ] Approve the plan, or say what to change. Its real run at the end costs
      tokens on Sol at high thinking.

### 4. Plan 2E, self-sufficient diagnostics (toolkit)

[Plan 2E](../../docs/plans/iteration-2e-diagnostic-messages/main-plan.md),
awaiting contract review.

- [ ] RD-1: may a finding carry a proposed declaration, in its own field under
      the label "Proposed declaration (not an existing permission)", only when
      one change to an existing statement would satisfy the rule?
- [ ] RD-2: finding identity from structured facts instead of the message.
      Every retained finding shows as new once after the upgrade.
- [ ] RD-3: keep `ramify.analysis/1` and `ramify.check/1`.
- [ ] RD-4: one catalogue document, a full-text test per owner, and a script
      that fails on a code without an entry.
- [ ] RD-5: remove the two unreachable codes.
- [ ] The roadmap row for Plan 2E is uncommitted, in a file another session is
      also editing.

### 5. The signature-companions error (toolkit, another session's plan)

- [ ] Define "required companions" for a type another module owns. It decides
      how often an engineer cannot fix the error from its own declaration.
- [ ] Say when it ships. The agent then needs: a fixture update
      (`collection-review` hides `ToolResult` and `ToolInputSchema` on
      purpose, and the reference project has at least six such cases), a
      rerun of `npm run check:self` under the new rule, and the removal of the
      "incomplete exposure" wording from the engineer prompt and the hook.

### 6. Plan 3's open completion decisions

- [ ] Module depth 4 or 5.
- [ ] The 28 producerless union values.
- [ ] The root module's broad scope.
- [ ] Where the Cucumber gap is recorded.
- [ ] The review verdict.
- [ ] Plan 4 is blocked until Plan 3 is complete and merged. Plan 3 is merged
      into local `main`; say whether Plan 4 may start.

## Smaller questions

- [ ] **Capability graph checks.** Start the coherence checks on the initial
      analysis now (no unknown name, no cycle, nothing depends on a top-level
      capability), presented as checks on a forecast and never as a guarantee?
- [ ] **Capability registry (post-MVP).** Should the initial architect also
      record an *expected* entry point for a new capability, marked as a
      forecast? It is left out of the
      [recorded candidate](future/README.md#plan-scoped-capability-registry-with-entry-points).
- [ ] **Glossary.** Add "external capability", which hypothesis 2 defines and
      the glossary does not?
- [ ] **The T2 recording.** Approve one full rerun of the `review-notes` plan
      on `openai-codex/gpt-5.6-sol:high` once Plan 6 and the Ramify changes
      are in. It becomes the recording for the replay fake.

## Housekeeping

- [ ] Commit, or say "commit": `glossary.md`, `future/README.md`, `todo.md`,
      this file, the Plan 6 directory and two index lines in `README.md`.
- [ ] Other sessions' uncommitted work in the same checkout: the toolkit
      roadmap, the Plan 2D and Plan 3 successor directories, and the Plan 8
      directory.
