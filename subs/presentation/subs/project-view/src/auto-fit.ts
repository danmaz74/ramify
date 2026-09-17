import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface FitOptions { readonly padding: number; readonly minZoom: number; readonly maxZoom: number }
/** The part of a React Flow instance fitting needs. */
export interface FitTarget { fitView(options?: FitOptions): Promise<boolean> }

export interface AutoFit<Instance> {
  readonly flow: Instance | null;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly onInit: (instance: Instance) => void;
  /** Stops fitting once the viewer pans or zooms; programmatic moves carry no event. */
  readonly onMoveStart: (event: MouseEvent | TouchEvent | null) => void;
}

/**
 * Fits the view when nodes first appear and whenever the canvas is resized, until the viewer
 * moves the viewport. `enabled` false leaves the viewport to the caller.
 */
export function useAutoFit<Instance extends FitTarget = FitTarget>(
  nodeCount: number, options: FitOptions, enabled = true): AutoFit<Instance> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [flow, setFlow] = useState<Instance | null>(null);
  const moved = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Collapsing or filtering changes the node count but keeps the viewport; only emptiness matters.
  const hasNodes = nodeCount > 0;
  const fit = useCallback(() => {
    if (!flow || moved.current || !enabled || !hasNodes) return;
    void flow.fitView(optionsRef.current);
  }, [enabled, flow, hasNodes]);

  useEffect(() => {
    if (!flow) return;
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [flow, fit]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(element);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [fit]);

  const onMoveStart = useCallback((event: MouseEvent | TouchEvent | null) => {
    if (event) moved.current = true;
  }, []);

  return { flow, containerRef, onInit: setFlow, onMoveStart };
}
