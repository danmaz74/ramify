import { describe, expect, it } from 'vitest';
import { linkDescriptions } from '../link.js';
import { parseDescription } from '../parse.js';
import { createDefaultTagRegistry, deriveSourceAreas } from '../../../model/src/index.js';
import type { OriginalId } from '../../../model/src/interfaces/model.js';
import type { LinkInputs } from '../interfaces/linking.js';

function fixture(child: string, root = 'expose-sub * from child to descendants', tags = ''): LinkInputs {
  const registry = createDefaultTagRegistry();
  const modules = [
    { id: 'fixture', name: 'fixture', parent: null, directory: '.', tags: '', statements: root },
    { id: 'fixture/child', name: 'child', parent: 'fixture', directory: 'subs/child', tags, statements: child },
  ].map(module => {
    const directory = module.directory === '.' ? '' : module.directory + '/';
    const description = parseDescription(directory + 'module.ramify', `ramify 1\nmodule ${module.name}${module.tags}\n${module.statements}\n`);
    if (description.status !== 'valid') throw new Error(JSON.stringify(description));
    return { ...module, headerTags: description.document.module.tags, description,
      areas: [{ owner: module.id, kind: 'ordinary' as const, root: directory + 'src', present: true },
        { owner: module.id, kind: 'tests' as const, root: directory + 'src/tests', present: true }],
      purpose: { state: 'missing-file' as const, readme: directory + 'README.md' } };
  });
  const file = 'subs/child/src/interfaces/api.ts';
  const area = deriveSourceAreas(registry, 'fixture/child', 'subs/child/src', modules[1]!.headerTags);
  if (area.status !== 'valid') throw new Error('Fixture area invalid');
  const id: OriginalId = { kind: 'code', owner: 'fixture/child', file: 'interfaces/api.ts', binding: 'value' };
  const location = { file, start: 13, end: 18, line: 1, column: 14 };
  return { registry, inventory: { scope: { root: '/fixture', invokedFrom: '/fixture', selection: 'given', configuration: 'tsconfig.json', walkedAreas: ['src', 'subs/child/src'], independentScopes: [] },
    modules, files: [{ path: file, owner: 'fixture/child', area: 'ordinary', kind: 'source', sha256: 'fixture', bytes: 23 }],
    references: modules.flatMap(module => module.description.document.statements.filter(statement => statement.kind !== 'expose-sub').map(statement => ({
      description: module.description.document.file, statement: statement.index, decoded: statement.from.value, normalized: file, status: 'file' as const, interfaceEligible: true,
    }))), outsideModuleFiles: [], warnings: [] },
  catalog: { originals: [{ id, origin: { file, area: area.value[0]! }, declarations: [location], hasValue: true, hasType: false }],
    files: [{ file, state: 'complete', exports: [{ name: 'value', original: id, namespace: null, forwarding: [] }], issueIds: [], descriptionFiles: [] }], coverage: [] } };
}
const owned = 'expose-src value from "interfaces/api.ts"';
const wildcard = 'expose-src * from "interfaces/api.ts"';

