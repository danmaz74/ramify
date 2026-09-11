# Check Results for Iteration 8

## Summary
- **Static Analysis**: PASSED
- **Scope Review**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: PASSED
- **Regression Tests**: FAILED

## Failure Details

### Regression Tests
```
### vitest [FAIL]
> ramify.ts@0.0.0 test
> vitest run


 RUN  v4.1.11 /tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification

 ❯ subs/daemon/src/tests/outbound.test.ts (14 tests | 2 failed) 1143ms
     × does not admit a frame after its classify callback disposes the writer 15ms
     × does not admit a frame after its encode callback disposes the writer 2ms

 Test Files  1 failed | 58 passed (59)
      Tests  2 failed | 1102 passed (1104)
   Start at  08:17:02
   Duration  74.73s (transform 4.61s, setup 0ms, import 10.74s, tests 336.69s, environment 1.24s)



⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/daemon/src/tests/outbound.test.ts > private outbound socket writer > does not admit a frame after its classify callback disposes the writer
 FAIL  subs/daemon/src/tests/outbound.test.ts > private outbound socket writer > does not admit a frame after its encode callback disposes the writer
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ subs/daemon/src/tests/outbound.test.ts:209:45
    207|       await eventually(() => f.host.closed);
    208|       expect(f.host.listenerCount('drain')).toBe(0);
    209|       expect(f.host.listenerCount('close')).toBe(0);
       |                                             ^
    210|     } finally { writer.dispose(); await f.dispose(); }
    211|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


Command failed: bash /usr/local/lib/node_modules/cucumber-viz/scripts/run-command-with-cleanup.sh npm test

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/daemon/src/tests/outbound.test.ts > private outbound socket writer > does not admit a frame after its classify callback disposes the writer
 FAIL  subs/daemon/src/tests/outbound.test.ts > private outbound socket writer > does not admit a frame after its encode callback disposes the writer
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ subs/daemon/src/tests/outbound.test.ts:209:45
    207|       await eventually(() => f.host.closed);
    208|       expect(f.host.listenerCount('drain')).toBe(0);
    209|       expect(f.host.listenerCount('close')).toBe(0);
       |                                             ^
    210|     } finally { writer.dispose(); await f.dispose(); }
    211|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
```
