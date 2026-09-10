# Check Results for Iteration 13

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
  "reasoning": "Reviewed all four selected constraints. Final declaration and package-entry validation passed. A real subprocess probe confirmed one interruption contradiction introduced by the diff. No implementation or constraint files were edited.",
  "issues": [
    {
      "constraintPath": "docs/architecture/cli-invocation.spec.md",
      "constraintId": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "severity": "important",
      "issue": "src/cli-entry.ts:32-35 waits for pending stdout writes before handling interruption, then changes the exit to 130 after publishing the completed result. In a real compiled-CLI probe, SIGINT during a backpressured JSON write left the process waiting until stdout resumed; it then emitted a complete 732,996-byte report with execution=completed, check=passed and summary.complete=true, while exiting 130 and printing 'Interrupted; no result claimed.' The uninterrupted control exited 0. This contradicts the requirement that exit 130 claims no result.",
      "guidance": "Coordinate interruption with output publication: make pending writes cancellable and prevent exit 130 from accompanying a completed report. Add a subprocess regression that sends SIGINT while stdout is backpressured and verifies termination and consistent output/exit behavior."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/cli-invocation.spec.md",
      "id": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 1,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.94,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.86,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/module-description.principles.md",
      "id": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.93,
      "selectedBy": [
        "semantic"
      ]
    }
  ]
}
```
