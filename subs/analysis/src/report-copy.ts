interface CopiedValue { readonly id: number; readonly value: unknown }

/** Detach one report while sharing its equal, immutable plain-data subtrees.
 * Tables are invocation-local; retaining a report retains no inputs or tables. */
export function copyReport<T>(input: T): T {
  const canonical = new Map<string, CopiedValue>();
  const copied = new WeakMap<object, CopiedValue>();
  const active = new Set<object>();
  const shapes = new Map<string, string>();

  function objectCopy(children: readonly (readonly [string, CopiedValue])[]): unknown {
    const keys = children.map(([key]) => key);
    const shape = JSON.stringify(keys);
    let template = shapes.get(shape);
    if (template === undefined) {
      template = `{${keys.map(key => `${JSON.stringify(key)}:null`).join(',')}}`;
      shapes.set(shape, template);
    }
    // JSON.parse allocates the complete shape up front, avoiding spare slots and
    // property storage from incrementally grown objects in retained reports.
    // Every key already exists as an own data property, including __proto__.
    const result = JSON.parse(template) as Record<string, unknown>;
    for (const [key, child] of children) result[key] = child.value;
    return Object.freeze(result);
  }

  function intern(key: string, make: () => unknown): CopiedValue {
    const previous = canonical.get(key);
    if (previous) return previous;
    const result = { id: canonical.size, value: make() };
    canonical.set(key, result);
    return result;
  }

  function visit(value: unknown): CopiedValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean'
      || typeof value === 'number' && Number.isFinite(value)) {
      // JSON normalizes negative zero. Primitive type tags keep every key distinct.
      const normalized = typeof value === 'number' && value === 0 ? 0 : value;
      return intern(JSON.stringify([typeof value, normalized]), () => normalized);
    }
    if (typeof value !== 'object') throw new TypeError('Report data requires finite JSON values');
    if (active.has(value)) throw new TypeError('Report data must be acyclic');
    const previous = copied.get(value);
    if (previous) return previous;
    if (active.size >= 1024) throw new TypeError('Report data exceeds its nesting limit');
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Report data must have plain object or array prototypes');
    }
    const properties = new Map<string, PropertyDescriptor>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new TypeError('Report data cannot contain symbol properties');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor)) throw new TypeError('Report data cannot contain accessors');
      if (!descriptor.enumerable && !(array && key === 'length')) {
        throw new TypeError('Report data cannot contain hidden properties');
      }
      if (array && key !== 'length' && (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
        throw new TypeError('Report arrays cannot contain non-index properties');
      }
      properties.set(key, descriptor);
    }
    active.add(value);
    let result: CopiedValue;
    try {
      if (array) {
        const children = Array.from({ length: value.length }, (_, index) => {
          const child = properties.get(String(index))?.value;
          return visit(child === undefined ? null : child);
        });
        result = intern(JSON.stringify(['array', children.map(child => child.id)]),
          () => Object.freeze(children.map(child => child.value)));
      } else {
        const children = [...properties].filter(([, property]) => property.value !== undefined)
          .map(([key, property]) => [key, visit(property.value)] as const);
        // Retain property order as part of equality so serialization is unchanged.
        result = intern(JSON.stringify(['object', children.map(([key, child]) => [key, child.id])]),
          () => objectCopy(children));
      }
    } finally { active.delete(value); }
    copied.set(value, result);
    return result;
  }

  return visit(input).value as T;
}
