# Layout

Layout computes geometry and viewport transformations from neutral keys, ordered edges and measured dimensions. It owns its coordinate vocabulary and has no dependency on model decisions, parent presentation types or React.

The public entry exports the neutral interfaces, placement operations, geometry
metrics and viewport arithmetic. Node and tree placement use parent keys and
explicit order. Lane placement uses signed, one-based lane numbers (zero is the
base connector); chord placement uses lane as endpoint clearance and order as
the tie-break for equal spans. Chord points sample the d3 Catmull–Rom curve while
retaining its knots, so consumers can draw them without retaining a d3 object.
Legend placement flows measured items within the requested extent. Focus
placement aligns panels and distributes measured columns within their parent.

Presentation prepares the content and associates results with its rows, labels
and colors by key. Layout never imports presentation or model definitions.
