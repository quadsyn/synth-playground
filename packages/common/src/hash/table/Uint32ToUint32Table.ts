// import { fnv1a32le as hash32 } from "../fnv1a.js";
import { fxhash32le as hash32 } from "../fxhash.js";
import { nextHighestPowerOfTwo } from "../../math.js";

// See `./Uint64ToUint32Table.ts` for more information.

// Using a const enum for these constants so they can be force-inlined.
const enum C {
    /**
     * This cannot be 1 (the probing loops will run forever if so).
     * And it probably should be above or equal to 0.5, at least.
     */
    MAXIMUM_LOAD_FACTOR = 0.5,

    /** Key that will be used to indicate an empty bucket. */
    EMPTY_SENTINEL = 0,
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
    const buckets: Uint32Array = new Uint32Array(capacity * 2);
    return { size: size, capacity: capacity, buckets: buckets };
}

export function has(table: Type, key: number): boolean {
    return getIndexFromKey(table, key) !== -1;
}

export function get(table: Type, key: number): number | undefined {
    const index: number = getIndexFromKey(table, key);
    return index === -1 ? undefined : getValueFromIndex(table, index);
}

export function set(table: Type, key: number, value: number): void {
    // Avoiding the load factor division here, we have:
    //     if (table.size > table.capacity * C.MAXIMUM_LOAD_FACTOR) expand(table);
    // but since the maximum load factor is 0.5, we can do even better:
    if (table.size > (table.capacity >> 1)) expand(table);
    const capacity: number = table.capacity;
    const mask: number = capacity - 1;
    const buckets: Uint32Array = table.buckets;
    let found: boolean = false;
    let newIndex: number = hash32(key) & mask;
    let existingKey: number = buckets[newIndex * 2];
    while (existingKey !== C.EMPTY_SENTINEL) {
        if (existingKey === key) {
            buckets[newIndex * 2 + 1] = value;
            found = true;
            break;
        }
        newIndex = (newIndex + 1) & mask;
        existingKey = buckets[newIndex * 2];
    }
    if (found === false) {
        buckets[newIndex * 2] = key;
        buckets[newIndex * 2 + 1] = value;
        table.size++;
    }
}

// This can't be called `delete` (like in `Map`) if it's a free function.
export function remove(table: Type, key: number): boolean {
    // This is derived from https://github.com/rigtorp/HashMap
    const buckets: Uint32Array = table.buckets;
    const capacity: number = table.capacity;
    const mask: number = capacity - 1;
    let index: number = -1;
    let newIndex: number = hash32(key) & mask;
    let existingKey: number = buckets[newIndex * 2];
    while (existingKey !== C.EMPTY_SENTINEL) {
        if (existingKey === key) {
            index = newIndex;
            break;
        }
        newIndex = (newIndex + 1) & mask;
        existingKey = buckets[newIndex * 2];
    }
    if (index !== -1) {
        let bucket: number = index;
        let newIndex: number = (bucket + 1) & mask;
        let existingKey: number = buckets[newIndex * 2];
        while (true) {
            if (existingKey === C.EMPTY_SENTINEL) {
                buckets[bucket * 2] = C.EMPTY_SENTINEL;
                table.size--;
                return true;
            }
            const ideal: number = hash32(existingKey) & mask;
            const bucketDiff: number = (capacity + (bucket - ideal)) & mask;
            const newIndexDiff: number = (capacity + (newIndex - ideal)) & mask;
            if (bucketDiff < newIndexDiff) {
                buckets[bucket * 2] = buckets[newIndex * 2];
                buckets[bucket * 2 + 1] = buckets[newIndex * 2 + 1];
                bucket = newIndex;
            }
            newIndex = (newIndex + 1) & mask;
            existingKey = buckets[newIndex * 2];
        }
    }
    return false;
}

export function clear(table: Type): void {
    table.buckets.fill(C.EMPTY_SENTINEL);
    table.size = 0;
}

export function getIndexFromKey(table: Type, key: number): number {
    const buckets: Uint32Array = table.buckets;
    const mask: number = table.capacity - 1;
    let newIndex: number = hash32(key) & mask;
    let existingKey: number = buckets[newIndex * 2];
    while (existingKey !== C.EMPTY_SENTINEL) {
        if (existingKey === key) return newIndex;
        newIndex = (newIndex + 1) & mask;
        existingKey = buckets[newIndex * 2];
    }
    return -1;
}

export function getValueFromIndex(table: Type, index: number): number {
    return table.buckets[index * 2 + 1];
}

function expand(table: Type): void {
    const oldCapacity: number = table.capacity;
    const newCapacity: number = oldCapacity * 2;
    const newMask: number = newCapacity - 1;
    const oldBuckets: Uint32Array = table.buckets;
    const newBuckets: Uint32Array = new Uint32Array(newCapacity * 2);
    for (let oldIndex: number = 0; oldIndex < oldCapacity; oldIndex++) {
        const key: number = oldBuckets[oldIndex * 2];
        const val: number = oldBuckets[oldIndex * 2 + 1];
        if (key !== C.EMPTY_SENTINEL) {
            let found: boolean = false;
            let newIndex: number = hash32(key) & newMask;
            let existingKey: number = newBuckets[newIndex * 2];
            while (existingKey !== C.EMPTY_SENTINEL) {
                if (existingKey === key) {
                    newBuckets[newIndex * 2 + 1] = val;
                    found = true;
                    break;
                }
                newIndex = (newIndex + 1) & newMask;
                existingKey = newBuckets[newIndex * 2];
            }
            if (found === false) {
                newBuckets[newIndex * 2] = key;
                newBuckets[newIndex * 2 + 1] = val;
            }
        }
    }
    table.buckets = newBuckets;
    table.capacity = newCapacity;
}

// `Map`-like functions that you probably shouldn't use:

export function forEach(
    table: Type,
    callbackFn: (value: number, key: number, map: Type) => void,
): void {
    const capacity: number = table.capacity;
    const buckets: Uint32Array = table.buckets;
    for (let index: number = 0; index < capacity; index++) {
        const key: number = buckets[index * 2];
        if (key !== C.EMPTY_SENTINEL) {
            const value: number = buckets[index * 2 + 1];
            callbackFn(value, key, table);
        }
    }
}

export function keys(table: Type): number[] {
    const result: number[] = [];
    forEach(table, (_val, key, _map) => { result.push(key); });
    return result;
}

export function values(table: Type): number[] {
    const result: number[] = [];
    forEach(table, (val, _key, _map) => { result.push(val); });
    return result;
}

export function entries(table: Type): [number, number][] {
    const result: [number, number][] = [];
    forEach(table, (val, key, _map) => { result.push([key, val]); });
    return result;
}
