# Check Results for Iteration 11

## Summary
- **Static Analysis**: PASSED
- **Scope Review**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: PASSED
- **Regression Tests**: FAILED

## Failure Details

### Regression Tests
```
d { …(15) } to match object { outcome: 'checked', …(3) }
(14 matching properties omitted from actual)

- Expected
+ Received

  {
    "changed": [
      {
-       "covered": true,
+       "covered": false,
        "path": "subs/consumer/src/use.ts",
        "sha256": null,
      },
    ],
-   "exitCode": 0,
+   "exitCode": 2,
    "findings": [],
-   "outcome": "checked",
+   "outcome": "not-checked",
  }

 ❯ src/tests/resident-cli.test.ts:157:23
    155|       const result = await invokeResident(quick, root, args), deleted …
    156|       expect(result.requests[0]?.freshness).toEqual({ mode: 'synchroni…
    157|       expect(deleted).toMatchObject({ outcome: 'checked', exitCode: 0,…
       |                       ^
    158|         changed: [{ path, sha256: null, covered: true }] });
    159|
 ❯ fixture src/tests/fixture.ts:26:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/10]⎯

 FAIL  subs/analysis/src/tests/session-audit.test.ts > retained session audit > equals batch and keeps the current sequence after each of twelve source, description, metadata and membership steps
Error: Cold open did not recompute the session
 ❯ opened subs/analysis/src/tests/session-test-fixture.ts:88:66
     86|     expect(result.status).toBe('opened');
     87|     if (result.status !== 'opened') throw new Error(`Expected an open …
     88|     if (!captured.state) { await result.session.dispose(); throw new E…
       |                                                                  ^
     89|     return { handle: result.session, revision: result.revision, state:…
     90|   } finally { activeCapture.capture = previousCapture; }
 ❯ subs/analysis/src/tests/session-audit.test.ts:14:24
 ❯ fixture subs/analysis/src/tests/session-test-fixture.ts:64:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/10]⎯

 FAIL  subs/analysis/src/tests/session-audit.test.ts > retained session audit > detects an injected access corruption, publishes the real recomputation, then audits equal
Error: Cold open did not recompute the session
 ❯ opened subs/analysis/src/tests/session-test-fixture.ts:88:66
     86|     expect(result.status).toBe('opened');
     87|     if (result.status !== 'opened') throw new Error(`Expected an open …
     88|     if (!captured.state) { await result.session.dispose(); throw new E…
       |                                                                  ^
     89|     return { handle: result.session, revision: result.revision, state:…
     90|   } finally { activeCapture.capture = previousCapture; }
 ❯ subs/analysis/src/tests/session-audit.test.ts:83:41
 ❯ fixture subs/analysis/src/tests/session-test-fixture.ts:64:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/10]⎯

 FAIL  subs/analysis/src/tests/session-audit.test.ts > retained session audit > compares and repairs original declaration positions inside retained access decisions
Error: Cold open did not recompute the session
 ❯ opened subs/analysis/src/tests/session-test-fixture.ts:88:66
     86|     expect(result.status).toBe('opened');
     87|     if (result.status !== 'opened') throw new Error(`Expected an open …
     88|     if (!captured.state) { await result.session.dispose(); throw new E…
       |                                                                  ^
     89|     return { handle: result.session, revision: result.revision, state:…
     90|   } finally { activeCapture.capture = previousCapture; }
 ❯ subs/analysis/src/tests/session-audit.test.ts:108:41
 ❯ fixture subs/analysis/src/tests/session-test-fixture.ts:64:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/10]⎯

 FAIL  subs/analysis/src/tests/session-audit.test.ts > retained session audit > cancels before recomputation without replacing the published revision
Error: Cold open did not recompute the session
 ❯ opened subs/analysis/src/tests/session-test-fixture.ts:88:66
     86|     expect(result.status).toBe('opened');
     87|     if (result.status !== 'opened') throw new Error(`Expected an open …
     88|     if (!captured.state) { await result.session.dispose(); throw new E…
       |                                                                  ^
     89|     return { handle: result.session, revision: result.revision, state:…
     90|   } finally { activeCapture.capture = previousCapture; }
 ❯ subs/analysis/src/tests/session-audit.test.ts:135:41
 ❯ fixture subs/analysis/src/tests/session-test-fixture.ts:64:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/10]⎯

 FAIL  subs/analysis/src/tests/session-audit.test.ts > retained session audit > cancels during observation promotion after detecting drift without publishing the recomputed facts
Error: Cold open did not recompute the session
 ❯ opened subs/analysis/src/tests/session-test-fixture.ts:88:66
     86|     expect(result.status).toBe('opened');
     87|     if (result.status !== 'opened') throw new Error(`Expected an open …
     88|     if (!captured.state) { await result.session.dispose(); throw new E…
       |                                                                  ^
     89|     return { handle: result.session, revision: result.revision, state:…
     90|   } finally { activeCapture.capture = previousCapture; }
 ❯ subs/analysis/src/tests/session-audit.test.ts:148:41
 ❯ fixture subs/analysis/src/tests/session-test-fixture.ts:64:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/10]⎯

 FAIL  subs/cli/src/tests/changed-command.test.ts > changed check command > retains the original hash across recovery and reports an intervening write as superseded
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ subs/cli/src/tests/changed-command.test.ts:62:3
     60|   });
     61|
     62|   it('retains the original hash across recovery and reports an interve…
       |   ^
     63|     const f = await fixture();
     64|     try {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/10]⎯

 FAIL  subs/cli/src/tests/changed-command.test.ts > changed check command > maps a real controlled deadline-exceeded deadline without cancelling the context work
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ subs/cli/src/tests/changed-command.test.ts:92:50
     90|   });
     91|
     92|   it.each(['cold', 'deadline-exceeded'] as const)('maps a real control…
       |                                                  ^
     93|     const f = await fixture();
     94|     try {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/10]⎯

 FAIL  subs/cli/src/tests/changed-command.test.ts > changed check command > preserves received findings when close-context cleanup fails
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ subs/cli/src/tests/changed-command.test.ts:131:58
    129|   });
    130|
    131|   it.each(['close-context', 'close-connection'] as const)('preserves r…
       |                                                          ^
    132|     await changedCleanupWitness(fault);
    133|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/10]⎯

 FAIL  subs/cli/src/tests/changed-command.test.ts > changed check command > publishes an invalid description as a covering revision and exits 1 with its diagnostics
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ subs/cli/src/tests/changed-command.test.ts:163:3
    161|   });
    162|
    163|   it('publishes an invalid description as a covering revision and exit…
       |   ^
    164|     const f = await fixture();
    165|     try {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯
```
