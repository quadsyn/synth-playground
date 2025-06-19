// https://github.com/rust-lang/rustc-hash/tree/e155548d4bc95fb98e214506d79a87a7bacdb025
// (commits after that one are using something rather different)

// This is a bit faster than FNV-1a since it's not operating one-byte-at-a-time.
// May be worse when it comes to collisions though, but then, FNV-1a isn't great
// for that either.
//
// For more info: https://nnethercote.github.io/2021/12/08/a-brutally-effective-hash-function-in-rust.html

// Using a const enum for these constants so they can be force-inlined.
const enum C {
    SEED32 = 0x9e3779b9,
}

export function fxhash(data: Uint32Array): number {
    let hash: number = 0;
    const length: number = data.length;
    for (let index: number = 0; index < length; index++) {
        // hash = fxhashStep(hash, data[index]);
        hash = Math.imul(((hash << 5) | (hash >>> 27)) ^ data[index], C.SEED32);
    }
    return hash >>> 0;
}

export function fxhashStep(hash: number, value: number): number {
    // return Math.imul(rotateLeft32(hash, 5) ^ value, C.SEED32);
    return Math.imul(((hash << 5) | (hash >>> 27)) ^ value, C.SEED32);
}

export function fxhash32le(data: number): number {
    // return fxhashStep(0, data);
    return Math.imul(data, C.SEED32) >>> 0;
}

export function fxhash64le(lo: number, hi: number): number {
    // This really should actually run the 64-bit version of fxhash but we don't
    // really have an Math.imul equivalent for 64-bit integers, so...
    // return fxhashStep(fxhashStep(0, lo), hi);
    let hash: number = Math.imul(lo, C.SEED32);
    return Math.imul(((hash << 5) | (hash >>> 27)) ^ hi, C.SEED32) >>> 0;
}
