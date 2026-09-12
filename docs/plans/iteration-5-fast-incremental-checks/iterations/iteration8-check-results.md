# Check Results for Iteration 8

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "One concrete teardown contradiction remains in the new heap-exhaustion test. No concrete contradiction with the importability principles was established.",
  "issues": [
    {
      "constraintPath": "docs/architecture/quick-testing.spec.md",
      "constraintId": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "severity": "important",
      "issue": "In subs/analysis/src/tests/session-worker.test.ts:287-301, if the 16 MiB session unexpectedly opens, the expected 'reported' assertion throws, but finally only calls observation.cleanup(). That helper restores spies and listeners; it neither disposes the opened session nor terminates its worker. The enclosing fixture only removes temporary files. This failure path leaves the session, supervisor and compiler running, contradicting the requirement that tests release owned resources on both success and failure.",
      "guidance": "Make the test's finally block dispose any successfully opened session and await worker termination, with observation.cleanup() in a nested finally so listeners are restored even when disposal rejects. Preserve the existing heap-failure assertions."
    }
  ],
  "selectedConstraints": [
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
      "score": 0.54,
      "selectedBy": [
        "semantic"
      ]
    }
  ]
}
```
