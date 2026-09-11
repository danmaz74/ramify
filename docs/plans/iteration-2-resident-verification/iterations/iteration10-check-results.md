# Check Results for Iteration 10

## Summary
- **Static Analysis**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: PASSED
- **Regression Tests**: FAILED

## Failure Details

### Regression Tests
```
7s)



⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-src', …(4) }, …(8) ] to deeply equal [ { kind: 'expose-src', …(4) }, …(8) ]

- Expected
+ Received

@@ -19,36 +19,10 @@
    },
    {
      "destinations": [
        "descendants",
      ],
-     "from": "daemon",
-     "kind": "expose-sub",
-     "names": [
-       [
-         "EndpointSelection",
-         "EndpointSelection",
-       ],
-       [
-         "ConnectTimeouts",
-         "ConnectTimeouts",
-       ],
-       [
-         "ConnectOptions",
-         "ConnectOptions",
-       ],
-       [
-         "DisconnectReason",
-         "DisconnectReason",
-       ],
-     ],
-     "tags": null,
-   },
-   {
-     "destinations": [
-       "descendants",
-     ],
      "from": "analysis",
      "kind": "expose-sub",
      "names": [
        [
          "ModuleId",
@@ -549,10 +523,128 @@
          "shopTreeDiagram",
        ],
        [
          "shopFocusDiagram",
          "shopFocusDiagram",
+       ],
+     ],
+     "tags": null,
+   },
+   {
+     "destinations": [
+       "descendants",
+     ],
+     "from": "daemon",
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
+         "DaemonInstance",
+         "DaemonInstance",
+       ],
+       [
+         "LogEntry",
+         "LogEntry",
+       ],
+       [
+         "DaemonBudgets",
+         "DaemonBudgets",
+       ],
+       [
+         "EndpointSelection",
+         "EndpointSelection",
+       ],
+       [
+         "DaemonRecord",
+         "DaemonRecord",
+       ],
+       [
+         "StopDisposition",
+         "StopDisposition",
+       ],
+       [
+         "Handshake",
+         "Handshake",
+       ],
+       [
+         "ConnectTimeouts",
+         "ConnectTimeouts",
+       ],
+       [
+         "ConnectOptions",
+         "ConnectOptions",
+       ],
+       [
+         "ConnectionState",
+         "ConnectionState",
+       ],
+       [
+         "DisconnectReason",
+         "DisconnectReason",
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
        ],
      ],
      "tags": null,
    },
  ]

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:169:14
    167|           kind: item.kind, names: item.selection.kind === 'wildcard' ?…
    168|           from: item.from.value, tags: item.tags?.values ?? null, dest…
    169|         }))).toEqual(fixture.statements);
       |              ^
    170|         expect(document.statements.map(({ index }) => index)).toEqual(…
    171|         for (const token of document.tokens) expect(text.slice(token.s…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


Command failed: bash /usr/local/lib/node_modules/cucumber-viz/scripts/run-command-with-cleanup.sh npm test

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > parses module.ramify to the reviewed statements
AssertionError: expected [ { kind: 'expose-src', …(4) }, …(8) ] to deeply equal [ { kind: 'expose-src', …(4) }, …(8) ]

- Expected
+ Received

[truncated]
```
