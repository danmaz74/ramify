# Capability recovery integration

After the [passing pre-merge released full nested audit](06-premerge-audit.md), the coordinator merged candidate `80cd98c208925a4b1ac61d57bbbe5048768aba62` plus receipt-only `23318db9` into target `fcc89393` as `420383957bfca51f5c62511c3ef850a9c3f40850`.

Plan21 had 60 dirty tracked files and one untracked workflow test. Three dirty files also received narrow optimization changes: capability recovery, composition and recovery-table. An initial context-sensitive apply check refused nearby dirty context before modifying any target file or ref. A conflict-free three-way merge of each overlap then produced patches against the current working bytes; an isolated context-shift control verified committed optimization content excludes unfinished edits. Integration verified all unrelated bytes, preserved the working edits in overlapping files, and left the index unstaged. No unfinished Plan21 work was committed or discarded. The untracked workflow test was untouched.

The four exact ordinary recovery, strict-control, actual-recovery and composition files then passed **39 tests, zero failed, zero skipped** from the target's `ramify-agent/` directory. Report: `/tmp/plan22-recovery-integrated.json`; log: `/tmp/plan22-recovery-integrated.log`. The ordinary guards report zero setup/flow/cleanup attempts. These focused checks also exercised the target's current unfinished Plan21 runtime. The pre-merge audit qualifies the clean committed candidate; it does not declare the unfinished Plan21 work fully audited.

All 18 original case destinations and the 105 original assertion lines were preserved in the optimization candidate. Concurrent Plan21 working edits independently remove an assertion about a legacy event being removed from its protocol; that working edit remains intact. It was not removed by this optimization.

Cut 6 is integrated. The next worktree begins the nonfunctional lifecycle family; remaining migrations and automatic runner enforcement remain outstanding.
