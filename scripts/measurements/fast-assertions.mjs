import { fastBudgets as budgets, fastFixtures, fixtureForId, editKindsFor } from './fast-plan.mjs';
import { assertResidentWorkload } from './resident-assertions.mjs';
import { median } from './common.mjs';
import { isDeepStrictEqual } from 'node:util';
import { coverageEquals, fixtureSignatureNotes } from './signature-notes.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...(values ?? [])].sort();
const finite = value => Number.isFinite(value) && value >= 0;
const med = values => values?.length && values.every(finite) ? median(values) : null;
const timing = cycle => cycle?.revision?.timings?.total;

/**
 * `fixture` names the pinned signature notes a build enforcing Plan 8's rule adds,
 * and `state` the measurement state; see `coverageMatches`.
 */
function coveringEdit(cycle, fixture = null, state = {}) {
  const revision = cycle?.revision, hook = cycle?.hook, document = hook?.document;
  const notes = expectedSignatureNotes(fixture, revision?.timings, state).length;
  return hook?.failure === null && hook.signal === null && hook.stderr === '' && [0, 1].includes(hook.code)
    && document?.schemaVersion === 'ramify.check/2' && document.outcome === 'checked'
    && document.execution === 'completed' && document.exitCode === hook.code
    && revision?.outcome?.execution === 'completed' && revision.outcome.coverage === (notes ? 'partial' : 'complete')
    && coverageMatches(fixture, revision.timings, document.coverage, [], state)
    && Number.isSafeInteger(cycle.beforeSequence) && cycle.beforeSequence >= 0
    && Number.isSafeInteger(revision.sequence) && revision.sequence > cycle.beforeSequence
    && document.revision?.sequence === revision.sequence && document.revision.id === revision.revision
    && Array.isArray(cycle.expected) && cycle.expected.length > 0
    && Array.isArray(document.paths) && document.paths.length === cycle.expected.length
    && document.paths.every((item, index) => item.disposition === 'checked'
      && item.path === cycle.expected[index].path && item.sha256 === cycle.expected[index].sha256)
    && same(document.timings?.daemon, revision.timings);
}

function scopedEdits(data, kind, path) {
  const rows = data?.cycles?.[kind];
  return rows?.length === budgets.editCycles && rows.every((cycle, index) => {
    const denied = kind === 'description' && index % 2 === 0 ? 1 : 0;
    // A description removal is the edit that removes the setup's exposure of `value`.
    return cycle.kind === kind && cycle.revision?.checked?.path === path
      && coveringEdit(cycle, data?.name ?? null, { setupExposureRemoved: denied === 1 })
      && cycle.revision.summary?.denied === denied && cycle.hook.code === (denied ? 1 : 0)
      && cycle.hook.document.findings?.length === denied && finite(timing(cycle))
      && (index === 0 || cycle.beforeSequence >= rows[index - 1].revision.sequence
        && cycle.revision.sequence > rows[index - 1].revision.sequence);
  }) ? rows : null;
}

function filteredExtractionTimings(data, name) {
  const body = data?.fixtures?.find(fixture => fixture.name === name)?.body;
  const rows = scopedEdits(data, 'body', 'unchanged-surface');
  return typeof body === 'string' && body.length > 0 && rows?.every(cycle =>
    same(cycle.revision.checked.files, [body]) && cycle.revision.checked.accesses === 0
    && cycle.revision.checked.modelRebuilt === false && cycle.expected.length === 1
    && cycle.expected[0].path === body && finite(cycle.revision.timings?.accesses))
    ? rows.map(cycle => cycle.revision.timings.accesses) : null;
}

function completedCold(data, name) {
  const reply = data?.cold?.reply, revision = reply?.revision;
  return reply?.status === 'reported' && reply.published === true
    && revision?.checked?.path === 'cold' && revision.outcome?.execution === 'completed'
    && revision.outcome.coverage === (expectedSignatureNotes(name, revision.timings).length ? 'partial' : 'complete')
    && revision.summary?.owners === (name === 'reference' ? 15 : Number(name.slice(1)))
    && finite(revision.timings?.total);
}

function deletedCoverage(data, name, cycle) {
  const definition = data?.fixtures?.find(fixture => fixture.name === name);
  const body = name === 'reference' ? 'src/assembly.ts' : 'src/impl0.ts';
  if (definition?.body !== body || definition.created !== 'src/fast-measurement-created.ts'
    || definition.creationWitness?.path !== body || definition.creationWitness.specifier !== './fast-measurement-created.js'
    || cycle?.kind !== 'deleted' || cycle.expected?.length !== 1
    || cycle.expected[0].path !== definition.created || cycle.expected[0].sha256 !== null) return null;
  return [{ id: name === 'reference'
    ? 'access-limit/1:69a7528da599c0bb91ecdf8acdbb521e4c05fc19dd2c35a1433baa447e559f4f'
    : 'access-limit/1:797e8a8de4b78a82be864b29b885b098b6f01f5c5c942cb9f2db4cbb1d812c53',
  code: 'unresolved-target', location: { file: body, start: 7, end: 38, line: 1, column: 8 },
  message: 'Cannot establish the accessed source or resource target', related: [] }];
}

