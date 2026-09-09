# Check Results for Iteration 12

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
  "reasoning": "Reviewed all five selected constraints. Compiler-valid probes through the public analysis session confirmed two source-interpretation contradictions introduced by the diff. No implementation or constraint files were edited.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/typescript/src/accesses.ts:247-249 classifies calls as CommonJS solely because the identifier is named require. A compiler-valid local identity function `function require(p: string) { return p; }` called with the path of an existing testing stylesheet produces a definite testing-origin denial, although it loads nothing. An imported same-owner identity function named require also fails. Renaming the function makes the check pass.",
      "guidance": "Use compiler binding information to distinguish CommonJS require from local or imported application functions. Do not resolve ordinary function arguments as source loads. Add local, imported and renamed-function controls alongside actual CommonJS cases."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/typescript/src/namespace-uses.ts:53 recursively processes an empty nested object pattern without retaining the selected merged binding. With an exported function/namespace Merged, `const { Merged: {} } = ns` produces no selections or coverage and an allowed symbol-free decision. Public-session probes pass even when Merged is private or lacks the browser promise required by the consumer. Static, awaited and .then forms reproduce this; ordinary `const { Merged } = ns` correctly receives the corresponding denial.",
      "guidance": "Preserve the selected runtime original when an empty nested pattern consumes a merged binding. Do not convert that explicit selection into a symbol-free load. Add static, awaited and callback regressions with private-binding and browser-tag controls."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/cli-invocation.spec.md",
      "id": "docs/architecture/cli-invocation.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.72,
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
      "score": 0.87,
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
