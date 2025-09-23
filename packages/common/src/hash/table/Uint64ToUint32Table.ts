// import { fnv1a64le as hash64 } from "../fnv1a.js";
import { fxhash64le as hash64 } from "../fxhash.js";
import { nextHighestPowerOfTwo } from "../../math.js";

// Alternative to `Map`.
//
// Characteristics:
// - [Open addressing](https://en.wikipedia.org/wiki/Open_addressing)
// - [Linear probing](https://en.wikipedia.org/wiki/Linear_probing)
// - Backshift deletion (instead of tombstones)
// - 0 as a sentinel key to indicate empty buckets (makes initialization faster)
//   - There's no validation to ensure you don't use 0 as a key!
// - Size of the backing storage is always a power of two (& is faster than %)
// - No shrinking after deletions
// - [fxhash](https://nnethercote.github.io/2021/12/08/a-brutally-effective-hash-function-in-rust.html)
//   as the hash function (HashDoS doesn't matter here)
//
// The benefit here is mostly in having a hash table that works with 64-bit
// integers (split into two 32-bit parts), as `Map` requires either `BigInt`s,
// strings, or nested `Map`s, which all need extra allocations. `Map` is faster
// than this when using 64-bit floats (at least on Firefox here), but then you
// don't get the entire range of possible bit patterns.

// Using a const enum for these constants so they can be force-inlined.
const enum C {
    /**
     * This cannot be 1 (the probing loops will run forever if so).
     * And it probably should be above or equal to 0.5, at least.
     */
    MAXIMUM_LOAD_FACTOR = 0.5,

    /** Upper 32-bits of the key that will be used to indicate an empty bucket. */
    EMPTY_SENTINEL_HI = 0,

    /** Lower 32-bits of the key that will be used to indicate an empty bucket. */
    EMPTY_SENTINEL_LO = 0,
}

export interface Type {
    /** Number of key-value pairs present in the table. */
    size: number;

    /** Number of buckets that can be used. */
    capacity: number;

    /** Key-value pairs, stored one after another. */
    buckets: Uint32Array;
}

export function make(initialCapacity: number): Type {
    const size: number = 0;
    const capacity: number = nextHighestPowerOfTwo(initialCapacity);
    const buckets: Uint32Array = new Uint32Array(capacity * 3);
    if (C.EMPTY_SENTINEL_LO !== 0 || C.EMPTY_SENTINEL_HI !== 0) {
        if (C.EMPTY_SENTINEL_LO === C.EMPTY_SENTINEL_HI) {
            buckets.fill(C.EMPTY_SENTINEL_LO);
        } else {
            for (let index: number = 0; index < capacity; index++) {
                buckets[index * 3] = C.EMPTY_SENTINEL_LO;
                buckets[index * 3 + 1] = C.EMPTY_SENTINEL_HI;
            }
        }
    }
    return {
        size: size,
        capacity: capacity,
        buckets: buckets,
    };
}

export function has(table: Type, keyLo: number, keyHi: number): boolean {
    return getIndexFromKey(table, keyLo, keyHi) !== -1;
}

export function get(table: Type, keyLo: number, keyHi: number): number | undefined {
    const index: number = getIndexFromKey(table, keyLo, keyHi);
    return index === -1 ? undefined : getValueFromIndex(table, index);
}

export function set(table: Type, keyLo: number, keyHi: number, value: number): void {
    // Avoiding the load factor division here, we have:
    //     if (table.size > table.capacity * C.MAXIMUM_LOAD_FACTOR) expand(table);
    // but since the maximum load factor is 0.5, we can do even better:
    if (table.size > (table.capacity >> 1)) expand(table);
    const capacity: number = table.capacity;
    const mask: number = capacity - 1;
    const buckets: Uint32Array = table.buckets;
    let found: boolean = false;
    let newIndex: number = hash64(keyLo, keyHi) & mask;
    let existingKeyLo: number = buckets[newIndex * 3];
    let existingKeyHi: number = buckets[newIndex * 3 + 1];
    while (existingKeyLo !== C.EMPTY_SENTINEL_LO || existingKeyHi !== C.EMPTY_SENTINEL_HI) {
        if (existingKeyLo === keyLo && existingKeyHi === keyHi) {
            buckets[newIndex * 3 + 2] = value;
            found = true;
            break;
        }
        newIndex = (newIndex + 1) & mask;
        existingKeyLo = buckets[newIndex * 3];
        existingKeyHi = buckets[newIndex * 3 + 1];
    }
    if (found === false) {
        buckets[newIndex * 3] = keyLo;
        buckets[newIndex * 3 + 1] = keyHi;
        buckets[newIndex * 3 + 2] = value;
        table.size++;
    }
}

