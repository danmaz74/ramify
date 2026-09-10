# Check Results for Iteration 14

## Summary
- **Static Analysis**: PASSED
- **Scope Review**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: PASSED
- **Regression Tests**: FAILED

## Failure Details

### Regression Tests
```
dex }) => index)).toEqual(…
    154|         for (const token of document.tokens) expect(text.slice(token.s…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses subs/analysis/module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-sub', …(4) }, …(8) ] to deeply equal [ { kind: 'expose-sub', …(4) }, …(6) ]

- Expected
+ Received

@@ -237,6 +237,34 @@
          "acquireInventory",
        ],
      ],
      "tags": null,
    },
+   {
+     "destinations": [
+       "parent",
+     ],
+     "from": "session.ts",
+     "kind": "expose-src",
+     "names": [
+       [
+         "createAnalysisSession",
+         "createAnalysisSession",
+       ],
+     ],
+     "tags": null,
+   },
+   {
+     "destinations": [
+       "parent",
+     ],
+     "from": "analyze-project.ts",
+     "kind": "expose-src",
+     "names": [
+       [
+         "analyzeProject",
+         "analyzeProject",
+       ],
+     ],
+     "tags": null,
+   },
  ]

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:152:14
    150|           kind: item.kind, names: item.selection.kind === 'wildcard' ?…
    151|           from: item.from.value, tags: item.tags?.values ?? null, dest…
    152|         }))).toEqual(fixture.statements);
       |              ^
    153|         expect(document.statements.map(({ index }) => index)).toEqual(…
    154|         for (const token of document.tokens) expect(text.slice(token.s…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses subs/cli/module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-src', …(4) }, …(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "destinations": [
+       "parent",
+     ],
+     "from": "run-cli.ts",
+     "kind": "expose-src",
+     "names": [
+       [
+         "runCli",
+         "runCli",
+       ],
+     ],
+     "tags": null,
+   },
+   {
+     "destinations": [
+       "parent",
+     ],
+     "from": "interfaces/cli.ts",
+     "kind": "expose-src",
+     "names": "*",
+     "tags": null,
+   },
+ ]

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:152:14
    150|           kind: item.kind, names: item.selection.kind === 'wildcard' ?…
    151|           from: item.from.value, tags: item.tags?.values ?? null, dest…
    152|         }))).toEqual(fixture.statements);
       |              ^
    153|         expect(document.statements.map(({ index }) => index)).toEqual(…
    154|         for (const token of document.tokens) expect(text.slice(token.s…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


Command failed: bash /usr/local/lib/node_modules/cucumber-viz/scripts/run-command-with-cleanup.sh npm test

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-src', …(4) }, …(6) ] to deeply equal [ { kind: 'expose-sub', …(4) }, …(5) ]

- Expected
+ Received

@@ -1,10 +1,19 @@
  [
    {
      "destinations": [
        "descendants",
      ],
+     "from": "interfaces/batch.ts",
+     "kind": "expose-src",
+     "names": "*",
+     "tags": null,
+   },
+   {
+     "destinations": [
+       "descendants",
+     ],
      "from": "analysis",
      "kind": "expose-sub",
      "names": [
        [
          "ModuleId",
@@ -367,18 +376,50 @@
          "InventoryRun",
        ],
        [
          "ValidationRun",
          "ValidationRun",
+       ],
+       [
+         "CapabilityExecution",
+         "CapabilityExecution",
        ],
        [
+         "StageExecution",
+         "StageExecution",
+       ],
+       [
          "AnalysisCode",
          "AnalysisCode",
        ],
        [
          "AnalysisDiagnostic",
          "AnalysisDiagnostic",
+       ],
+       [
+         "AccessResult",
+         "AccessResult",
+       ],
+       [
+         "AnalysisSnapshot",
+         "AnalysisSnapshot",
+       ],
+       [
+         "AnalysisSummary",
+         "AnalysisSummary",
+       ],
+       [
+         "AnalysisReport",
+         "AnalysisReport",
+       ],
+       [
+         "AnalysisRun",
+         "AnalysisRun",
+       ],
+       [
+         "AnalysisSession",
+         "AnalysisSession",
        ],
      ],
      "tags": null,
    },
    {

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:152:14
    150|           kind: item.kind, names: item.selection.kind === 'wildcard' ?…
    151|           from: item.from.value, tags: item.tags?.values ?? null, dest…
    152|         }))).toEqual(fixture.statements);
       |              ^
    153|         expect(document.statements.map(({ index }) => index)).toEqual(…
    154|         for (const token of document.tokens) expect(text.slice(token.s…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses subs/analysis/module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-sub', …(4) }, …(8) ] to deeply equal [ { kind: 'expose-sub', …(4) }, …(6) ]

- Expected
+ Received

@@ -237,6 +237,34 @@
[truncated]
```
