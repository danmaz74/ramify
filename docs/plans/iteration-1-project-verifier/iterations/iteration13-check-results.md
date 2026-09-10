# Check Results for Iteration 13

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "Reviewed all four constraints. Final declaration and package-entry validation passed. A focused compiled-CLI probe confirmed one remaining interruption contradiction. No implementation or constraint files were edited.",
  "issues": [
    {
      "constraintPath": "docs/architecture/cli-invocation.spec.md",
      "constraintId": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "severity": "important",
      "issue": "src/cli-entry.ts:22-33 can yield after writing the complete JSON document but before its trailing newline, while published remains false. A real-session subprocess probe aligned the closing brace with the 49,152-byte chunk boundary and sent SIGINT immediately after that native write. The CLI emitted fully parseable JSON with execution=completed, check=passed and summary.complete=true, then exited 130 with 'Interrupted; no result claimed.' The uninterrupted control exited 0. Exit 130 therefore still accompanies a completed result.",
      "guidance": "Commit publication when the JSON document itself is complete, before yielding to write trailing whitespace. Add a subprocess regression with the closing brace exactly at a chunk boundary, alongside cancellation before document completion and uninterrupted controls."
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
