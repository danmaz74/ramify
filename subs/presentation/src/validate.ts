/**
 * The diagram cannot be allowed to drift from the model, so it checks itself
 * against the model before it is drawn.
 *
 * Everything the picture asserts is re-derived here through the definitive
 * evaluator:
 *
 * - every row drawn in a node box claims the symbol is available in that
 *   module, for a stated reason and by a named module's decision -
 *   `diagramVisibility`'s clause and `via` must agree;
 * - every arrowhead and chevron that *lands* on a module claims the symbol is
 *   available there - `isVisible` must agree;
 * - every decision dot claims a particular module decided -
 *   `diagramVisibility`'s `via` must name that module, and its clause must be
 *   the channel the lane is drawn in;
 * - every ✓ chord must be legal and every ✗ chord must be illegal, for the
 *   precise reason its label gives;
 * - nothing gray ever moves: a symbol drawn as stopping must have no lane;
 * - every tag claim - the chip on a row, the strike, the module classifications drawn
 *   inside a node, and every blink a selection would produce - is re-derived
 *   through `mayImport` with the importer the picture is talking about.
 *
 * The structure is checked against **availability** and the tags against
 * **importability**, which is the model's own split: a symbol arrives in a
 * module because the exposure chain sent it there, and a tag then decides who
 * may take it. A diagram whose chips or blinks contradict the evaluator fails
 * here, before anything is drawn.
 *
 * A mismatch throws. There is no "draw it anyway" path, because a diagram that
 * quietly disagrees with the model is worse than no diagram.
 */

import {
  moduleTagsOf,
  moduleView,
  modelModule,
  diagramVisibility,
  diagramImport,
  symbolTagsOf,
  isVisible,
  mayImport,
  type ModuleId,
  type Model,
  type SymbolName,
} from './model-access.js';
import type { TracedSymbol } from './diagram-definition.js';
import type { ChordLayout } from './layout-chords.js';
import type { DecisionDot, PropagationDecision, PropagationLayout } from './layout-lanes.js';
import {
  descendantsOf,
  tagChipText,
  type ModuleClassification,
  type NodeLayout,
} from './layout-nodes.js';

export class DiagramModelMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramModelMismatch';
  }
}

function fail(message: string): never {
  throw new DiagramModelMismatch(message);
}

function describe(importer: ModuleId, owner: ModuleId, symbol: SymbolName): string {
  return `${importer} → ${symbol} @ ${owner}`;
}

/**
 * Every head that lands on a node asserts an arrival. Check all of them - the
 * reading rule of §3.1 is "an arrowhead landing on a module means that symbol
 * is available there", and it has to be true.
 *
 * Availability, not importability: a lane draws where an exposure chain took a
 * symbol, and a tag on that symbol restricts who may import it without moving
 * the arrival. The chip on the arrival row is what states the restriction.
 */
export function validateLandings(tree: Model, propagation: PropagationLayout): void {
  for (const lane of propagation.lanes) {
    for (const ref of lane.symbols) {
      if (!isVisible(tree, lane.reaches, ref.owner, ref.name)) {
        fail(
          `Lane "${lane.id}" lands a ${lane.head} on "${lane.reaches}" for ` +
            `${describe(lane.reaches, ref.owner, ref.name)}, but the model denies that import.`,
        );
      }
    }
  }
}

/**
 * The module a dot sits on must be the module the evaluator credits with the
 * decision. For an exposure to descendants this is the *nearest* exposing
 * ancestor, since that is the one `diagramVisibility` reports.
 *
 * A dot is a claim about where a symbol went, so this too is an availability
 * question: a tag never changes whose decision made a symbol available.
 */
