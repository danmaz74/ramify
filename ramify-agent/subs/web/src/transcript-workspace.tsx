import { useEffect, useState, type MouseEvent } from 'react';
import { Rnd } from 'react-rnd';
import type { ExecutionNode } from '../../harness/src/interfaces/protocol/execution-map.js';
import type { ProtocolClient } from './client.js';
import { executionMapVisualTokens as tokens } from './execution-map-tokens.js';
import { parseRoute, sessionHref, type SessionAnchor } from './routes.js';
import { SessionReading } from './session-page.js';
import { RoleIcon } from './session-role.js';
import { useTranscriptCoordinator } from './transcript-coordinator.js';

export interface WindowRect { x: number; y: number; width: number; height: number }
export interface TranscriptWindowState {
  readonly id: string;
  readonly rect: WindowRect;
  readonly z: number;
  readonly minimized: boolean;
  readonly maximized: boolean;
  readonly restore: WindowRect;
  readonly anchor: SessionAnchor | null;
  readonly anchorNonce: number;
  readonly opener: HTMLElement | null;
}

export function defaultWindowRect(index: number): WindowRect {
  return { x: 56 + index % 8 * 30, y: 72 + index % 8 * 30, width: 640, height: 560 };
}

/** Keep the complete header and a usable body inside the current viewport. */
export function clampWindowRect(rect: WindowRect, width: number, height: number): WindowRect {
  const availableWidth = Math.max(1, width - 16);
  const availableHeight = Math.max(1, height - 16);
  const w = Math.min(Math.max(rect.width, Math.min(320, availableWidth)), availableWidth);
  const h = Math.min(Math.max(rect.height, Math.min(220, availableHeight)), availableHeight);
  return { x: Math.min(Math.max(8, rect.x), Math.max(8, width - w - 8)),
    y: Math.min(Math.max(8, rect.y), Math.max(8, height - h - 8)), width: w, height: h };
}

function compactQuery(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 680px), (pointer: coarse)').matches;
}

function useCompact(): boolean {
  const [compact, setCompact] = useState(compactQuery);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 680px), (pointer: coarse)');
    const changed = () => setCompact(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return compact;
}

