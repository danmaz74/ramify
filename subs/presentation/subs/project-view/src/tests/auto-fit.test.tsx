/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoFit, type AutoFit, type FitTarget } from '../auto-fit.js';

const observers: { callback: ResizeObserverCallback; disconnected: boolean }[] = [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class {
    readonly entry: { callback: ResizeObserverCallback; disconnected: boolean };
    constructor(callback: ResizeObserverCallback) { this.entry = { callback, disconnected: false }; observers.push(this.entry); }
    observe() {}
    disconnect() { this.entry.disconnected = true; }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const options = { padding: 0.1, minZoom: 0.2, maxZoom: 1 };

function Harness({ nodes, enabled = true, capture }: {
  readonly nodes: number; readonly enabled?: boolean; readonly capture: (fit: AutoFit<FitTarget>) => void }) {
  const fit = useAutoFit(nodes, options, enabled);
  capture(fit);
  return <div ref={fit.containerRef} />;
}

function resize(): void {
  act(() => { for (const observer of observers.filter(item => !item.disconnected)) observer.callback([], {} as ResizeObserver); });
}

describe('useAutoFit', () => {
  it('fits once the instance and nodes exist, and again after each resize', () => {
    let current!: AutoFit<FitTarget>;
    const fitView = vi.fn(async () => true);
    const { rerender } = render(<Harness nodes={0} capture={fit => { current = fit; }} />);
    act(() => current.onInit({ fitView }));
    expect(fitView).not.toHaveBeenCalled();
    rerender(<Harness nodes={3} capture={fit => { current = fit; }} />);
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(fitView).toHaveBeenCalledWith(options);
    resize();
    expect(fitView).toHaveBeenCalledTimes(2);
    rerender(<Harness nodes={2} capture={fit => { current = fit; }} />);
    expect(fitView).toHaveBeenCalledTimes(2);
  });

  it('stops fitting after the viewer moves, but not after a programmatic move', () => {
    let current!: AutoFit<FitTarget>;
    const fitView = vi.fn(async () => true);
    render(<Harness nodes={3} capture={fit => { current = fit; }} />);
    act(() => current.onInit({ fitView }));
    act(() => current.onMoveStart(null));
    resize();
    expect(fitView).toHaveBeenCalledTimes(2);
    act(() => current.onMoveStart(new MouseEvent('mousedown')));
    resize();
    expect(fitView).toHaveBeenCalledTimes(2);
  });

  it('stops fitting after a move the canvas makes on the viewer\'s behalf', () => {
    let current!: AutoFit<FitTarget>;
    const fitView = vi.fn(async () => true);
    render(<Harness nodes={3} capture={fit => { current = fit; }} />);
    act(() => current.onInit({ fitView }));
    expect(fitView).toHaveBeenCalledTimes(1);
    act(() => current.markMoved());
    resize();
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it('never fits while disabled', () => {
    let current!: AutoFit<FitTarget>;
    const fitView = vi.fn(async () => true);
    render(<Harness nodes={3} enabled={false} capture={fit => { current = fit; }} />);
    act(() => current.onInit({ fitView }));
    resize();
    expect(fitView).not.toHaveBeenCalled();
  });
});
