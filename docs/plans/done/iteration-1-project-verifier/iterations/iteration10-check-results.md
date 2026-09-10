# Check Results for Iteration 10

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "Reviewed all four selected constraints. Nine focused tests pass, but a compiler-backed probe confirms one resolution contradiction introduced by the diff. No other concrete contradictions were established. No repository files were edited.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "In subs/analysis/subs/typescript/src/resolution.ts:131, the new .jsx substitution list places .js before .jsx and changes relative-import resolution incorrectly. Reproduced with src/use.ts importing './init.jsx', plain scripts at both src/init.js and src/init.jsx, and no TypeScript counterparts. With allowJs/checkJs enabled, jsx: 'preserve', and bundler resolution, TypeScript 7.0.2 exits successfully and its trace resolves src/init.jsx. The real analysis pipeline instead targets src/init.js and reports a checked, allowed symbol-free load with empty coverage. The previous .jsx substitution list selected src/init.jsx.",
      "guidance": "Preserve the compiler's priority between .jsx and .js candidates while retaining the verified TypeScript substitutions and exact paths-target behavior. Add a compiler-trace regression for a relative .jsx import with both JavaScript files present and no TypeScript counterpart, alongside the existing controls. If faithful resolution cannot be established, report unresolved coverage instead of checking a guessed target."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.85,
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
      "score": 0.64,
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
