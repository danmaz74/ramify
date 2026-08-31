/**
 * The diagram cannot be allowed to drift from the model, so it checks itself
 * against the model before it is drawn.
 *
 * Everything the picture asserts is re-derived here through the Iteration 2
 * evaluator:
 *
 * - every row drawn in a node box claims the symbol is available in that
 *   module, for a stated reason and by a named module's decision —
 *   `explainImport`'s clause and `via` must agree;
 * - every arrowhead and chevron that *lands* on a module claims that module may
 *   import the symbol — `mayImport` must agree;
 * - every decision dot claims a particular module decided — `explainImport`'s
 *   `via` must name that module, and its clause must be the channel the lane is
 *   drawn in;
 * - every ✓ chord must be legal and every ✗ chord must be illegal, for the
 *   precise reason its label gives;
 * - nothing gray ever moves: a symbol drawn as stopping must have no lane.
 *
 * A mismatch throws. There is no "draw it anyway" path, because a diagram that
 * quietly disagrees with the model is worse than no diagram.
 */

import { explainImport, mayImport, type ModuleId, type ModuleTree, type SymbolName } from './model-access.js';
import type { ChordLayout } from './layout-chords.js';
import type { DecisionDot, PropagationDecision, PropagationLayout } from './layout-lanes.js';
import { descendantsOf, type NodeLayout } from './layout-nodes.js';

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
 * Every head that lands on a node asserts an import right. Check all of them —
 * the reading rule of §3.1 is "an arrowhead landing on a module means that
 * module may import that symbol", and it has to be true.
 */
export function validateLandings(tree: ModuleTree, propagation: PropagationLayout): void {
  for (const lane of propagation.lanes) {
    for (const ref of lane.symbols) {
      if (!mayImport(tree, lane.reaches, ref.owner, ref.name)) {
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
 * decision. For a grant this is the *nearest* granting ancestor, since that is
 * the one `explainImport` reports.
 */
export function validateDecisionDots(
  tree: ModuleTree,
  propagation: PropagationLayout,
): void {
  const byId = new Map<string, PropagationDecision>(
    propagation.decisions.map((decision) => [decision.id, decision]),
  );
  const grantsOf = (symbolOwner: ModuleId, name: SymbolName): Set<ModuleId> =>
    new Set(
      propagation.decisions
        .filter(
          (decision) =>
            decision.kind === 'grant' &&
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
      if (decision.kind === 'up-hop') {
        const parent = tree.modules.get(decision.decider)?.parent ?? null;
        if (parent === null) {
          fail(`Up-hop decision "${decision.id}" has no parent to expose to.`);
        }
        const verdict = explainImport(tree, parent, ref.owner, ref.name);
        if (!verdict.allowed || verdict.clause !== 'child-exposure' || verdict.via !== decision.decider) {
          fail(
            `Dot "${dot.id}" claims "${decision.decider}" exposed ${ref.name} to "${parent}", ` +
              'but the evaluator does not credit that decision.',
          );
        }
        continue;
      }

      const granters = grantsOf(ref.owner, ref.name);
      for (const reached of descendantsOf(tree, decision.decider)) {
        const verdict = explainImport(tree, reached, ref.owner, ref.name);
        if (!verdict.allowed) {
          fail(
            `The grant drawn at "${decision.decider}" reaches "${reached}", ` +
              `but ${describe(reached, ref.owner, ref.name)} is denied.`,
          );
        }
        if (verdict.clause !== 'ancestor-grant') {
          // The reached module owns the symbol (a uniform grant landing back on
          // the provider is harmless) — nothing to attribute.
          continue;
        }
        const nearestGranter = ancestorChain(tree, reached).find((ancestor) => granters.has(ancestor));
        if (verdict.via !== nearestGranter) {
          fail(
            `Dot "${dot.id}" attributes ${ref.name} at "${reached}" to "${String(nearestGranter)}", ` +
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

function ancestorChain(tree: ModuleTree, id: ModuleId): ModuleId[] {
  const chain: ModuleId[] = [];
  let current = tree.modules.get(id)?.parent ?? null;
  while (current !== null) {
    chain.push(current);
    current = tree.modules.get(current)?.parent ?? null;
  }
  return chain;
}

/** Every ✓ must be legal, every ✗ illegal — and for the reason its label gives. */
export function validateChords(tree: ModuleTree, chords: readonly ChordLayout[]): void {
  for (const chord of chords) {
    const verdict = explainImport(tree, chord.importer, chord.owner, chord.symbol);
    if (chord.verdict === 'allowed' && !verdict.allowed) {
      fail(
        `Chord "${chord.id}" is drawn as allowed (${describe(chord.importer, chord.owner, chord.symbol)}), ` +
          'but the model denies it.',
      );
    }
    if (chord.verdict === 'denied' && verdict.allowed) {
      fail(
        `Chord "${chord.id}" is drawn as denied (${describe(chord.importer, chord.owner, chord.symbol)}), ` +
          'but the model allows it.',
      );
    }
    if (chord.verdict === 'denied' && chord.expectDenial !== undefined && !verdict.allowed) {
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
 * A node box is a claim about availability — "this symbol is available here,
 * and here is why". The three row kinds are the three clauses of the rule, and
 * the provenance a row prints names the module the evaluator credits, so both
 * are checkable and both are checked. A row whose stated provenance is not the
 * evaluator's `via` is the diagram inventing a chain.
 */
export function validateNodeRows(tree: ModuleTree, nodes: readonly NodeLayout[]): void {
  const expectedClause = {
    owns: 'same-module',
    received: 'child-exposure',
    granted: 'ancestor-grant',
  } as const;

  for (const node of nodes) {
    for (const row of node.rows) {
      const verdict = explainImport(tree, node.id, row.owner, row.symbol);
      if (!verdict.allowed) {
        fail(
          `"${node.id}" lists ${describe(node.id, row.owner, row.symbol)}, ` +
            `but the model denies that import ("${verdict.reason}").`,
        );
      }
      const clause = expectedClause[row.kind];
      if (verdict.clause !== clause) {
        fail(
          `"${node.id}" draws ${row.symbol} as a "${row.kind}" row (${clause}), ` +
            `but the evaluator allows it by "${verdict.clause}".`,
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
 * `granted` rows are exempt in both directions. They record an arrival, not a
 * decision — re-exposing an ancestor-granted symbol is a no-op — so such a row
 * neither claims the symbol stopped nor promises a lane leaving the node.
 */
export function validateGrayRows(
  nodes: readonly NodeLayout[],
  propagation: PropagationLayout,
): void {
  for (const node of nodes) {
    for (const row of node.rows.filter((candidate) => candidate.kind !== 'granted')) {
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

/** Every check. Called before anything is drawn. */
export function validateDiagram(
  tree: ModuleTree,
  nodes: readonly NodeLayout[],
  propagation: PropagationLayout,
  chords: readonly ChordLayout[],
): void {
  validateNodeRows(tree, nodes);
  validateLandings(tree, propagation);
  validateDecisionDots(tree, propagation);
  validateChords(tree, chords);
  validateGrayRows(nodes, propagation);
}
