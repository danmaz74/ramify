# Sealed-file edits: immediate feedback and justified saves

**Date:** 2026-09-24. **Status:** design analysis for a follow-up plan, not an
implemented check or an implementation plan.

The [CheckFinding architecture](../architecture/check-findings.md) defines the
shared issue lifecycle and work-item assessment used by this follow-up. Its
proposed findings child owns disposition rules; seal hooks and save policy
remain harness application behavior.

## Recommendation

Give sealed files a **conditional edit** path in the engineer's existing tool
loop. After each mutating tool call, compare the relevant sealed files with
their captured hashes and tell the engineer immediately when a seal changed.
Before it can propose iteration completion, the engineer must either restore
the file or use a harness tool to **save the current edit with a concrete
justification**. The save records the exact before and current hashes, the
diff, the agent's reason and its assignment, and creates one CheckFinding for
later assessment. A later edit invalidates that save until it is justified
again. The iteration gate independently checks the same sealed-file hashes and
the matching save record; it cannot infer permission from the agent's prose.

The save is **provisional**, not proof that the reason is good. The local
architect assesses saved sealed edits with the other CheckFindings at the
module work-item boundary, against the current tree and applicable authority.
It may accept, repair, revert or supersede the agent's judgment. Escalate to
the user only when accepting the edit would strongly contradict an explicit
requirement or principle, change an approved obligation, or cross another
person-held authority boundary. Quietly resolve ordinary cases; report
material choices and their fixes under the
[CheckFinding principles](../check-findings.principles.md).

This is an **overlay on assignment write scope**. A sealed file outside the
scope remains unwritable. A file reserved for the harness alone remains hard
denied. A justification must never widen scope or override that denial.

## Request and method

The question is how to notice an edit while the engineer can still respond,
permit a well-explained exception, and retain the resulting judgment for later
review. The proposed owner is `ramify-agent/harness`, which owns the run's
durable records and already composes the engineer's guard, post-mutation hook
and gate. No separate seal module is justified for the first implementation;
the shared finding lifecycle follows the CheckFinding architecture above.
The alternative is a separate sealed-file subsystem, but it would add a new
authority and recovery surface before the simple loop is proven.

This is entirely **ramify-agent behavior**. The Ramify toolkit owns its own
structural checks and project model; it must not import harness seal policy,
know about CheckFindings or make harness approval decisions. The harness may
continue to invoke `ramify check` as an independent project check.

The architect view was refreshed on 2026-09-24 at
`rev/1:bc4ab96a-fdcf-43fc-b9f7-d02b710797fb:1`; it reports nine modules,
measured production dependencies and measured test references. This analysis
read its `_meta.json`, root map and `harness/module.json` and followed the
`engineerEquipment`, `decideWrite` and `captureGuardedFiles` records into
source. The module-architect guidance read was `discovery.md`, `placement.md`,
`cognitive-decomposition.md` and `report.md`. Source examined in this checkout:
`subs/harness/src/work/{engineer-equipment,iterations,scope}.ts`,
`subs/harness/src/guard/write-guard.ts`,
`subs/harness/src/checks/gate.ts` and `subs/harness/src/run/service.ts`.
This was source and design inspection; no runtime behavior was changed or
tested.

## Current ramify-agent boundary

- [Engineer equipment](../../subs/harness/src/work/engineer-equipment.ts)
  already runs a hook after each settled mutating tool call and returns its
  text to the agent. For ordinary edit/write calls it knows the canonical
  target; for shell calls it records the changed paths as unknown. Its current
  hook runs a Ramify check, not a sealed-file check.
- [Write guard](../../subs/harness/src/guard/write-guard.ts) checks the
  captured assignment scope before ordinary writes. It hard-denies the
  harness-owned `ramify-agent.json` and tracked feature files; shell commands
  bypass this pre-write guard. Neither a seal nor a justification changes that
  policy today.
- [Assignment capture](../../subs/harness/src/work/iterations.ts) contains
  guarded path/hash pairs and architect-granted authorizations. The
  [gate](../../subs/harness/src/checks/gate.ts) compares captured hashes with
  the current tree; an unlisted guarded change fails. The captured set includes
  configuration, manifests, contract artifacts and scenario support files,
  as defined by [scope capture](../../subs/harness/src/work/scope.ts). These
  authorizations are issued with the assignment, before an engineer's edit;
  they are not a mechanism for justifying a change discovered during work.
- [Run service](../../subs/harness/src/run/service.ts) gives the engineer
  this equipment and preserves the gate's guarded-change evidence. Its line
  snapshots explicitly cannot see a shell command that changes and restores
  a file between snapshots.

The conditional seal should have a clear, explicit **seal set and baseline**,
captured at assignment or run start with path, content hash and governing
authority. The follow-up plan must decide which project-owned files enter that
set; “guarded” and “sealed” cannot silently be treated as synonyms. Existing
guarded files may be migrated one policy class at a time after their authority
is reviewed. Harness-owned generated files remain hard-denied even if a user
also calls them sealed.

## Studio precedent and what to take from it

The installed cucumber-viz `0.7.0` source has a sanctioned
`workflow.apply_justified_sealed_change` tool. Its
`server/mcp/mcp-tool-surface.ts:191-275` requires a path, expected current
hash, replacement content and structured justification. The
`core/runtime/sealed-files/sanctioned-sealed-write-service.ts:296-321,593-719,1908-1945`
checks the session and hashes, applies the replacement, journals the operation
and creates a linked, decision-pending CheckFinding. Studio labels the
committed result pending user review. Paths in this paragraph are relative to
the installed package's `src/domain-sub-apps/implementation-studio/`.

