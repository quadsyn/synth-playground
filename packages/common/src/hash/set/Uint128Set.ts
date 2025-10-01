// import { fnv1a128le as hash128 } from "../fnv1a.js";
import { fxhash128le as hash128 } from "../fxhash.js";
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

    /** First 32-bit part of the key that will be used to indicate an empty bucket. */
    EMPTY_SENTINEL_0 = 0,

    /** Second 32-bit part of the key that will be used to indicate an empty bucket. */
    EMPTY_SENTINEL_1 = 0,

    /** Third 32-bit part of the key that will be used to indicate an empty bucket. */
    EMPTY_SENTINEL_2 = 0,

    /** Fourth 32-bit part of the key that will be used to indicate an empty bucket. */
    EMPTY_SENTINEL_3 = 0,
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
    const buckets: Uint32Array = new Uint32Array(capacity * 4);
    if (
        C.EMPTY_SENTINEL_0 !== 0
        || C.EMPTY_SENTINEL_1 !== 0
        || C.EMPTY_SENTINEL_2 !== 0
        || C.EMPTY_SENTINEL_3 !== 0
    ) {
        if (
            C.EMPTY_SENTINEL_0 === C.EMPTY_SENTINEL_1
            && C.EMPTY_SENTINEL_1 === C.EMPTY_SENTINEL_2
            && C.EMPTY_SENTINEL_2 === C.EMPTY_SENTINEL_3
        ) {
            buckets.fill(C.EMPTY_SENTINEL_0);
        } else {
            for (let index: number = 0; index < capacity; index++) {
                buckets[index * 4] = C.EMPTY_SENTINEL_0;
                buckets[index * 4 + 1] = C.EMPTY_SENTINEL_1;
                buckets[index * 4 + 2] = C.EMPTY_SENTINEL_2;
                buckets[index * 4 + 3] = C.EMPTY_SENTINEL_3;
            }
        }
    }
    return {
        size: size,
        capacity: capacity,
        buckets: buckets,
    };
}

export function has(
    table: Type,
    key0: number,
    key1: number,
    key2: number,
    key3: number,
): boolean {
    return getIndexFromKey(table, key0, key1, key2, key3) !== -1;
}

export function add(
    table: Type,
    key0: number,
    key1: number,
    key2: number,
    key3: number,
): void {
    // Avoiding the load factor division here, we have:
    //     if (table.size > table.capacity * C.MAXIMUM_LOAD_FACTOR) expand(table);
    // but since the maximum load factor is 0.5, we can do even better:
    if (table.size > (table.capacity >> 1)) expand(table);
    const capacity: number = table.capacity;
    const mask: number = capacity - 1;
    const buckets: Uint32Array = table.buckets;
    let found: boolean = false;
    let newIndex: number = hash128(key0, key1, key2, key3) & mask;
    let existingKey0: number = buckets[newIndex * 4];
    let existingKey1: number = buckets[newIndex * 4 + 1];
    let existingKey2: number = buckets[newIndex * 4 + 2];
    let existingKey3: number = buckets[newIndex * 4 + 3];
    while (!(
        existingKey0 === C.EMPTY_SENTINEL_0
        && existingKey1 === C.EMPTY_SENTINEL_1
        && existingKey2 === C.EMPTY_SENTINEL_2
        && existingKey3 === C.EMPTY_SENTINEL_3
    )) {
        if (
            existingKey0 === key0
            && existingKey1 === key1
            && existingKey2 === key2
            && existingKey3 === key3
        ) {
            found = true;
            break;
        }
        newIndex = (newIndex + 1) & mask;
        existingKey0 = buckets[newIndex * 4];
        existingKey1 = buckets[newIndex * 4 + 1];
        existingKey2 = buckets[newIndex * 4 + 2];
        existingKey3 = buckets[newIndex * 4 + 3];
    }
    if (found === false) {
        buckets[newIndex * 4] = key0;
        buckets[newIndex * 4 + 1] = key1;
        buckets[newIndex * 4 + 2] = key2;
        buckets[newIndex * 4 + 3] = key3;
        table.size++;
    }
}

