export interface Type {
    // In pulses per quarter note.
    startOffset: number;
}

export function make(startOffset: number): Type {
    return {
        startOffset: startOffset,
    };
}
