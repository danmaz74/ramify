# Check Results for Iteration 2

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

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts (25 tests | 1 failed) 223ms
     × covers exactly nine toolkit and fifteen reference descriptions without omitting an owner 42ms

 Test Files  1 failed | 47 passed (48)
      Tests  1 failed | 979 passed (980)
   Start at  05:41:45
   Duration  97.65s (transform 5.68s, setup 0ms, import 13.99s, tests 444.18s, environment 1.42s)



⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > covers exactly nine toolkit and fifteen reference descriptions without omitting an owner
AssertionError: expected [ 'module.ramify', …(10) ] to deeply equal [ 'module.ramify', …(8) ]

- Expected
+ Received

@@ -4,8 +4,10 @@
    "subs/analysis/subs/descriptions/module.ramify",
    "subs/analysis/subs/model/module.ramify",
    "subs/analysis/subs/project/module.ramify",
    "subs/analysis/subs/typescript/module.ramify",
    "subs/cli/module.ramify",
+   "subs/daemon/module.ramify",
+   "subs/daemon/subs/contexts/module.ramify",
    "subs/presentation/module.ramify",
    "subs/presentation/subs/layout/module.ramify",
  ]

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:176:29
    174|     for (const [prefix, fixtures] of [['', toolkit], ['examples/collec…
    175|       const actual = ['module.ramify', ...(await nestedDescriptions(ne…
    176|       expect(actual.sort()).toEqual(fixtures.map(({ path }) => `${path…
       |                             ^
    177|     }
    178|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


Command failed: bash /usr/local/lib/node_modules/cucumber-viz/scripts/run-command-with-cleanup.sh npm test

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/analysis/subs/descriptions/src/tests/descriptions.test.ts > all current project descriptions as exact-text parser fixtures > covers exactly nine toolkit and fifteen reference descriptions without omitting an owner
AssertionError: expected [ 'module.ramify', …(10) ] to deeply equal [ 'module.ramify', …(8) ]

- Expected
+ Received

@@ -4,8 +4,10 @@
    "subs/analysis/subs/descriptions/module.ramify",
    "subs/analysis/subs/model/module.ramify",
    "subs/analysis/subs/project/module.ramify",
    "subs/analysis/subs/typescript/module.ramify",
    "subs/cli/module.ramify",
+   "subs/daemon/module.ramify",
+   "subs/daemon/subs/contexts/module.ramify",
    "subs/presentation/module.ramify",
    "subs/presentation/subs/layout/module.ramify",
  ]

 ❯ subs/analysis/subs/descriptions/src/tests/descriptions.test.ts:176:29
    174|     for (const [prefix, fixtures] of [['', toolkit], ['examples/collec…
    175|       const actual = ['module.ramify', ...(await nestedDescriptions(ne…
    176|       expect(actual.sort()).toEqual(fixtures.map(({ path }) => `${path…
       |                             ^
    177|     }
    178|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```
