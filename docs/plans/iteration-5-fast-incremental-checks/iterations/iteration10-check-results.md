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
  "reasoning": "Reviewed both selected constraints. Focused reproductions through the real quick service confirmed two contradictions in the new changed-check handler. No files were edited.",
  "issues": [
    {
      "constraintPath": "docs/architecture/cli-invocation.spec.md",
      "constraintId": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "severity": "important",
      "issue": "subs/cli/src/changed-command.ts:144-154 discards findings already received when cleanup rejects. After the real service returned an invalid-name diagnostic, injecting connection loss during closeContext reply delivery produced exit 2 with findings: []. This contradicts the requirement to retain findings obtained before a failure.",
      "guidance": "Preserve the received result across cleanup failures and retain its diagnostics in the single output document. Add a regression for connection loss during closeContext after a finding-bearing check reply."
    },
    {
      "constraintPath": "docs/architecture/quick-testing.spec.md",
      "constraintId": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "severity": "important",
      "issue": "subs/cli/src/changed-command.ts:70-77 checks cancellation after acquiring a connection but before entering its cleanup try/finally. Cancelling as quick.connect completes makes runCli return 130 without calling connection.close; daemon status still reports one connection. This contradicts the cancellation and resource-release requirements.",
      "guidance": "Ensure every acquired connection enters cleanup protection before checking cancellation. Add a regression that cancels at connection completion and verifies exit 130, no result document, and zero remaining connections."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/cli-invocation.spec.md",
      "id": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.99,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.96,
      "selectedBy": [
        "semantic"
      ]
    }
  ]
}
```