describe('pure description linking', () => {
  it('retains ineffective named child selections while excluding them from child wildcards', () => {
    const result = linkDescriptions(fixture(`${owned} to descendants`, 'expose-sub value as unreachable from child to descendants\nexpose-sub * from child to parent'));
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    expect(result.selections.filter(item => item.module === 'fixture').map(item => item.pairs)).toEqual([
      [{ name: 'unreachable', original: { kind: 'code', owner: 'fixture/child', file: 'interfaces/api.ts', binding: 'value' }, effective: false }], [],
    ]);
    expect(result.modelInput.exposures.find(item => item.module === 'fixture')?.effective).toBe(false);
  });

  it('uses canonical receipt even when a different child alias supplies the parent channel', () => {
    const result = linkDescriptions(fixture(`expose-src value as first from "interfaces/api.ts" to descendants\n${owned} to parent`,
      'expose-sub first as received from child to descendants'));
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    expect(result.selections.find(item => item.module === 'fixture')!.pairs[0]).toMatchObject({ name: 'received', effective: true });
  });

  it('does not apply the relay source profile to its child contract', () => {
    const inputs = fixture(`${owned} tagged [dispatch] to parent`, 'expose-sub * from child to descendants', ' tagged [dispatch]');
    const root = inputs.inventory.modules[0]!;
    const description = parseDescription('module.ramify', 'ramify 1\nmodule fixture tagged [browser]\nexpose-sub * from child to descendants');
    const result = linkDescriptions({ ...inputs, inventory: { ...inputs.inventory,
      modules: [{ ...root, headerTags: ['browser'], description }, inputs.inventory.modules[1]!] } });
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    expect(result.modelInput.originals[0]!.tags).toEqual(['dispatch']);
    expect(result.selections.find(item => item.module === 'fixture')!.pairs[0]!.effective).toBe(true);
  });

  it.each(['unknown', 'missing'])('rejects %s child references without a partial model', kind => {
    const result = linkDescriptions(fixture(`${owned} to parent`, kind === 'unknown'
      ? 'expose-sub * from absent to descendants' : 'expose-sub absent from child to descendants'));
    expect(result).toMatchObject({ status: 'invalid', issues: [{ code: kind === 'unknown' ? 'unknown-child' : 'missing-export' }] });
    expect(result).not.toHaveProperty('modelInput');
  });

  it('collects tag assignments before defaults regardless of statement order', () => {
    const statements = [`${owned} to descendants`, `${wildcard} tagged [browser] to parent`];
    for (const order of [statements, [...statements].reverse()]) {
      const result = linkDescriptions(fixture(order.join('\n')));
      expect(result.status).toBe('valid');
      if (result.status !== 'valid') throw new Error(JSON.stringify(result));
      expect(result.modelInput.originals[0]!.tags).toEqual(['browser']);
      expect(result.modelInput.exposures.filter(item => item.module === 'fixture/child')).toHaveLength(1);
    }
  });

  it('rejects collisions even when destination sets differ', () => {
    const inputs = fixture(`${wildcard} to parent\nexpose-src different as value from "interfaces/api.ts" to descendants`);
    const original = { ...inputs.catalog.originals[0]!, id: { ...inputs.catalog.originals[0]!.id, binding: 'different' } };
    const result = linkDescriptions({ ...inputs, catalog: { ...inputs.catalog, originals: [...inputs.catalog.originals, original],
      files: [{ ...inputs.catalog.files[0]!, exports: [...inputs.catalog.files[0]!.exports,
        { name: 'different', original: original.id, namespace: null, forwarding: [] }] }] } });
    expect(result).toMatchObject({ status: 'invalid', issues: expect.arrayContaining([expect.objectContaining({ code: 'name-collision' })]) });
  });

  it.each(['incomplete', 'ambiguous'] as const)('rejects the whole %s wildcard, retaining known named selections only in independent valid runs', state => {
    const inputs = fixture(`${wildcard} to parent`);
    const catalog = { ...inputs.catalog, files: [{ ...inputs.catalog.files[0]!, state }] };
    expect(linkDescriptions({ ...inputs, catalog })).toMatchObject({ status: 'invalid', issues: [{ code: state === 'ambiguous' ? 'ambiguous-expansion' : 'incomplete-expansion' }] });
    expect(linkDescriptions({ ...fixture(`${owned} to parent`), catalog }).status).toBe('valid');
  });

  it('rejects missing catalog prerequisites even when no statement selects the file', () => {
    const inputs = fixture('', '');
    expect(linkDescriptions({ ...inputs, catalog: { originals: [], files: [], coverage: [] } })).toMatchObject({ status: 'invalid', issues: [{ code: 'invalid-prerequisite' }] });
  });

  it('validates unknown tags even for an empty interface expansion', () => {
    const inputs = fixture(`${wildcard} tagged [unknown] to parent`);
    expect(linkDescriptions({ ...inputs, catalog: { ...inputs.catalog, originals: [], files: [{ ...inputs.catalog.files[0]!, exports: [] }] } }))
      .toMatchObject({ status: 'invalid', issues: [{ code: 'unknown-tag' }] });
  });

  it('retains empty expansions and returns detached frozen data without freezing caller inputs', () => {
    const inputs = fixture(`${wildcard} to parent`);
    const result = linkDescriptions(inputs);
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    expect(Object.isFrozen(result.selections[0]!.pairs[0]!.original)).toBe(true);
    expect(Object.isFrozen(inputs.catalog.originals[0]!.id)).toBe(false);
    expect(result.modelInput.originals[0]!.id).not.toBe(inputs.catalog.originals[0]!.id);
    const empty = linkDescriptions({ ...inputs, catalog: { ...inputs.catalog, originals: [], files: [{ ...inputs.catalog.files[0]!, exports: [] }] } });
    expect(empty.status).toBe('valid');
    if (empty.status === 'valid') expect(empty.selections.map(item => item.pairs)).toEqual([[], []]);
  });
});