/**
 * Plan 8 adds `companions`, the signature-companion pass measured inside
 * `decide`, to the nine revision timings. A build reports all nine, and the
 * tenth exactly when it enforces the rule.
 */
const stageTimings = ['classify', 'inventory', 'compiler', 'descriptions', 'accesses', 'link', 'decide', 'publish', 'total'];
export const enforcesCompanions = timings => Object.hasOwn(timings ?? {}, 'companions');
export function revisionTimingsValid(timings) {
  const keys = Object.keys(timings ?? {}).sort();
  const expected = [...stageTimings, ...(enforcesCompanions(timings) ? ['companions'] : [])].sort();
  return same(keys, expected) && Object.values(timings).every(finite);
}

/**
 * The `signature-inferred` notes a build that enforces the rule reports on each
 * fixture state, by original: `signature-notes.mjs` pins them for every
 * measurement recipe. A build that does not enforce the rule reports none.
 */
export function expectedSignatureNotes(fixture, timings, state = {}) {
  return enforcesCompanions(timings) ? fixtureSignatureNotes(fixture, state) : [];
}
/** Other coverage entries equal `expected`; signature notes equal the fixture state's pinned set, once each. */
export function coverageMatches(fixture, timings, coverage, expected, state = {}) {
  return coverageEquals(coverage, expectedSignatureNotes(fixture, timings, state), expected);
}

const counterFields = ['analyses', 'revisions', 'coveredRequests', 'sweeps', 'audits'];
const maintenance = counters => counters.sweeps + counters.audits;

/**
 * Judges a hook whose watcher revision had already published by the work it
 * caused. `b`, `a` and `s` are daemon counters sampled before the hook,
 * immediately after it returned and once settled. Sweeps and audits may run in
 * either interval, since each one also counts as an analysis; any other
 * analysis, publication or missing covered request fails.
 */
export function publishedHookAttributed(cycle) {
  const document = cycle?.hook?.document;
  const b = cycle?.beforeHook?.counters, a = cycle?.afterHook?.counters, s = cycle?.settled?.counters;
  if (![b, a, s].every(counters => counterFields.every(field => Number.isSafeInteger(counters?.[field]) && counters[field] >= 0))) return false;
  return Number.isSafeInteger(document?.revision?.sequence)
    && cycle.beforeHook.contexts?.[0]?.published?.sequence === document.revision.sequence
    && cycle.hook.code === 0 && document.exitCode === 0
    && Array.isArray(document.paths) && document.paths.length > 0 && document.paths.every(item => item.disposition === 'checked')
    && a.coveredRequests === b.coveredRequests + 1
    && a.analyses - b.analyses === maintenance(a) - maintenance(b)
    && s.revisions === b.revisions && s.coveredRequests === a.coveredRequests
    && s.analyses - a.analyses === maintenance(s) - maintenance(a);
}

const replySessionWork = ['invocationCheck', 'workerStatus', 'workerRoundTrip', 'publication'];

/**
 * Judges a hook launched while the watcher's update for its write ran. `b` and
 * `s` are daemon counters sampled before the save and once settled. The hook
 * must be answered from the racing revision with every changed entry covered.
 * Either the revision that published answered it as a covered request with no
 * session work of its own, or it added no covered request and was answered by
 * an update that included it, as when it arrived before the watcher's batch.
 * Sweeps and audits count in `analyses` and are discounted; at least one other
 * analysis must have run. A covered answer from another revision, more than one
 * covered request, or a covered reply that reports session work fails.
 */
export function racingHookAttributed(cycle, fixture = null) {
  const b = cycle?.countersBeforeSave, s = cycle?.settled?.counters, reply = cycle?.hook?.document?.timings?.reply;
  if (![b, s].every(counters => counterFields.every(field => Number.isSafeInteger(counters?.[field]) && counters[field] >= 0))) return false;
  if (!coveringEdit(cycle, fixture) || cycle.hook.code !== 0) return false;
  if (s.analyses - b.analyses - (maintenance(s) - maintenance(b)) < 1) return false;
  const covered = s.coveredRequests - b.coveredRequests;
  if (covered === 1) return reply === undefined || replySessionWork.every(field => reply[field] === 0);
  return covered === 0 && (reply === undefined || reply.workerRoundTrip > 0);
}

