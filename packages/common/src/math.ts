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
    // https://graphics.stanford.edu/~seander/bithacks.html#RoundUpPowerOf2
    x--;
    x |= x >> 1;
    x |= x >> 2;
    x |= x >> 4;
    x |= x >> 8;
    x |= x >> 16;
    x++;
    return x;
}

export function rotateLeft32(x: number, n: number): number {
    // https://en.wikipedia.org/wiki/Circular_shift#Implementing_circular_shifts
    return ((x << n) | (x >>> (32 - n))) >>> 0;
}

export function rotateRight32(x: number, n: number): number {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
}
