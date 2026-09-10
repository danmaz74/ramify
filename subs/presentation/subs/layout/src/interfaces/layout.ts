/** Neutral measured inputs and geometry. No model or rendering policy crosses this boundary. */
export interface Point { readonly x: number; readonly y: number }
export interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface ViewRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface Anchor { readonly u: number; readonly v: number }
export interface LayoutNodeInput { readonly key: string; readonly parent: string | null;
  readonly width: number; readonly height: number; readonly order: number }
export interface LayoutEdgeInput { readonly key: string; readonly from: string; readonly to: string;
  readonly lane: number; readonly order: number }
export interface LayoutGraphInput { readonly nodes: readonly LayoutNodeInput[];
  readonly edges: readonly LayoutEdgeInput[] }
export interface LayoutNode { readonly key: string; readonly box: Box }
export interface LayoutEdge { readonly key: string; readonly points: readonly Point[] }
export interface LayoutResult { readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[]; readonly bounds: Box }
export interface LayoutOptions { readonly gapX: number; readonly gapY: number;
  readonly padding: number; readonly orientation: 'horizontal' | 'vertical' }
export interface LegendItemInput { readonly key: string; readonly width: number; readonly height: number }
export interface LegendInput { readonly items: readonly LegendItemInput[]; readonly maxWidth: number }
export interface LegendResult { readonly items: readonly LayoutNode[]; readonly bounds: Box }