/** Recompute from raw responses and observations, never trust a saved verdict. */
export function assertFastWorkload(id, measurements) {
  if (id === 'I5-13:entry-footprints') return assertResidentWorkload('I2-29:entry-footprints', measurements);
  const assertions = [];
  const check = (name, passed, observed = null) => assertions.push({ name, passed: Boolean(passed), observed });
  // Every Plan 5 timing and memory target is an ideal optimization budget: a
  // miss is recorded with its target and never fails. Missing evidence still fails.
  const target = (name, observed, maximum) => {
    const valid = finite(observed);
    assertions.push({ name, passed: valid, observed, maximum, enforcement: 'ideal', targetMet: valid && observed <= maximum });
  };
  const count = (name, values, expected) => check(name, Array.isArray(values) && values.length === expected, values?.length ?? null);
  const natural = value => Number.isSafeInteger(value) && value >= 0;
  function validProcessSample(sample) {
    return Array.isArray(sample?.processes)
      && sample.processes.every(row => Number.isSafeInteger(row.pid) && row.pid > 0 && finite(row.rssBytes))
      && new Set(sample.processes.map(row => row.pid)).size === sample.processes.length
      && sample.combinedRssBytes === sample.processes.reduce((sum, row) => sum + row.rssBytes, 0);
  }
  function processes(name, samples) {
    check(`${name}: external process samples`, samples?.length > 0 && samples.every(validProcessSample)
      && samples.some(sample => sample.combinedRssBytes > 0), samples?.length ?? null);
  }
  function withinRetention(sample) {
    return Array.isArray(sample?.contexts) && sample.contexts.length <= budgets.runtime.contexts
      && sample.contexts.every(context => finite(context.retainedBytes) && context.retainedBytes <= budgets.runtime.factBytes
        && finite(context.history?.bytes) && context.history.bytes <= budgets.runtime.historyBytes
        && natural(context.history?.retained) && context.history.retained <= budgets.runtime.historyRevisions
        && (context.session === null ? context.level === 'cold' && context.retainedBytes === 0
          : finite(context.session?.factBytes) && context.session.factBytes <= budgets.runtime.factBytes
            && context.session.factBytes === context.retainedBytes))
      && sample.contexts.reduce((sum, context) => sum + context.retainedBytes + context.history.bytes, 0) <= budgets.runtime.globalBytes;
  }
  function telemetry(name, data) {
    check(`${name}: telemetry polling completed`, Array.isArray(data?.telemetryErrors) && data.telemetryErrors.length === 0, data?.telemetryErrors ?? null);
    check(`${name}: daemon counters and session samples`, data?.telemetry?.length > 0 && data.telemetry.every(sample =>
      finite(sample.memory?.rss) && finite(sample.memory?.heapUsed) && finite(sample.counters?.analyses)
      && sample.contexts?.every(context => finite(context.retainedBytes) && finite(context.history?.bytes))), data?.telemetry?.length ?? null);
    check(`${name}: runtime retention throughout telemetry`, data?.telemetry?.length > 0 && data.telemetry.every(withinRetention),
      { samples: data?.telemetry?.length ?? 0,
        violations: data?.telemetry?.flatMap((sample, index) => withinRetention(sample) ? [] : [index]).slice(0, 20) ?? [] });
    processes(name, data?.processSamples);
    check(`${name}: observed cleanup`, data?.cleanup?.stopped === true && same(data.cleanup.liveProcesses, []), data?.cleanup ?? null);
  }
  function completed(label, cycle, denied = 0, expectedCoverage = [], { fixture = null, findings = denied, setupExposureRemoved = false } = {}) {
    const hook = cycle?.hook, doc = hook?.document;
    const timings = cycle?.revision?.timings, state = { setupExposureRemoved };
    const notes = expectedSignatureNotes(fixture, timings, state).length;
    check(`${label}: real covering CLI result`, hook?.failure === null && hook.signal === null && hook.stderr === ''
      && hook.code === (findings ? 1 : 0) && doc?.schemaVersion === 'ramify.check/2'
      && doc.outcome === 'checked' && doc.execution === 'completed' && doc.exitCode === hook.code
      && natural(cycle.beforeSequence) && doc.revision?.sequence > cycle.beforeSequence
      && cycle.revision?.revision === doc.revision.id && cycle.revision.sequence === doc.revision.sequence
      && Array.isArray(cycle.expected) && cycle.expected.length > 0
      && doc.paths?.length === cycle.expected.length && doc.paths.every((item, index) => item.disposition === 'checked'
        && item.path === cycle.expected[index].path && item.sha256 === cycle.expected[index].sha256),
    { code: hook?.code ?? null, reason: doc?.reason ?? null, sequence: doc?.revision?.sequence ?? null });
    check(`${label}: independent outcome`, cycle?.revision?.outcome?.execution === 'completed'
      && cycle.revision.summary?.denied === denied && doc?.findings?.length === findings
      && coverageMatches(fixture, timings, doc?.coverage, expectedCoverage, state)
      && cycle.revision.outcome.coverage === (expectedCoverage.length + notes ? 'partial' : 'complete'),
    { denied: cycle?.revision?.summary?.denied ?? null, findings: doc?.findings?.length ?? null,
      coverage: doc?.coverage?.length ?? null });
    check(`${label}: timings match the covering revision`, same(doc?.timings?.daemon, timings)
      && revisionTimingsValid(timings) && finite(hook?.durationMs), timing(cycle) ?? null);
  }
  /**
   * The configuration row's hook is answered at once as not checked: a configuration
   * edit is not the kind of change a post-write hook verifies. The cycle's revision is
   * the one the daemon published behind that reply, read after the cycle settled.
   */
  function notChecked(label, cycle, fixture = null) {
    const hook = cycle?.hook, doc = hook?.document;
    const notes = expectedSignatureNotes(fixture, cycle?.revision?.timings).length;
    check(`${label}: real immediate not-checked CLI result`, hook?.failure === null && hook.signal === null && hook.stderr === ''
      && hook.code === 2 && doc?.schemaVersion === 'ramify.check/2' && doc.outcome === 'not-checked'
      && doc.reason === 'configuration-changed' && doc.exitCode === 2 && doc.revision === null
      && doc.checked === null && doc.execution === null && doc.timings?.daemon === null
      && Array.isArray(cycle.expected) && cycle.expected.length > 0
      && doc.paths?.length === cycle.expected.length && doc.paths.every((item, index) => item.disposition === 'not-checked'
        && item.reason === 'configuration-changed' && item.path === cycle.expected[index].path && !('sha256' in item)),
    { code: hook?.code ?? null, reason: doc?.reason ?? null, revision: doc?.revision ?? null });
    check(`${label}: independent outcome`, cycle?.revision?.outcome?.execution === 'completed'
      && cycle.revision.summary?.denied === 0 && doc?.findings?.length === 0
      && Array.isArray(doc.coverage) && isDeepStrictEqual(doc.coverage, [])
      && cycle.revision.outcome.coverage === (notes ? 'partial' : 'complete'),
    { denied: cycle?.revision?.summary?.denied ?? null, findings: doc?.findings?.length ?? null });
    check(`${label}: background revision published behind the reply`, natural(cycle?.beforeSequence)
      && cycle.revision?.sequence > cycle.beforeSequence
      && revisionTimingsValid(cycle.revision.timings) && finite(hook?.durationMs),
    { before: cycle?.beforeSequence ?? null, sequence: cycle?.revision?.sequence ?? null, durationMs: hook?.durationMs ?? null });
  }
  function retained(label, settled) {
    check(`${label}: runtime retention`, settled?.contexts?.length > 0 && withinRetention(settled),
      settled?.contexts?.map(context => ({ facts: context.session?.factBytes, history: context.history?.bytes })) ?? null);
    check(`${label}: no audit mismatch`, settled?.counters?.auditMismatches === 0, settled?.counters?.auditMismatches ?? null);
  }
  function checked(name, data) {
    const definition = data?.fixtures?.find(item => item.name === name);
    const body = data?.cycles?.body, source = data?.cycles?.source;
    count(`${name}: body checked sets`, body, 20); count(`${name}: export checked sets`, source, 20);
    for (const [kind, cycles] of [['body', body], ['source', source]]) {
      for (const [index, cycle] of (cycles ?? []).entries()) completed(`${name}: ${kind} checked set ${index + 1}`, cycle, 0, [], { fixture: name });
      check(`${name}: ${kind} checked sets belong to advancing revisions`, cycles?.length > 0
        && cycles.every((cycle, index) => index === 0 || cycle.beforeSequence >= cycles[index - 1].revision?.sequence
          && cycle.revision?.sequence > cycles[index - 1].revision?.sequence), cycles?.map(cycle => cycle.revision?.sequence) ?? null);
    }
    check(`${name}: one file and zero decided accesses`, body?.length > 0 && body.every(cycle =>
      cycle.revision?.checked?.path === 'unchanged-surface' && cycle.revision.checked.accesses === 0
      && same(cycle.revision.checked.files, [definition?.body]) && !cycle.revision.checked.modelRebuilt),
    body?.map(cycle => cycle.revision?.checked) ?? null);
    check(`${name}: exported file and its importers only`, definition?.sourceImporters?.length > 0 && source?.length > 0
      && source.every(cycle => cycle.revision?.checked?.path === 'source'
        && same(sorted(cycle.revision.checked.files), sorted([definition.source, ...definition.sourceImporters]))),
    source?.map(cycle => cycle.revision?.checked) ?? null);
  }
  const lifetimeFields = [
    ['filesOpened', 'filesClosed', 'files'], ['watchersOpened', 'watchersClosed', 'watchers'],
    ['helpersStarted', 'helpersClosed', 'helpers'], ['sessionsCreated', 'sessionsDisposed', 'activeSessions'],
    ['workersCreated', 'workersExited', 'workerCount'], ['compilersStarted', 'compilersExited', 'compilerCount'],
  ];
  function balanced(sample) {
    return lifetimeFields.every(([opened, closed, live]) => natural(sample?.totals?.[opened])
      && natural(sample.totals[closed]) && natural(sample[live])
      && sample.totals[opened] - sample.totals[closed] === sample[live]);
  }
  function physicalMemory(cycle) {
    const sample = cycle?.settledProcessSample, settled = cycle?.settled, instrumentation = settled?.instrumentation;
    const workers = instrumentation?.workers?.map(worker => worker.pid), compilers = instrumentation?.compilerPids;
    if (!validProcessSample(sample) || !finite(sample.at) || !finite(instrumentation?.at)
      || sample.at < instrumentation.at || instrumentation.pid !== settled?.pid
      || !Array.isArray(workers) || !Array.isArray(compilers)
      || workers.length !== 1 || compilers.length !== 1
      || instrumentation.workerCount !== workers.length || instrumentation.compilerCount !== compilers.length
      || settled.contexts?.length !== 1 || settled.contexts[0].session?.compiler?.pid !== compilers[0]) return null;
    const pids = [settled.pid, ...workers, ...compilers];
    if (pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0) || new Set(pids).size !== pids.length
      || !same(sorted(pids), sorted(sample.processes.map(row => row.pid)))) return null;
    const sum = ids => sample.processes.filter(row => ids.includes(row.pid)).reduce((total, row) => total + row.rssBytes, 0);
    return { daemon: sum([settled.pid]), worker: sum(workers), compiler: sum(compilers), combined: sample.combinedRssBytes };
  }
  if (!measurements) { check('raw measurements exist', false); return assertions; }
  const name = fixtureForId(id);
  if (name) {
    const data = measurements, limit = budgets[name];
    count('bare Node process floor', data.bareNode, 20);
    check('bare Node processes completed', data.bareNode?.every(row => row.code === 0 && row.signal === null && row.failure === null && row.stderr === '' && row.durationMs > 0),
      data.bareNode?.map(row => row.durationMs) ?? null);
    count('zero-work client samples', data.zeroWork, 20);
    check('zero-work clients cover the revision without analysis', data.zeroWork?.every(row =>
      row.hook?.document?.outcome === 'checked' && row.hook.code === 0
      && row.hook.document.paths.every(item => item.disposition === 'checked')
      && row.before.counters.analyses === row.after.counters.analyses
      && row.before.counters.revisions === row.after.counters.revisions
      && row.after.counters.coveredRequests > row.before.counters.coveredRequests),
    data.zeroWork?.map(row => row.hook?.durationMs) ?? null);
    const paths = { body: 'unchanged-surface', source: 'source', description: 'description', readme: 'metadata',
      created: 'membership', deleted: 'membership', configuration: 'broad', signature: 'source', companion: 'description' };
    const definition = data.fixtures?.find(item => item.name === name);
    for (const kind of editKindsFor(name)) {
      const cycles = data.cycles?.[kind]; count(`${kind}: twenty cycles`, cycles, 20);
      for (const [index, cycle] of (cycles ?? []).entries()) {
        const removal = index % 2 === 0;
        if (kind === 'configuration') notChecked(`${kind} ${index + 1}`, cycle, name);
        // X100's wildcard still exposes the value whose extra named exposure the description edit removes.
        // The removal leaves no fixture a signature note; see `signature-notes.mjs`.
        else if (kind === 'description') completed(`${kind} ${index + 1}`, cycle, removal && name !== 'X100' ? 1 : 0, [],
          { fixture: name, setupExposureRemoved: removal });
        // A companion removal fails the check with its pinned findings, and no denied import, only where the rule is enforced.
        else if (kind === 'companion') completed(`${kind} ${index + 1}`, cycle, 0, [], { fixture: name,
          findings: removal && enforcesCompanions(cycle?.revision?.timings) ? definition?.companionFindings ?? -1 : 0 });
        else completed(`${kind} ${index + 1}`, cycle, 0, kind === 'deleted' ? deletedCoverage(data, name, cycle) : [], { fixture: name });
        if (kind === 'companion' && removal && enforcesCompanions(cycle?.revision?.timings)) {
          check(`${kind} ${index + 1}: companion findings only`, cycle.hook?.document?.findings?.every(finding =>
            finding.code === 'exposed-without-companion' && finding.location?.file === definition?.companion),
          cycle.hook?.document?.findings?.map(finding => finding.code) ?? null);
        }
        check(`${kind} ${index + 1}: revision path`, cycle.revision?.checked?.path === paths[kind], cycle.revision?.checked?.path ?? null);
        retained(`${kind} ${index + 1}`, cycle.settled);
      }
      target(`${kind}: median session work (ms)`, med(cycles?.map(timing)), limit[kind]);
    }
    const racing = data.cycles?.body;
    check('racing hooks launched before publication', racing?.length > 0 && racing.every(cycle => cycle.hookStartedAt <= cycle.revision?.publishedAt),
      racing?.map(cycle => ({ started: cycle.hookStartedAt, published: cycle.revision?.publishedAt })) ?? null);
    check('racing hooks are answered from the racing revision', racing?.length > 0 && racing.every(cycle => racingHookAttributed(cycle, name)),
      { cycles: racing?.length ?? 0,
        covered: racing?.filter(cycle => cycle.settled?.counters?.coveredRequests === cycle.countersBeforeSave?.coveredRequests + 1).length ?? 0,
        unattributed: racing?.flatMap((cycle, index) => racingHookAttributed(cycle, name) ? [] : [index + 1]) ?? [] });
    target('racing: median hook end to end (ms)', med(racing?.map(cycle => cycle.hook.durationMs)), limit.racing);
    count('watcher already published: twenty hooks', data.published, 20);
    for (const [index, cycle] of (data.published ?? []).entries()) completed(`published ${index + 1}`, cycle, 0, [], { fixture: name });
    check('published hooks perform zero analysis', data.published?.length > 0 && data.published.every(publishedHookAttributed),
      { cycles: data.published?.length ?? 0,
        unattributed: data.published?.flatMap((cycle, index) => publishedHookAttributed(cycle) ? [] : [index + 1]) ?? [] });
    target('published: median hook end to end (ms)', med(data.published?.map(cycle => cycle.hook.durationMs)), limit.published);
    if (name === 'S1000') {
      const extraction = filteredExtractionTimings(data, name);
      check('one-file filtered extraction cost recorded', extraction !== null, extraction);
    }
    check('revision input and diagnostic arrays have measured clone evidence', revisionCloneEvidence(data.cloneProbe)
      && data.cloneProbe.inputId === data.published?.at(-1)?.revision?.fingerprints?.inputId
      && data.finalInstrumentation?.activeProbeCount === 0,
    { inputId: data.cloneProbe?.inputId ?? null, status: data.cloneProbe?.status ?? null,
      activeProbeCount: data.finalInstrumentation?.activeProbeCount ?? null });
    telemetry(name, data);
  } else if (id === 'I5-13:checked-set-bounded') {
    for (const name of fastFixtures) checked(name, measurements[name]);
  } else if (id === 'I5-13:cold-open') {
    for (const name of fastFixtures) {
      const cold = measurements[name]?.cold, reply = cold?.reply;
      check(`${name}: real completed cold publication`, completedCold(measurements[name], name), reply?.status ?? null);
      target(`${name}: cold session work (ms)`, reply?.revision?.timings?.total ?? null, budgets[name].cold);
    }
  } else if (id === 'I5-13:repeated-edit-plateau') {
    for (const name of ['reference', 'S100']) {
      const data = measurements[name], cycles = data?.cycles;
      count(`${name}: alternating cycles`, cycles, budgets.repeatedCycles);
      for (const [index, cycle] of (cycles ?? []).entries()) { completed(`${name} ${index + 1}`, cycle, 0, [], { fixture: name }); retained(`${name} ${index + 1}`, cycle.settled); }
      check(`${name}: exactly two alternating identities`, new Set(cycles?.map(cycle => cycle.revision?.fingerprints?.inputId)).size === 2
        && cycles?.every((cycle, index) => index === 0 || cycle.revision.sequence > cycles[index - 1].revision.sequence
          && cycle.revision.fingerprints.inputId !== cycles[index - 1].revision.fingerprints.inputId), cycles?.length ?? null);
      const settled = cycles?.slice(-budgets.settledCycles) ?? [], first = settled[0]?.settled, last = settled.at(-1)?.settled;
      count(`${name}: settled plateau samples`, settled, budgets.settledCycles);
      const history = sample => sample.contexts.reduce((sum, row) => sum + row.history.bytes, 0);
      const workerHeap = sample => sample.contexts.reduce((sum, row) => sum + row.session.worker.heapUsed, 0);
      const physical = settled.map(physicalMemory);
      check(`${name}: settled process samples identify every daemon, worker and compiler PID exactly once`,
        cycles?.length === budgets.repeatedCycles && cycles.every(cycle => physicalMemory(cycle) !== null),
      { samples: cycles?.length ?? 0, invalid: cycles?.flatMap((cycle, index) => physicalMemory(cycle) === null ? [index + 1] : []).slice(0, 20) ?? [] });
      for (const [role, label] of [['daemon', 'daemon'], ['worker', 'worker supervisor'], ['compiler', 'compiler'], ['combined', 'combined process']]) {
        const values = physical.map(sample => sample?.[role] ?? null);
        target(`${name}: ${label} RSS growth`, values.length === budgets.settledCycles && values.every(finite)
          ? Math.max(0, values.at(-1) - values[0]) : null, budgets.memory.rssGrowth);
      }
      // Signed growth may be negative after GC; retain it instead of treating a drop as missing evidence.
      const growth = first && last ? workerHeap(last) - workerHeap(first) - (history(last) - history(first)) : null;
      target(`${name}: worker heap growth beyond history`, growth === null ? null : Math.max(0, growth), budgets.memory.heapGrowthBeyondHistory);
      const compilerRss = physical.map(sample => sample?.compiler ?? null);
      target(`${name}: compiler server RSS`, compilerRss.every(value => finite(value) && value > 0) ? Math.max(...compilerRss) : null,
        name === 'reference' ? budgets.memory.compilerReference : budgets.memory.compilerS100);
      check(`${name}: one retained session and one compiler`, settled.length > 0 && settled.every(cycle => cycle.settled.contexts.length === 1
        && cycle.settled.contexts[0].session?.level === 'hot' && cycle.settled.contexts[0].session.compiler.pid > 0
        && cycle.settled.instrumentation.workerCount === 1 && cycle.settled.instrumentation.compilerCount === 1), settled.length);
      const checkpoints = [...(data?.telemetry ?? []).map(sample => sample.instrumentation),
        ...(cycles ?? []).map(cycle => cycle.settled?.instrumentation), data?.finalInstrumentation];
      check(`${name}: lifetime totals balance at every observed checkpoint`, checkpoints.length > 1 && checkpoints.every(balanced),
        { samples: checkpoints.length, invalid: checkpoints.flatMap((sample, index) => balanced(sample) ? [] : [index]).slice(0, 20) });
      const totalFields = lifetimeFields.flatMap(([opened, closed]) => [opened, closed]);
      // Each stream has observation order; equal millisecond timestamps do
      // not establish an ordering between periodic and settled snapshots.
      const streams = [(data?.telemetry ?? []).map(sample => sample.instrumentation),
        (cycles ?? []).map(cycle => cycle.settled?.instrumentation)];
      check(`${name}: lifetime totals never reset`, streams.every(stream => stream.length > 0 && stream.every((sample, index) =>
        finite(sample?.at) && totalFields.every(field => natural(sample?.totals?.[field]))
        && (index === 0 || sample.at >= stream[index - 1]?.at
          && totalFields.every(field => sample.totals[field] >= stream[index - 1]?.totals?.[field]))))
        && checkpoints.slice(0, -1).every(sample => finite(data?.finalInstrumentation?.at)
          && data.finalInstrumentation.at >= sample?.at
          && totalFields.every(field => data.finalInstrumentation.totals?.[field] >= sample?.totals?.[field])), checkpoints.length);
      check(`${name}: watchers, timers and open files stay bounded after settling`, settled.length === budgets.settledCycles && settled.every(cycle => {
        const observed = cycle.settled?.instrumentation, baseline = first?.instrumentation;
        return natural(observed?.watchers) && observed.watchers === baseline?.watchers
          && natural(observed.timers) && natural(baseline?.timers) && observed.timers <= baseline.timers + 1
          && natural(observed.files) && observed.files === baseline.files;
      }), settled.map(cycle => ({ watchers: cycle.settled?.instrumentation?.watchers,
        timers: cycle.settled?.instrumentation?.timers, files: cycle.settled?.instrumentation?.files })));
      check(`${name}: final instrumentation records released lifetimes`, balanced(data?.finalInstrumentation)
        && lifetimeFields.every(([, , live]) => data.finalInstrumentation[live] === 0)
        && data.finalInstrumentation.timers === 0, data?.finalInstrumentation?.totals ?? null);
      telemetry(name, data);
    }
  } else if (id === 'I5-13:hot-warm-memory') {
    const contexts = measurements.settled?.contexts;
    count('eight retained contexts', contexts, 8);
    check('exactly two hot and six warm', contexts?.filter(row => row.level === 'hot').length === 2
      && contexts.filter(row => row.level === 'warm').length === 6, contexts?.map(row => row.level) ?? null);
    check('exactly two compiler servers', measurements.settled?.instrumentation?.compilerCount === 2, measurements.settled?.instrumentation?.compilerPids ?? null);
    retained('eight contexts', measurements.settled);
    const sample = measurements.settledProcessSample;
    processes('settled memory', sample ? [sample] : []);
    target('combined process RSS (each PID counted once)', sample?.combinedRssBytes ?? null, budgets.memory.combinedContexts);
    for (const [index, context] of (contexts ?? []).entries()) target(`context ${index + 1}: retained facts`, context.session?.factBytes ?? null, budgets.memory.factsS100);
    telemetry('eight contexts', measurements);
    telemetry('one hot reference', measurements.reference);
    target('reference: daemon RSS (compiler and supervisor separate)', measurements.reference?.settled?.memory?.rss ?? null, budgets.memory.daemonReference);
    target('reference: retained facts', measurements.reference?.settled?.contexts?.[0]?.session?.factBytes ?? null, budgets.memory.factsReference);
  } else check('known I5-13 instance', false, id);
  return assertions;
}

