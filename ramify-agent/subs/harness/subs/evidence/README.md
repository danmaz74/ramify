# evidence

Obtains a fact about the target project: it runs the Ramify command line,
runs one of the project's own commands, reads what Ramify generates and asks
git what changed, and it is the only source in the harness that does any of
them. It hides the `ramify` executable and its exit codes, the private daemon
the harness runs its materializations through, the file formats of the
architect view, of a module's API views and of the measurement document, and
process-group teardown for an external command. Its callers name the fact
they want and receive this module's own types; no argument vector, endpoint
directory or view file path is theirs to assemble.

## Why it is separate

Every later part of the harness needs a fact about the project: readiness,
the gate engine, the post-write hook check, a view refresh before a
placement, a measurement snapshot, the owner of a written path, the tests a
scope selects, and the run branch. One responsibility with one dependency
serves all of them, so the dependency is hidden once rather than repeated at
each caller. It receives nothing from the harness and exposes nothing to its
descendants: its types are its own, so no caller's vocabulary reaches it.

## Running the Ramify CLI

`ramify-cli.ts` holds `RamifyCli`, one command line with its working
directory, its timeout and its optional endpoint directory. `materialize`
names the views to refresh and reports `ok` with the output or a message
naming the command and its exit code; a failure is never a thrown string of
stderr.

`privateRamify` builds a command line with a daemon of its own in a fresh
endpoint directory, which is what lets the harness materialize without
sharing the developer's daemon, and disposes of both. `ramifyVersion` answers
once per process and is `null` when the executable cannot be run.

`ramifyExecutable` is the path of the `ramify` this package depends on. It is
the one part of the command line that crosses: a run captures the complete
command it ran each check with, its environment included, so that the check
can be run again and so that what it ran is in the record. A captured
command that names no executable is not a command.

`checkComplete` and `checkChanged` are Ramify's two check forms, read from
their exit codes alone: 0 is checked with no findings, 1 is findings or an
invalid revision, and 2 is not checked with the CLI's reason. Exit 2 is never
a pass. `checkChanged` is the bounded hook check and never falls back to a
complete one; a cold daemon, an expired deadline or a named configuration
file is answered at once as not checked, which permits continued editing.
A caller that needs a verdict runs `checkComplete`, rather than claiming hook
coverage.

## Running one of the project's own commands

`run-command.ts` holds `runCommand`, which never throws. Every command runs
as `bash run-command-with-cleanup.sh <command> <args>`, the wrapper beside
it, so the command gets a process group of its own and a descendant that
outlives it is killed with that group rather than left for the harness to
wait on. How a command ended is never read from what it printed: `completed`
carries the exit code the command chose, a timeout is Node's `killed`, a
cancellation is the caller's signal, and a spawn failure is a `runner-error`
carrying that failure's string code. The complete output is written to the
file the caller names, and the answer carries its size, whether the output
cap truncated it, and a tail of a fixed bound. That bound is
`outputTailBytes`, which crosses so that a caller answering a tail names it
rather than restating a figure of its own.

`cleanEnvironment` is the harness's only builder of a child environment. It
answers a complete environment without `NODE_OPTIONS`, whose flags would
otherwise reach a child with no such package installed, so no caller merges
this process's own environment again.

## Reading what Ramify generates

`views.ts` holds the readers. `readArchitectMeta` and `coverageLimitsOf` give
the view's revision, its input identity and, in one statement each, what the
view could not establish, so a caller reports a limit rather than treating an
absent detail as an absent fact. `loadArchitectIndex` walks the view once and
returns every module and every exported original it records;
`loadModuleTree` returns the modules alone, for a caller that needs no
symbols. `readApiView` reads one module's ordinary or testing API view, and
`findInView` answers whether a named original is available to that requester.

`measure.ts` holds `readMeasurement`, which runs `ramify measure --format
json`, validates the `ramify.measure/1` document and answers its per-module
buckets with the producer's own bytes beside them. A producer that cannot be
run, a document of another version and a document the format rejects are each
unavailable with that reason, never a zero.

## The identity of the state it describes

`guarded-files.ts` holds `guardedFilesHash`: the SHA-256 of each file whose
change could weaken a check, which is the test runner's and the compiler's
configuration, the package manifests and the contract artifacts an assignment
names. It is one hash per file rather than one over the set, so a change
names the file that changed, and a file that is not there is `null`. It
compares nothing, and no identity of the working tree is taken anywhere.

## Git, for the run branch

`git.ts` holds a few thin calls over `runCommand`: `isCleanRepository`, which
readiness needs; `createRunBranch`, which finds the run's branch again after
a crash and never resets it; `commitAccepted`, the commit made after a gate
passed; `findCommitByTrailer`, which is how a repeat finds what it already
committed; and `changedPaths`, `diffNumstat` and `worktreeLineChanges`, the only places
the harness learns what changed and by how many lines. Where git reports no
lines for a file, because it is binary, its size in the worktree is reported
instead and no line count is invented. `commitAccepted` is `git add -A`
and `git commit` with `--no-verify`, `--no-gpg-sign` and the harness's own
identity, so neither the project's hooks nor the person's configuration can
fail it; it refuses any branch that is not a run branch, and a tree with
nothing to commit is `null` rather than an empty commit.

## What is still elsewhere

`mapping/validate.ts` decides what a map submission may cite and stays with
the harness until the initial analysis replaces it. Which commands a
checkpoint runs, which tests a scope selects and what a guarded change means
are the harness's: this module answers what one command did and what one file
hashes to, and decides nothing about a gate.

## Tests

`src/tests/` covers what this module owns and what it cannot learn from a
caller: a command that leaves a descendant behind is settled by its process
group, `NODE_OPTIONS` is absent from a child's environment, a timeout is told
from a non-zero exit and a spawn failure carries its string code, the
measurement document's versions and rejections, the guarded set's hashes and
absences, and the run branch, whose commit succeeds where a project hook
fails and where no identity is configured. Ramify's check forms are answered
by a stand-in, so that no test starts a daemon; `ramify-cli.ts`'s
materialization is still exercised by the harness's mapping tests against the
real CLI.
