# Check Results for Iteration 6

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
  "reasoning": "Reviewed all four selected constraints. Focused probes through real project acquisition and createSourceAnalysis confirmed three source-catalog contradictions. No additional evident contradictions were found in the other selected constraints. Repository files were left unchanged.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "catalog.ts:108-113 and 322-354 treat an in-progress cyclic star target as a completed export set. With a.ts starring b.ts and left.ts, b.ts starring a.ts and right.ts, and both leaf files defining distinct clash bindings, the catalog marks b.ts and its named downstream forwarder complete and selects right.ts's clash. TypeScript reports TS2308 for both barrels, and native Node ESM rejects the downstream import for conflicting star exports. The implementation therefore publishes an arbitrary original for an ambiguous export.",
      "guidance": "Resolve cyclic star exports without accepting unfinished catalog entries as complete. Propagate ambiguity to affected barrels and downstream selections while retaining independently resolvable exports. Add the cyclic conflict fixture and verify traversal order cannot change the result."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "resolution.ts:36-49 recognizes resource declarations using filename patterns that omit configured moduleSuffixes. In a compiler-valid fixture with moduleSuffixes ['.custom', ''], an existing theme.css, and theme.d.css.custom.ts, forwarding './theme.css' produces a complete code original belonging to theme.d.css.custom.ts. The actual CSS resource receives no effective description. This contradicts the requirement that resource identity and origin belong to the resource independently of its declaration.",
      "guidance": "Keep the resolved physical resource separate from its compiler-selected declaration, including declarations selected through moduleSuffixes. If the resource target cannot be established, report an unresolved resource rather than assigning the declaration's code identity. Add a regression for this configuration."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "catalog.ts:173-186 uses target.name as the resource binding key and overwrites the corresponding original. A compiler-valid '*.asset' declaration re-exporting Value as runtime from one package and a different Value as typeOnly from another collapses both resource exports into the same original. When the first Value is a const and the second an interface, the retained original incorrectly has hasValue false and hasType true for both exports. Both files remain complete with no coverage notes. Distinct declarations are thus merged solely because their names match.",
      "guidance": "Assign distinct stable resource identities to distinct resolved bindings. Coalesce aliases only when compiler evidence establishes that they identify the same binding, and preserve each binding's value/type flags. Add a regression covering identical declaration names with different originals and value/type existence."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.68,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.86,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/module-description.principles.md",
      "id": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.91,
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
