# Check Results for Iteration 6

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: FAILED

## Failure Details

### Constraints
```
{
  "met": false,
  "reasoning": "Reviewed all four selected constraints. Focused probes through real project acquisition and createSourceAnalysis confirmed two contradictions. No additional evident contradictions were found in the other selected constraints. Repository files were left unchanged.",
  "issues": [
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/typescript/src/catalog.ts:166-168 compares resource descriptions using only export names and generated identities, while lines 192-193 overwrite their original facts. A compiler-valid fixture maps @asset to src/data.asset, with '*.asset' declaring value as a const and '@asset' declaring value as an interface. Forwarding both spellings produces one original and complete files without coverage notes. Reversing the forwarding statements switches that original between hasValue=true/hasType=false and hasValue=false/hasType=true. Conflicting descriptions therefore arbitrarily determine binding classification.",
      "guidance": "Compare effective descriptions before committing canonical originals, including binding equivalence and value/type existence. Report incompatible descriptions as ambiguous instead of overwriting facts. Add a regression asserting identical ambiguity outcomes for both statement orders."
    },
    {
      "constraintPath": "docs/model/typescript-source-interpretation.principles.md",
      "constraintId": "docs/model/typescript-source-interpretation.principles.md#principles-md",
      "ruleId": "principles-md",
      "severity": "important",
      "issue": "subs/analysis/subs/typescript/src/catalog.ts:385-408 accepts a namespace candidate without checking its constituent completeness, and lines 429-448 do not propagate namespace limits through named selections. In a fixture where conflict.ts stars two distinct clash exports, namespace.ts exports that barrel as ns, and interfaces/api.ts forwards ns by name, the catalog correctly marks conflict.ts ambiguous and namespace.ts incomplete but marks interfaces/api.ts and its downstream star forwarder complete with empty issueIds. Their namespace still contains clash with no original. An unresolved namespace selection is thus published as a complete export description.",
      "guidance": "Propagate namespace completeness through named forwarding and subsequent star exports after resolving constituent facts. Preserve independently resolved members while marking affected namespace selections unverifiable with located evidence. Add regressions for ambiguous and unresolved constituents across multiple forwarding hops."
    }
  ],
  "selectedConstraints": [
    {
      "path": "docs/architecture/quick-testing.spec.md",
      "id": "docs/architecture/quick-testing.spec.md#architecture-specs",
      "ruleId": "architecture-specs",
      "score": 0.76,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/cross-module-importability.principles.md",
      "id": "docs/model/cross-module-importability.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.85,
      "selectedBy": [
        "semantic"
      ]
    },
    {
      "path": "docs/model/module-description.principles.md",
      "id": "docs/model/module-description.principles.md#principles-md",
      "ruleId": "principles-md",
      "score": 0.92,
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
