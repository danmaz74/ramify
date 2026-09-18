import { SignatureKind, SymbolFlags, TypeFlags, type Project, type Symbol as CompilerSymbol, type Type,
  type UnionOrIntersectionType } from 'typescript/unstable/sync';

const behaviorSymbols = SymbolFlags.Function | SymbolFlags.Method | SymbolFlags.Class | SymbolFlags.Constructor;
const emptyConstituents = TypeFlags.Nullable | TypeFlags.Void | TypeFlags.Never;

/**
 * The behavior shape of a value's type, by precedence: a construct signature,
 * else a call signature, else a declared first-level callable or constructable
 * member. `data` has none of them; `unknown` could not be decided.
 */
export type BehaviorShape = 'constructable' | 'callable' | 'member' | 'data' | 'unknown';
/** The consumer classifier's capability: the three behavior shapes are one `capable`. */
export type BehaviorCapability = 'capable' | 'data' | 'unknown';
const behaviors: readonly BehaviorShape[] = ['constructable', 'callable', 'member'];

/** The capability of a shape; the three behaviors map to `capable`. */
export function collapse(shape: BehaviorShape): BehaviorCapability {
  return shape === 'data' || shape === 'unknown' ? shape : 'capable';
}

/**
 * The one behavior-shape rule shared by the consumer classifier and the export
 * shapes: whether a value's type, or a declared first-level member, is callable
 * or constructable. Members declared only by a default or external library
 * (array, string or promise methods) do not count. Results are cached per type
 * for the lifetime of one instance, over one compiler snapshot. The rule lives
 * apart from the classifier, so a retained session that classifies export
 * shapes never loads the classifier module.
 */
export class BehaviorShapes {
  readonly #types = new Map<number, BehaviorShape>();
  constructor(private readonly project: Project) {}

  /** The consumer classifier's capability of a type. */
  of(type: Type): BehaviorCapability { return collapse(this.shape(type)); }

  shape(type: Type, depth = 0): BehaviorShape {
    const cached = this.#types.get(type.id);
    if (cached) return cached;
    let result: BehaviorShape;
    if (depth > 8 || type.flags & TypeFlags.AnyOrUnknown) result = 'unknown';
    else if (type.flags & TypeFlags.UnionOrIntersection) {
      // Every part is classified before the precedence applies, so the cache
      // holds the same entries whichever part decides.
      const parts = (type as UnionOrIntersectionType).getTypes().filter(part => !(part.flags & emptyConstituents))
        .map(part => this.shape(part, depth + 1));
      result = behaviors.find(behavior => parts.includes(behavior)) ?? (parts.includes('unknown') ? 'unknown' : 'data');
    } else if (type.flags & TypeFlags.InstantiableNonPrimitive) {
      const constraint = this.project.checker.getBaseConstraintOfType(type);
      result = constraint && constraint.id !== type.id ? this.shape(constraint, depth + 1) : 'unknown';
    } else if (type.flags & TypeFlags.Object) result = this.#structured(type);
    else result = 'data';
    this.#types.set(type.id, result);
    return result;
  }

  #signatures(type: Type): boolean {
    const { checker } = this.project;
    return checker.getSignaturesOfType(type, SignatureKind.Call).length > 0
      || checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0;
  }

  #structured(type: Type): BehaviorShape {
    const { checker, program } = this.project;
    if (checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0) return 'constructable';
    if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0) return 'callable';
    const declared = (symbol: CompilerSymbol): boolean => symbol.declarations.some(handle => {
      const metadata = program.getSourceFileMetadataByPath(handle.path);
      return !!metadata && !metadata.isDefaultLibrary && !metadata.isFromExternalLibrary;
    });
    const members = checker.getPropertiesOfType(type).filter(declared);
    if (members.some(member => member.flags & behaviorSymbols)) return 'member';
    if (!members.length) return 'data';
    // A member's own signatures count; its members do not.
    for (const member of checker.getTypeOfSymbol(members)) {
      if (!member) continue;
      const parts = member.flags & TypeFlags.Union
        ? (member as UnionOrIntersectionType).getTypes().filter(part => !(part.flags & emptyConstituents)) : [member];
      if (parts.some(part => part.flags & TypeFlags.Object && this.#signatures(part))) return 'member';
    }
    return 'data';
  }
}