// This can't be called `delete` (like in `Map`) if it's a free function.
export function remove(table: Type, keyLo: number, keyHi: number): boolean {
    // This is derived from https://github.com/rigtorp/HashMap
    const buckets: Uint32Array = table.buckets;
    const capacity: number = table.capacity;
    const mask: number = capacity - 1;
    let index: number = -1;
    let newIndex: number = hash64(keyLo, keyHi) & mask;
    let existingKeyLo: number = buckets[newIndex * 3];
    let existingKeyHi: number = buckets[newIndex * 3 + 1];
    while (existingKeyLo !== C.EMPTY_SENTINEL_LO || existingKeyHi !== C.EMPTY_SENTINEL_HI) {
        if (existingKeyLo === keyLo && existingKeyHi === keyHi) {
            index = newIndex;
            break;
        }
        newIndex = (newIndex + 1) & mask;
        existingKeyLo = buckets[newIndex * 3];
        existingKeyHi = buckets[newIndex * 3 + 1];
    }
    if (index !== -1) {
        let bucket: number = index;
        let newIndex: number = (bucket + 1) & mask;
        let existingKeyLo: number = buckets[newIndex * 3];
        let existingKeyHi: number = buckets[newIndex * 3 + 1];
        while (true) {
            if (existingKeyLo === C.EMPTY_SENTINEL_LO && existingKeyHi === C.EMPTY_SENTINEL_HI) {
                buckets[bucket * 3] = C.EMPTY_SENTINEL_LO;
                buckets[bucket * 3 + 1] = C.EMPTY_SENTINEL_HI;
                table.size--;
                return true;
            }
            const ideal: number = hash64(existingKeyLo, existingKeyHi) & mask;
            const bucketDiff: number = (capacity + (bucket - ideal)) & mask;
            const newIndexDiff: number = (capacity + (newIndex - ideal)) & mask;
            if (bucketDiff < newIndexDiff) {
                buckets[bucket * 3] = buckets[newIndex * 3];
                buckets[bucket * 3 + 1] = buckets[newIndex * 3 + 1];
                buckets[bucket * 3 + 2] = buckets[newIndex * 3 + 2];
                bucket = newIndex;
            }
            newIndex = (newIndex + 1) & mask;
            existingKeyLo = buckets[newIndex * 3];
            existingKeyHi = buckets[newIndex * 3 + 1];
        }
    }
    return false;
}

export function clear(table: Type): void {
    const buckets: Uint32Array = table.buckets;
    if (C.EMPTY_SENTINEL_LO === C.EMPTY_SENTINEL_HI) {
        buckets.fill(C.EMPTY_SENTINEL_LO);
    } else {
        const capacity: number = table.capacity;
        for (let index: number = 0; index < capacity; index++) {
            buckets[index * 3] = C.EMPTY_SENTINEL_LO;
            buckets[index * 3 + 1] = C.EMPTY_SENTINEL_HI;
        }
    }
    table.size = 0;
}

export function getIndexFromKey(table: Type, keyLo: number, keyHi: number): number {
    const buckets: Uint32Array = table.buckets;
    const mask: number = table.capacity - 1;
    let newIndex: number = hash64(keyLo, keyHi) & mask;
    let existingKeyLo: number = buckets[newIndex * 3];
    let existingKeyHi: number = buckets[newIndex * 3 + 1];
    if (existingKeyLo === keyLo && existingKeyHi === keyHi) return newIndex;
    while (existingKeyLo !== C.EMPTY_SENTINEL_LO || existingKeyHi !== C.EMPTY_SENTINEL_HI) {
        newIndex = (newIndex + 1) & mask;
        existingKeyLo = buckets[newIndex * 3];
        existingKeyHi = buckets[newIndex * 3 + 1];
        if (existingKeyLo === keyLo && existingKeyHi === keyHi) return newIndex;
    }
    return -1;
}