Its `core/runtime/sealed-files/sealed-write-policy.ts:27-45` defines a
pre-write refusal directing the agent to that tool, but inspection of the
installed source found no production caller for the policy. Ordinary edits
are instead caught by its later
`core/runtime/sealed-files/sealed-files-check.ts:475-512`
baseline-to-worktree comparison. Thus Studio demonstrates the justified-write
and linked-finding idea, but not the immediate ordinary-edit hook requested
here. ramify-agent should implement that hook directly and use the existing
local-architect reconciliation path instead of importing Studio's transaction,
waiver and default user-review workflow.

## Proposed flow

1. **Capture the seal.** The harness records the sealed path's canonical
   identity, baseline hash, authority and source revision. It also checks that
   the seal definition itself is within an authority-controlled location.
   Missing, moved and deleted sealed files are changes, not clean results.
2. **Detect and alert.** After every settled edit/write call, inspect its
   resolved target when it is sealed. After every shell call, rescan the
   bounded sealed set because the command has no trustworthy target list.
   Return a clear message before the next agent step: path, baseline/current
   state, whether it is still pending, and the two available actions—restore
   or save with justification. Record a detection observation even if the
   tool reported failure but left bytes changed.
3. **Save the current edit.** A harness-owned `save_sealed_edit` tool accepts
   the path, expected current hash and a concrete reason tied to the
   assignment and the seal's purpose. It verifies scope, seal membership,
   current bytes and baseline; it records the diff and hash pair in the run
   ledger, then creates or projects a CheckFinding linked to that saved
   change. The agent need not submit a second copy of the file merely to
   explain bytes already in the worktree. A retry with the same key should be
   idempotent; a different current hash requires a new save. If recording
   fails, the edit stays pending and cannot pass a gate.
4. **Gate the candidate.** The gate compares the current sealed set with its
   baseline. Every changed path must have a matching saved record for the
   exact current hash and the same assignment; restoration needs no save.
   Existing required tests, Ramify checks and scenarios still run under their
   own rules. A saved sealed edit is a documented exception, not a passing
   semantic review or an authority to change a frozen obligation.
5. **Assess the finding.** At module work-item reconciliation, the local
   architect checks whether the edit remains present and whether its reason
   holds against the current source and governing text. It can supersede the
   engineer's justification with a new judgment. If the edit was reverted,
   close the concern with a fresh hash comparison; if it changed again,
   reassess the new version. An unresolved finding cannot be silently
   interpreted as accepted merely because the iteration's mechanical gate
   passed.

An in-tool warning is a **prompt feedback loop**, not a claim to intercept
every filesystem write at the instant it occurs. For shell commands, the
earliest supported boundary is after the command settles. A command could
write and restore a sealed file before then, and an external writer could
race with the scan. The follow-up plan should either accept that bounded
coverage and label it honestly, or add filesystem isolation/interception if
the requirement is literally every transient write. A pre-write refusal for
known sealed targets could be added later, but it is not necessary for the
first version when the gate refuses unsaved final changes.

## Judgment, failure and authority rules

The hash change is an observation. The engineer's reason is a judgment; a
required field or well-formed citation cannot prove it is good. A save means
“this agent claims the exception is warranted,” not “the seal has been
waived.” The local architect's later assessment may agree or supersede it.
Only a governing owner can approve a change where the seal policy reserves
that decision, and strong conflicts follow the CheckFinding escalation rule.

The first version should validate useful structure—what necessitated the
edit, which assignment or requirement it serves, and why restoring it would
harm the work—without a synchronous second agent review on every write. This
preserves the parallel review model's latency benefit. A vague explanation
can be rejected by the local architect at reconciliation; the gate only proves
that a reason and exact edit were recorded. A policy that requires advance
approval must be modeled as a distinct hard authority rule, not disguised as
an ordinary conditional seal.

Missing seal baselines, unreadable files, failed scans or a stale hash must be
**not verified**, never “no sealed edits.” The final gate must fail or defer
under its explicit policy when it cannot establish whether a changed sealed
file has a matching save. Retain the original observation, save claim and
later disposition so the user can inspect them without receiving routine
notifications.

## Follow-up plan boundary

Write a separate implementation plan after the CheckFinding core and its
work-item reconciliation contract are specified. A small first delivery would
cover:

1. seal selection and revision-bound baseline capture, with a clear authority
   distinction from existing guarded and hard-denied files;
2. hook feedback for builtin edits and bounded post-shell scans, plus restart
   reconciliation from current bytes and durable records;
3. a justified-save tool and one durable finding per saved change, with
   idempotency and changed-hash invalidation;
4. gate verification and local-architect disposition at the work-item boundary;
5. acceptance cases for edit, deletion, restore, repeated edit, stale save,
   shell write, crash after write, missing baseline, out-of-scope target and
   hard-denied target.

The plan should measure hook and scan latency, how many saved edits survive to
work-item reconciliation, how often reasons are accepted or superseded, and
whether shell coverage is adequate. It should not create a broad seal registry,
general waiver engine or per-edit review agent before those cases show a need.

## Not verified

No seal list or runtime hook was implemented here. Studio inspection is of
the installed `0.7.0` source, not a live workflow trial. The choice of which
project files are sealed, their governing owner, and whether transient shell
writes must be prevented rather than detected at tool boundaries remain
follow-up plan decisions.
