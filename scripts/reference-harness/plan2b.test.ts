import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { repositoryRoot } from './plan.js';
import { apiViewIdentity, comparableReport, entryClosures, invariance, invariantCounters, materializeCounters, realRuns, renderedInstructionBlock,
  writeEvidence } from './plan2b-cases.js';
import type { ApiIdentityEvidence, EntryEvidence, InvarianceEvidence, RealRunsEvidence } from './plan2b-cases.js';

/**
 * Plan 2B iteration 8 (AV29–AV31, and AV34's API view, entry and closure cases) against the compiled
 * CLI and daemon. Run `npm run build` first. Each case owns its endpoint
 * directory and project copies and stops its daemon before it returns.
 * `RAMIFY_PLAN2B_EVIDENCE=<file>` writes the collected evidence.
 */

const evidence: Record<string, unknown> = {};
afterAll(async () => { await writeEvidence(evidence); });

describe('Plan 2B real runs (AV29, AV31)', () => {
  let runs: RealRunsEvidence;

  it('materializes the reference project and the toolkit, matches the expectation, writes nothing on a repeat and stops its daemons', async () => {
    runs = await realRuns();
    evidence.realRuns = { ...runs, primary: runs.primary.map(({ normalized: _normalized, ...rest }) => rest) };
    expect(runs.primary.map(item => item.kind)).toEqual(['reference', 'toolkit']);
    for (const run of runs.primary) {
      const label = run.kind;
      expect(run.first, label).toMatchObject({ code: 0, stderr: '', targets: 1, unchanged: 0, modules: 15, dependencies: 'measured' });
      expect(run.first.bytesWritten, label).toBe(run.bytes);
      expect(run.first.records, label).toBe(run.first.entries);
      expect(run.meta, label).toMatchObject({ schema: 'ramify.architect-view/2', revision: run.revision, input: run.inputId, modules: 15,
        // Plan 2C fixed the architect metrics policy as `measure`; a valid inventory is measured.
        dependencies: 'measured', dependencyScope: 'production', testReferences: 'measured', metrics: 'measured' });
      expect(run.structural.mismatches, label).toEqual([]);
      // An unchanged repeat writes nothing and touches no file.
      expect(run.repeat, label).toMatchObject({ code: 0, stderr: '', revision: run.first.revision, targets: 1, bytesWritten: 0, unchanged: 1,
        records: run.first.records, dependencies: 'measured' });
      expect(run.repeatTouched, label).toEqual([]);
      // Publishing the view started no revision.
      expect(run.sequenceAfter, label).toBe(run.sequenceBefore);
      expect(run.revisionsCounter.after, label).toBe(run.revisionsCounter.before);
      // A rewrite of a deleted view at the same revision is byte-identical (AV31, one daemon).
      expect(run.rewrite, label).toMatchObject({ code: 0, revision: run.first.revision, bytesWritten: run.bytes, unchanged: 0 });
      expect(run.rewriteDifference, label).toBeNull();
    }
    const reference = runs.primary[0]!;
    expect(reference.structural.checkedExposures).toBeGreaterThan(20);
    expect(reference.structural.checkedWildcardFiles).toBeGreaterThan(0);
    expect(reference.structural.checkedRelays).toBeGreaterThan(5);
    expect(reference.feature?.actual).toEqual(reference.feature?.expected);
    // The independent byte expectation: the same revision's facts computed in this process.
    expect(reference.inProcess?.inputId).toBe(reference.inputId);
    expect(reference.inProcess?.difference).toBeNull();
    expect(reference.inProcess?.records).toBe(reference.first.records);
    // Both daemons were stopped in finally and their processes are gone.
    expect(runs.stops).toHaveLength(2);
    for (const stop of runs.stops) expect(stop).toMatchObject({ stopCode: 0, statusAfterStop: 'not running', survivingPids: [] });
  }, 900_000);

  it('gives byte-identical views on a second daemon, apart from the revision identifier, and at another path apart from the input too', () => {
    expect(runs.secondary.map(item => `${item.placement} ${item.kind}`))
      .toEqual(['same-path reference', 'same-path toolkit', 'other-path reference', 'other-path toolkit']);
    for (const second of runs.secondary) {
      const label = `${second.placement} ${second.kind}`;
      const first = runs.primary.find(item => item.kind === second.kind)!;
      expect(second.first, label).toMatchObject({ code: 0, dependencies: 'measured', records: first.first.records, bytesWritten: first.bytes });
      expect(second.revision, label).not.toBe(first.revision);
      if (second.placement === 'same-path') {
        expect(second.roots[1], label).toBe(second.roots[0]);
        expect(second.inputId, label).toBe(first.inputId);
      } else {
        expect(second.roots[1], label).not.toBe(second.roots[0]);
        expect(second.inputId, label).not.toBe(first.inputId);
      }
      expect(second.difference, label).toBeNull();
      // The revision appears only where the specification places it: metadata, the map and every module.json.
      const places = Object.keys(second.revisionOccurrences).sort();
      expect(places.filter(path => !/(?:^|\/)module\.json$/.test(path)), label).toEqual(['README.md', '_meta.json']);
      expect(places.filter(path => /(?:^|\/)module\.json$/.test(path)), label).toHaveLength(15);
      expect(Object.values(second.revisionOccurrences).every(count => count === 1), label).toBe(true);
    }
  });
});

