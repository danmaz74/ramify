# Check Results for Iteration 12

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "Reviewed all five selected constraints. A compiler-valid public-session probe confirmed one source-interpretation contradiction. The two previously reported cases now behave correctly. No implementation or constraint files were edited.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/typescript/src/accesses.ts:152-168 rejects every initialized variable as a CommonJS loader. Consequently, `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); require('./tests/fixture.cjs');` produces no access record or coverage note for the require call. A compiler-valid fixture returned completed/passed/complete through analyzeProject, recording only the external node:module import. Executing that same fixture confirmed that its ordinary source loads the testing file. This silently omits actual CommonJS access while claiming complete coverage.",
      "guidance": "Distinguish ordinary application functions from loaders created by the compiler-resolved Node createRequire binding. Retain unsupported CommonJS coverage for these calls and apply testing-origin checks when their targets can be established. Add public-session controls for createRequire alongside the existing ambient-loader and ordinary-function cases."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/cli-invocation.spec.md",
      "id": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.68,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.9,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.97,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/module-description.principles.md",
      "id": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.85,
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
