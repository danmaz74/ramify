/** Compact authoring of teaching fixtures; produces actual canonical ModelInput facts. */
import { assignOriginalTags, createDefaultTagRegistry, deriveSourceAreas,
  type Destination, type Exposure, type ModelInput, type ModuleRecord, type Original,
} from '../../../analysis/subs/model/src/index.js';
import { buildDiagramModel, validModelResult, type DiagramModelInput } from '../model-access.js';

interface TeachingModule {
  readonly name: string;
  readonly tags?: readonly string[];
  readonly symbols?: readonly { readonly name: string; readonly tags?: readonly string[]; readonly destinations?: readonly Destination[] }[];
  readonly relays?: readonly { readonly name: string; readonly child: string; readonly destinations: readonly Destination[] }[];
  readonly children?: readonly TeachingModule[];
}

export function defineDiagramModel(root: TeachingModule): DiagramModelInput {
  const registry = createDefaultTagRegistry();
  const modules: ModuleRecord[] = [];
  const labels: Record<string, string> = {};
  const declaredName = (label: string) => label.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const originals: Original[] = [];
  const exposures: Exposure[] = [];
  const visit = (node: TeachingModule, parent: ModuleRecord | null, directory: string): void => {
    const name = declaredName(node.name);
    const id = parent ? `${parent.id}/${name}` : name;
    labels[id] = node.name;
    const record: ModuleRecord = { id, name, parent: parent?.id ?? null,
      headerTags: node.tags ?? [], areas: validModelResult(deriveSourceAreas(registry, id, `${directory}src`, node.tags ?? [])) };
    modules.push(record);
    const evidence = [{ file: `${directory}module.ramify`, start: 0, end: 1, line: 1, column: 1 }];
    for (const symbol of node.symbols ?? []) {
      const area = record.areas[0]!;
      const assignment = validModelResult(assignOriginalTags(registry, area,
        symbol.tags === undefined ? [] : [{ tags: symbol.tags, location: evidence[0]! }]));
      const original: Original = { id: { kind: 'code', owner: id, file: 'fixtures.ts', binding: symbol.name },
        origin: { area, file: `${area.root}/fixtures.ts` }, declarations: evidence,
        tags: assignment.tags, tagEvidence: assignment.evidence, hasValue: true, hasType: true };
      originals.push(original);
      if (symbol.destinations?.length) exposures.push({ module: id, original: original.id,
        names: [symbol.name], destinations: symbol.destinations, evidence, provider: null, effective: true });
    }
    for (const child of node.children ?? []) visit(child, record, `${directory}subs/${child.name}/`);
    for (const relay of node.relays ?? []) {
      const provider = `${id}/${declaredName(relay.child)}`;
      const supplied = exposures.filter((item) => item.module === provider && item.names.includes(relay.name));
      if (supplied.length !== 1) throw new Error(`Fixture relay requires one child selection: ${provider}/${relay.name}`);
      const selected = supplied[0]!;
      exposures.push({ module: id, original: selected.original, names: [relay.name], destinations: relay.destinations,
        evidence, provider, effective: selected.effective && selected.destinations.includes('parent') });
    }
  };
  visit(root, null, '');
  return buildDiagramModel({ registry, modules, originals, exposures, labels });
}
