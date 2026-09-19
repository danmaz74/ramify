# Architect prompt package

> **Superseded** on 2026-09-19 by the [harness principles](../../../harness.principles.md) and the
> [harness architecture](../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../README.md) for what may be reused.

**Plan:** [Pi architectural planning MVP](main-plan.md).
**Owner:** Iteration 2, in the standalone harness application.
**Status:** authoring and validation requirements; production prompts have not
been written or tried yet.

## Deliverable

Author and version the complete prompt package that turns a captured plan into
the [architectural artifact](architecture-artifact.md). Loading the existing
module-architect skill alone does not supply this product's task decomposition,
structured submission, correction and continuation instructions.

Proposed files in the new application's prompt directory:

| Prompt | Responsibility |
| --- | --- |
| `architect-role.md` | Standing role, read-only operation, evidence discipline, autonomous routine decisions and the substantial-change boundary |
| `decompose-plan.md` | Captured request/constraints, project and evidence references, decomposition outcomes and completion procedure |
| `repair-output.md` | Correct a rejected candidate using exact schema/reference diagnostics while preserving requirements and accepted decisions |
| `continue-planning.md` | Continue after interruption or a decision using recorded work, current evidence and an explicit continuation reason |

Also author descriptions and result messages for the architect's custom tools.
Their schemas remain canonical in code; prompts do not maintain a second schema
in prose. These templates support one architect workflow and do not require a
separate agent or session per stage.

## Required decomposition instructions

The initial task directs the architect to:

1. Extract outcomes and constraints with source references; distinguish explicit
   requirements from assumptions.
2. Discover relevant existing behavior before proposing new behavior. Check
   access for the intended requester, keeping ordinary/testing API areas and
   unknown evidence distinct.
3. Identify affected owners, responsibilities, qualitative work weight and any
   justified new module. Consider retaining the existing structure; splitting
   work does not itself require splitting modules.
4. Choose manageable exact-owner or subtree scopes with explicit read/write and
   supporting paths. Use revision-matched Plan 2C module summaries and harness
   scope-size projections as evidence. Preserve bucket/coverage limits; bytes
   are not tokens or actual reads. Explain scope choices instead of mechanically making one
   task per module or one module per feature.
5. Identify cross-scope agreements, provider/contract work and dependencies.
   Schedule bounded discovery for unresolved contracts instead of inventing them.
6. Cover every required outcome with work and observable acceptance, including
   integration. Assign work to make unresolved checks executable. Describe
   future work without executing it.
7. Assess assumptions, evidence limits, alternatives and cumulative impact on
   requirements. Resolve ordinary uncertainty automatically; request a decision
   only for a necessary substantial change.
8. Submit the structured artifact and address validation feedback. A prose
   answer or an unvalidated draft is not completion.

The [measurement/KPI contract](../../../measurements-and-kpis.md) owns the sums and
ratios in ramify-agent. The architect never asks Ramify to record session or
agent activity and never invents sizes for proposed modules.

Request concise rationale and cited evidence for choices. Do not request hidden
reasoning or fabricated numerical estimates.

## Skill reuse and report adaptation

Use an explicitly configured, versioned copy of the existing
[module-architect skill](../../../../../.claude/skills/module-architect/SKILL.md),
including its workflows and cognitive-decomposition guidance. Load references
progressively. Do not fork its architectural rules into independently maintained
prompts or autoload unrelated user extensions/skills. Preserve applicable
project instructions and linked instructions.

The skill's generic report uses Markdown headings. The harness instructions
must explicitly adapt that output to structured submission while retaining the
substantive obligations:

| Report content | Canonical destination |
| --- | --- |
| Request/interpretation | Artifact requirements and summary |
| Method, guidance/source reads and verification performed | Job input/resource manifest and observed session/tool evidence |
| Cited facts | Evidence references on reuse, module and seam findings |
| Recommendation, alternatives and proposed changes | Summary and module/seam entries, including rationale and alternatives where applicable |
| Unverified claims and limits | Assumptions and evidence limits |
| Bounded next steps | Work packages, dependencies and acceptance |

The effective instructions must not demand incompatible Markdown-only final
output and structured tool submission. Author and test this adaptation in the
harness while keeping the shared Ramify skill general-purpose. No separately
maintained report duplicates the architecture artifact.

## Tools and continuation

Describe `submit_architecture` as candidate submission: the harness assigns
provenance, validates, publishes and marks completion. Rejection returns precise
diagnostics for correction. The architect cannot weaken requirements or claim
checks passed merely to satisfy the validator.

Describe `propose_plan_change` with discovery evidence, the original requirement,
proposed change, consequences and alternatives. Calling it does not approve a
proposal. Continuation must distinguish acceptance of that exact proposal from
a request to preserve the original requirements.

The architect has no general shell. Provide a narrow harness-owned
`request_discovery_view` tool for refreshing Ramify evidence for a known
requester/source area when initial materialization is insufficient. Its
instructions name supported requests and returned revision/coverage; the
harness validates targets and performs only that materialization. Never prompt
the architect to invoke an unavailable shell or edit generated views. This
internal pi tool is not a new [client command](client-protocol.md).

Interruption recovery includes the latest valid candidate/proposal, relevant
session/handoff references, completed discovery and actual outstanding work.
Do not assume an interrupted submission succeeded. Use the main plan's bounded
recovery; routine failures never require a person to author briefs or repair JSON.

## Assembly and verification

Assemble effective role instructions and task messages from the templates,
applicable project instructions, selected skill resources, captured request,
evidence paths and continuation state. Record prompt versions/content hashes,
resource paths/hashes, enabled tool definitions and effective instructions sent
to pi. Conversation messages remain in the native session record, not a second
transcript in the job event feed. Record referenced resources when actually read.

Deterministic checks verify required template inputs, context/tool selection
and continuation assembly for validation errors, approval, rejection and
interruption. They cannot establish architectural judgment quality.

Run two contrasting small live pi fixtures: an existing reusable provider
operation, and a missing operation requiring provider/consumer work. Assess
reuse/access evidence, responsibility placement, scope rationale, dependencies,
preserved requirements and acceptance coverage against known fixture facts.
Use a written rubric, not exact generated wording or task counts. Include an
incomplete-evidence condition and require explicit uncertainty instead of
fabricated absence or availability. Retain prompt versions and resulting
artifacts; revise and rerun when prompts fail these obligations.

PW25 covers complete prompt assembly/provenance; PW26 covers live decomposition
evidence. Both belong to iteration 2. Engineering/execution prompts belong to
the separate implementation-runner plan.
