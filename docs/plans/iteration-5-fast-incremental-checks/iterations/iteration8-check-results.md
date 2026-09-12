# Check Results for Iteration 8

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
  "reasoning": "The worker failure path contradicts the selected requirement to release test-owned resources on success and failure. No concrete contradiction was established for the importability principles; no unconfirmed API accessibility violation is reported.",
  "issues": [
    {
      "constraintPath": "docs/architecture/quick-testing.spec.md",
      "constraintId": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "severity": "important",
      "issue": "Worker termination and heap exhaustion leave compiler children unreaped. In subs/analysis/src/session-processes.ts:67-76, cleanup sends SIGKILL and polls process existence but cannot complete reaping after the worker exits. SessionHost.dispose() then clears child tracking even when cleanup rejects. The recorded iteration8-followup-lifecycle.json confirms three new failure cases retain compiler PIDs after teardown. This violates the requirement that each test release its owned sessions and resources on both success and failure.",
      "guidance": "Make compiler-child supervision survive worker failure and await actual child reaping before discarding lifecycle ownership. Keep the crash and heap-exhaustion assertions enabled, and ensure their teardown releases all owned processes even when assertions or disposal fail."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.87,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.55,
      "selectedBy": [
        "semantic"
      ]
    }
  ]
}
```
