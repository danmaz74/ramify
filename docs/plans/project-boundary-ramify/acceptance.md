# Executable acceptance matrix

**Status:** planned, not executed. [cases.json](cases.json) is the case register.
Each case requires independent expected assertions and a receipt naming its
fixture, command/configuration, revision, actual result and primary artifacts.
The producer column closes behavior only after its whole case passes; earlier
slices may exercise preparations but cannot claim completion. Iteration 20
requalifies every runtime case and iteration 21 qualifies artifact cases.
PB1-41 to PB1-44 cover the root marker (R7); their producers are the inserted
iterations 3A and 3B, registered as `"3A"` and `"3B"` in the case register.

Provider cases use local builders derived from [fixtures.md](fixtures.md).
Tests stay in the owning module's tests, or in the declared reference testing
module. No consumer copies a toolkit fixture file. Planned test paths are
specified in each iteration. Existing scenarios are retained through migration.

| Case | Independent expected result | Producer | Evidence boundary |
| --- | --- | --- | --- |
| PB1-01: Valid statement grammar | Both kinds parse with preserved spans, comments and interleaved exposure statement indices; ordinary exposures retain their meaning. | 2 | focused |
| PB1-02: Malformed statement grammar | Unquoted/empty directories, multiline strings, extra clauses, repeated headers and invalid encoding fail with located independent expected codes. | 2 | focused |
| PB1-03: Boundary layout validation | Escape, external-under-src, child overlap and a missing owned-ignored directory invalidate acquisition; absent external directories remain valid. | 8 | focused |
| PB1-04: Declaration ambiguity and symlinks | Duplicate normalized or overlapping declarations and symlink traversal fail; equivalent nonoverlapping real directories pass. | 8 | focused |
| PB1-05: Excluded discovery and separate roots | Neither ignored nor external descendants enter the enclosing model, and a marked project root inside either kind is neither interpreted nor a layout error; an ignored project selected from its own root is evaluated independently. | 8 | public-api |
| PB1-06: Undeclared project migration | A package manifest or a marked description in an undeclared nonmodule directory is a named layout error suggesting a declaration; a tsconfig alone never silently stops discovery. | 8 | focused |
| PB1-07: Auxiliary compiler source inventory | Owned selected and unselected compiler source outside src, including loose subs source, appears under its owner; external compiler dependencies do not become application files. | 8 | public-api |
| PB1-08: Inert and nonexistent ownership | New/deleted inert paths have containment owners without inventory entries, content hashes or per-file subscriptions. | 14 | public-api |
| PB1-09: Scratch location and ownership | Only tmp directly under each module src is excluded and owned; src/tests/tmp and tools/tmp remain ordinary analyzed source in their corresponding profiles. | 8 | focused |
| PB1-10: Git ignores do not define boundaries | Changing repository ignores changes optional advice only; owned unversioned compiler source remains analyzed with the same ownership rules. | 17 | cli-process |
| PB1-11: Compiler-selected exclusion warnings | Compiler-selected files in owned-ignored and scratch yield distinct nonblocking warnings with bounded path evidence; correct compiler exclusions remove them. | 8 | public-api |
| PB1-12: Auxiliary importer profile | Ordinary same-owner access passes, legal foreign exposure passes, illegal foreign access and testing origins fail; test-shaped auxiliary filenames remain ordinary. | 11 | public-api |
| PB1-13: Auxiliary original exposure | Direct/forwarded auxiliary exposure and forged model input fail; a normal src original and its valid companions pass. | 10 | focused |
| PB1-14: Nonpackage nested-tree imports | Value/type/symbol-free/namespace/lazy imports and re-exports into either tree by relative, alias or workspace-link routes are definite violations. | 11 | public-api |
| PB1-15: Installed linked package provenance | Established node_modules imports are external even at an ignored real target; a bare alias to that same target fails as a boundary import. | 11 | public-api |
| PB1-16: Outside and unresolved coverage | Nonpackage targets outside the root, unresolved targets and always-excluded targets retain explicit distinct coverage notes; none is labelled allowed or an established package. | 11 | public-api |
| PB1-17: Owner and reverse-import selection | a-owned paths select a/app/b in the written topology; root-owned inert edits select app only; isolated descendants are not selected by ancestry. | 14 | public-api |
| PB1-18: Affected exclusions | External/reserved seeds select nothing with excluded basis; owned-ignored and scratch seeds select their owner and transitive importers. | 14 | public-api |
| PB1-19: Affected additions deletions and renames | Absent/new/deleted paths and both rename sides resolve without reads; current child declarations change containment at the new revision; outside seeds alone cause unowned-path widening. | 14 | public-api |
| PB1-20: Changed-check dispositions | Every answered request has the exit code and findings of a complete check on the same inputs. Ignored/scratch/inert paths say not-analyzed without changing the exit code: 0 on a healthy project, 1 with definite findings. Exit 2 only for not-checked paths, deadline or unavailable work. | 17 | cli-process |
| PB1-21: Boundary structural invalidation | Adding/removing/changing declarations and removing an owned-ignored root reacquires or invalidates the model without stale passes; reincluded source is freshly captured. | 13 | retained |
| PB1-22: Auxiliary incremental membership | Auxiliary edits/new files/deletions/forwarding changes produce independently expected findings and match fresh batch in hot and warm sessions. | 13 | retained |
| PB1-23: Excluded and inert observation | Byte edits within ignored/scratch/inert files change no analysis inputs/facts and add no content observations or excluded watch registrations; boundary-root evidence remains observed. | 16 | ipc-process |
| PB1-24: Invalidation cancellation and limits | Invalid boundaries cannot publish a valid partial model; deadline/cancellation/byte bounds report explicit incomplete or unavailable outcomes and dispose owned resources. | 13 | retained |
| PB1-25: Schema and transport coherence | New report/affected/check/scope shapes round-trip through worker and real IPC; stale protocol peers reject coherently; strict codecs reject malformed new variants. | 16 | ipc-process |
| PB1-26: Git advisory behavior | Only ignored directories the selected project would enter warn; excluded dirs, no repo, absent Git and optional Git failure do not change source verdict; spaces/nested roots are safe. | 17 | cli-process |
| PB1-27: Architect boundary visibility | Module metadata names both boundary kinds and owned-ignored omissions; ignored descendants contribute no symbols/files/tests; analyzed auxiliary originals are internal evidence. | 18 | materialization |
| PB1-28: Foreign API projection | Only legal exposed originals appear; auxiliary/ignored originals never become foreign APIs; auxiliary from-selection uses the owner ordinary profile and excluded selection is refused. | 18 | materialization |
| PB1-29: Explorer and measurements | Source counts and byte sums include analyzed auxiliary source/resources exactly, exclude inert/ignored contents and remain revision-bound in explorer/browser projection. | 18 | public-api |
| PB1-30: CLI root selection | Real built batch and resident processes select the nearest root-marked description: the enclosing root from inside a nested unmarked module, and a marked project in an owned-ignored tree beneath subs/ from inside it. No marked description above exits 2 naming the working directory; --root on an unmarked description exits 1 with the add-the-marker message; the report states the root and how it was selected. | 17 | cli-process |
| PB1-31: Production selection policy | Resolved testing profiles exclude testing modules/areas; ordinary auxiliary inputs are eligible; inert ownership adds no production files and declared trees/scratch never enter. | 19 | public-api |
| PB1-32: Reference harness boundary | The harness tree is a root owned-ignored tree: none of its files enters the inventory, analysis or views, no analyzed toolkit source imports from it, no compiler-selected warning names it, and its test files and instances run unchanged under the unchanged command. | 8 | reference-runner |
| PB1-33: Legal toolkit scripting imports | Root scripts/measurements use exposed source APIs and cannot gain testing access from filename/configuration tricks; same-owner references remain legal. | 8 | self-check |
| PB1-34: Site package consumption | Site builds from the candidate exported package entries with no source aliases; isolated NodeNext consumer rejects an unlisted internal subpath and accepts supported exports. | 19 | packed-install |
| PB1-35: Full-mode and fallback gate | Existing audit full mode is explicitly requested and recorded; every gate runs reference separately; infrastructure fallback retains the failed attempt and all direct check evidence. | 20 | full-gate |
| PB1-36: Packed provider answers | An isolated install runs public typed API and batch/resident CLI against locally reconstructed topology and matches expected owners/exclusions/closure; no checkout source import is used. | 21 | packed-install |
| PB1-37: Bounds and cleanup | Capacity limits yield explicit incomplete outcomes, with any raised limit recorded with its measurement; 10000 inert/5000 excluded files do not create captured content/watch growth; all owned processes/listeners are released. | 20 | integration |
| PB1-38: Full regression and reference acceptance | Candidate full toolkit suite, explicit reference suite and required completed-plan acceptance chain execute with all required correctness cases passing, preserving failures and only valid evidence reuse; earlier timing targets are measured and reported as met or missed without failing the case. | 20 | full-gate |
| PB1-39: Revision-bound artifact receipt | Verified source/configuration/contract revisions, package version/digest, actual gate results and durable primary artifacts are bound in one handoff; a later changed tree is not silently certified. | 21 | artifact |
| PB1-40: Phase boundaries | No Phase 1 edit/install touches audit or agent, no unsupported audit fields are added and no local artifact path is committed as a dependency. | 21 | artifact |
| PB1-41: Root marker grammar | `root module` parses with the marker span and a whole-line header span; an unmarked header stays valid with a null marker and unchanged exposure records; `root` is reserved in every name position and valid there only quoted; as a tag it resolves through the registry, unknown under the default one; `root` alone, doubled, after `module` or before another statement is malformed with existing parser codes. | 3A | focused |
| PB1-42: Root selection by marker | Selection passes unmarked descriptions inside and outside subs/ and stops at the nearest marked one; a marked project in an owned-ignored tree beneath subs/ is selected from inside it; a marked root with later syntax errors stops the climb and acquisition reports them; no marked description is root-not-found naming the working directory; --root on an unmarked description is invalid unmarked-root-description with the add-the-marker message; a reused resolution is stale after a marker change and reused after a marker-preserving edit. | 3B | public-api |
| PB1-43: Root marker validity | A root description that lost its marker makes acquisition invalid with the migration message; a marked description at a child position beneath subs/ or at a stray position is a located undeclared-project-boundary layout error that contributes no module; the marked root with unmarked children acquires with exposures unchanged. | 3B | focused |
| PB1-44: Toolkit root migration | The toolkit and example roots carry the marker and their committed child descriptions do not; every toolkit generator and fixture writes marked roots; with the rule enforced, the full toolkit suite, self-check and every reference instance pass without deleting or skipping a case. | 3B | full-gate |

## Evidence requirements

Run real handler/session flows for public behavior and real built/installed
processes for CLI, IPC, root selection, linked resolution and watcher cleanup.
Fake-backed wiring cannot close a real-process case. For retained cases assert
both independent expectations and equality with a fresh batch on the same inputs.
Cancellation or unknown analysis is never a passing source check.

Resource tests preserve existing admitted ceilings. The scale fixture asserts
captured source bytes and excluded watch registrations independently of inert
file count; discovery may visit ordinary directories for boundary validity.
Measure baseline and candidate on the same fixtures, archive raw counts and
memory/latency. Under the [budget policy](budgets.md#policy) a missed earlier
timing target is reported to the user in the final handoff and does not fail
a case; no rule is weakened to meet one, and no new timing target is invented.

Full reference instance/measurement obligations remain in their adopted plans.
PB1 rows supplement them; they do not replace full regression or authorize
reclassifying registered-but-unrun cases as accepted. The final gate follows
[execution.md](execution.md), with its separate reference command and defined
old-audit fallback. Handoff expectations follow [handoff.md](handoff.md).
