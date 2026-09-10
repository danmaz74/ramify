# Check Results for Iteration 5

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "Reviewed all five selected constraints. Focused probes confirm the three previously reported cases are corrected, but two concrete contradictions remain in generated-output discovery and README purpose extraction.",
  "issues": [
    {
      "constraintPath": "docs/model/module-description.principles.md",
      "constraintId": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/project/src/inventory.ts:16-24 excludes outDir but ignores declarationDir. An isolated fixture successfully compiled declarations into src/generated using declarationDir and explicitly excluded that directory from compiler selection. readProject nevertheless inventoried the generated src/generated/value.d.ts as owned application source and accepted an expose-src reference to it. This contradicts the requirement that generated outputs remain outside application discovery and cannot be referenced as application-owned exports.",
      "guidance": "Include configured declaration output directories in discovery exclusions and reject exposure references into them. Add a focused case using actual emitted declarations while retaining the rule that ordinary compiler exclusions cannot hide owned implementation or tests."
    },
    {
      "constraintPath": "docs/model/module-description.principles.md",
      "constraintId": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/project/src/purpose.ts:29-32 keeps excludedBlock active after an indented code block ends. For README text '    const code = 1;\\nPurpose.\\n\\nLater.\\n', both readPurpose and public readProject return 'Later.' instead of the first top-level paragraph, 'Purpose.'. An independent Markdown parser confirmed that the input contains a code block followed by those two separate paragraphs.",
      "guidance": "End the indented-code exclusion when an unindented paragraph begins. Add a focused regression asserting that prose immediately following the code block supplies the purpose without requiring a blank separator."
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
      "score": 0.75,
      "selectedBy": [
        "semantic"
      ]
    }
  ]
}
```