export function validateDecisionDots(
  tree: Model,
  propagation: PropagationLayout,
): void {
  const byId = new Map<string, PropagationDecision>(
    propagation.decisions.map((decision) => [decision.id, decision]),
  );
  const descendantExposuresOf = (symbolOwner: ModuleId, name: SymbolName): Set<ModuleId> =>
    new Set(
      propagation.decisions
        .filter(
          (decision) =>
            decision.kind === 'to-descendants' &&
            decision.symbols.some((ref) => ref.owner === symbolOwner && ref.name === name),
        )
        .map((decision) => decision.decider),
    );

  const check = (dot: DecisionDot): void => {
    const decision = byId.get(dot.decisionId);
    if (decision === undefined) {
      fail(`Decision dot "${dot.id}" refers to unknown decision "${dot.decisionId}".`);
    }
    for (const ref of decision.symbols) {
      if (decision.kind === 'to-parent') {
        const parent = moduleView(tree, decision.decider).parent ?? null;
        if (parent === null) {
          fail(`To-parent decision "${decision.id}" has no parent to expose to.`);
        }
        const verdict = diagramVisibility(tree, parent, ref.owner, ref.name);
        if (!verdict.visible || verdict.kind !== 'child' || verdict.via !== decision.decider) {
          fail(
            `Dot "${dot.id}" claims "${decision.decider}" exposed ${ref.name} to "${parent}", ` +
              'but the evaluator does not credit that decision.',
          );
        }
        continue;
      }

      const exposingAncestors = descendantExposuresOf(ref.owner, ref.name);
      for (const reached of descendantsOf(tree, decision.decider)) {
        const verdict = diagramVisibility(tree, reached, ref.owner, ref.name);
        if (!verdict.visible) {
          fail(
            `The exposure to descendants drawn at "${decision.decider}" reaches "${reached}", ` +
              `but ${describe(reached, ref.owner, ref.name)} is denied.`,
          );
        }
        if (verdict.kind !== 'ancestor') {
          // The reached module owns the symbol (a uniform exposure to
          // descendants landing back on the provider is harmless) - nothing to
          // attribute.
          continue;
        }
        const nearestExposingAncestor = ancestorChain(tree, reached).find((ancestor) => exposingAncestors.has(ancestor));
        if (verdict.via !== nearestExposingAncestor) {
          fail(
            `Dot "${dot.id}" attributes ${ref.name} at "${reached}" to "${String(nearestExposingAncestor)}", ` +
              `but the evaluator credits "${String(verdict.via)}".`,
          );
        }
      }
    }
  };

  for (const dot of propagation.dots) {
    check(dot);
  }
}

function ancestorChain(tree: Model, id: ModuleId): ModuleId[] {
  const chain: ModuleId[] = [];
  let current = moduleView(tree, id).parent ?? null;
  while (current !== null) {
    chain.push(current);
    current = moduleView(tree, current).parent ?? null;
  }
  return chain;
}

/** Every ✓ must be legal, every ✗ illegal - and for the reason its label gives. */
export function validateChords(tree: Model, chords: readonly ChordLayout[]): void {
  for (const chord of chords) {
    const verdict = diagramImport(tree, chord.importer, chord.owner, chord.symbol);
    if (chord.verdict === 'allowed' && verdict.status === 'denied') {
      fail(
        `Chord "${chord.id}" is drawn as allowed (${describe(chord.importer, chord.owner, chord.symbol)}), ` +
          'but the model denies it.',
      );
    }
    if (chord.verdict === 'denied' && verdict.status === 'allowed') {
      fail(
        `Chord "${chord.id}" is drawn as denied (${describe(chord.importer, chord.owner, chord.symbol)}), ` +
          'but the model allows it.',
      );
    }
    if (chord.verdict === 'denied' && chord.expectDenial !== undefined && verdict.status === 'denied') {
      if (verdict.reason !== chord.expectDenial) {
        fail(
          `Chord "${chord.id}" is labelled "${chord.reason}" (${chord.expectDenial}), ` +
            `but the model denies it because of "${verdict.reason}".`,
        );
      }
    }
  }
}

