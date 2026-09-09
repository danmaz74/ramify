# Check Results for Iteration 11

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
  "reasoning": "Reviewed all three selected constraints. Compiler-backed probes through the real acquisition, catalog, linker and evaluation pipeline confirmed four contradictions introduced by the diff. No repository files were edited.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "namespace-uses.ts:22-26 misses namespace references in shorthand properties. Compiler-valid `import * as ns from './api.js'; consume({ ns });` produces empty selections, empty coverage and a checked, allowed symbol-free decision. The awaited dynamic-import equivalent does the same. The direct `consume(ns)` control correctly reports namespace-escape. Unsupported namespace escape must remain visibly unverifiable.",
      "guidance": "Resolve shorthand properties to their referenced value symbols when indexing namespace uses. Report namespace-escape for the unsupported flow while preserving identifiable selections. Add static and dynamic shorthand regression cases."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "accesses.ts:164-171 determines runtime namespace membership solely from the original's hasValue flag. When bridge.ts contains `export type { privateValue } from './api.js'`, a consumer's compiler-valid `type All = typeof import('./bridge.js')` incorrectly selects privateValue and receives a not-visible denial. TypeScript confirms that this namespace has no runtime keys. The specification limits this query to runtime namespace members.",
      "guidance": "Preserve whether an export is available at runtime through its forwarding path, and use that information for runtime namespace selections. Exclude type-only forwarded bindings from whole typeof-import queries without changing their original identity or explicit type-import checks."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "namespace-uses.ts:70-72 treats ordinary properties of merged runtime bindings as nested module exports. Using the existing exposed function/namespace Merged fixture, both `ns.Merged.name` and `ns.Merged.call(null)` compile successfully but produce missing-export errors for Merged.name and Merged.call. Direct `ns.Merged()` passes. These expressions select the existing Merged runtime binding; its ordinary function properties are not missing module exports.",
      "guidance": "Distinguish nested namespace export selections from property access on an owned runtime binding. Preserve the Merged value request for ordinary function properties and add compiler-valid controls for merged and unmerged functions."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "accesses.ts:94-106 checks only the accessed file's completeness when declaring a nested export missing. Reproduced with an incomplete source containing an unresolved star export, a bridge exporting that source as ns, and a named relay of ns. `typeof import('./relay.js').ns.absent` receives a definite missing-export error with no coverage note at the consumer, although the nested namespace's exports are incomplete. The unresolved star prevents establishing that the member is absent.",
      "guidance": "Carry completeness through every namespace lookup segment and relevant forwarding source. Emit missing-export only when the containing namespace is complete; otherwise retain located unresolved or incomplete coverage and continue checking known members."
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
