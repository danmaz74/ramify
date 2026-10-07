# Installed public-provider fixtures for iteration 0

These are disposable Git projects preserved as complete bundles. `f2.bundle`
contains the five published audit reports and their exact run/tree refs as well
as the full, partial, failure, deletion, empty-selection and cancellation
source commits. `f3.bundle` contains the committed-configuration A/B, nested,
missing, symlink, malformed and invalid-schema commits. The five `f2-*.json`
files are the original CLI producer responses, without summary rewriting.
The compact matrices are in `../iteration0-p3-f3.json` and
`../iteration0-p4-installed-f2.json`.

The installed pair was `ramify.ts` 0.4.0 and `ramify-audit` 0.7.1 from
`https://npm.braimax.com`; the audit tarball SHA-256 was
`c9c2c6638ba0a8aa1775afb8eba5edcf880c4e0e44ab281da928464e6543074c`.
Restore with `git clone f2.bundle /tmp/plan21-replay-f2` and
`git clone f3.bundle /tmp/plan21-replay-f3`. In F2, install its locked
packages with `npm ci --ignore-scripts`; use an isolated npm host with installed
public `ramify-audit@0.7.1` for the commands below. The F3 reader needs only
that public package and Git. No provider source path is used.

The original CLI calls were, in order, against the F2 source commits named in
`../iteration0-p4-installed-f2.json`:

```sh
ramify-audit audit --cwd /tmp/plan21-iteration0-f2 --full --force --json
ramify-audit audit --cwd /tmp/plan21-iteration0-f2 --json
ramify-audit audit --cwd /tmp/plan21-iteration0-f2 --json
ramify-audit audit --cwd /tmp/plan21-iteration0-f2 --json
ramify-audit audit --cwd /tmp/plan21-iteration0-f2 --json
```

The cases were full A `91171a1`, partial B `9970c42`, failed command
`82a4922`, eligible deletion `e5ddbc3`, and empty README selection
`46db62a`. Each ran after checking out or committing its named source; the
bundle retains its resulting refs. The failed command exits 1, while its
completed producer result remains in `f2-failure.json`. The public
`findCompletedAuditRequest` lookup used each original `requestId` and
`sourceCommit` and recovered the same `runId` and `reportCommit` for all five.

`f3-reader.mjs` records the public A/B/nested/negative reader calls. To run it,
copy the script into the isolated npm host (so its bare package import resolves),
then pass the restored F3 directory as its first argument. The original A/B
positive call was made while the working definition contained malformed JSON;
that working change was restored afterward. `f2-cancellation.mjs` records the
public running cancellation: copy it into the same host and pass the restored
F2 directory checked out at `55c8175`. Its command writes a marker after its
child starts; the script aborts only after seeing that marker, then checks child
settlement, ref nonpublication and completed-result absence. The original
output is in `../iteration0-p4-installed-f2.json`.

The actual-agent adoption check uses the separate clean source `1c8764a8`
with the candidate declarations listed in
`../iteration0-actual-agent-adoption-probe.json`. It was a bounded disposable
probe, so its 15 findings and coverage-note counts are retained there rather
than committing a 44 MB transient analysis snapshot.
