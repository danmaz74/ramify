# Check Results for Iteration 6

## Summary
- **Static Analysis**: PASSED
- **Scope Review**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: PASSED
- **Regression Tests**: FAILED

## Failure Details

### Regression Tests
```
.js',
+   'file:///ramify/node_modules/typescript/dist/enums/nodeFlags.js',
+   'file:///ramify/node_modules/typescript/dist/enums/regularExpressionFlags.js',
+   'file:///ramify/node_modules/typescript/dist/enums/scriptKind.js',
+   'file:///ramify/node_modules/typescript/dist/enums/scriptTarget.js',
+   'file:///ramify/node_modules/typescript/dist/enums/syntaxKind.js',
+   'file:///ramify/node_modules/typescript/dist/enums/tokenFlags.js',
+   'file:///ramify/node_modules/typescript/dist/ast/ast.js',
+   'file:///ramify/node_modules/typescript/dist/ast/astnav.js',
+   'file:///ramify/node_modules/typescript/dist/ast/clone.js',
+   'file:///ramify/node_modules/typescript/dist/ast/is.js',
+   'file:///ramify/node_modules/typescript/dist/ast/jsdoc.js',
+   'file:///ramify/node_modules/typescript/dist/ast/scanner.js',
+   'file:///ramify/node_modules/typescript/dist/ast/utils.js',
+   'file:///ramify/node_modules/typescript/dist/ast/visitor.js',
+   'file:///ramify/node_modules/typescript/dist/api/node/encoder.generated.js',
+   'file:///ramify/node_modules/typescript/dist/api/node/msgpack.js',
+   'file:///ramify/node_modules/typescript/dist/api/node/protocol.js',
+   'file:///ramify/node_modules/typescript/dist/api/node/node.generated.js',
+   'file:///ramify/node_modules/typescript/dist/api/node/node.infrastructure.js',
+   'file:///ramify/node_modules/typescript/dist/api/fs.js',
+   'file:///ramify/node_modules/typescript/dist/api/options.js',
+   'file:///ramify/node_modules/typescript/dist/api/syncChannel.js',
+   'file:///ramify/node_modules/typescript/dist/api/timing.js',
+   'file:///ramify/node_modules/typescript/dist/ast/ast.generated.js',
+   'file:///ramify/node_modules/typescript/dist/ast/factory.generated.js',
+   'file:///ramify/node_modules/typescript/dist/enums/outerExpressionKinds.js',
+   'file:///ramify/node_modules/typescript/dist/ast/is.generated.js',
+   'file:///ramify/node_modules/typescript/dist/internal/utils.js',
+   'file:///ramify/node_modules/typescript/dist/ast/visitor.generated.js',
+   'file:///ramify/node_modules/typescript/dist/api/node/protocol.generated.js',
+   'file:///ramify/node_modules/typescript/lib/getExePath.js'
+ ]
- []


- Expected
+ Received

- []
+ [
+   "file:///ramify/node_modules/typescript/dist/api/sync/api.js",
+   "file:///ramify/node_modules/typescript/dist/enums/completionItemKind.js",
+   "file:///ramify/node_modules/typescript/dist/enums/diagnosticCategory.js",
+   "file:///ramify/node_modules/typescript/dist/enums/elementFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/moduleKind.js",
+   "file:///ramify/node_modules/typescript/dist/enums/nodeBuilderFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/objectFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/signatureFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/signatureKind.js",
+   "file:///ramify/node_modules/typescript/dist/enums/symbolFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/typeFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/typePredicateKind.js",
+   "file:///ramify/node_modules/typescript/dist/ast/index.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/encoder.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/node.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/wtf8.js",
+   "file:///ramify/node_modules/typescript/dist/api/path.js",
+   "file:///ramify/node_modules/typescript/dist/api/proto.js",
+   "file:///ramify/node_modules/typescript/dist/api/sourceFileCache.js",
+   "file:///ramify/node_modules/typescript/dist/api/sync/client.js",
+   "file:///ramify/node_modules/typescript/dist/enums/characterCodes.js",
+   "file:///ramify/node_modules/typescript/dist/enums/commentDirectiveType.js",
+   "file:///ramify/node_modules/typescript/dist/enums/internalSymbolName.js",
+   "file:///ramify/node_modules/typescript/dist/enums/languageVariant.js",
+   "file:///ramify/node_modules/typescript/dist/enums/modifierFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/nodeFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/regularExpressionFlags.js",
+   "file:///ramify/node_modules/typescript/dist/enums/scriptKind.js",
+   "file:///ramify/node_modules/typescript/dist/enums/scriptTarget.js",
+   "file:///ramify/node_modules/typescript/dist/enums/syntaxKind.js",
+   "file:///ramify/node_modules/typescript/dist/enums/tokenFlags.js",
+   "file:///ramify/node_modules/typescript/dist/ast/ast.js",
+   "file:///ramify/node_modules/typescript/dist/ast/astnav.js",
+   "file:///ramify/node_modules/typescript/dist/ast/clone.js",
+   "file:///ramify/node_modules/typescript/dist/ast/is.js",
+   "file:///ramify/node_modules/typescript/dist/ast/jsdoc.js",
+   "file:///ramify/node_modules/typescript/dist/ast/scanner.js",
+   "file:///ramify/node_modules/typescript/dist/ast/utils.js",
+   "file:///ramify/node_modules/typescript/dist/ast/visitor.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/encoder.generated.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/msgpack.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/protocol.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/node.generated.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/node.infrastructure.js",
+   "file:///ramify/node_modules/typescript/dist/api/fs.js",
+   "file:///ramify/node_modules/typescript/dist/api/options.js",
+   "file:///ramify/node_modules/typescript/dist/api/syncChannel.js",
+   "file:///ramify/node_modules/typescript/dist/api/timing.js",
+   "file:///ramify/node_modules/typescript/dist/ast/ast.generated.js",
+   "file:///ramify/node_modules/typescript/dist/ast/factory.generated.js",
+   "file:///ramify/node_modules/typescript/dist/enums/outerExpressionKinds.js",
+   "file:///ramify/node_modules/typescript/dist/ast/is.generated.js",
+   "file:///ramify/node_modules/typescript/dist/internal/utils.js",
+   "file:///ramify/node_modules/typescript/dist/ast/visitor.generated.js",
+   "file:///ramify/node_modules/typescript/dist/api/node/protocol.generated.js",
+   "file:///ramify/node_modules/typescript/lib/getExePath.js",
+ ]

 ❯ Object.equal src/tests/entry-boundaries.test.ts:7:71
      5|
      6| const assertions = {
      7|   equal: (name: string, actual: unknown, expected: unknown) => assert.…
       |                                                                       ^
      8|   ok: (name: string, actual: unknown) => assert.ok(actual, name),
      9| };
 ❯ batchBoundary src/tests/entry-boundary-cases.ts:65:9
 ❯ fixture src/tests/fixture.ts:26:5
 ❯ src/tests/entry-boundaries.test.ts:16:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  subs/analysis/src/tests/retained-session.test.ts > retained analysis session > takes the source path for imports and exports, bounds the checked set and reports finding deltas
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ subs/analysis/src/tests/retained-session.test.ts:129:3
    127|   }));
    128|
    129|   it('takes the source path for imports and exports, bounds the checke…
       |   ^
    130|     const { session: handle } = await opened(inputs);
    131|     try {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  subs/analysis/src/tests/retained-session.test.ts > retained analysis session > takes the metadata path for a README edit and the broad path for created, deleted and reopened compiler states
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ subs/analysis/src/tests/retained-session.test.ts:192:3
    190|   }));
    191|
    192|   it('takes the metadata path for a README edit and the broad path for…
       |   ^
    193|     const { session: handle } = await opened(inputs);
    194|     try {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯
```
