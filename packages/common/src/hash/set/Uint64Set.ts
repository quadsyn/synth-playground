// import { fnv1a64le as hash64 } from "../fnv1a.js";
import { fxhash64le as hash64 } from "../fxhash.js";
import { nextHighestPowerOfTwo } from "../../math.js";

// Alternative to `Set`.
//
// Based on `../table/Uint64ToUint32Table.ts`.

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
    /** Number of keys present in the set. */
    size: number;

    /** Number of buckets that can be used. */
    capacity: number;

    /** Keys, stored one after another. */
    buckets: Uint32Array;
}

export function make(initialCapacity: number): Type {
    const size: number = 0;
    const capacity: number = nextHighestPowerOfTwo(initialCapacity);
    const buckets: Uint32Array = new Uint32Array(capacity * 2);
    if (C.EMPTY_SENTINEL_LO !== 0 || C.EMPTY_SENTINEL_HI !== 0) {
        if (C.EMPTY_SENTINEL_LO === C.EMPTY_SENTINEL_HI) {
            buckets.fill(C.EMPTY_SENTINEL_LO);
        } else {
            for (let index: number = 0; index < capacity; index++) {
                buckets[index * 2] = C.EMPTY_SENTINEL_LO;
                buckets[index * 2 + 1] = C.EMPTY_SENTINEL_HI;
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

export function add(table: Type, keyLo: number, keyHi: number): void {
    const loadFactor: number = table.size / table.capacity;
    if (loadFactor > C.MAXIMUM_LOAD_FACTOR) expand(table);
    const capacity: number = table.capacity;
    const mask: number = capacity - 1;
    const buckets: Uint32Array = table.buckets;
    let found: boolean = false;
    let newIndex: number = hash64(keyLo, keyHi) & mask;
    let existingKeyLo: number = buckets[newIndex * 2];
    let existingKeyHi: number = buckets[newIndex * 2 + 1];
    while (existingKeyLo !== C.EMPTY_SENTINEL_LO || existingKeyHi !== C.EMPTY_SENTINEL_HI) {
        if (existingKeyLo === keyLo && existingKeyHi === keyHi) {
            found = true;
            break;
        }
        newIndex = (newIndex + 1) & mask;
        existingKeyLo = buckets[newIndex * 2];
        existingKeyHi = buckets[newIndex * 2 + 1];
    }
    if (found === false) {
        buckets[newIndex * 2] = keyLo;
        buckets[newIndex * 2 + 1] = keyHi;
        table.size++;
    }
}

// This can't be called `delete` (like in `Set`) if it's a free function.
export function remove(table: Type, keyLo: number, keyHi: number): boolean {
    // This is derived from https://github.com/rigtorp/HashMap
    const buckets: Uint32Array = table.buckets;
    const capacity: number = table.capacity;
    const mask: number = capacity - 1;
    let index: number = -1;
    let newIndex: number = hash64(keyLo, keyHi) & mask;
    let existingKeyLo: number = buckets[newIndex * 2];
    let existingKeyHi: number = buckets[newIndex * 2 + 1];
    while (existingKeyLo !== C.EMPTY_SENTINEL_LO || existingKeyHi !== C.EMPTY_SENTINEL_HI) {
        if (existingKeyLo === keyLo && existingKeyHi === keyHi) {
            index = newIndex;
            break;
        }
        newIndex = (newIndex + 1) & mask;
        existingKeyLo = buckets[newIndex * 2];
        existingKeyHi = buckets[newIndex * 2 + 1];
    }
    if (index !== -1) {
        let bucket: number = index;
        let newIndex: number = (bucket + 1) & mask;
        let existingKeyLo: number = buckets[newIndex * 2];
        let existingKeyHi: number = buckets[newIndex * 2 + 1];
        while (true) {
            if (existingKeyLo === C.EMPTY_SENTINEL_LO && existingKeyHi === C.EMPTY_SENTINEL_HI) {
                buckets[bucket * 2] = C.EMPTY_SENTINEL_LO;
                buckets[bucket * 2 + 1] = C.EMPTY_SENTINEL_HI;
                table.size--;
                return true;
            }
            const ideal: number = hash64(existingKeyLo, existingKeyHi) & mask;
            const bucketDiff: number = (capacity + (bucket - ideal)) & mask;
            const newIndexDiff: number = (capacity + (newIndex - ideal)) & mask;
            if (bucketDiff < newIndexDiff) {
                buckets[bucket * 2] = buckets[newIndex * 2];
                buckets[bucket * 2 + 1] = buckets[newIndex * 2 + 1];
                bucket = newIndex;
            }
            newIndex = (newIndex + 1) & mask;
            existingKeyLo = buckets[newIndex * 2];
            existingKeyHi = buckets[newIndex * 2 + 1];
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
            buckets[index * 2] = C.EMPTY_SENTINEL_LO;
            buckets[index * 2 + 1] = C.EMPTY_SENTINEL_HI;
        }
    }
    table.size = 0;
}

export function getIndexFromKey(table: Type, keyLo: number, keyHi: number): number {
    const buckets: Uint32Array = table.buckets;
    const mask: number = table.capacity - 1;
    let newIndex: number = hash64(keyLo, keyHi) & mask;
    let existingKeyLo: number = buckets[newIndex * 2];
    let existingKeyHi: number = buckets[newIndex * 2 + 1];
    if (existingKeyLo === keyLo && existingKeyHi === keyHi) return newIndex;
    while (existingKeyLo !== C.EMPTY_SENTINEL_LO || existingKeyHi !== C.EMPTY_SENTINEL_HI) {
        if (existingKeyLo === keyLo && existingKeyHi === keyHi) return newIndex;
        newIndex = (newIndex + 1) & mask;
        existingKeyLo = buckets[newIndex * 2];
        existingKeyHi = buckets[newIndex * 2 + 1];
    }
    return -1;
}

function expand(table: Type): void {
    const oldCapacity: number = table.capacity;
    const newCapacity: number = oldCapacity * 2;
    const newMask: number = newCapacity - 1;
    const oldBuckets: Uint32Array = table.buckets;
    const newBuckets: Uint32Array = new Uint32Array(newCapacity * 2);
    for (let oldIndex: number = 0; oldIndex < oldCapacity; oldIndex++) {
        const keyLo: number = oldBuckets[oldIndex * 2];
        const keyHi: number = oldBuckets[oldIndex * 2 + 1];
        if (keyLo !== C.EMPTY_SENTINEL_LO || keyHi !== C.EMPTY_SENTINEL_HI) {
            let found: boolean = false;
            let newIndex: number = hash64(keyLo, keyHi) & newMask;
            let existingKeyLo: number = newBuckets[newIndex * 2];
            let existingKeyHi: number = newBuckets[newIndex * 2 + 1];
            while (existingKeyLo !== C.EMPTY_SENTINEL_LO || existingKeyHi !== C.EMPTY_SENTINEL_HI) {
                if (existingKeyLo === keyLo && existingKeyHi === keyHi) {
                    found = true;
                    break;
                }
                newIndex = (newIndex + 1) & newMask;
                existingKeyLo = newBuckets[newIndex * 2];
                existingKeyHi = newBuckets[newIndex * 2 + 1];
            }
            if (found === false) {
                newBuckets[newIndex * 2] = keyLo;
                newBuckets[newIndex * 2 + 1] = keyHi;
            }
        }
    }
    table.buckets = newBuckets;
    table.capacity = newCapacity;
}

// `Set`-like functions that you probably shouldn't use:

export function forEach(
    table: Type,
    callbackFn: (keyLo: number, keyHi: number, map: Type) => void,
): void {
    const capacity: number = table.capacity;
    const buckets: Uint32Array = table.buckets;
    for (let index: number = 0; index < capacity; index++) {
        const keyLo: number = buckets[index * 2];
        const keyHi: number = buckets[index * 2 + 1];
        if (keyLo !== C.EMPTY_SENTINEL_LO || keyHi !== C.EMPTY_SENTINEL_HI) {
            callbackFn(keyLo, keyHi, table);
        }
    }
}

/** The array is in the format `[[keyLowBits, keyHighBits], ...]` */
export function keys(table: Type): [number, number][] {
    const result: [number, number][] = [];
    forEach(table, (keyLo, keyHi, _map) => { result.push([keyLo, keyHi]); });
    return result;
}

/** The array is in the format `[[keyLowBits, keyHighBits], ...]` */
export function values(table: Type): [number, number][] {
    return keys(table);
}

/** The array is in the format `[[[keyLowBits, keyHighBits], [keyLowBits, keyHighBits]], ...]` */
export function entries(table: Type): [[number, number], [number, number]][] {
    const result: [[number, number], [number, number]][] = [];
    forEach(table, (keyLo, keyHi, _map) => {
        result.push([[keyLo, keyHi], [keyLo, keyHi]]);
    });
    return result;
}
