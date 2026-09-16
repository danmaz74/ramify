// Plan 2A iteration 1 probe: I2A-01 TypeScript symbol-detail feasibility.
//
// Uses the SAME TypeScript dependency and API surface the toolkit's own
// retained compiler adapter uses (`typescript` 7.0.2, consumed through
// `typescript/unstable/sync`; see subs/analysis/subs/typescript/src/catalog.ts
// for the toolkit's existing use of this exact API to resolve exports to
// `Symbol`s and declarations). This probe extends that same pattern with
// NET-NEW code -- nothing here is imported from `subs/`, and no production
// owner is touched -- to demonstrate whether a bounded, body-free signature
// and a first-JSDoc-paragraph extraction are feasible, and to name the
// concrete gaps for iteration 4.
//
// Findings this probe demonstrates concretely:
//  - Callable signatures (functions, overloads) are body-free "for free" via
//    `checker.signatureToSignatureDeclaration(signature, SyntaxKind.CallSignature)`
//    + `emitter.printNode`, because a synthetic call-signature node never
//    carries a body.
//  - Interface, type-alias and enum declarations are body-free "for free"
//    when the REAL declaration node is printed directly (interface members,
//    type aliases and enum members have no implementation bodies in
//    TypeScript syntax).
//  - Class and variable declarations are NOT body-free when their real
//    declaration node is printed as-is (methods/constructors carry bodies;
//    variables carry initializers). This probe demonstrates the printed
//    (non-body-free) form for a class, and a body-free ALTERNATIVE for
//    variables built from `checker.getTypeOfSymbol` + `checker.typeToTypeNode`
//    + `emitter.printNode` rather than printing the real declaration. A
//    body-free class rendering is not solved here and is recorded as a gap.
//  - `checker.getDocumentationCommentOfSymbol(symbol)` already returns a
//    plain joined string (unlike classic `typescript`'s `SymbolDisplayPart[]`,
//    no `ts.displayPartsToString` equivalent is needed); first-paragraph
//    extraction is ordinary string splitting on the first blank line.
//  - A UTF-8-byte-safe truncation helper does not exist anywhere in `subs/`
//    (confirmed by search); this probe writes and exercises a small one.
//  - Forwarding/alias resolution (`checker.getAliasedSymbol`) already
//    resolves a re-exported name back to its defining file, matching the
//    catalog's existing identity rule.
//  - A missing export and an unsupported declaration kind (a namespace) are
//    both isolated per-request failures that do not affect other requests in
//    the same batch.
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, SymbolFlags, SignatureKind } from 'typescript/unstable/sync';
import type { Project, Symbol as CompilerSymbol } from 'typescript/unstable/sync';
import { SyntaxKind } from 'typescript/unstable/ast';
import { archive } from '../resident-probe.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureRoot = resolve(packageRoot, 'scripts/probes/fixtures/plan2a-symbol-details');
const config = resolve(fixtureRoot, 'tsconfig.json');

/** Net-new: no byte-safe UTF-8 truncation helper exists anywhere in subs/ today
 * (confirmed by search). `fatal: true` makes the decoder reject a slice that
 * ends mid-code-point, so backing off one byte at a time always lands on a
 * safe boundary without ever emitting a replacement character. */
function truncateUtf8Bytes(text: string, maxBytes: number): { readonly text: string; readonly truncated: boolean } {
  const full = Buffer.from(text, 'utf8');
  if (full.length <= maxBytes) return { text, truncated: false };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let end = maxBytes; end >= 0; end--) {
    try { return { text: decoder.decode(full.subarray(0, end)), truncated: true }; }
    catch { /* mid-code-point; try one byte shorter */ }
  }
  return { text: '', truncated: true };
}

function firstParagraph(documentation: string): string | undefined {
  const trimmed = documentation.trim();
  if (!trimmed) return undefined;
  const [first] = trimmed.split(/\r?\n\s*\r?\n/);
  return first.replace(/\s+/g, ' ').trim();
}