// This can't be called `delete` (like in `Set`) if it's a free function.
export function remove(
    table: Type,
    key0: number,
    key1: number,
    key2: number,
    key3: number,
): boolean {
    // This is derived from https://github.com/rigtorp/HashMap
    const buckets: Uint32Array = table.buckets;
    const capacity: number = table.capacity;
    const mask: number = capacity - 1;
    let index: number = -1;
    let newIndex: number = hash128(key0, key1, key2, key3) & mask;
    let existingKey0: number = buckets[newIndex * 4];
    let existingKey1: number = buckets[newIndex * 4 + 1];
    let existingKey2: number = buckets[newIndex * 4 + 2];
    let existingKey3: number = buckets[newIndex * 4 + 3];
    while (!(
        existingKey0 === C.EMPTY_SENTINEL_0
        && existingKey1 === C.EMPTY_SENTINEL_1
        && existingKey2 === C.EMPTY_SENTINEL_2
        && existingKey3 === C.EMPTY_SENTINEL_3
    )) {
        if (
            existingKey0 === key0
            && existingKey1 === key1
            && existingKey2 === key2
            && existingKey3 === key3
        ) {
            index = newIndex;
            break;
        }
        newIndex = (newIndex + 1) & mask;
        existingKey0 = buckets[newIndex * 4];
        existingKey1 = buckets[newIndex * 4 + 1];
        existingKey2 = buckets[newIndex * 4 + 2];
        existingKey3 = buckets[newIndex * 4 + 3];
    }
    if (index !== -1) {
        let bucket: number = index;
        let newIndex: number = (bucket + 1) & mask;
        let existingKey0: number = buckets[newIndex * 4];
        let existingKey1: number = buckets[newIndex * 4 + 1];
        let existingKey2: number = buckets[newIndex * 4 + 2];
        let existingKey3: number = buckets[newIndex * 4 + 3];
        while (true) {
            if (
                existingKey0 === C.EMPTY_SENTINEL_0
                && existingKey1 === C.EMPTY_SENTINEL_1
                && existingKey2 === C.EMPTY_SENTINEL_2
                && existingKey3 === C.EMPTY_SENTINEL_3
            ) {
                buckets[bucket * 4] = C.EMPTY_SENTINEL_0;
                buckets[bucket * 4 + 1] = C.EMPTY_SENTINEL_1;
                buckets[bucket * 4 + 2] = C.EMPTY_SENTINEL_2;
                buckets[bucket * 4 + 3] = C.EMPTY_SENTINEL_3;
                table.size--;
                return true;
            }
            const ideal: number = hash128(existingKey0, existingKey1, existingKey2, existingKey3) & mask;
            const bucketDiff: number = (capacity + (bucket - ideal)) & mask;
            const newIndexDiff: number = (capacity + (newIndex - ideal)) & mask;
            if (bucketDiff < newIndexDiff) {
                buckets[bucket * 4] = buckets[newIndex * 4];
                buckets[bucket * 4 + 1] = buckets[newIndex * 4 + 1];
                buckets[bucket * 4 + 2] = buckets[newIndex * 4 + 2];
                buckets[bucket * 4 + 3] = buckets[newIndex * 4 + 3];
                bucket = newIndex;
            }
            newIndex = (newIndex + 1) & mask;
            existingKey0 = buckets[newIndex * 4];
            existingKey1 = buckets[newIndex * 4 + 1];
            existingKey2 = buckets[newIndex * 4 + 2];
            existingKey3 = buckets[newIndex * 4 + 3];
        }
    }
    return false;
}

export function clear(table: Type): void {
    const buckets: Uint32Array = table.buckets;
    if (
        C.EMPTY_SENTINEL_0 === C.EMPTY_SENTINEL_1
        && C.EMPTY_SENTINEL_1 === C.EMPTY_SENTINEL_2
        && C.EMPTY_SENTINEL_2 === C.EMPTY_SENTINEL_3
    ) {
        buckets.fill(C.EMPTY_SENTINEL_0);
    } else {
        const capacity: number = table.capacity;
        for (let index: number = 0; index < capacity; index++) {
            buckets[index * 4] = C.EMPTY_SENTINEL_0;
            buckets[index * 4 + 1] = C.EMPTY_SENTINEL_1;
            buckets[index * 4 + 2] = C.EMPTY_SENTINEL_2;
            buckets[index * 4 + 3] = C.EMPTY_SENTINEL_3;
        }
    }
    table.size = 0;
}

export function getIndexFromKey(
    table: Type,
    key0: number,
    key1: number,
    key2: number,
    key3: number,
): number {
    const buckets: Uint32Array = table.buckets;
    const mask: number = table.capacity - 1;
    let newIndex: number = hash128(key0, key1, key2, key3) & mask;
    let existingKey0: number = buckets[newIndex * 4];
    let existingKey1: number = buckets[newIndex * 4 + 1];
    let existingKey2: number = buckets[newIndex * 4 + 2];
    let existingKey3: number = buckets[newIndex * 4 + 3];
    while (!(
        existingKey0 === C.EMPTY_SENTINEL_0
        && existingKey1 === C.EMPTY_SENTINEL_1
        && existingKey2 === C.EMPTY_SENTINEL_2
        && existingKey3 === C.EMPTY_SENTINEL_3
    )) {
        if (
            existingKey0 === key0
            && existingKey1 === key1
            && existingKey2 === key2
            && existingKey3 === key3
        ) return newIndex;
        newIndex = (newIndex + 1) & mask;
        existingKey0 = buckets[newIndex * 4];
        existingKey1 = buckets[newIndex * 4 + 1];
        existingKey2 = buckets[newIndex * 4 + 2];
        existingKey3 = buckets[newIndex * 4 + 3];
    }
    return -1;
}