export function revisionCloneEvidence(probe) {
  return probe?.schemaVersion === 'ramify.revision-array-clone/1' && probe.status === 'measured'
    && probe.passed === true && probe.failures?.length === 0 && probe.cleanup?.exited === true
    && probe.cleanup.terminationRequested === true && Number.isInteger(probe.cleanup.threadId)
    && ['inputs', 'diagnostics'].every(name => {
      const value = probe.arrays?.[name];
      if (!value || !Number.isInteger(value.count) || value.count < 0 || !Number.isInteger(value.jsonBytes)
        || value.jsonBytes < 2 || value.jsonBytes > budgets.runtime.factBytes || !/^[a-f0-9]{64}$/.test(value.sha256)
        || value.samples?.length !== 20) return false;
      const timings = value.samples.map(row => row.roundTripMs).sort((a, b) => a - b);
      return value.samples.every((row, index) => row.cycle === index + 1 && finite(row.roundTripMs)
        && row.receivedAt >= row.sentAt && row.echoCount === value.count && row.echoSha256 === value.sha256)
        && value.maxMs === timings.at(-1) && value.medianMs === (timings[9] + timings[10]) / 2;
    });
}

export function fastDeferrals(workloads) {
  const data = name => workloads.find(row => row.id === `I5-13:hook-latency-${name.toLowerCase()}`)?.measurements;
  const evaluated = (values, predicate, reason) => ({ status: values.every(value => value !== null && finite(value))
    ? values.some(predicate) ? 'triggered' : 'not-triggered' : 'not-evaluated', observed: values, reason });
  const editMedian = (name, kind, path) => {
    const project = data(name), rows = scopedEdits(project, kind, path);
    const file = kind === 'created' ? project?.fixtures?.find(fixture => fixture.name === name)?.created
      : name === 'reference' ? 'subs/workspace/module.ramify' : 'subs/m001/module.ramify';
    return typeof file === 'string' && rows?.every(cycle => cycle.expected.length === 1
      && cycle.expected[0].path === file && /^[a-f0-9]{64}$/.test(cycle.expected[0].sha256))
      ? med(rows.map(timing)) : null;
  };
  const descriptions = ['S500', 'S1000'].map(name => editMedian(name, 'description', 'description'));
  const extraction = med(filteredExtractionTimings(data('S1000'), 'S1000'));
  const ready = [...new Map(workloads.flatMap(row => row.measurements?.telemetry?.flatMap(sample =>
    sample.instrumentation?.workers?.map(worker => worker.ready) ?? []) ?? []).filter(Boolean)
    .map(value => [JSON.stringify([value.heapLimit, value.oldGenerationMiB]), value])).values()];
  const clone = data('S1000')?.cloneProbe ?? null;
  const cloneMatchesRevision = clone?.inputId === data('S1000')?.published?.at(-1)?.revision?.fingerprints?.inputId;
  const heapFailed = ready.some(value => value.oldGenerationMiB !== budgets.runtime.workerHeapMiB
    || value.heapLimit > (budgets.runtime.workerHeapMiB + 64) * 1024 ** 2);
  const cloneFailed = clone?.status === 'failed' && clone.failures?.length > 0;
  return {
    proportionalRelink: evaluated(descriptions, (value, index) => value > budgets[['S500', 'S1000'][index]].description, 'Description session medians on S500/S1000.'),
    resolutionNarrowing: evaluated([editMedian('S100', 'created', 'membership')], value => value > budgets.S100.created, 'S100 created-file session median from twenty covering membership revisions.'),
    syntacticPrefilter: evaluated([extraction], value => value > 10, 'S1000 filtered access extraction median from twenty covering unchanged-surface revisions checking only the fixture body file, with zero decided accesses and no model rebuild.'),
    persistentCheckpoints: evaluated([completedCold(data('S1000'), 'S1000') ? data('S1000').cold.reply.revision.timings.total : null], value => value > budgets.S1000.cold, 'S1000 completed cold session work.'),
    childProcessHost: { status: heapFailed || cloneFailed ? 'triggered'
      : ready.length && revisionCloneEvidence(clone) && cloneMatchesRevision ? 'not-triggered' : 'not-evaluated',
      observed: { ready, clone },
      reason: 'Actual effective worker heap preflight plus twenty real structured-clone echo round trips separately for S1000 revision input and diagnostic arrays, with byte bounds and auxiliary thread cleanup. Includes both copies and scheduling; excludes analysis, JSON sizing and integrity hashing.' },
  };
}

/** Derived instances reuse the same measured saves with their own predicates. */
export function deriveFastMeasurements(id, workloads) {
  const projectCycle = cycle => ({ revision: cycle.revision, expected: cycle.expected, beforeSequence: cycle.beforeSequence,
    hook: cycle.hook && Object.fromEntries(Object.entries(cycle.hook).filter(([key]) => key !== 'samples')) });
  return Object.fromEntries(fastFixtures.map(name => {
    const data = workloads.find(row => row.id === `I5-13:hook-latency-${name.toLowerCase()}`)?.measurements;
    return [name, id === 'I5-13:cold-open' ? { cold: data?.cold ?? null } : {
      fixtures: data?.fixtures ?? [], cycles: {
        body: data?.cycles?.body?.map(projectCycle) ?? [], source: data?.cycles?.source?.map(projectCycle) ?? [],
      },
    }];
  }));
}
