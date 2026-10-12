# Committed candidate audit

**Date:** 2026-10-12. **Verdict:** Pass. The implementation and plan qualification gate are complete for candidate `f370d7d3e96820710585668aabb9ec23cea29d43`. Registry publication and consumer adoption are separate work.

The user authorized the candidate commit, configured default audit and receipt-update commit. The audit started from a clean checkout using the committed `ramify-audit.json` and published auditor **0.7.0** installed outside the toolkit:

```sh
/home/app/tools/ramify-audit-0.7.0/node_modules/.bin/ramify-audit audit --cwd . --json
```

The command exited 0. Requested mode was defaulted `ramify-partial`; the auditor selected **full** execution because 134 distinct changed paths exceeded its drift cap of 25 since the baseline audit at `6161e76dcd22e45213a59e19950762750ca03e60`. No scope override was supplied. All five configured checks ran; none was omitted. Composition verdict is pass with zero outstanding failures.

| Configured check | Result |
| --- | --- |
| Patch integrity | Pass |
| Toolkit build | Pass |
| Toolkit type-check | Pass |
| Toolkit regression suite | Pass: 216 files, 3,007 tests, zero failures or skips |
| Toolkit self-check | Pass: 15 owners, 624 source files, zero errors/warnings, 47 nonblocking analysis limits |

The runner expected and executed all 216 configured test files. Duration was 344.714 seconds. The auditor recorded `2026-10-12T10:54:58.810Z` (12:54:58 Europe/Rome).

- Candidate commit: `f370d7d3e96820710585668aabb9ec23cea29d43`.
- Candidate source tree: `69a69bf3f569404aeddac95e35d000b8e7f1fe97`.
- Audit report commit: `82380fedea4d5ddb8688cf665e2d8da5841bc56c`.
- Run ID: `6fc049eb-531e-44a4-bc9b-572650f29901`.
- Run ref: `refs/audited/runs/2026-10-12T10-54-58Z-f370d7d3e`.
- Tree ref: `refs/audited/by-tree/69a69bf3f569404aeddac95e35d000b8e7f1fe97`.
- [Exact CLI JSON, compressed](evidence/candidate-audit.json.gz): uncompressed SHA-256 `77994fefef38c300815faf130b3c4a3dad75f235a82e28b06f2b5a66b330661d`; compressed SHA-256 `1649ce6f99dc9f6361b4fb305684f3950bd8586abb3d5e132069dcf174468fa2`. Standard error was empty.

Retrieve the retained Git evidence with:

```sh
git notes --ref=audit show f370d7d3e96820710585668aabb9ec23cea29d43
git show refs/audited/runs/2026-10-12T10-54-58Z-f370d7d3e:reports/audit/summary.json
```

The earlier [local qualification](completion-report.md) retains its original source/build identities. Candidate preparation compressed log artifacts and removed one trailing blank source line; the audit above qualifies the resulting committed source. The follow-up commit records receipts and documentation only. This audit names the implementation commit, not that later documentation commit. No published recovery version or release commit is claimed; manifest `0.4.3` and the disposable packed artifact remain unsuitable as a released adoption pin.

The subsequent [0.5.0 release receipt](release-receipt.md) records publication from its own versioned and fully audited release commit. The candidate audit above remains evidence for its original commit.
