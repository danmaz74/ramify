# Check Results for Iteration 4

## Summary
- **Static Analysis**: PASSED
- **Scope Review**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: PASSED
- **Regression Tests**: FAILED

## Failure Details

### Regression Tests
```
contexts/module.ramify to the reviewed statements 13ms

 Test Files  1 failed | 50 passed (51)
      Tests  2 failed | 1016 passed (1018)
   Start at  07:24:43
   Duration  74.37s (transform 4.49s, setup 0ms, import 10.31s, tests 332.24s, environment 1.32s)



⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses subs/daemon/module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-sub', …(4) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "destinations": [
+       "parent",
+     ],
+     "from": "contexts",
+     "kind": "expose-sub",
+     "names": [
+       [
+         "ContextId",
+         "ContextId",
+       ],
+       [
+         "GenerationId",
+         "GenerationId",
+       ],
+       [
+         "RevisionId",
+         "RevisionId",
+       ],
+       [
+         "LeaseId",
+         "LeaseId",
+       ],
+       [
+         "ContextToken",
+         "ContextToken",
+       ],
+       [
+         "ContextSetup",
+         "ContextSetup",
+       ],
+       [
+         "ContextSelection",
+         "ContextSelection",
+       ],
+       [
+         "InputFingerprints",
+         "InputFingerprints",
+       ],
+       [
+         "WatchEvent",
+         "WatchEvent",
+       ],
+       [
+         "WatcherHandle",
+         "WatcherHandle",
+       ],
+       [
+         "WatcherPort",
+         "WatcherPort",
+       ],
+       [
+         "ClockPort",
+         "ClockPort",
+       ],
+       [
+         "createControlledWatcher",
+         "createControlledWatcher",
+       ],
+       [
+         "createControlledClock",
+         "createControlledClock",
+       ],
+       [
+         "ControlledWatcher",
+         "ControlledWatcher",
+       ],
+       [
+         "ControlledClock",
+         "ControlledClock",
+       ],
+     ],
+     "tags": null,
+   },
+ ]

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:157:14
    155|           kind: item.kind, names: item.selection.kind === 'wildcard' ?…
    156|           from: item.from.value, tags: item.tags?.values ?? null, dest…
    157|         }))).toEqual(fixture.statements);
       |              ^
    158|         expect(document.statements.map(({ index }) => index)).toEqual(…
    159|         for (const token of document.tokens) expect(text.slice(token.s…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses subs/daemon/subs/contexts/module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-src', …(4) }, …(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "destinations": [
+       "parent",
+     ],
+     "from": "interfaces/contexts.ts",
+     "kind": "expose-src",
+     "names": "*",
+     "tags": null,
+   },
+   {
+     "destinations": [
+       "parent",
+     ],
+     "from": "controlled-ports.ts",
+     "kind": "expose-test",
+     "names": [
+       [
+         "createControlledWatcher",
+         "createControlledWatcher",
+       ],
+       [
+         "createControlledClock",
+         "createControlledClock",
+       ],
+       [
+         "ControlledWatcher",
+         "ControlledWatcher",
+       ],
+       [
+         "ControlledClock",
+         "ControlledClock",
+       ],
+     ],
+     "tags": null,
+   },
+ ]

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:157:14
    155|           kind: item.kind, names: item.selection.kind === 'wildcard' ?…
    156|           from: item.from.value, tags: item.tags?.values ?? null, dest…
    157|         }))).toEqual(fixture.statements);
       |              ^
    158|         expect(document.statements.map(({ index }) => index)).toEqual(…
    159|         for (const token of document.tokens) expect(text.slice(token.s…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


Command failed: bash /usr/local/lib/node_modules/cucumber-viz/scripts/run-command-with-cleanup.sh npm test

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses subs/daemon/module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-sub', …(4) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "destinations": [
+       "parent",
+     ],
+     "from": "contexts",
+     "kind": "expose-sub",
+     "names": [
+       [
+         "ContextId",
+         "ContextId",
+       ],
+       [
+         "GenerationId",
+         "GenerationId",
+       ],
+       [
+         "RevisionId",
+         "RevisionId",
+       ],
+       [
+         "LeaseId",
+         "LeaseId",
+       ],
+       [
+         "ContextToken",
+         "ContextToken",
+       ],
[truncated]
```
