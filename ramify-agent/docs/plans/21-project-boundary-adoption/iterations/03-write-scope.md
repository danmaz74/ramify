# Iteration 3: whole-owner authority

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 2.
**Owners:** harness scope, shared assignments, guards, recovery and prompts;
evidence only for required public ownership-query access.

## Goal

Permit the assigned owner's real contents while enforcing child and declared
tree boundaries in every execution path.

## Read first

[Contracts 1–3](../contracts.md#1-ownership-and-assignment-authority), the harness
scope specification, `work/{scope,assignment,iterations}.ts`,
`guard/{write-guard,resolve-contained-path}.ts`, shared assignment builders,
`capability/policy.ts`, `sessions/single.ts`, and generated evidence APIs.

## Deliverables

- Replace source-prefix ownership with revision-bound provider facts. Capture
  positive regions, excluded regions and the single `included` list of whole
  trees with reason/instructions, deriving each entry's kind and owner from
  the ownership answer and refusing any other directory. No separate
  child-subtree and project-tree inclusion records.
- Apply hard exclusions before every base/child/breaking/contract/extra-file
  allowance. Reuse real-target handling and validate absent paths via the
  provider. Handle current boundary changes without widening captured authority.
- Remove the new-run `outside-modules` purpose. Keep legitimate contract,
  conformance and fake-injection extras and explicit bootstrap authority.
- Apply the same rule at intercepted writes and candidate diff validation.
  Preserve guarded configuration and harness-only files; include applicable
  nested configuration in authorization checks.
- Carry included-tree instructions into ordinary, capability and standalone
  briefs. Keep source cwd and separate testing API views.
- Advance the common run-policy once, refusing a record under any earlier
  policy outright by version before any mutation and removing the historical
  decoders. Update capability policy and all new-run call sites together.
- Update the nonprotected autonomous-loop architecture, READMEs and prompts
  whose old wording treated child directories as unconditional write roots.

## Verification

PB3-S01–S09, PB3-P04 and PB3-R01. Extend:

- `subs/harness/src/tests/write-guard.test.ts`
- `subs/harness/src/tests/iterations.test.ts`
- `subs/harness/src/tests/capability-assignments.test.ts`
- `subs/harness/src/tests/contract-injection-scope.test.ts`
- `subs/harness/src/tests/assignment-source-evidence.test.ts`
- `subs/harness/src/tests/capability-historical-resume.test.ts`
- `subs/harness/src/tests/scratch.test.ts`
- `subs/harness/src/tests/single-session.test.ts`

F1 uses real provider placement data; scripted tests cover deterministic guard
and recovery branches. Include an excluded tree inside an included child,
symlink/absent targets, declaration changes during an invocation and a shell
write caught at candidate validation. Run type-check/check:self.

## Exit criteria

Every entry path uses the new shared scope. No positive-root or extra-file
shortcut opens an excluded tree. Old-policy records are refused by version
before any mutation and no decoder for them remains. Scratch invariants still pass.

## Handoff

`iteration3-results.md`, record/policy identities, old-policy refusal
receipt, F1 guard evidence and protected-file comparison.