export function getValueFromIndex(table: Type, index: number): number {
    return table.buckets[index * 3 + 2];
}

function expand(table: Type): void {
    const oldCapacity: number = table.capacity;
    const newCapacity: number = oldCapacity * 2;
    const newMask: number = newCapacity - 1;
    const oldBuckets: Uint32Array = table.buckets;
    const newBuckets: Uint32Array = new Uint32Array(newCapacity * 3);
    if (C.EMPTY_SENTINEL_LO !== 0 || C.EMPTY_SENTINEL_HI !== 0) {
        if (C.EMPTY_SENTINEL_LO === C.EMPTY_SENTINEL_HI) {
            newBuckets.fill(C.EMPTY_SENTINEL_LO);
        } else {
            for (let index: number = 0; index < newCapacity; index++) {
                newBuckets[index * 3] = C.EMPTY_SENTINEL_LO;
                newBuckets[index * 3 + 1] = C.EMPTY_SENTINEL_HI;
            }
        }
    }
    for (let oldIndex: number = 0; oldIndex < oldCapacity; oldIndex++) {
        const keyLo: number = oldBuckets[oldIndex * 3];
        const keyHi: number = oldBuckets[oldIndex * 3 + 1];
        const value: number = oldBuckets[oldIndex * 3 + 2];
        if (keyLo !== C.EMPTY_SENTINEL_LO || keyHi !== C.EMPTY_SENTINEL_HI) {
            let found: boolean = false;
            let newIndex: number = hash64(keyLo, keyHi) & newMask;
            let existingKeyLo: number = newBuckets[newIndex * 3];
            let existingKeyHi: number = newBuckets[newIndex * 3 + 1];
            while (existingKeyLo !== C.EMPTY_SENTINEL_LO || existingKeyHi !== C.EMPTY_SENTINEL_HI) {
                if (existingKeyLo === keyLo && existingKeyHi === keyHi) {
                    newBuckets[newIndex * 3 + 2] = value;
                    found = true;
                    break;
                }
                newIndex = (newIndex + 1) & newMask;
                existingKeyLo = newBuckets[newIndex * 3];
                existingKeyHi = newBuckets[newIndex * 3 + 1];
            }
            if (found === false) {
                newBuckets[newIndex * 3] = keyLo;
                newBuckets[newIndex * 3 + 1] = keyHi;
                newBuckets[newIndex * 3 + 2] = value;
            }
        }
    }
    table.buckets = newBuckets;
    table.capacity = newCapacity;
}

// `Map`-like functions that you probably shouldn't use:

export function forEach(
    table: Type,
    callbackFn: (value: number, keyLo: number, keyHi: number, map: Type) => void,
): void {
    const capacity: number = table.capacity;
    const buckets: Uint32Array = table.buckets;
    for (let index: number = 0; index < capacity; index++) {
        const keyLo: number = buckets[index * 3];
        const keyHi: number = buckets[index * 3 + 1];
        if (keyLo !== C.EMPTY_SENTINEL_LO || keyHi !== C.EMPTY_SENTINEL_HI) {
            const value: number = buckets[index * 3 + 2];
            callbackFn(value, keyLo, keyHi, table);
        }
    }
}

/** The array is in the format `[[keyLowBits, keyHighBits], ...]` */
export function keys(table: Type): [number, number][] {
    const result: [number, number][] = [];
    forEach(table, (_val, keyLo, keyHi, _map) => { result.push([keyLo, keyHi]); });
    return result;
}

export function values(table: Type): number[] {
    const result: number[] = [];
    forEach(table, (val, _keyLo, _keyHi, _map) => { result.push(val); });
    return result;
}

/** The array is in the format `[[[keyLowBits, keyHighBits], value], ...]` */
export function entries(table: Type): [[number, number], number][] {
    const result: [[number, number], number][] = [];
    forEach(table, (val, keyLo, keyHi, _map) => { result.push([[keyLo, keyHi], val]); });
    return result;
}
