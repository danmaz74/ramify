# Check Results for Iteration 9

## Summary
- **Static Analysis**: PASSED
- **Scope Review**: PASSED
- **Sealed Files**: PASSED
- **Constraints**: PASSED
- **Regression Tests**: FAILED

## Failure Details

### Regression Tests
```
erimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3093868) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3093868) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3094126) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3094126) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3094359) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3094359) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3094612) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3094612) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3095309) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3095309) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3095628) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3095628) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3095953) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3095953) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096078) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096078) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096181) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096181) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096548) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096548) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
panic: EOF [recovered, repanicked]

goroutine 36 [running]:
sync.(*WaitGroup).Go.func1.1()
	sync/waitgroup.go:251 +0x45
panic({0xd7d680?, 0x1ac2fa0?})
	runtime/panic.go:860 +0x13a
github.com/microsoft/typescript-go/internal/api.(*callbackFS).ReadFile(0x328383182b00, {0x328382fd3180, 0x46})
	github.com/microsoft/typescript-go/internal/api/callbackfs.go:108 +0x15d
github.com/microsoft/typescript-go/internal/vfs/cachedvfs.(*FS).ReadFile(0x328383318c40?, {0x328382fd3180?, 0x3283832259d0?})
	github.com/microsoft/typescript-go/internal/vfs/cachedvfs/cachedvfs.go:97 +0x22
github.com/microsoft/typescript-go/internal/project.(*snapshotFSBuilder).reloadEntryIfNeeded(0x32838307b800, 0x328383318c40)
	github.com/microsoft/typescript-go/internal/project/snapshotfs.go:416 +0x6d
github.com/microsoft/typescript-go/internal/project.(*snapshotFSBuilder).getDiskFile(0x32838307b800, {0x328382fd3180, 0x46}, {0x328382fd3180, 0x46}, 0x0)
	github.com/microsoft/typescript-go/internal/project/snapshotfs.go:353 +0x11d
github.com/microsoft/typescript-go/internal/project.(*snapshotFSBuilder).GetFileByPath(0x32838307b800, {0x328382fd3180, 0x46}, {0x328382fd3180, 0x46})
	github.com/microsoft/typescript-go/internal/project/snapshotfs.go:320 +0x75
github.com/microsoft/typescript-go/internal/project.(*sourceFS).GetFileByPath(0x3283831d5cb0, {0x328382fd3180, 0x46}, {0x328382fd3180, 0x46})
	github.com/microsoft/typescript-go/internal/project/snapshotfs.go:723 +0x53
github.com/microsoft/typescript-go/internal/project.(*compilerHost).GetSourceFile(0x328382fc5630, {{0x328382fd3180, 0x46}, {0x328382fd3180, 0x46}, {0x0, 0x0}})
	github.com/microsoft/typescript-go/internal/project/compilerhost.go:98 +0x87
github.com/microsoft/typescript-go/internal/compiler.(*fileLoader).parseSourceFile(0x32838331c008, 0x32838312d080)
	github.com/microsoft/typescript-go/internal/compiler/fileloader.go:370 +0x25b
github.com/microsoft/typescript-go/internal/compiler.(*parseTask).load(0x32838312d080, 0x32838331c008)
	github.com/microsoft/typescript-go/internal/compiler/filesparser.go:112 +0x4a6
github.com/microsoft/typescript-go/internal/compiler.(*filesParser).start.func1()
	github.com/microsoft/typescript-go/internal/compiler/filesparser.go:290 +0x351
github.com/microsoft/typescript-go/internal/core.(*parallelWorkGroup).Queue.func1()
	github.com/microsoft/typescript-go/internal/core/workgroup.go:40 +0x13
sync.(*WaitGroup).Go.func1()
	sync/waitgroup.go:258 +0x4a
created by sync.(*WaitGroup).Go in goroutine 33
	sync/waitgroup.go:238 +0x73
(node:3096698) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096698) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096842) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096842) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096989) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:3096989) ExperimentalWarning: Transform Types is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  subs/daemon/subs/contexts/src/tests/context-manager.test.ts > watcher reconciliation and retention > applies the global budget to session facts even when the revision is reused
AssertionError: expected 7422 to be less than or equal to 5000
 ❯ subs/daemon/subs/contexts/src/tests/context-manager.test.ts:228:91
    226|       expect(await e.check(opened.token)).toMatchObject({ reason: 'res…
    227|       expect(e.status(opened.token).published).toEqual(before.publishe…
    228|       expect(e.status(opened.token).retainedBytes + e.status(opened.to…
       |                                                                                           ^
    229|     } finally { await e.dispose(); }
    230|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```
