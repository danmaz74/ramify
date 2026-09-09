# Check Results for Iteration 5

## Summary
- **Static Analysis**: PASSED
- **Scope Review**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "Reviewed all five selected constraints. Isolated probes confirmed three contradictions in discovery exclusions, failure reporting, and README metadata extraction.",
  "issues": [
    {
      "constraintPath": "docs/model/module-description.principles.md",
      "constraintId": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "In subs/analysis/subs/project/src/inventory.ts:100-102, discovery exclusions are bypassed beneath src/ and subs/. A probe with outDir set to src/generated inventories its generated JavaScript as application source; another inventories src/node_modules/lib/index.ts and its package.json as owned files. This contradicts the requirement that application source remain outside dependency and generated-output discovery exclusions.",
      "guidance": "Apply dependency and generated-output discovery exclusions within source and child containers too. Keep these exclusions distinct from ordinary compiler include/exclude selection, which must not hide owned implementation or tests."
    },
    {
      "constraintPath": "docs/architecture/cli-invocation.spec.md",
      "constraintId": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "severity": "important",
      "issue": "Collected findings disappear when acquisition subsequently fails. inventoryProject keeps issues locally until completion, while read-project.ts:54-55 returns only the terminal error. A probe that discovers src/module.ramify before encountering an oversized source file returns only resource-limit, losing the already detected description-in-src error. The invocation contract requires findings obtained before an execution failure to be retained.",
      "guidance": "Preserve collected diagnostics and available partial inventory when acquisition fails. Include them alongside the terminal error while retaining the incomplete outcome."
    },
    {
      "constraintPath": "docs/model/module-description.principles.md",
      "constraintId": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "In subs/analysis/subs/project/src/purpose.ts:28-31, a heading suppresses every following line until a blank line. For '# Title\\nActual purpose.\\n', readPurpose returns no-paragraph; adding a later separated paragraph makes it return that later paragraph. The first paragraph immediately following an ATX heading is valid top-level prose and must supply the purpose.",
      "guidance": "Track Markdown block boundaries so headings do not suppress subsequent paragraphs. Add a focused case with prose immediately following a heading and assert that the first paragraph is selected."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/cli-invocation.spec.md",
      "id": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.9,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.6,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.78,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/module-description.principles.md",
      "id": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.99,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/typescript-source-interpretation.principles.md",
      "id": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.73,
      "selectedBy": [
        "semantic"
      ]
    }
  ]
}
```
