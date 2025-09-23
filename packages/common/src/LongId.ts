export interface Type {
    // These are arranged like so (when seen as a BigInt written in binary):
    // 0bhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhlllllllllllllllllllllllllllllllln
    // where the h bits come from hi and the l bits come from lo.
    lo: number;
    hi: number;
}

export function make(lo: number, hi: number): Type {
    return {
        lo: lo >>> 0,
        hi: hi >>> 0,
    };
}

export function increment(id: Type): void {
    const lo: number = id.lo;
    const lowBitsOverflowed: boolean = lo === 4294967295;
    id.lo = (lo + 1) >>> 0;
    if (lowBitsOverflowed) {
        id.hi = (id.hi + 1) >>> 0;
    }
}

export function toBigInt(id: Type): BigInt {
    return (BigInt(id.hi) << 32n) + BigInt(id.lo);
}

export function toString(id: Type): string {
    return toBigInt(id).toString();
}
