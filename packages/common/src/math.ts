// Ideally these should be inlined wherever they're used, if small.

export function clamp(x: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, x));
}

export function lerp(t: number, a: number, b: number): number {
    return a + (b - a) * t;
}

export function unlerp(x: number, a: number, b: number): number {
    return (x - a) / (b - a);
}

export function remap(x: number, a: number, b: number, c: number, d: number): number {
    return c + (d - c) * ((x - a) / (b - a));
}

export function quantize(a: number, b: number): number {
    return Math.floor(a / b) * b;
}

export function smoothstep(x: number): number {
    // https://en.wikipedia.org/wiki/Smoothstep
    return x * x * (3.0 - 2.0 * x);
}

export function isPowerOfTwo(x: number): boolean {
    // https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
    return x > 0 && (x & (x - 1)) === 0;
}

export function nextHighestPowerOfTwo(x: number): number {
    // Borrowed from https://github.com/johnnesky/beepbox/blob/4b10adb789e6917cc3db747bd6cf472331ec3c22/synth/synth.ts#L7734-L7736
    // Equivalent to https://graphics.stanford.edu/~seander/bithacks.html#RoundUpPowerOf2
    // with the tweak for x=0 added. This will also round up floats.
    return (1 << (32 - Math.clz32(Math.ceil(x) - 1))) >>> 0;
}

export function rotateLeft32(x: number, n: number): number {
    // https://en.wikipedia.org/wiki/Circular_shift#Implementing_circular_shifts
    return ((x << n) | (x >>> (32 - n))) >>> 0;
}

export function rotateRight32(x: number, n: number): number {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/**
 * This assumes that `a <= b`.
 *
 * Note that if `x` is equal to `a` or `b`, it counts as being inside the
 * range.
 */
export function insideRange(x: number, a: number, b: number): boolean {
    return x >= a && x <= b;
}

/**
 * This assumes that `a <= b` and `c <= d`.
 *
 * Note that cases where ranges "touch" (like `a=2, b=3, c=4, d=5`)
 * don't count as overlapping.
 */
export function rangesOverlap(a: number, b: number, c: number, d: number): boolean {
    return a <= d && b >= c;
}

/** This assumes x is in the range `[0, 255]`. */
export function u8ToI8(x: number): number {
    return (x << 24) >> 24;
}

export function u8(x: number): number {
    return (x >>> 0) & 0xFF;
}

export function u16(x: number): number {
    return (x >>> 0) & 0xFFFF;
}

export function u32(x: number): number {
    return x >>> 0;
}

export function leastSignificantPowerOf(x: number): number {
    return u32(x & -x);
}

export function mostSignificantPowerOf(x: number): number {
    x |= x >>> 1;
    x |= x >>> 2;
    x |= x >>> 4;
    x |= x >>> 8;
    x |= x >>> 16;
    return u32((x >>> 1) + (x & 1));
}

// @TODO: Find fast approximations for these.
export function linearToDecibels(x: number): number {
    // `x` should really be a ratio, but we just assume the reference amplitude is 1 here.
    return Math.log(x) * 8.685889638065035 /* 20 / Math.log(10) */;
    // return 20.0 * Math.log10(x);
}

export function decibelsToLinear(x: number): number {
    return Math.exp(x * 0.11512925464970229 /* Math.log(10) / 20 */);
    // return Math.pow(10.0, x / 20.0);
}
