import type { InvocationEvaluation, OperationIdentity, ScopeSizeView, RecordedChargeView } from '../../harness/src/interfaces/protocol/runs.js';

const value = (number: number | null | undefined): string => number == null ? 'unavailable' : String(number);
const paths = (items: readonly string[] | null): string => items === null ? 'unavailable' : items.join(', ') || 'none recorded';

export function operationText(operation: OperationIdentity): string {
  return `Turn ${operation.turn} in ${operation.sessionId}, operation ${operation.operationId}`;
}

function pointText(point: OperationIdentity['sourcePoint']): string {
  return `${point.kind === 'checkpoint' ? 'Checkpoint' : 'Turn point'} ${point.checkpoint}, turn ${point.turn} in ${point.sessionId}`;
}

/** Recorded generic identity is separate from the transcript's chapter and event anchors. */
export function OperationFacts({ operation, invocation }: { readonly operation: OperationIdentity | null | undefined; readonly invocation: string }) {
  if (!operation) return <p className="muted">Operation identity unavailable for {invocation}.</p>;
  return <dl className="facts operation-facts" aria-label={`Operation of ${invocation}`}>
    <div><dt>Original operation</dt><dd>{operationText(operation)}; run {operation.runId}</dd></div>
    <div><dt>Source point</dt><dd>{pointText(operation.sourcePoint)}</dd></div>
    <div><dt>Completion point</dt><dd>{operation.point === null ? 'No reusable completion point' : operation.point === undefined ? 'Completion point not recorded' : pointText(operation.point)}</dd></div>
  </dl>;
}

function Coverage({ items }: { readonly items: readonly string[] }) {
  return items.length > 0 ? <details className="warn"><summary>Coverage limits ({items.length})</summary><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null;
}

function ScopeFacts({ title, scope }: { readonly title: string; readonly scope: ScopeSizeView | null }) {
  return <section className="efficiency-scope" aria-label={title}>
    <h4>{title}</h4>
    {scope === null ? <p>Unavailable: no recorded scope size.</p> : <>
      <p>{value(scope.bytes)} bytes; known subtotal {scope.subtotal} bytes ({scope.coverage}); policy {scope.policy}; snapshot <code>{scope.snapshot}</code>.</p>
      <table className="table" aria-label={`${title} components`}>
        <thead><tr><th>Component</th><th>Bytes</th><th>State</th><th>Recorded detail</th></tr></thead>
        <tbody>{scope.components.map((component, index) => <tr key={index}>
          <th scope="row">{component.component}</th><td>{value(component.bytes)}</td><td>{component.state}</td>
          <td>{component.detail}{component.reason && <>; {component.reason}</>}{component.buckets && <details><summary>Recorded buckets</summary><ul>{Object.entries(component.buckets).map(([key, bytes]) => <li key={key}>{key}: {bytes} bytes</li>)}</ul></details>}</td>
        </tr>)}</tbody>
      </table>
    </>}
  </section>;
}

function ChargeFacts({ charge }: { readonly charge: RecordedChargeView }) {
  const categories = [
    ['New input', charge.newInputTokens, charge.ratesPerMillion.newInput, charge.newInput],
    ['Cached input', charge.cachedInputTokens, charge.ratesPerMillion.cachedInput, charge.cachedInput],
    ['Cache writes', charge.cacheWriteTokens, charge.ratesPerMillion.cacheWrite, charge.cacheWrite],
    ['Output', charge.outputTokens, charge.ratesPerMillion.output, charge.output],
  ] as const;
  return <section aria-label={`Recorded charge for ${charge.model}`}>
    <p><code>{charge.model}</code>: {charge.source === 'estimated-from-recorded-rates' ? 'Estimate from recorded rates' : 'Provider-recorded charge'} ({charge.source}); revision {charge.sourceRevision ?? 'unavailable'}.</p>
    <table className="table" aria-label={`Charge categories for ${charge.model}`}>
      <thead><tr><th>Category</th><th>Recorded tokens</th><th>Recorded USD per million tokens</th><th>USD</th></tr></thead>
      <tbody>{categories.map(([name, tokens, rate, amount]) => <tr key={name}><th scope="row">{name}</th><td>{value(tokens)}</td><td>{value(rate)}</td><td>{value(amount)}</td></tr>)}</tbody>
    </table>
    <p>Total: {value(charge.total)} USD.</p><Coverage items={charge.coverage} />
  </section>;
}

