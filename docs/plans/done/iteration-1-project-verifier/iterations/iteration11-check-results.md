# Check Results for Iteration 11

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "Reviewed all three selected constraints. Compiler-valid probes through the real acquisition, catalog, linker and evaluation pipeline confirmed three source-interpretation contradictions. No implementation or constraint files were edited.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/typescript/src/namespace-uses.ts:23-32 misses namespace references in unrenamed local exports. Compiler-valid `import * as ns from './api.js'; export { ns };` produces empty selections, empty coverage and a checked, allowed symbol-free decision. The awaited dynamic-import equivalent does the same. Renaming the export to `export { ns as forwarded }` correctly produces namespace-escape coverage. Adding an identifiable private-member access preserves its denial but still omits coverage for the exported namespace.",
      "guidance": "Resolve local ExportSpecifier references to their referenced local symbols when indexing namespace uses. Preserve namespace-escape coverage for unsupported forwarding and continue checking known selections. Add static, awaited and renamed-export controls."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/typescript/src/namespace-uses.ts:47-49 stops nested destructuring at merged bindings. Using the existing exposed Merged function/namespace, compiler-valid `const { Merged: { member } } = ns` selects only Merged and reports allowed with no coverage. Direct `ns.Merged.member` correctly selects the unexposed Merged/member original and reports not-visible. Nested destructuring from an awaited dynamic import also silently passes.",
      "guidance": "Follow explicit nested destructuring keys into actual namespace exports even when the containing namespace also has a runtime original. Check the selected constituent original; retain coverage for any unsupported remainder instead of reporting a complete allowed selection."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "Ordinary function properties are still misclassified outside the corrected direct-member path. In namespace-uses.ts:47-49, compiler-valid `const { name } = ns.Merged` produces missing-export for Merged.name, for both static and awaited namespaces. In accesses.ts:282-285, `type Name = typeof import('./api.js').Merged.name` and the corresponding `.call` query also produce definite missing-export errors with no coverage. Direct `ns.Merged.name` correctly selects Merged.",
      "guidance": "Apply the distinction between namespace exports and ordinary binding properties consistently to destructuring and import-type qualifiers. Preserve the Merged value request for runtime property access and its type-only request for import-type queries, rather than looking up ordinary function properties as module exports."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.84,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.98,
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
