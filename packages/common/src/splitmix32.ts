// https://github.com/bryc/code/blob/fdd2d21471febe58c7879707c0f43a65e1dd8248/jshash/PRNGs.md
// Constants from https://github.com/skeeto/hash-prospector/issues/19#issuecomment-1120105785

// Code is pulled apart a bit so we can avoid the closure whenever we want.

export function splitmix32AdvanceState(state: number): number {
    return ((state | 0) + 0x9e3779b9) | 0;
}

export function splitmix32ProduceValue(state: number): number {
    let x: number = state ^ state >>> 16;
    x = Math.imul(x, 0x21f0aaad);
    x = x ^ x >>> 15;
    x = Math.imul(x, 0x735a2d97);
    x = x ^ x >>> 15;
    return x >>> 0;
}

export function splitmix32ValueToF64(value: number): number {
    return value / 4294967296.0;
}

export function splitmix32(seed: number): (() => number) {
    let state: number = seed;
    return function (): number {
        state = splitmix32AdvanceState(state);
        return splitmix32ValueToF64(splitmix32ProduceValue(state));
    };
}
