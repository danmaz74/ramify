# Presentation

Presentation prepares and renders the teaching diagrams and their interactions from the definitive model. It owns diagram meaning, rows, labels, colors and React components, and supplies neutral geometry inputs to its layout child.

The `src/index.ts` package entry supplies the components, diagram definitions
and teaching fixtures. Definitions carry canonical `ModelInput` facts;
`model-access.ts` asks the definitive model for visibility and import decisions
and projects their evidence into rows and labels. Fixture labels can preserve
camel-case teaching names while the model retains valid declared owner paths.
Labels never replace original identity or decide permission.

The model's values reach this owner through analysis and root declarations,
with explicit browser promises. Root relays presentation declarations without
importing UI values. The layout child owns numerical placement and viewport
operations; presentation joins its neutral keyed results to teaching content.

Owned tests live in `src/tests/`. Their SVG assertions require the emitter's
existing artifacts under package-root `site/static/diagrams/`; this owner has
no snapshot directory of its own.
