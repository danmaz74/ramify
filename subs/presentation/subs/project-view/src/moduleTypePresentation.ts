// Adapted from cucumber-viz
// src/domains/module-architecture/ui/components/moduleTypePresentation.ts at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import type { ExplorerModule } from './interfaces/project-view.js';

export function getPresentationClass(module: ExplorerModule): string {
  return module.presentationClass;
}

export function getPresentationClassLabel(presentationClass: string): string {
  if (presentationClass === 'untagged') return 'Untagged';
  return presentationClass
    .split('+')
    .map((tag) => tag.charAt(0).toUpperCase() + tag.slice(1))
    .join(' + ');
}

export function getPresentationClassColor(presentationClass: string): string {
  return COLOR_PALETTE[hashString(presentationClass) % COLOR_PALETTE.length];
}

export function getOrderedPresentationClasses(classes: Iterable<string>): string[] {
  return [...new Set(classes)].sort(compareUtf8);
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const safe = normalized.length === 3
    ? normalized.split('').map((character) => character + character).join('')
    : normalized;
  const value = Number.parseInt(safe, 16);
  if (Number.isNaN(value)) return `rgba(100, 116, 139, ${alpha})`;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

const COLOR_PALETTE = [
  '#16a34a', '#2563eb', '#0891b2', '#0f766e', '#4f46e5',
  '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#dc2626',
  '#ea580c', '#ca8a04', '#65a30d', '#059669',
] as const;

function hashString(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function compareUtf8(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
}
