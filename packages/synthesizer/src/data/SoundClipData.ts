export interface Type {
    // In seconds.
    startOffset: number;
}

export function make(startOffset: number): Type {
    return {
        startOffset: startOffset,
    };
}