export function TranscriptWorkspace({ client, planId, runId, nodes, windows, onOpen, onChange, onClose, onFocusMap, interval }: {
  client: ProtocolClient; planId: string; runId: string; nodes: readonly ExecutionNode[];
  windows: readonly TranscriptWindowState[];
  onOpen: (id: string, anchor?: SessionAnchor | null, opener?: HTMLElement | null) => void;
  onChange: (id: string, change: Partial<TranscriptWindowState>) => void;
  onClose: (id: string) => void;
  onFocusMap: (id: string) => void;
  interval?: number;
}) {
  const compact = useCompact();
  // Dragging and resizing stop at the same margin `clampWindowRect` keeps, so a window does not jump when released.
  const [bounds, setBounds] = useState<HTMLDivElement | null>(null);
  const readings = useTranscriptCoordinator(client, planId, runId, windows.map(item => item.id), interval);
  const sessions = new Map(nodes.filter((node): node is Extract<ExecutionNode, { kind: 'session' }> => node.kind === 'session')
    .map(node => [node.key.slice('session:'.length), node]));
  const top = windows.reduce<TranscriptWindowState | undefined>((previous, item) => !previous || item.z > previous.z ? item : previous, undefined);
  const raise = (id: string) => onChange(id, { z: Math.max(0, ...windows.map(item => item.z)) + 1 });
  const navigate = (event: MouseEvent, source: string) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[href^="#/"]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const route = parseRoute(link.hash);
    if (route.page !== 'session' || route.session.source !== 'run' || route.session.planId !== planId || route.session.runId !== runId) return;
    event.preventDefault();
    onOpen(route.session.session, route.anchor, link);
  };
  return <div className={`transcript-workspace${compact ? ' transcript-workspace-compact' : ''}`} aria-label="Transcript windows">
    <div className="transcript-window-bounds" ref={setBounds} aria-hidden="true" />
    {compact && windows.length > 0 && <nav className="transcript-window-switcher" aria-label="Open transcripts">
      {windows.map(item => <button key={item.id} type="button" aria-current={top?.id === item.id ? 'page' : undefined} onClick={() => raise(item.id)}>{item.id}</button>)}
    </nav>}
    {windows.map(item => {
      const node = sessions.get(item.id);
      const ref = { source: 'run' as const, planId, runId, session: item.id };
      const reading = readings.get(item.id) ?? { detail: undefined, entries: [], file: undefined, unreadable: [], following: false, error: undefined };
      const detailed = reading.detail?.source === 'run' ? reading.detail.session : undefined;
      const role = detailed?.role ?? node?.role;
      const accent = role ? tokens.light.role[role] : '#475569';
      const state = detailed?.state ?? node?.state ?? 'unavailable';
      const reach = detailed?.reaches ?? node?.reach;
      const module = reach?.kind === 'work-item' || reach?.kind === 'module' ? reach.module ?? 'module unavailable'
        : node?.modules.map(relation => relation.module).join(', ') || 'run-wide';
      const body = <div className="transcript-window-body" hidden={!compact && item.minimized} onClickCapture={event => navigate(event, item.id)}>
        <SessionReading client={client} session={ref} anchor={item.anchor} anchorNonce={item.anchorNonce} reading={reading} compact />
      </div>;
      const controls = <div className="transcript-window-controls">
        <button type="button" onClick={() => onFocusMap(item.id)}>Focus on map</button>
        <a href={sessionHref(ref, item.anchor)}>Open full page</a>
        {!compact && <><button type="button" onClick={() => onChange(item.id, { rect: clampWindowRect(defaultWindowRect(windows.indexOf(item)), window.innerWidth, window.innerHeight), maximized: false })}>Reset position</button>
          <button type="button" aria-label={`${item.minimized ? 'Restore' : 'Minimize'} ${item.id}`} onClick={() => onChange(item.id, { minimized: !item.minimized, maximized: false })}>{item.minimized ? '▢' : '−'}</button>
          <button type="button" aria-label={`${item.maximized ? 'Restore' : 'Maximize'} ${item.id}`} onClick={() => onChange(item.id, item.maximized
            ? { maximized: false, rect: clampWindowRect(item.restore, window.innerWidth, window.innerHeight) }
            : { maximized: true, minimized: false, restore: item.rect, rect: clampWindowRect({ x: 8, y: 8, width: window.innerWidth - 16, height: window.innerHeight - 16 }, window.innerWidth, window.innerHeight) })}>{item.maximized ? '❐' : '□'}</button></>}
        <button type="button" aria-label={`Close ${item.id}`} onClick={() => onClose(item.id)}>×</button>
      </div>;
      const header = <header className="transcript-window-drag" tabIndex={0} aria-label={`Move or resize transcript ${item.id}`}
        onPointerDown={() => raise(item.id)} onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const step = event.shiftKey ? 50 : 20;
          if (event.key === 'Home') { event.preventDefault(); onChange(item.id, { rect: clampWindowRect(defaultWindowRect(windows.indexOf(item)), window.innerWidth, window.innerHeight), maximized: false }); return; }
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
          const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
          onChange(item.id, { rect: clampWindowRect(event.altKey
            ? { ...item.rect, width: item.rect.width + dx, height: item.rect.height + dy }
            : { ...item.rect, x: item.rect.x + dx, y: item.rect.y + dy }, window.innerWidth, window.innerHeight) });
        }}>
        <div className="transcript-window-title" style={{ borderLeftColor: accent }}>
          {role && <span className="execution-role-label" style={{ color: accent }}><RoleIcon role={role} /> {tokens.roleIdentity[role].label}</span>}
          <strong>Session {item.id}</strong><span>{state}</span><small>{reach?.kind ?? 'run-wide'} · {module}</small>
        </div>{controls}
      </header>;
      if (compact) return <section key={item.id} data-transcript-window={item.id} className="transcript-window transcript-window-panel" aria-label={`Transcript window ${item.id}`}
        style={{ display: top?.id === item.id ? 'flex' : 'none' }}>{header}{body}</section>;
      const rect = clampWindowRect(item.rect, window.innerWidth, window.innerHeight);
      return <Rnd key={item.id} aria-label={`Transcript window ${item.id}`} data-transcript-window={item.id} className="transcript-window" bounds={bounds ?? 'window'} minWidth={Math.min(320, window.innerWidth - 16)} minHeight={item.minimized ? 55 : Math.min(220, window.innerHeight - 16)}
        size={{ width: rect.width, height: item.minimized ? 55 : rect.height }} position={{ x: rect.x, y: rect.y }}
        dragHandleClassName="transcript-window-drag" cancel=".transcript-window-controls, button, a" disableDragging={item.maximized} enableResizing={!item.maximized && !item.minimized}
        style={{ zIndex: item.z }} onMouseDown={() => raise(item.id)}
        onDragStop={(_, data) => onChange(item.id, { rect: clampWindowRect({ ...item.rect, x: data.x, y: data.y }, window.innerWidth, window.innerHeight) })}
        onResizeStop={(_, __, element, ___, position) => onChange(item.id, { rect: clampWindowRect({ x: position.x, y: position.y,
          width: element.offsetWidth, height: element.offsetHeight }, window.innerWidth, window.innerHeight) })}>
        <div className="transcript-window-shell">{header}{body}</div>
      </Rnd>;
    })}
  </div>;
}
