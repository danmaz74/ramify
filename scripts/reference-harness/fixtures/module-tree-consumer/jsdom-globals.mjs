// Preloaded before the render check: a browser-like global scope from jsdom,
// plus the layout APIs jsdom lacks and React Flow measures with.
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const name of Object.getOwnPropertyNames(window)) {
  if (name in globalThis || name.startsWith('_')) continue;
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] });
}
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent',
  'PointerEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? window : window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.DOMMatrixReadOnly = class {
  constructor(transform) { const scale = /scale\(([\d.]+)\)/.exec(transform ?? ''); this.m22 = scale ? Number(scale[1]) : 1; }
};
Object.defineProperties(window.HTMLElement.prototype, {
  offsetWidth: { configurable: true, get() { return 960; } },
  offsetHeight: { configurable: true, get() { return 720; } },
});
