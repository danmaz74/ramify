# Check Results for Iteration 9

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
  "reasoning": "Reviewed all four selected constraints and reproduced two source-interpretation contradictions. No additional contradictions were established. No repository files were edited.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "In subs/analysis/subs/typescript/src/accesses.ts:79-83, a compiler diagnostic anywhere within an import statement makes every selected binding unresolved. Reproduced with `import { safe as clash, bad, safe as clash }`: duplicate-identifier diagnostics concern `clash`, but also suppress the independently resolvable private `bad` binding. The real evaluation loses its previously reported `not-visible` denial and returns no diagnostics. This contradicts individual binding checks and preservation of definite violations alongside unverifiable portions.",
      "guidance": "Determine which selection or target each compiler diagnostic actually blocks. Preserve resolution and model evaluation for unaffected bindings. Add a regression asserting that duplicate local aliases produce coverage notes while an independently resolvable private import still produces its denial."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "The new script fallback in subs/analysis/subs/typescript/src/resolution.ts:122-149 consumes paths substitutions for relative specifiers. With `paths: { \"*\": [\"./src/tests/*\"] }`, `src/use.ts` importing `./init.js`, and only `src/tests/init.ts` present, the pinned compiler reports an unresolved target. The adapter instead selects the testing script with empty coverage, and real evaluation reports a definite `testing-origin` denial. This contradicts configured TypeScript resolution and the required distinction between unresolved access and denied access.",
      "guidance": "Apply paths mappings only to specifiers eligible under the compiler's resolution rules. For this relative import, retain an unresolved-target coverage result. Add a regression comparing the fallback target with compiler resolution when a wildcard paths mapping could incorrectly redirect a relative import."
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