describe('Plan 2B agent instructions (deliverable 3)', () => {
  it('gives AGENTS.md and CLAUDE.md the exact block the generated README opens with', async () => {
    const block = (text: string) => /```text\n(This directory is generated[\s\S]*?)\n```/.exec(text)?.[1] ?? null;
    const readme = await renderedInstructionBlock();
    expect(readme).toContain('This directory is generated by `ramify materialize --view architect`.');
    for (const file of ['AGENTS.md', 'CLAUDE.md']) expect(block(await readFile(join(repositoryRoot, file), 'utf8')), file).toBe(readme);
  });
});

describe('Plan 2B invariance (AV30)', () => {
  it('gives identical check reports, revision sequences and counters with and without interleaved materialization', async () => {
    const run: InvarianceEvidence = await invariance();
    evidence.invariance = { ...run, control: run.control.map(step => ({ ...step, report: step.report ? { inputId: step.report.inputId, summary: step.report.summary } : null })),
      interleaved: run.interleaved.map(step => ({ ...step, report: step.report ? { inputId: step.report.inputId, summary: step.report.summary } : null })) };
    expect(run.control.map(step => step.step)).toEqual(['open', 'edit-source', 'edit-test', 'unchanged']);
    expect(run.interleaved.map(step => step.step)).toEqual(run.control.map(step => step.step));
    // The watcher published each edit's revision in both runs, so both took the same path.
    expect(run.control.map(step => step.watcherPublished)).toEqual([null, true, true, null]);
    expect(run.interleaved.map(step => step.watcherPublished)).toEqual([null, true, true, null]);
    for (const [index, control] of run.control.entries()) {
      const interleaved = run.interleaved[index]!;
      expect(control.code, control.step).toBe(0);
      expect(interleaved.code, control.step).toBe(0);
      expect(comparableReport(interleaved.report), control.step).toEqual(comparableReport(control.report));
      expect([interleaved.sequence, interleaved.cause, interleaved.history], control.step).toEqual([control.sequence, control.cause, control.history]);
      expect(interleaved.session, control.step).toEqual({ ...control.session!, compilerPid: interleaved.session!.compilerPid });
      for (const name of invariantCounters) expect(interleaved.counters[name], `${control.step} ${name}`).toBe(control.counters[name]);
      // The materialization counters differ by exactly what the materializations before this check did.
      const prior = run.materializations.filter(item => run.control.findIndex(step => step.step === item.after) < index);
      for (const name of materializeCounters) {
        const done = prior.reduce((sum, item) => sum + item.settled.counters[name]! - item.before.counters[name]!, 0);
        expect(interleaved.counters[name]! - control.counters[name]!, `${control.step} ${name}`).toBe(done);
      }
    }
    expect(run.control.map(step => step.sequence)).toEqual([1, 2, 3, 3]);
    expect(run.materializations).toHaveLength(3);
    for (const item of run.materializations) {
      expect(item.run, item.after).toMatchObject({ code: 0, stderr: '', dependencies: 'measured' });
      // Publishing starts no revision, immediately or after the watcher's debounce.
      expect([item.afterRun.sequence, item.settled.sequence], item.after).toEqual([item.before.sequence, item.before.sequence]);
      for (const name of invariantCounters) expect(item.settled.counters[name], `${item.after} ${name}`).toBe(item.before.counters[name]);
      // One required sweep, counted as one analysis, and one analyzer job for a revision without retained facts.
      expect(item.settled.counters.sweeps! - item.before.counters.sweeps!, item.after).toBe(1);
      expect(item.settled.counters.analyses! - item.before.counters.analyses!, item.after).toBe(1);
      expect(item.settled.counters.dependencyDiagrams! - item.before.counters.dependencyDiagrams!, item.after).toBe(1);
      expect(item.settled.counters.behaviorRuns! - item.before.counters.behaviorRuns!, item.after).toBeGreaterThan(0);
    }
    for (const stop of run.stops) expect(stop).toMatchObject({ stopCode: 0, statusAfterStop: 'not running', survivingPids: [] });
  }, 600_000);
});

