import type { ReactNode } from 'react';
import type { Availability, Citation, ImplementationMap } from '../../harness/src/interfaces/map.js';
import type { ModuleTree as Tree } from '../../harness/src/interfaces/protocol/maps.js';
import { ModuleTree } from './module-tree.js';

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="map-section" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function None({ children }: { readonly children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

function AvailabilityText({ availability }: { readonly availability: Availability }) {
  switch (availability.status) {
    case 'available':
      return <><span className="availability availability-available">available</span> <code>{availability.importSpelling}</code> <span className="muted">record</span> <code>{availability.record}</code></>;
    case 'unavailable':
      return (
        <>
          <span className="availability availability-unavailable">unavailable</span> needs:
          <ul>{availability.exposures.map((exposure, index) => <li key={index}><code>{exposure.module}</code>: <code>{exposure.declaration}</code></li>)}</ul>
        </>
      );
    case 'unknown':
      return <><span className="availability availability-unknown">unknown</span> {availability.reason}</>;
  }
}

function CitationText({ citation }: { readonly citation: Citation }) {
  return <><span className="muted">{citation.kind}</span> <code>{citation.path}{citation.line === undefined ? '' : `:${citation.line}`}</code></>;
}

/**
 * One saved implementation map, read-only: the summary, the modules touched
 * drawn on the module tree, then reuse, new capabilities, seams, entry point,
 * proposed work items, assumptions and limits, and evidence.
 */
export function MapDocument({ map, tree }: { readonly map: ImplementationMap; readonly tree: Tree | undefined }) {
  const view = map.identity.manifest.architectView;
  return (
    <article className="map-document" aria-label="Map content">
      <Section title="Summary">
        <p>{map.summary.change}</p>
        {map.summary.preserves.length > 0 && (
          <>
            <p className="muted">It preserves:</p>
            <ul>{map.summary.preserves.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </>
        )}
      </Section>

      <Section title="Modules touched">
        {tree === undefined
          ? <p className="muted">Loading the module tree…</p>
          : <ModuleTree tree={tree} touched={map.modulesTouched} />}
        {tree?.status === 'available' && view.status === 'materialized' && tree.input !== view.input && (
          <p className="muted">The tree is drawn from the architect view as last materialized, whose source state differs from the one this map describes.</p>
        )}
      </Section>

      <Section title="Reuse">
        {map.reuse.length === 0 ? <None>No existing behavior is reused.</None> : (
          <ul className="map-list">
            {map.reuse.map((reuse, index) => (
              <li key={index}>
                <p><strong>{reuse.capability}</strong></p>
                <p>
                  {reuse.symbols.map((symbol, position) => <span key={position}>{position > 0 && ', '}<code>{symbol.name}</code> of <code>{symbol.owner}</code></span>)}
                  {' '}for <code>{reuse.requester.module}</code> ({reuse.requester.area})
                </p>
                <p><AvailabilityText availability={reuse.availability} /></p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="New capabilities">
        {map.newCapabilities.length === 0 ? <None>No new capability.</None> : (
          <ul className="map-list">
            {map.newCapabilities.map((capability, index) => (
              <li key={index}>
                <p><strong>{capability.capability}</strong>, owned by <code>{capability.owner}</code>
                  {capability.consumers.length > 0 && <>, consumed by {capability.consumers.map((consumer, position) => <span key={consumer}>{position > 0 && ', '}<code>{consumer}</code></span>)}</>}
                </p>
                <p>{capability.goal}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Seams">
        {map.seams.length === 0 ? <None>No capability crosses branches.</None> : (
          <ul className="map-list">
            {map.seams.map((seam, index) => (
              <li key={index}><strong>{seam.capability}</strong>: <code>{seam.owner}</code> → <code>{seam.consumer}</code></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Entry point and acceptance">
        <p><code>{map.entryPoint.module}</code></p>
        <p>{map.entryPoint.acceptance}</p>
      </Section>

      <Section title="Proposed work items">
        {map.workItems.length === 0 ? <None>No work item is proposed.</None> : (
          <ol className="map-list">
            {map.workItems.map((item, index) => (
              <li key={index}>
                <p><strong>{item.title}</strong>, subtree root <code>{item.subtreeRoot}</code></p>
                <p className="muted">{item.capabilities.join('; ')}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Assumptions and limits">
        {([['Assumed', map.assumptions.assumed], ['Not found', map.assumptions.notFound], ['Coverage limits', map.assumptions.coverageLimits]] as const).map(([label, items]) => (
          <div key={label}>
            <h3>{label}</h3>
            {items.length === 0 ? <None>None.</None> : <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
          </div>
        ))}
      </Section>

      <Section title="Evidence">
        {map.evidence.length === 0 ? <None>No evidence is cited.</None> : (
          <ul className="map-list">
            {map.evidence.map((entry, index) => (
              <li key={index}>
                <p>{entry.claim}</p>
                <ul>{entry.citations.map((citation, position) => <li key={position}><CitationText citation={citation} /></li>)}</ul>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Identity">
        <dl className="identity">
          <div><dt>Job</dt><dd><code>{map.identity.jobId}</code></dd></div>
          <div><dt>Plan hash</dt><dd><code>{map.identity.manifest.planHash.slice(0, 16)}</code></dd></div>
          <div><dt>Source</dt><dd>{map.identity.manifest.source === null
            ? 'not a git checkout'
            : <><code>{map.identity.manifest.source.commit.slice(0, 12)}</code>{map.identity.manifest.source.dirty ? ', with uncommitted changes' : ''}</>}</dd></div>
          <div><dt>Architect view</dt><dd>{view.status === 'materialized'
            ? <>revision <code>{view.revision}</code>, input <code>{view.input}</code></>
            : 'not materialized'}</dd></div>
          {view.status === 'materialized' && view.coverageLimits.length > 0 && (
            <div><dt>View coverage limits</dt><dd>{view.coverageLimits.join('; ')}</dd></div>
          )}
          <div><dt>Versions</dt><dd>{Object.entries(map.identity.manifest.versions).map(([name, version]) => `${name} ${version ?? 'none'}`).join(' · ')}</dd></div>
        </dl>
      </Section>
    </article>
  );
}
