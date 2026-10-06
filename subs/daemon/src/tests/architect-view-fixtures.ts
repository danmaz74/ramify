import { renderArchitectView } from '../../../analysis/src/architect-render.js';
import type {
  ArchitectModuleFacts, ArchitectSymbol, ArchitectTestRecord, ArchitectViewProjection, RenderedArchitectView,
} from '../../../analysis/src/interfaces/architect-view.js';

/** Small builders for architect views that the publisher tests and the
 * crash-recovery child-process fixture publish. Views are rendered by the
 * real renderer, so the publisher is tested against the bytes it will
 * receive, `_meta.json` included. */

const root = 'fixture';

function moduleFacts(name: string | null, children: readonly string[], purpose: string): ArchitectModuleFacts {
  return {
    module: name ? `${root}/${name}` : root, dir: name ? `subs/${name}` : '', parent: name ? root : null,
    children: children.map(child => `${root}/${child}`), tags: [], areas: ['src', 'src/tests'], boundaries: [],
    purpose: { state: 'present', path: name ? `subs/${name}/README.md` : 'README.md', text: purpose },
    docs: [], files: { own: 2, subtree: name ? 2 : 2 + 2 * children.length },
  };
}

function symbol(module: string, dir: string, name: string, signature: string): ArchitectSymbol {
  const file = `${dir ? `${dir}/` : ''}src/${name}.ts`;
  const original = { kind: 'code' as const, owner: module, file, binding: name };
  return {
    module, original, name, binding: null, exposureNames: [], role: 'exposed', destinations: ['parent'],
    kind: 'function', behavior: 'callable', hasValue: true, tags: [], reexposed: [],
    detail: { state: 'described', original, exportName: name, signature }, file,
  };
}

function suite(module: string, dir: string, name: string, titles: readonly string[]): ArchitectTestRecord {
  return { kind: 'suite', module, file: `${dir ? `${dir}/` : ''}src/tests/${name}.test.ts`, suite: [name], tests: titles };
}

/**
 * The architect view of a project whose root module `fixture` has the given
 * child modules, each with one callable symbol and one suite. `term` appears
 * in every symbol name, signature and test title, so a search for it finds
 * lines in each module's `behavior.jsonl` and `tests.jsonl`.
 */
export function architectView(options: {
  readonly revision?: string;
  readonly children?: readonly string[];
  readonly term?: string;
} = {}): RenderedArchitectView {
  const children = [...(options.children ?? ['engine'])].sort();
  const term = options.term ?? 'run';
  const modules = [moduleFacts(null, children, 'The fixture project.'),
    ...children.map(child => moduleFacts(child, [], `The ${child} module.`))];
  const symbols: ArchitectSymbol[] = [], tests: ArchitectTestRecord[] = [];
  for (const facts of modules) {
    const local = facts.module === root ? 'root' : facts.module.slice(root.length + 1);
    const name = `${term}${local[0]!.toUpperCase()}${local.slice(1)}`;
    symbols.push(symbol(facts.module, facts.dir, name, `function ${name}(input: string): void;`));
    tests.push(suite(facts.module, facts.dir, local, [`${term}s ${local} once`, `${term}s ${local} twice`]));
  }
  const projection: ArchitectViewProjection = {
    schema: 'ramify.architect-projection/3', sequence: 1, inputId: 'input/1:fixture', root, modules, symbols, tests,
    counts: { coverage: 0, detailsUnavailable: 0, unknownShapes: 0, dynamicTitles: 0, testsUnavailable: 0, cut: 0 }, bytes: 0,
  };
  return renderArchitectView({ revision: options.revision ?? 'rev/1:fixture', projection,
    dependencies: { state: 'unavailable', reason: 'wait-limit' },
    measurements: { state: 'unavailable', reason: 'analysis-failed' } });
}
