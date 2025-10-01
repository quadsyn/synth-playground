export interface Type {
    // @TODO: I may want to change this to 64-bit depending on how it gets used,
    // but I don't imagine it will be necessary for now.
    id: number;

    // In order to support changing the data after importing or creating.
    version: number;

    samplesPerSecond: number;

    dataL: Float32Array;
    dataR: Float32Array | null;
}

export function make(
    id: number,
    version: number,
    samplesPerSecond: number,
    dataL: Float32Array,
    dataR: Float32Array | null,
): Type {
    return {
        id: id,
        version: version,
        samplesPerSecond: samplesPerSecond,
        dataL: dataL,
        dataR: dataR,
    };
}

export function update(
    sound: Type,
    samplesPerSecond: number,
    dataL: Float32Array,
    dataR: Float32Array | null,
): void {
    sound.samplesPerSecond = samplesPerSecond;
    sound.dataL = dataL;
    sound.dataR = dataR;

    // Keep this as an unsigned 32-bit integer.
    sound.version = (sound.version + 1) >>> 0;
}
