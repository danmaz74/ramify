# Review responses: authority, scheduling and execution readiness

**Date:** 2026-09-28. This records changes to [Plan 16](main-plan.md), not
implementation results. All twelve points warranted an amendment; point 5
clarifies an implicit completion distinction rather than reversing the design.

| Point | Assessment and resolution | Plan locations / acceptance |
| --- | --- | --- |
| 1. B's existing authority | Valid. Defer B's independent entry; preserve its goal and prior decisions. X owns temporary coordination, its own assignment sequence and task limit. B replans against intervening changes before it resumes. | Main scheduling section; appendix scheduling/limits; iterations 1–5; CA28–CA29 |
| 2. Work-item completion gate | Valid. New-run completion is refused for unresolved requests or tasks lacking current accepted handback, checked at submission and completion commit. Ordinary completion gates still apply. | Appendix state table/predicate; iterations 4 and 7; CA31 |
| 3. A's unsubmitted source | Valid. Capture and retain it as a provisional candidate, including untracked source and index state. Attribute each later mutation from its actual starting tree; whole-tree gates include inherited source. | Main failure handling; appendix capture/gate semantics; iterations 2–5; CA30 |
| 4. Run scheduling | Valid. Use one durable depth-first stack; unrelated frontier work never proceeds while X is active or waiting. Nested tasks return to their parent before frontier work resumes. | Main/appendix scheduling; iterations 2 and 5; strengthened CA03/CA19/CA20 and CA32 |
| 5. Live exit ambiguity | Clarification required. CA27 is successful delivery; CA35 is failure handling. An incomplete attempt can prove only the latter. Iteration 7 and the plan stay incomplete until both gates and required audit/browser evidence pass. | Main acceptance; iteration 7; CA27 and CA35 |
| 6. Pre-rollout entry | Valid. Harness-owned tests inject a captured workflow policy and internal factory into the actual service. Production does not register it until rollout and public policy injection is refused. | Main implementation boundary; iterations 2 and 7; CA33 |
| 7. Source paths | Valid. Correct all inventory paths to project-relative paths, including agent, Pi, ledger and plan-evidence under `subs/harness/subs/`. | Main behavior/source table |
| 8. Model amendments | Valid. Name the consumer-return, protocol-outcomes and ancestor integration sections as well as the other affected principles. Define current contract/conformance meanings and historical provider obligation; preserve non-functional obligations. | [Model amendments](model-amendments.md); iterations 1 and 7 |
| 9. Capability terminology | Valid distinction needed. Preserve capability's existing meaning; define request/task/plan/architect separately. Keep task IDs separate from plan capability and module identities and expose explicit relations only. | Appendix terminology; model amendments; iterations 1 and 6; CA34 |
| 10. Iteration convention | Valid documentation gap. Keep existing descriptive brief filenames/manifest, state that convention, add an index and require `iterationN-results.md` reports in `iterations/`. | [Iteration index](iterations/README.md) and every handoff |
| 11. Fixture ownership | Valid. Iteration 2 creates A/B/D/P and nested-C projects under the two named `ramify-agent/fixtures/` directories; harness-owned helpers copy them to temporary workspaces. | Iteration 2 and acceptance fixture definition |
| 12. Dirty prompt precursor | Valid execution prerequisite. Resolve version-4 procedure, corresponding package bump and test separately; record precursor/disposition and a clean committed execution baseline. Existing source edits are preserved by this documentation review. | Main implementation prerequisite; iterations 1 and 7 |

Validation of this revision covers document links, iteration/result conventions,
source path existence, case coverage and consistency. No runtime test, source
commit or discard of the precursor edits was performed.