/**
 * Every row of every node box, checked against the clause that put it there.
 *
 * A node box is a claim about availability - "this symbol is available here,
 * and here is why". The three row kinds are the three clauses of the rule, and
 * the provenance a row prints names the module the evaluator credits, so both
 * are checkable and both are checked. A row whose stated provenance is not the
 * evaluator's `via` is the diagram inventing a chain.
 *
 * What a row says about *importing* - its chip, its strike and whether it
 * blinks - is checked by {@link validateTagClaims}.
 */
export function validateNodeRows(tree: Model, nodes: readonly NodeLayout[]): void {
  const expectedClause = {
    owns: 'owned',
    fromChild: 'child',
    fromAncestor: 'ancestor',
  } as const;

  for (const node of nodes) {
    for (const row of node.rows) {
      const verdict = diagramVisibility(tree, node.id, row.owner, row.symbol);
      if (!verdict.visible) {
        fail(
          `"${node.id}" lists ${describe(node.id, row.owner, row.symbol)}, ` +
            `but the model denies that import (no exposure path).`,
        );
      }
      const clause = expectedClause[row.kind];
      if (verdict.kind !== clause) {
        fail(
          `"${node.id}" draws ${row.symbol} as a "${row.kind}" row (${clause}), ` +
            `but the evaluator allows it by "${verdict.kind}".`,
        );
      }
      if ((row.from ?? null) !== verdict.via) {
        fail(
          `"${node.id}" credits ${row.symbol} to "${String(row.from)}", ` +
            `but the evaluator credits "${String(verdict.via)}".`,
        );
      }
    }
  }
}

/**
 * Gray means *stops here*: nothing gray may have a lane leaving its node.
 *
 * `fromAncestor` rows are exempt in both directions. They record an arrival,
 * not a decision - re-exposing a symbol received from an ancestor is a no-op -
 * so such a row neither claims the symbol stopped nor promises a lane leaving
 * the node.
 */
export function validateGrayRows(
  nodes: readonly NodeLayout[],
  propagation: PropagationLayout,
): void {
  for (const node of nodes) {
    for (const row of node.rows.filter((candidate) => candidate.kind !== 'fromAncestor')) {
      const moving = propagation.decisions.some(
        (decision) =>
          decision.decider === node.id &&
          decision.symbols.some((ref) => ref.owner === row.owner && ref.name === row.symbol),
      );
      if (row.gray && moving) {
        fail(`"${node.id}" draws ${row.symbol} as gray, but a lane leaves the node carrying it.`);
      }
      if (!row.gray && !moving) {
        fail(`"${node.id}" marks ${row.symbol} as exposed, but no lane carries it out of the node.`);
      }
    }
  }
}

/** The module classification displayed by a node, when it has tags. */
function classificationsOf(node: NodeLayout): ModuleClassification[] {
  return node.classification === undefined ? [] : [node.classification];
}

/**
 * Everything the picture says about tags, re-derived through the evaluator.
 *
 * Four claims, each checked for the importing module and import form:
 *
 * - **the chip.** A row wears exactly the exposure tags `symbolTagsOf` gives
 *   for its symbol, asked at the owner - never at whoever re-exposed it.
 * - **the strike.** A row is struck exactly when it is not available - the
 *   diagrams show value availability, with an asterisk for type-only access.
 * - **the blink.** `importable` on a row and `imports` on a module classification are the
 *   blink sets, so checking them is checking every pulse a selection can
 *   produce: an arrival a tag refuses stays dark, and a module lights up only
 *   for what it may really import.
 * - **the module tags.** Every classification drawn exists in the declaration, carries
 *   the tags the declaration gives it, and none is missing.
 */