describe('Plan 2B regressions (AV34)', () => {
  it('publishes the same API view without --view as the build before Plan 2B, byte for byte', async () => {
    const identity: ApiIdentityEvidence = await apiViewIdentity();
    evidence.apiViewIdentity = identity;
    expect(identity.baseline.buildCode).toBe(0);
    expect(identity.projects.map(item => item.kind)).toEqual(['reference', 'toolkit']);
    for (const project of identity.projects) {
      expect(project.baseline, project.kind).toMatchObject({ code: 0, stderr: '', unchanged: 0 });
      expect(project.current, project.kind).toMatchObject({ code: 0, stderr: '', unchanged: 0,
        targets: project.baseline.targets, entries: project.baseline.entries, bytesWritten: project.baseline.bytesWritten });
      expect(project.currentStdoutLines, project.kind).toHaveLength(2);
      expect(project.files, project.kind).toBeGreaterThan(10);
      expect(project.difference, project.kind).toBeNull();
    }
    for (const stop of identity.stops) expect(stop).toMatchObject({ stopCode: 0, statusAfterStop: 'not running', survivingPids: [] });
  }, 600_000);


  it('keeps the eight reviewed entries beside the recorded additions and the lightweight ./cli and ./client closures', async () => {
    const entries: EntryEvidence = await entryClosures();
    evidence.entries = entries;
    expect(entries.packageEntries).toBe(8);
    expect(entries.manifest.equalToBaseline).toBe(true);
    expect(entries.manifest.baselineExports).toEqual(['.', './analysis', './analysis/inventory', './model', './presentation', './cli', './layout', './client']);
    // The recorded additions are named, not a bare superset, and the stylesheet
    // entry is a string target that the gate reads as a file and never imports.
    expect(entries.manifest.additions).toEqual(['./module-tree', './module-tree.css']);
    expect(entries.manifest.stylesheetAdditions).toEqual(['./module-tree.css']);
    expect(entries.manifest.exports.filter(key => !entries.manifest.additions.includes(key)))
      .toEqual(['.', './analysis', './analysis/inventory', './model', './presentation', './cli', './layout', './client']);
    expect(entries.client.code).toBe(0);
    expect(entries.client.closure.length).toBeGreaterThan(1);
    expect(entries.cli.code).toBe(0);
    expect(entries.cli.closure).toContain('dist/subs/cli/src/index.js');
    expect(entries.cli.forbidden).toEqual([]);
    expect(entries.cli.activity).toBe(0);
  }, 300_000);
});
