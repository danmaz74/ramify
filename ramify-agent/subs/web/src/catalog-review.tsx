import type { AnalysisResponse, CatalogFindingView, ElementView } from '../../harness/src/interfaces/protocol/runs.js';

type PlanEvidence = NonNullable<Extract<AnalysisResponse['analysis'], { status: 'accepted' }>['planEvidence']>;

/** The five kinds, in the order a package renders them, with the heading each is shown under. */
const kinds: ReadonlyArray<{ readonly kind: ElementView['kind']; readonly heading: string; readonly note?: string }> = [
  { kind: 'context', heading: 'Context', note: 'Not a requirement; nothing assesses it.' },
  { kind: 'functional', heading: 'Functional requirements' },
  { kind: 'non-functional', heading: 'Non-functional requirements of the plan' },
  { kind: 'fixed', heading: 'Fixed requirements' },
  { kind: 'recommendation', heading: 'Recommendations', note: 'Not requirements; nothing assesses them.' },
];

const actions: Readonly<Record<CatalogFindingView['action'], string>> = {
  add: 'added', rewrite: 'rewrote', replace: 'replaced',
};

/**
 * The frozen element catalog the review stop shows: every element by kind,
 * the checkers' corrections with their reasons, and the incorporation of the
 * captured plan documents. Nothing here is a verdict on the plan's
 * requirements: an element in the catalog is a reading, not a satisfied
 * requirement.
 */
export function CatalogReview({ evidence }: { readonly evidence: PlanEvidence | undefined }) {
  if (evidence === undefined || evidence.status === 'unavailable') {
    return <p role="status">The element catalog is unavailable: {evidence?.reason ?? 'this run has no accepted catalog'}.</p>;
  }
  return (
    <>
      <p className="muted">Catalog <code>{evidence.catalogHash.slice(0, 12)}</code>: {evidence.elements.length} element{evidence.elements.length === 1 ? '' : 's'}{evidence.retired.length > 0 && `; retired ${evidence.retired.join(', ')}`}.</p>
      {kinds.map(({ kind, heading, note }) => {
        const elements = evidence.elements.filter(element => element.kind === kind);
        return (
          <section key={kind} aria-label={heading}>
            <h3>{heading} <span className="muted">({elements.length})</span></h3>
            {note && <p className="muted">{note}</p>}
            {elements.length === 0
              ? <p className="muted">None.</p>
              : <ul className="cards">{elements.map(element => <ElementCard key={element.id} element={element} />)}</ul>}
          </section>
        );
      })}
      <section aria-label="Checker findings">
        <h3>Checker findings</h3>
        {evidence.findings.length === 0
          ? <p className="muted">The checkers found every reading faithful.</p>
          : <ul>{evidence.findings.map((finding, index) => (
            <li key={index}>
              The checker of <code>{finding.path}</code> {actions[finding.action]}{' '}
              {finding.retired.length > 0 && <>{finding.retired.join(', ')} with </>}{finding.elements.join(', ') || 'nothing'}: {finding.reason}
            </li>))}</ul>}
      </section>
      {evidence.missing.filter(item => item.judgment === 'unclear').map(item =>
        <p role="alert" key={`${item.from}:${item.start}`}>Unclear missing reference: {item.target} from {item.fromPath} at bytes {item.start}–{item.end}. Source: <q>{item.excerpt}</q> {item.reason}</p>)}
      <details><summary>Document incorporation</summary>
        <ul>{evidence.incorporation.map(item =>
          <li key={item.document}>{item.path}: {item.scenarios ? 'scenarios incorporated' : 'scenarios not incorporated'}{item.uncertainty && `; uncertainty: ${item.uncertainty}`}</li>)}</ul>
        {evidence.missing.filter(item => item.judgment === 'advisory').map(item =>
          <p key={`${item.from}:${item.start}`}>Advisory missing reference: {item.target}. {item.reason}</p>)}
      </details>
    </>
  );
}

function ElementCard({ element }: { readonly element: ElementView }) {
  return (
    <li className="card" aria-label={`Element ${element.id}`}>
      <strong>{element.id}</strong> · <code>{element.path}</code>{element.locator && ` · ${element.locator}`}
      <blockquote className="element-text">{element.text}</blockquote>
      {element.conditions.map((condition, index) => <p key={index}>{condition.source} condition: {condition.text}</p>)}
      {element.uncertainty && <p>Uncertainty: {element.uncertainty}</p>}
    </li>
  );
}