export function validateTagClaims(
  tree: Model,
  nodes: readonly NodeLayout[],
  traced: readonly TracedSymbol[],
): void {
  const annotation = (
    row: NodeLayout['rows'][number],
    kind: 'tags',
  ): string | undefined => (row.annotations ?? []).find((entry) => entry.kind === kind)?.text;

  for (const node of nodes) {
    for (const row of node.rows) {
      const tags = symbolTagsOf(tree, row.owner, row.symbol);
      if ((row.tags ?? []).join(' ') !== tags.join(' ')) {
        fail(
          `"${node.id}" draws ${row.symbol} with tags [${(row.tags ?? []).join(', ')}], ` +
            `but its owner declares [${tags.join(', ')}].`,
        );
      }
      const chip = tagChipText(tags, tree.registry);
      if (annotation(row, 'tags') !== chip) {
        fail(
          `"${node.id}" draws the chip ${String(annotation(row, 'tags'))} on ${row.symbol}, ` +
            `but the model's chip is ${String(chip)}.`,
        );
      }

      const value = mayImport(tree, { module: node.id, binding: 'value' }, row.owner, row.symbol);
      if (row.importable !== value) {
        fail(
          `"${node.id}" would ${row.importable ? 'blink' : 'leave dark'} ${row.symbol}, ` +
            `but the model ${value ? 'allows' : 'does not allow'} that import.`,
        );
      }
      if (row.struck !== !value) {
        fail(
          `"${node.id}" ${row.struck ? 'strikes' : 'does not strike'} ${row.symbol}, ` +
            `but the symbol is ${value ? '' : 'not '}available there.`,
        );
      }
      const type = mayImport(tree, { module: node.id, binding: 'type' }, row.owner, row.symbol);
      if (row.typeAvailable !== type) {
        fail(
          `"${node.id}" ${row.typeAvailable ? 'marks' : 'does not mark'} ${row.symbol} ` +
            `as type-available, but the model ${type ? 'allows' : 'does not allow'} the type import.`,
        );
      }
    }

    const record = modelModule(tree, node.id);
    if (record === undefined) {
      fail(`The diagram draws a node for the unknown module "${node.id}".`);
    }
    const drawn = classificationsOf(node);
    const moduleTags = moduleTagsOf(tree, node.id);
    if ((node.classification === undefined) !== (moduleTags.length === 0)) {
      fail(
        `"${node.id}" ${node.classification === undefined ? 'draws no' : 'draws a'} module ` +
          `classification, but its files carry [${moduleTags.join(', ')}].`,
      );
    }

    for (const classification of drawn) {
      const where = node.id;
      if (classification.module !== node.id) {
        fail(`The classification "${where}" is drawn inside "${node.id}" but claims "${classification.module}".`);
      }
      const tags = moduleTagsOf(tree, node.id);
      if (classification.tags.join(' ') !== tags.join(' ')) {
        fail(
          `The classification "${where}" is drawn with [${classification.tags.join(', ')}], ` +
            `but the declaration classifies its files [${tags.join(', ')}].`,
        );
      }
      const imports = traced
        .filter(
          (entry) =>
            entry.owner !== node.id &&
            mayImport(
              tree,
              {
                module: node.id,
                binding: 'value',
              },
              entry.owner,
              entry.symbol,
            ),
        )
        .map((entry) => entry.symbol);
      if (classification.imports.join(' ') !== imports.join(' ')) {
        fail(
          `The classification "${where}" would blink for [${classification.imports.join(', ')}], ` +
            `but the model lets it import [${imports.join(', ')}].`,
        );
      }
    }
  }
}

/** Every check. Called before anything is drawn. */
export function validateDiagram(
  tree: Model,
  nodes: readonly NodeLayout[],
  propagation: PropagationLayout,
  chords: readonly ChordLayout[],
  traced: readonly TracedSymbol[] = [],
): void {
  validateNodeRows(tree, nodes);
  validateLandings(tree, propagation);
  validateDecisionDots(tree, propagation);
  validateChords(tree, chords);
  validateGrayRows(nodes, propagation);
  validateTagClaims(tree, nodes, traced);
}
