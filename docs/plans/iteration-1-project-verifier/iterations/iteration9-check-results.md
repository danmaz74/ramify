# Check Results for Iteration 9

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "Reviewed all four selected constraints. The three focused remediation tests pass, but a compiler-backed probe confirms one remaining resolution contradiction. No additional contradictions were established. No repository files were edited.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "The script fallback in subs/analysis/subs/typescript/src/resolution.ts:130-145 omits .ts substitution for .jsx and can select the wrong alias target. Reproduced with paths: { \"@init\": [\"./src/init.jsx\", \"./src/tests/init.ts\"] }, two plain scripts at src/init.ts and src/tests/init.ts, and src/use.ts importing '@init'. The pinned compiler exits successfully and resolves src/init.ts. The adapter instead selects src/tests/init.ts with empty coverage, and evaluateAccesses reports a definite testing-origin denial. This contradicts configured TypeScript resolution and applies isolation to a source the import does not target.",
      "guidance": "Match the pinned compiler's extension substitution and paths-candidate priority. Do not advance to a later substitution when the compiler resolves an earlier candidate. Add a regression comparing compiler resolution and the real evaluation for this ordinary/testing script pair, retaining the passing .js variant as a positive control. Report unresolved coverage when the fallback cannot establish a faithful target."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.67,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.99,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/module-description.principles.md",
      "id": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.86,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/typescript-source-interpretation.principles.md",
      "id": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 1,
      "selectedBy": [
        "semantic"
      ]
    }
  ]
}
```
