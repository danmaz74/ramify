# Check Results for Iteration 10

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
  "reasoning": "The new README-purpose validator contradicts the required paragraph-selection rule. No concrete contradictions were identified against the other selected constraints.",
  "issues": [
    {
      "constraintPath": "docs/model/module-description.principles.md",
      "constraintId": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "In scripts/validate-final-contracts.ts, assertOwner selects the first blank-line-separated block that does not start with '#'. A README containing a list, table or fenced code block before its purpose therefore fails validation even when its first top-level prose paragraph matches the review. The constraint explicitly requires skipping those non-prose blocks.",
      "guidance": "Extract the first top-level prose paragraph using the README metadata rules, convert it to plain text, and then compare it with the reviewed purpose. Cover introductory lists, tables and code blocks in the validator tests."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/cli-invocation.spec.md",
      "id": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.84,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.91,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.94,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/module-description.principles.md",
      "id": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.98,
      "selectedBy": [
        "semantic"
      ]
    }
  ]
}
```
