// https://en.wikipedia.org/wiki/FNV-1a

// Using a const enum for these constants so they can be force-inlined.
const enum C {
    OFFSET_BASIS = 0x811c9dc5,
    PRIME = 0x01000193,
}

export function fnv1a(data: Uint8Array): number {
    let hash: number = C.OFFSET_BASIS;
    const length: number = data.length;
    for (let index: number = 0; index < length; index++) {
        hash = Math.imul(data[index] ^ hash, C.PRIME);
    }
    return hash >>> 0;
}

export function fnv1a32le(data: number): number {
    const data0: number = (data >>>  0) & 0xFF;
    const data1: number = (data >>>  8) & 0xFF;
    const data2: number = (data >>> 16) & 0xFF;
    const data3: number = (data >>> 24) & 0xFF;
    let hash: number = C.OFFSET_BASIS;
    hash = Math.imul(data0 ^ hash, C.PRIME);
    hash = Math.imul(data1 ^ hash, C.PRIME);
    hash = Math.imul(data2 ^ hash, C.PRIME);
    hash = Math.imul(data3 ^ hash, C.PRIME);
    return hash >>> 0;
}

export function fnv1a64le(lo: number, hi: number): number {
    const data0: number = (lo >>>  0) & 0xFF;
    const data1: number = (lo >>>  8) & 0xFF;
    const data2: number = (lo >>> 16) & 0xFF;
    const data3: number = (lo >>> 24) & 0xFF;
    const data4: number = (hi >>>  0) & 0xFF;
    const data5: number = (hi >>>  8) & 0xFF;
    const data6: number = (hi >>> 16) & 0xFF;
    const data7: number = (hi >>> 24) & 0xFF;
    let hash: number = C.OFFSET_BASIS;
    hash = Math.imul(data0 ^ hash, C.PRIME);
    hash = Math.imul(data1 ^ hash, C.PRIME);
    hash = Math.imul(data2 ^ hash, C.PRIME);
    hash = Math.imul(data3 ^ hash, C.PRIME);
    hash = Math.imul(data4 ^ hash, C.PRIME);
    hash = Math.imul(data5 ^ hash, C.PRIME);
    hash = Math.imul(data6 ^ hash, C.PRIME);
    hash = Math.imul(data7 ^ hash, C.PRIME);
    return hash >>> 0;
}

export function fnv1a128le(k0: number, k1: number, k2: number, k3: number): number {
    const data0: number  = (k0 >>>  0) & 0xFF;
    const data1: number  = (k0 >>>  8) & 0xFF;
    const data2: number  = (k0 >>> 16) & 0xFF;
    const data3: number  = (k0 >>> 24) & 0xFF;
    const data4: number  = (k1 >>>  0) & 0xFF;
    const data5: number  = (k1 >>>  8) & 0xFF;
    const data6: number  = (k1 >>> 16) & 0xFF;
    const data7: number  = (k1 >>> 24) & 0xFF;
    const data8: number  = (k2 >>>  0) & 0xFF;
    const data9: number  = (k2 >>>  8) & 0xFF;
    const data10: number = (k2 >>> 16) & 0xFF;
    const data11: number = (k2 >>> 24) & 0xFF;
    const data12: number = (k3 >>>  0) & 0xFF;
    const data13: number = (k3 >>>  8) & 0xFF;
    const data14: number = (k3 >>> 16) & 0xFF;
    const data15: number = (k3 >>> 24) & 0xFF;
    let hash: number = C.OFFSET_BASIS;
    hash = Math.imul(data0 ^ hash, C.PRIME);
    hash = Math.imul(data1 ^ hash, C.PRIME);
    hash = Math.imul(data2 ^ hash, C.PRIME);
    hash = Math.imul(data3 ^ hash, C.PRIME);
    hash = Math.imul(data4 ^ hash, C.PRIME);
    hash = Math.imul(data5 ^ hash, C.PRIME);
    hash = Math.imul(data6 ^ hash, C.PRIME);
    hash = Math.imul(data7 ^ hash, C.PRIME);
    hash = Math.imul(data8 ^ hash, C.PRIME);
    hash = Math.imul(data9 ^ hash, C.PRIME);
    hash = Math.imul(data10 ^ hash, C.PRIME);
    hash = Math.imul(data11 ^ hash, C.PRIME);
    hash = Math.imul(data12 ^ hash, C.PRIME);
    hash = Math.imul(data13 ^ hash, C.PRIME);
    hash = Math.imul(data14 ^ hash, C.PRIME);
    hash = Math.imul(data15 ^ hash, C.PRIME);
    return hash >>> 0;
}