const api = new API({ cwd: fixtureRoot });
let snapshot: ReturnType<API['updateSnapshot']> | undefined;
try {
  api.parseConfigFile(config);
  snapshot = api.updateSnapshot({ openProjects: [config] });
  const project = snapshot.getProject(config);
  if (!project) throw new Error('Probe fixture project failed to open');
  const diagnostics = [...project.program.getSyntacticDiagnostics(), ...project.program.getSemanticDiagnostics()];
  if (diagnostics.length) throw new Error(`Probe fixture has compiler diagnostics: ${diagnostics.length}`);

  const { checker, emitter } = project;
  const originalsFile = project.program.getSourceFile(resolve(fixtureRoot, 'src/originals.ts'));
  if (!originalsFile) throw new Error('originals.ts missing from probe fixture program');
  const originalsModule = checker.getSymbolAtLocation(originalsFile);
  if (!originalsModule) throw new Error('originals.ts has no module symbol');
  const originalsExports = new Map(checker.getExportsOfModule(originalsModule).map((s) => [s.name, s]));

  const forwardFile = project.program.getSourceFile(resolve(fixtureRoot, 'src/forward.ts'));
  const forwardModule = forwardFile && checker.getSymbolAtLocation(forwardFile);
  const forwardExports = forwardModule ? new Map(checker.getExportsOfModule(forwardModule).map((s) => [s.name, s])) : new Map<string, CompilerSymbol>();

  const limits = { maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8 };

  function original(symbol: CompilerSymbol): CompilerSymbol {
    return symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  }

  function declarationFileOf(symbol: CompilerSymbol): string | null {
    const handle = symbol.declarations[0];
    if (!handle) return null;
    const node = handle.resolve(project);
    return node ? relative(fixtureRoot, node.getSourceFile().fileName) : null;
  }

  function describe(name: string, symbol: CompilerSymbol, signatureLimit: number, docLimit: number, overloadLimit: number) {
    const target = original(symbol);
    const handle = target.declarations[0];
    const node = handle?.resolve(project);
    const kindName = node ? SyntaxKind[node.kind] : 'unknown';
    if (node && node.kind === SyntaxKind.ModuleDeclaration) {
      return { name, state: 'unavailable' as const, reason: 'unsupported-declaration' as const, kind: kindName };
    }

    const documentationFull = checker.getDocumentationCommentOfSymbol(target);
    const paragraph = firstParagraph(documentationFull);
    const docBound = paragraph ? truncateUtf8Bytes(paragraph, docLimit) : null;

    let signatureText: string, overloadsRetained = 1, overloadsAvailable = 1, method: string;
    const type = checker.getTypeOfSymbol(target);
    const callSignatures = type ? checker.getSignaturesOfType(type, SignatureKind.Call) : [];
    if (callSignatures.length && node && (node.kind === SyntaxKind.FunctionDeclaration)) {
      method = 'signatureToSignatureDeclaration(CallSignature) [body-free "for free"]';
      overloadsAvailable = callSignatures.length;
      const retained = callSignatures.slice(0, overloadLimit);
      overloadsRetained = retained.length;
      signatureText = retained.map((signature) => {
        const declNode = checker.signatureToSignatureDeclaration(signature, SyntaxKind.CallSignature, undefined, undefined);
        return declNode ? `function ${name}${emitter.printNode(declNode)}` : `function ${name}(/* unresolved signature */)`;
      }).join('\n');
    } else if (node && node.kind === SyntaxKind.VariableDeclaration) {
      method = 'typeToTypeNode(getTypeOfSymbol) [body-free alternative to printing the real declaration, which carries an initializer]';
      const declaredType = checker.getTypeOfSymbol(target);
      const typeNode = declaredType && checker.typeToTypeNode(declaredType, undefined, 0);
      signatureText = typeNode ? `const ${name}: ${emitter.printNode(typeNode)}` : `const ${name}: unknown`;
    } else if (node) {
      method = 'printNode(real declaration) [interface/type-alias/enum: body-free by TypeScript syntax; class: NOT body-free -- gap]';
      signatureText = emitter.printNode(node, { preserveSourceNewlines: false });
    } else {
      return { name, state: 'unavailable' as const, reason: 'compiler-failure' as const, kind: kindName };
    }

    const sigBound = truncateUtf8Bytes(signatureText, signatureLimit);
    const truncated: ('signature' | 'documentation' | 'overloads')[] = [];
    if (sigBound.truncated) truncated.push('signature');
    if (docBound?.truncated) truncated.push('documentation');
    if (overloadsRetained < overloadsAvailable) truncated.push('overloads');

    return {
      name, state: truncated.length ? ('truncated' as const) : ('described' as const),
      kind: kindName, method,
      declarationFile: declarationFileOf(target),
      isAlias: Boolean(symbol.flags & SymbolFlags.Alias),
      signature: sigBound.text, signatureBytes: Buffer.byteLength(sigBound.text),
      documentation: docBound?.text, documentationBytes: docBound ? Buffer.byteLength(docBound.text) : 0,
      overloadsAvailable, overloadsRetained, truncated,
    };
  }

  function attempt(label: string, name: string, exports: Map<string, CompilerSymbol>, signatureLimit = limits.maxSignatureBytes, docLimit = limits.maxDocumentationBytes, overloadLimit = limits.maxOverloads) {
    const symbol = exports.get(name);
    if (!symbol) return { name: label, state: 'unavailable' as const, reason: 'missing-export' as const };
    try { return describe(label, symbol, signatureLimit, docLimit, overloadLimit); }
    catch (error) { return { name: label, state: 'unavailable' as const, reason: 'compiler-failure' as const, message: error instanceof Error ? error.message : String(error) }; }
  }

  const cases = {
    'declaration-kind:function-overloaded': attempt('add', 'add', originalsExports),
    'declaration-kind:class': attempt('Widget', 'Widget', originalsExports),
    'declaration-kind:interface': attempt('Shape', 'Shape', originalsExports),
    'declaration-kind:type-alias': attempt('Id', 'Id', originalsExports),
    'declaration-kind:variable': attempt('total', 'total', originalsExports),
    'declaration-kind:enum': attempt('Color', 'Color', originalsExports),
    'declaration-kind:default-export': attempt('default', 'default', originalsExports),
    'no-documentation': attempt('undocumented', 'undocumented', originalsExports),
    'unicode-documentation-full-budget': attempt('unicodeDoc', 'unicodeDoc', originalsExports),
    'unicode-documentation-tight-budget': attempt('unicodeDoc', 'unicodeDoc', originalsExports, limits.maxSignatureBytes, 40),
    'overload-bound-truncated': attempt('add', 'add', originalsExports, limits.maxSignatureBytes, limits.maxDocumentationBytes, 1),
    'signature-bound-truncated': attempt('add', 'add', originalsExports, 24, limits.maxDocumentationBytes),
    'unsupported-declaration:namespace': attempt('Grouped', 'Grouped', originalsExports),
    'missing-export': attempt('doesNotExist', 'doesNotExist', originalsExports),
    'forwarded-alias:identity': attempt('forwardedTotal', 'forwardedTotal', forwardExports),
    // Isolated-failure independence: a missing/unsupported request in the same
    // batch order must not affect a later valid one.
    'isolated-after-failure:function': attempt('add', 'add', originalsExports),
  };

  const isolationCheck = {
    missingExportDidNotAbort: 'state' in cases['missing-export'] && cases['missing-export'].state === 'unavailable',
    laterValidRequestStillDescribed: 'state' in cases['isolated-after-failure:function'] && ['described', 'truncated'].includes(cases['isolated-after-failure:function'].state),
  };
  const aliasCheck = 'declarationFile' in cases['forwarded-alias:identity']
    ? { resolvedToDefiningFile: cases['forwarded-alias:identity'].declarationFile === 'src/originals.ts', notForwardFile: cases['forwarded-alias:identity'].declarationFile !== 'src/forward.ts' }
    : null;
  const unicodeRoundTrip = 'documentation' in cases['unicode-documentation-tight-budget']
    ? { decodesWithoutReplacementCharacter: !cases['unicode-documentation-tight-budget'].documentation?.includes('�') }
    : null;

  snapshot.dispose();
  await archive('plan2a/typescript-detail-feasibility', {
    typescriptVersion: (await import('node:fs/promises').then((fs) => fs.readFile(resolve(packageRoot, 'node_modules/typescript/package.json'), 'utf8'))).length > 0
      ? JSON.parse(await (await import('node:fs/promises')).readFile(resolve(packageRoot, 'node_modules/typescript/package.json'), 'utf8')).version : null,
    apiEntry: 'typescript/unstable/sync (the same entry the toolkit\'s catalog.ts already uses to resolve exports)',
    limits,
    cases,
    isolationCheck, aliasCheck, unicodeRoundTrip,
    gaps: [
      'No byte-safe UTF-8 truncation helper exists in subs/ today; this probe\'s truncateUtf8Bytes is net-new and would need a production home (likely analysis/typescript).',
      'No code today builds or prints a synthetic signature/type node, or dispatches by declaration kind for signature shaping; every describe() branch above is net-new for iteration 4.',
      'Body-free CLASS rendering is not solved: printing the real ClassDeclaration node includes every method/constructor body. A synthetic reconstruction (e.g. printing member signatures individually, no factory API confirmed yet) is needed.',
      'Printing the real VariableDeclaration node includes its initializer; this probe\'s typeToTypeNode-based reconstruction is one workable alternative, not the only one.',
      'compiler-failure could not be independently forced in this probe (it requires a genuine checker-internal fault); isolation is instead demonstrated via the missing-export and unsupported-declaration cases in the same batch, which is the same isolation contract.',
    ],
  });
} finally {
  if (snapshot && !snapshot.isDisposed()) snapshot.dispose();
  api.close();
}
