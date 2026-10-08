# Iteration 11: integration acceptance and handoff

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** iteration 10 and every
earlier acceptance row passing.
**Owners:** coordinator across the agent's affected owners; provider defects
remain provider-owned repairs.

## Goal

Demonstrate the migration through real provider-backed harness workflows and
publish an exact completion receipt.

## Read first

[Acceptance matrix](../acceptance.md), [execution](../execution.md), all iteration
receipts, final provider handoffs, the protected-file inventory and the actual
committed audit configuration.

## Deliverables

- Run F5 through ordinary and capability assignments, failure/repair, explicit
  project-tree inclusion, suspended consumer resumption and standalone work.
  Agents may be scripted; use installed real providers and production wiring.
- Verify exact scope restoration, Plan 20 scratch lifetime, new-policy recovery
  and refusal of incompatible historical resume before mutations.
- Exercise full nested acceptance with a failing nested project and then its
  repaired commit. Preserve both reports; a passing rerun does not erase failure.
- Exercise architect registration, done reporting with/without `where`, audit
  pass without declaration, failed audit with a retained declaration,
  incomplete-request rejection, bounded unfinished work and interruption/reassessment.
  Demonstrate local delegated handback leaving broader consumer acceptance open.
- Verify browser/brief projection of architect judgments, outstanding reports
  and optional `where` separately from path dispositions and per-project
  executed/reused/unrun status at desktop and narrow widths.
- Reconcile every acceptance row with its evidence. Search current source and
  prompts for obsolete `outside-modules`, old view formats, package-walk
  discovery, warning suppression, forced reuse rejection, pass-driven scenario
  promotion, automatic withdrawal,
  causal diagnoses, cited-file/owner coverage gates and historical readers;
  only the version refusal and its tests may name an old policy.
- Review protected-file changes independently. Apply only exact authorized
  patches; no completion claim is inferred from changed status prose.

## Verification

PB3-S08, PB3-R01–R04 and final confirmation of all matrix rows. Run explicit
affected lifecycle suites, including `iterations-integration.test.ts`,
`capability-assignments.test.ts`, `capability-historical-resume.test.ts`,
`scenario-states.test.ts`,
`capability-acceptance.integration.test.ts`,
`single-session-integration.test.ts`, `scratch-setup.test.ts` and the
new provider conformance fixture as needed. Run type-check/check:self.
Do not repeat unchanged checks merely to accumulate evidence.

On the clean final commit run the released audit CLI with
`--project-root ramify-agent --cwd . --full --nested --json` from the repository
root. Inspect the combined verdict, expected-file completeness, nested discovery
and every required project result. If evidence is reused, retain the provider's
applicability proof and do not claim fresh execution. A lock-blocked check is
unrun and must be rerun on that same clean source.

## Exit criteria

The architect owns requirement judgments; the harness trusts their authorized
reports and performs only structural reporting/workflow checks. Raw audit health
remains separate, with final verification consisting of the full configured audit.

All required acceptance rows pass, the full final gate is applicable and passing,
protected changes match authorization, and no provider prerequisite is unresolved.
Plan 18's historical live-trial gaps remain separately described; this migration
does not claim a new real-Pi trial.

## Handoff

Write `final-results.md` with agent/source identity, exact package versions and
integrities, provider/source/report refs, case-to-evidence table, nested-project
results, browser artifacts, known limitations and the protected-file review.
Mark the plan and manifest complete only after these conditions hold. Commit
the receipt, establish applicable evidence for the delivered commit under the
provider's rules, push and verify branch synchronization.
