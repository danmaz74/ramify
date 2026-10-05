import assert from 'node:assert/strict';

export interface SyntheticOwnerOptions {
  /**
   * Plan 8's exposing variant. Every non-root owner exposes its
   * `interfaces/api.ts` by wildcard and its nine `run<N>` functions by name to
   * parent. Each `run<N>` signature names both api.ts types and the `Input` of
   * the preceding owner, and the root, the grouping level, re-exposes each tenth
   * owner's whole contract and every named `Input` to descendants under
   * owner-suffixed aliases. Each named companion is then visible wherever its
   * symbol is, and the project passes the signature-companion rule with
   * complete coverage. Omitted or false leaves the exposure-free bytes unchanged.
   */
  readonly exposures?: boolean;
}

/** Deterministic workload bytes only; this does not implement a checker. */
export function syntheticOwnerFiles(ownerCount: number, options: SyntheticOwnerOptions = {}): ReadonlyMap<string, string> {
  assert.ok(Number.isSafeInteger(ownerCount) && ownerCount >= 1 && ownerCount <= 1000, 'Owner count must be an integer from 1 to 1000');
  const exposing = options.exposures === true;
  const files = new Map<string, string>();
  const padded = (source: string, bytes: number) => {
    assert.ok(Buffer.byteLength(source) + 5 <= bytes);
    return `${source}/*${' '.repeat(bytes - Buffer.byteLength(source) - 5)}*/\n`;
  };
  const nameOf = (index: number) => index === 0 ? 'bench' : `m${String(index).padStart(3, '0')}`;
  const testingOwner = (index: number) => index !== 0 && index % 10 === 0;
  // The preceding owner whose `Input` a signature may name. The root is tagged
  // `dispatch` and a tenth owner `testing`; an untagged owner may import
  // neither, so the nearest preceding untagged owner stands in.
  const preceding = (index: number): number | null => {
    for (let candidate = index - 1; candidate >= 1; candidate--) {
      if (!testingOwner(candidate)) return candidate;
    }
    return null;
  };
  const named = new Set<number>();
  if (exposing) for (let index = 1; index < ownerCount; index++) {
    const previous = preceding(index);
    if (previous !== null) named.add(previous);
  }
  const packageName = exposing ? `ramify-${ownerCount}-exposing-owners`
    : ownerCount === 100 ? 'ramify-hundred-owners' : `ramify-${ownerCount}-owners`;
  files.set('package.json', `${JSON.stringify({ name: packageName, private: true, type: 'module' })}\n`);
  files.set('tsconfig.json', `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, noEmit: true, skipLibCheck: true, types: [],
    },
    include: ['src', 'subs/**/src'],
  }, null, 2)}\n`);
  for (let index = 0; index < ownerCount; index++) {
    const name = nameOf(index);
    const prefix = index === 0 ? '' : `subs/${name}/`;
    const tags = index === 0 ? 'dispatch' : testingOwner(index) ? 'testing' : '';
    let description = `ramify 1\n${index === 0 ? 'root ' : ''}module "${name}" tagged [${tags}]\n`;
    if (exposing && index === 0) {
      // Exposed names must be unique in the root, so each re-exposure is aliased
      // with its owner's name; visibility follows the original, not the name.
      for (let child = 1; child < ownerCount; child++) {
        const suffix = nameOf(child).toUpperCase();
        if (testingOwner(child)) {
          const contract = ['Input', 'Output', 'value', ...Array.from({ length: 9 }, (_, file) => `run${file}`)];
          description += `expose-sub ${contract.map(binding => `${binding} as ${binding}${suffix}`).join(', ')} from ${nameOf(child)} to descendants\n`;
        }
        if (named.has(child)) description += `expose-sub Input as Input${suffix} from ${nameOf(child)} to descendants\n`;
      }
    } else if (exposing) {
      description += 'expose-src * from "interfaces/api.ts" to parent\n';
      for (let file = 0; file < 9; file++) description += `expose-src run${file} from "impl${file}.ts" to parent\n`;
    }
    files.set(`${prefix}module.ramify`, description);
    files.set(`${prefix}README.md`, `# ${name}\n\nSupplies deterministic workload bytes for the ${exposing ? `${ownerCount}-owner exposing resident`
      : ownerCount === 100 ? 'hundred-owner batch' : `${ownerCount}-owner resident`} measurement.\n`);
    files.set(`${prefix}src/interfaces/api.ts`, padded(exposing
      ? 'export interface Input { readonly value: number }\nexport type Output = number;\nexport const value: number = 1;\n'
      : 'export interface Input { readonly value: number }\nexport const value = 1;\n', 1024,
    ));
    const previous = exposing && index !== 0 ? preceding(index) : null;
    for (let file = 0; file < 9; file++) {
      files.set(`${prefix}src/impl${file}.ts`, padded(!exposing
        ? `import { value, type Input } from './interfaces/api.js';\nexport function run${file}(input: Input): number { return input.value + value; }\n`
        : previous === null
          ? `import { value, type Input, type Output } from './interfaces/api.js';\nexport function run${file}(input: Input): Output { return input.value + value; }\n`
          : `import { value, type Input, type Output } from './interfaces/api.js';\nimport type { Input as PreviousInput } from '../../${nameOf(previous)}/src/interfaces/api.js';\n`
            + `export function run${file}(input: Input, previous: PreviousInput): Output { return input.value + previous.value + value; }\n`, 1024,
      ));
    }
    files.set(`${prefix}src/tests/impl.test.ts`, padded(previous === null
      ? "import { run0 } from '../impl0.js';\nif (run0({ value: 1 }) !== 2) throw new Error('unexpected result');\n"
      : "import { run0 } from '../impl0.js';\nif (run0({ value: 1 }, { value: 1 }) !== 3) throw new Error('unexpected result');\n", 1024,
    ));
    files.set(`${prefix}src/style.css`, padded('.fixture { color: black; }\n', 256));
  }
  return files;
}