/** Display supplied facts only: no ratios, token charges or durations are calculated here. */
export function SessionMetrics({ evaluation, operation, invocation }: { readonly evaluation: InvocationEvaluation | null | undefined; readonly operation?: OperationIdentity | null | undefined; readonly invocation?: string | undefined }) {
  const identity = evaluation?.invocation ?? invocation ?? operation?.operationId ?? 'unknown invocation';
  const efficiency = evaluation?.efficiency;
  return <section className="session-efficiency" aria-label={`Efficiency of ${identity}`}>
    <h3>Efficiency of {identity}</h3>
    <p>Recorded result: {evaluation?.ended ?? 'not recorded'}.</p>
    <OperationFacts invocation={identity} operation={operation === undefined ? efficiency?.operation : operation} />
    {efficiency === undefined ? <p>{evaluation ? 'Efficiency unavailable: no recorded observation projection.' : 'Efficiency unavailable: the invocation record cannot be read.'}</p> : <>
      <ScopeFacts title="Declared writer scope" scope={efficiency.declared} />
      <ScopeFacts title="Recorded read scope" scope={efficiency.readScope} />
      <details><summary>Delivered input provenance</summary>{efficiency.manifest === null ? <p>Manifest unavailable.</p> : <>
        <p>Manifest <code>{efficiency.manifest.hash}</code>; inherited point {efficiency.manifest.inheritedPoint ?? 'none'}; current message {efficiency.manifest.currentMessage ? `${efficiency.manifest.currentMessage.bytes} bytes, ${efficiency.manifest.currentMessage.hash}` : 'unavailable'}.</p>
        <ul>{efficiency.manifest.entries.map((entry, index) => <li key={index}><code>{entry.key}</code>: {entry.kind}, {entry.delivery}, {entry.bytes} bytes; hash {entry.hash}; source {entry.source ?? 'unavailable'}; revision {entry.revision ?? 'unavailable'}
          {entry.sources.length > 0 && <ul>{entry.sources.map((source, i) => <li key={i}>{source.path}: {source.bytes} bytes, {source.hash}{source.kind && ` (${source.kind})`}</li>)}</ul>}
        </li>)}</ul>
      </>}</details>
      <section aria-label="Observed exploration"><h4>Observed exploration</h4>
        <dl className="facts">
          <div><dt>Reads</dt><dd>{efficiency.exploration.metrics.reads}; unique files {efficiency.exploration.metrics.uniqueFilesRead}; repeated reads {efficiency.exploration.metrics.repeatedReads}</dd></div>
          <div><dt>Returned output</dt><dd>{efficiency.exploration.metrics.returnedBytes} {efficiency.units.returned}{efficiency.exploration.metrics.coverage.length > 0 ? ' (known subtotal; coverage incomplete)' : ''}</dd></div>
          <div><dt>Searches</dt><dd>{efficiency.exploration.metrics.searches}; broad {efficiency.exploration.metrics.broadSearches}; outside declared scope {efficiency.exploration.metrics.outsideScopeSearches}; zero matches {efficiency.exploration.zeroMatchSearches}</dd></div>
          <div><dt>Observed tool duration sum</dt><dd>{efficiency.exploration.metrics.toolElapsedMs} {efficiency.units.duration}{efficiency.exploration.metrics.coverage.length > 0 ? ' (known subtotal; coverage incomplete)' : ''}</dd></div>
        </dl>
        <Coverage items={efficiency.exploration.metrics.coverage} />
        <details><summary>Recorded read and search calls</summary><ul>{efficiency.exploration.observations.map((call, index) => <li key={index}>
          <code>{call.callId}</code>: {call.kind}, {call.outcome}; observation {call.id}; {call.invocationId}, operation {call.operationId}, turn {call.turn} in {call.sessionId} ({call.role}).
          <dl><dt>Requested scope</dt><dd>{paths(call.requestedScope)}</dd><dt>Resolved scope</dt><dd>{paths(call.resolvedScope)}</dd><dt>Reported files</dt><dd>{paths(call.files)}</dd>
            <dt>Returned output</dt><dd>{value(call.returnedBytes)} {efficiency.units.returned}</dd><dt>Duration</dt><dd>{value(call.elapsedMs)} {efficiency.units.duration}; start {call.startedAt ?? 'unavailable'}; end {call.endedAt ?? 'unavailable'}</dd>
            <dt>Search breadth / outside scope</dt><dd>{call.broad === null ? 'unavailable' : String(call.broad)} / {call.outsideScope === null ? 'unavailable' : String(call.outsideScope)}</dd></dl><Coverage items={call.coverage} />
        </li>)}</ul></details>
      </section>
      <section aria-label="Recorded timing"><h4>Recorded timing</h4>
        <p>Started {efficiency.timing.startedAt}; ended {efficiency.timing.endedAt ?? 'not recorded'}.</p>
        <dl className="facts">
          <div><dt>Elapsed wall time</dt><dd>{value(efficiency.timing.elapsedMs)} {efficiency.units.duration}</dd></div>
          <div><dt>Time to recorded milestone</dt><dd>{value(efficiency.timing.toMilestoneMs)} {efficiency.units.duration}; {efficiency.timing.milestone ?? 'milestone unavailable'}; {efficiency.timing.milestoneAt ?? 'time unavailable'}</dd></div>
          {([
            ['Model duration sum', efficiency.timing.modelElapsedMs, efficiency.timing.modelSubtotalMs],
            ['Tool duration sum', efficiency.timing.toolElapsedMs, efficiency.timing.toolSubtotalMs],
            ['Check duration sum', efficiency.timing.checkElapsedMs, efficiency.timing.checkSubtotalMs],
          ] as const).map(([label, amount, subtotal]) => <div key={label}><dt>{label}</dt><dd>{value(amount)} {efficiency.units.duration}{subtotal !== undefined && `; known subtotal ${subtotal} ${efficiency.units.duration}`}</dd></div>)}
        </dl><Coverage items={efficiency.timing.coverage} />
      </section>
      <section aria-label="Recorded charges"><h4>Recorded charges</h4>
        <p>Total: {value(efficiency.chargeTotal)} {efficiency.units.charge}; known subtotal {efficiency.chargeSubtotal} {efficiency.units.charge}. Charges retain their recorded source; estimates are not provider billing.</p>
        {efficiency.charges.length === 0 && <p>No recorded charge inputs.</p>}
        {efficiency.charges.map((charge, index) => <ChargeFacts key={index} charge={charge} />)}
      </section><Coverage items={efficiency.coverage} />
    </>}
  </section>;
}
