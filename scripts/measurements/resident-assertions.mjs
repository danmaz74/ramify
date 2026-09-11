import { residentBudgets as budgets } from './resident-plan.mjs';
import { median } from './common.mjs';

/** Fixed independent acceptance predicates. Missing samples never become zero. */
export function assertResidentWorkload(id, measurements) {
  const assertions = [];
  const check = (name, passed, observed, maximum = null) => assertions.push({ name, passed: Boolean(passed), observed: observed ?? null, maximum });
  const within = (name, observed, maximum) => check(name, Number.isFinite(observed) && observed <= maximum, observed, maximum);
  const bytes = (name, observed, maximum) => check(name, Number.isFinite(observed) && observed > 0 && observed <= maximum, observed, maximum);
  const rawPeak = (name, samples, pid) => {
    const complete = Array.isArray(samples) && samples.length > 0 && samples.every(sample =>
      Array.isArray(sample.processes) && sample.processes.every(item => Number.isSafeInteger(item.pid) && item.pid > 0
        && Number.isFinite(item.rssBytes) && item.rssBytes >= 0)
      && sample.combinedRssBytes === sample.processes.reduce((total, item) => total + item.rssBytes, 0));
    check(`${name}: complete actual process samples`, complete, samples?.length);
    return complete ? Math.max(0, ...samples.map(sample => pid === undefined ? sample.combinedRssBytes
      : sample.processes.filter(item => item.pid === pid).reduce((total, item) => total + item.rssBytes, 0))) : NaN;
  };
  const settledMemory = (name, sample) => {
    check(`${name}: actual daemon memory observation`, sample?.pid > 0 && sample?.instrumentation?.pid === sample.pid
      && ['rss', 'heapUsed', 'external'].every(key => Number.isFinite(sample.memory?.[key]) && sample.memory[key] > 0), sample?.memory);
  };
  const count = (name, values, expected) => check(name, Array.isArray(values) && values.length === expected, values?.length, expected);
  const captured = cycle => Array.isArray(cycle?.expected) && cycle.expected.length > 0
    && JSON.stringify(cycle.captured ?? cycle.report?.captured) === JSON.stringify(cycle.expected);
  const advances = cycles => cycles?.every((cycle, index) => cycle?.revision?.sequence > 0
    && cycle.revision?.fingerprints?.inputId === cycle.report?.inputId && captured(cycle)
    && cycle.freshness?.verified === true && cycle.freshness?.mode === 'synchronized'
    && cycle.freshness?.captureStarted >= cycle.freshness?.acknowledged
    && (index === 0 || cycle.revision.sequence > cycles[index - 1].revision.sequence
      && cycle.report.inputId !== cycles[index - 1].report.inputId));
  const retained = (name, sample) => {
    check(`${name}: at most eight contexts`, sample?.contexts?.length <= budgets.retention.contexts, sample?.contexts?.length);
    let total = 0;
    for (const context of sample?.contexts ?? []) {
      within(`${name}: retained revision count ${context.token.context}`, context.history.retained, budgets.retention.revisionsPerContext);
      within(`${name}: history bytes ${context.token.context}`, context.history.bytes, budgets.retention.historyBytesPerContext);
      within(`${name}: product bytes ${context.token.context}`, context.retainedBytes, budgets.retention.productsBytesPerContext);
      total += context.history.bytes + context.retainedBytes;
    }
    within(`${name}: global retained bytes`, total, budgets.retention.globalBytes);
  };
  if (!measurements) { check('complete workload measurements exist', false, null); return assertions; }
  const suffix = id.replace('I2-29:', '');
  if (suffix === 'entry-footprints') {
    const expected = { client: budgets.clientBytes, daemonEmpty: budgets.daemonEmptyBytes, daemonReference: budgets.daemonReferenceBytes,
      cliReference: budgets.reference.cliBytes, cliS100: budgets.S100.cliBytes };
    for (const [name, limit] of Object.entries(expected)) {
      const measurement = measurements[name];
      const observed = name.startsWith('daemon') ? measurement?.settled?.memory?.rss
        : rawPeak(name, measurement?.samples, name.startsWith('cli') ? measurement?.pid : undefined);
      if (name.startsWith('daemon')) settledMemory(name, measurement?.settled);
      check(`${name}: reported RSS equals raw observation`, observed === measurement?.rssBytes, measurement?.rssBytes);
      bytes(`${name}: RSS`, observed, limit);
    }
    const helpPeak = rawPeak('help', measurements.help?.samples);
    check('help contains real externally sampled RSS', helpPeak > 0 && helpPeak === measurements.help?.rssBytes, helpPeak);
  } else if (suffix.startsWith('cold-warm-broad-')) {
    const name = suffix.endsWith('reference') ? 'reference' : 'S100', limit = budgets[name];
    count('five independent cold starts', measurements.cold, budgets.coldSamples);
    check('cold starts use five daemon instances', new Set(measurements.cold?.map(value => value.instanceId)).size === budgets.coldSamples,
      measurements.cold?.map(value => value.instanceId));
    check('cold timings are actual positive durations', measurements.cold?.every(value => Number.isFinite(value.durationMs) && value.durationMs > 0), measurements.cold?.map(value => value.durationMs));
    within('cold median', measurements.cold?.length ? median(measurements.cold.map(value => value.durationMs)) : null, limit.coldMs);
    const expectedReuse = {
      unchanged: ['access', 'catalog', 'configuration', 'decide', 'link', 'metadata', 'parse'],
      readme: ['access', 'catalog', 'configuration', 'decide', 'link', 'parse'],
      exposure: ['access', 'catalog', 'configuration', 'metadata'],
      source: ['configuration', 'metadata', 'parse'], configuration: ['metadata', 'parse'],
    };
    for (const [kind, expected] of Object.entries(expectedReuse)) {
      const cycles = measurements.cycles?.[kind];
      count(`${kind}: twenty actual cycles`, cycles, budgets.editCycles);
      check(`${kind}: positive command durations`, cycles?.every(value => Number.isFinite(value.durationMs) && value.durationMs > 0), cycles?.map(value => value.durationMs));
      within(`${kind}: median`, cycles?.length ? median(cycles.map(value => value.durationMs)) : null, limit[`${kind}Ms`]);
      check(`${kind}: recorded completed stage reuse`, cycles?.every(value => JSON.stringify([...value.reused].sort()) === JSON.stringify(expected)), cycles?.map(value => value.reused));
      if (kind !== 'unchanged') {
        check(`${kind}: every edited hash is captured`, cycles?.every(captured), cycles?.map(value => value.report?.captured));
        check(`${kind}: adjacent edit captures differ`, cycles?.every((value, index) => index === 0 || value.report?.inputId !== cycles[index - 1].report?.inputId), cycles?.map(value => value.report?.inputId));
      }
      else check('unchanged cycles preserve one captured identity', new Set(cycles?.map(value => value.report?.inputId)).size === 1, cycles?.map(value => value.report?.inputId));
    }
    count('service-side status samples', measurements.status?.service, 20);
    count('CLI status samples', measurements.status?.cli, 20);
    check('raw status timings are finite nonnegative durations', measurements.status?.service?.every(value => Number.isFinite(value) && value >= 0)
      && measurements.status?.cli?.every(value => Number.isFinite(value) && value > 0), measurements.status);
    const serviceMedian = measurements.status?.service?.length ? median(measurements.status.service) : null;
    const cliMedian = measurements.status?.cli?.length ? median(measurements.status.cli) : null;
    check('service median equals raw timings', serviceMedian === measurements.status?.medianServiceMs, measurements.status?.medianServiceMs);
    check('CLI median equals raw timings', cliMedian === measurements.status?.medianCliMs, measurements.status?.medianCliMs);
    within('service-side contextStatus median', serviceMedian, budgets.contextStatusMs);
    within('end-to-end CLI daemon status median', cliMedian, budgets.cliStatusMs);
  } else if (suffix === 'repeated-edit-plateau') {
    for (const name of ['reference', 'S100']) {
      const cycles = measurements[name]?.cycles;
      count(`${name}: 200 alternating edit cycles`, cycles, budgets.plateau.cycles);
      check(`${name}: every edit publishes an advancing verified capture`, advances(cycles), cycles?.map(cycle => cycle.revision?.sequence));
      check(`${name}: repeated source/revert uses exactly two captured identities`, new Set(cycles?.map(cycle => cycle.report?.inputId)).size === 2,
        [...new Set(cycles?.map(cycle => cycle.report?.inputId))]);
      const settled = cycles?.slice(-budgets.plateau.settledCycles) ?? [];
      count(`${name}: last 100 settled observations`, settled, budgets.plateau.settledCycles);
      const first = settled[0]?.settled, last = settled.at(-1)?.settled;
      const history = sample => sample?.contexts?.reduce((sum, context) => sum + context.history.bytes, 0);
      within(`${name}: settled RSS growth`, last && first ? last.memory.rss - first.memory.rss : null, budgets.plateau.rssGrowthBytes);
      within(`${name}: heap growth beyond history bytes`, last && first ? last.memory.heapUsed - first.memory.heapUsed - (history(last) - history(first)) : null,
        budgets.plateau.heapGrowthBeyondHistoryBytes);
      check(`${name}: all real session and helper lifetimes balanced`, cycles?.every(({ settled: sample }) => {
        const m = sample.instrumentation;
        return m.activeSessions === 0 && m.helpers === 0 && m.files === 0 && m.totals.sessionsCreated > 0
          && m.totals.sessionsCreated === m.totals.sessionsDisposed && m.totals.helpersStarted === m.totals.helpersClosed
          && m.totals.filesOpened === m.totals.filesClosed;
      }), cycles?.map(({ settled: sample }) => [sample.instrumentation.activeSessions, sample.instrumentation.helpers, sample.instrumentation.files]));
      check(`${name}: no native helper survives settled observations`, cycles?.every(cycle => {
        const processes = cycle.samples?.at(-1)?.processes;
        return processes?.length === 1 && processes[0].pid === cycle.settled.pid;
      }), cycles?.map(cycle => cycle.samples?.at(-1)?.processes?.map(item => item.pid)));
      check(`${name}: settled watcher and timer counts stay bounded`, settled.length > 0 && settled.every(({ settled: sample }) =>
        sample.instrumentation.watchers === first.instrumentation.watchers && sample.instrumentation.timers <= first.instrumentation.timers + 1),
      settled.map(({ settled: sample }) => [sample.instrumentation.watchers, sample.instrumentation.timers]));
      for (let index = 0; index < settled.length; index++) {
        settledMemory(`${name} cycle ${index + 101}`, settled[index].settled);
        retained(`${name} cycle ${index + 101}`, settled[index].settled);
      }
    }
  } else if (suffix === 'many-contexts') {
    count('eight warm contexts', measurements.settled?.contexts, budgets.manyContexts.contexts);
    check('every context is warm and published', measurements.settled?.contexts?.every(context => context.state === 'warm' && context.published), measurements.settled?.contexts?.map(context => context.state));
    settledMemory('eight contexts', measurements.settled);
    bytes('eight-context settled RSS', measurements.settled?.memory?.rss, budgets.manyContexts.rssBytes);
    retained('eight warm contexts', measurements.settled);
  } else if (suffix === 'slow-consumer') {
    count('ten real S100 publications', measurements.publications, budgets.slowConsumer.publications);
    check('all slow-peer publications capture their real saves', advances(measurements.publications), measurements.publications?.map(cycle => cycle.revision?.sequence));
    check('every save published a new revision', new Set(measurements.publications?.map(value => value.revision.revision)).size === 10, measurements.publications?.map(value => value.revision.revision));
    const outbound = measurements.after?.instrumentation?.outbound;
    const outboundPeak = outbound?.length ? Math.max(...outbound.map(value => value.peakBytes)) : NaN;
    check('outbound maximum equals recorded connection peaks', outboundPeak === measurements.after?.instrumentation?.outboundMaximum, outboundPeak);
    bytes('maximum admitted outbound queue', outboundPeak, budgets.slowConsumer.outboundBytes);
    const overflow = measurements.after?.instrumentation?.outbound?.find(value => value.overflow);
    check('non-reading peer really exceeded admission', overflow?.overflow?.attemptedBytes > budgets.slowConsumer.outboundBytes, overflow?.overflow?.attemptedBytes);
    check('slow peer really disconnected', overflow?.closed?.reason === 'slow-consumer' && measurements.after?.counters?.disconnectedSlowConsumers > 0, overflow?.closed);
    within('actual server socket disconnect after overflow', overflow?.closed && overflow?.overflow ? overflow.closed.at - overflow.overflow.at : null, budgets.slowConsumer.disconnectMs);
    within('RSS recovery after slow peer release', measurements.after && measurements.before ? measurements.after.memory.rss - measurements.before.memory.rss : null,
      budgets.slowConsumer.rssRecoveryBytes);
    settledMemory('before slow peer', measurements.before); settledMemory('after slow peer', measurements.after);
  } else if (suffix === 'synthetic-500' || suffix === 'synthetic-1000') {
    const limit = budgets[suffix === 'synthetic-500' ? 'S500' : 'S1000'];
    within('cold complete check', measurements.cold?.durationMs, limit.coldMs);
    within('source edit complete check', measurements.source?.durationMs, limit.sourceMs);
    check('large-fixture source edit captured expected content', captured(measurements.source), measurements.source?.report?.captured);
    check('large-fixture source capture differs from cold result', measurements.source?.report?.inputId !== measurements.cold?.report?.inputId,
      measurements.source?.report?.inputId);
    const observed = rawPeak(suffix, measurements.samples);
    check('saved peak agrees with raw samples', observed === measurements.peakBytes, measurements.peakBytes);
    bytes('combined daemon/helper/native peak', observed, limit.peakBytes);
  } else if (suffix === 'publication-peak') {
    for (const name of ['reference', 'S100']) {
      const observed = rawPeak(name, measurements[name]?.samples);
      check(`${name}: saved peak agrees with raw samples`, observed === measurements[name]?.peakBytes, measurements[name]?.peakBytes);
      check(`${name}: publication and serialization completed`, measurements[name]?.revision?.sequence > 0 && measurements[name]?.reportBytes > 0, measurements[name]?.revision);
      check(`${name}: publication captured the actual source edit`, advances([measurements[name]]), measurements[name]?.captured);
      bytes(`${name}: combined publication peak`, observed, budgets[name].peakBytes);
    }
  } else check('known reviewed workload', false, id);
  return assertions;
}
