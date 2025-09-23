// @TODO:
// - Check that the generated IDs are 32-bit (or 53-bit).
// - Use a sparse bitset to save memory.
// - Check for uniqueness when deallocating, at least in development builds.
// - Bulk (de)allocation?

export interface Type {
    current: number;
    unused: number[];
}

export function make(): Type {
    return {
        // We start at 1 here because 0 is used as a sentinel key in our custom
        // hash maps, indicating empty buckets.
        current: 1,
        unused: [],
    };
}

export function allocate(generator: Type): number {
    if (generator.unused.length > 0) {
        return generator.unused.pop()!;
    } else {
        return generator.current++;
    }
}

export function deallocate(generator: Type, id: number): void {
    generator.unused.push(id);
}