function expand(table: Type): void {
    const oldCapacity: number = table.capacity;
    const newCapacity: number = oldCapacity * 2;
    const newMask: number = newCapacity - 1;
    const oldBuckets: Uint32Array = table.buckets;
    const newBuckets: Uint32Array = new Uint32Array(newCapacity * 4);
    for (let oldIndex: number = 0; oldIndex < oldCapacity; oldIndex++) {
        const key0: number = oldBuckets[oldIndex * 4];
        const key1: number = oldBuckets[oldIndex * 4 + 1];
        const key2: number = oldBuckets[oldIndex * 4 + 2];
        const key3: number = oldBuckets[oldIndex * 4 + 3];
        if (!(
            key0 === C.EMPTY_SENTINEL_0
            && key1 === C.EMPTY_SENTINEL_1
            && key2 === C.EMPTY_SENTINEL_2
            && key3 === C.EMPTY_SENTINEL_3
        )) {
            let found: boolean = false;
            let newIndex: number = hash128(key0, key1, key2, key3) & newMask;
            let existingKey0: number = newBuckets[newIndex * 4];
            let existingKey1: number = newBuckets[newIndex * 4 + 1];
            let existingKey2: number = newBuckets[newIndex * 4 + 2];
            let existingKey3: number = newBuckets[newIndex * 4 + 3];
            while (!(
                existingKey0 === C.EMPTY_SENTINEL_0
                && existingKey1 === C.EMPTY_SENTINEL_1
                && existingKey2 === C.EMPTY_SENTINEL_2
                && existingKey3 === C.EMPTY_SENTINEL_3
            )) {
                if (
                    existingKey0 === key0
                    && existingKey1 === key1
                    && existingKey2 === key2
                    && existingKey3 === key3
                ) {
                    found = true;
                    break;
                }
                newIndex = (newIndex + 1) & newMask;
                existingKey0 = newBuckets[newIndex * 4];
                existingKey1 = newBuckets[newIndex * 4 + 1];
                existingKey2 = newBuckets[newIndex * 4 + 2];
                existingKey3 = newBuckets[newIndex * 4 + 3];
            }
            if (found === false) {
                newBuckets[newIndex * 4] = key0;
                newBuckets[newIndex * 4 + 1] = key1;
                newBuckets[newIndex * 4 + 2] = key2;
                newBuckets[newIndex * 4 + 3] = key3;
            }
        }
    }
    table.buckets = newBuckets;
    table.capacity = newCapacity;
}

// `Set`-like functions that you probably shouldn't use:

export function forEach(
    table: Type,
    callbackFn: (
        key0: number,
        key1: number,
        key2: number,
        key3: number,
        map: Type,
    ) => void,
): void {
    const capacity: number = table.capacity;
    const buckets: Uint32Array = table.buckets;
    for (let index: number = 0; index < capacity; index++) {
        const key0: number = buckets[index * 4];
        const key1: number = buckets[index * 4 + 1];
        const key2: number = buckets[index * 4 + 2];
        const key3: number = buckets[index * 4 + 3];
        if (!(
            key0 === C.EMPTY_SENTINEL_0
            && key1 === C.EMPTY_SENTINEL_1
            && key2 === C.EMPTY_SENTINEL_2
            && key3 === C.EMPTY_SENTINEL_3
        )) {
            callbackFn(key0, key1, key2, key3, table);
        }
    }
}

/** The array is in the format `[[key0, key1, key2, key3], ...]` */
export function keys(table: Type): [number, number, number, number][] {
    const result: [number, number, number, number][] = [];
    forEach(table, (key0, key1, key2, key3, _map) => {
        result.push([key0, key1, key2, key3]);
    });
    return result;
}

/** The array is in the format `[[key0, key1, key2, key3], ...]` */
export function values(table: Type): [number, number, number, number][] {
    return keys(table);
}

/** The array is in the format `[[[key0, key1, key2, key3], [key0, key1, key2, key3]], ...]` */
export function entries(table: Type): [[number, number, number, number], [number, number, number, number]][] {
    const result: [[number, number, number, number], [number, number, number, number]][] = [];
    forEach(table, (key0, key1, key2, key3, _map) => {
        result.push([[key0, key1, key2, key3], [key0, key1, key2, key3]]);
    });
    return result;
}
