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
  "reasoning": "Reviewed all four selected constraints. The two compiler regression cases and matrix-registration test pass, but an additional compiler-backed probe confirms one resolution contradiction introduced by the diff. No other concrete contradictions were established. No repository files were edited.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "In subs/analysis/subs/typescript/src/resolution.ts:131, adding .ts before .jsx causes the script fallback to override an existing exact paths target. Reproduced with paths: { \"@init\": [\"./src/init.jsx\"] }, plain scripts at both src/init.jsx and src/init.ts, and src/use.ts importing '@init'. With allowJs/checkJs enabled, jsx: 'preserve', and bundler resolution, the pinned compiler exits successfully and resolves src/init.jsx. The real analysis pipeline instead selects src/init.ts and reports a checked, allowed symbol-free load with empty coverage. Previously, this fixture reached the existing .jsx candidate. The implementation therefore reports a different accessed source from the compiler-selected target.",
      "guidance": "Preserve the compiler's exact-file priority for paths substitutions before applying extension substitution, while retaining the correct behavior when the exact target is absent. Prefer compiler-established resolution where available; report unresolved coverage when a faithful target cannot be established. Add a regression with both init.jsx and init.ts present that compares the compiler trace with the analysis target, alongside the existing absent-.jsx controls."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.88,
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
      "score": 0.74,
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
