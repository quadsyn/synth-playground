export interface Type {
    // In seconds.
    startOffset: number;

    // Normalized percentage, i.e. 1 is the original pitch/speed, 2 is twice as
    // fast, etc.
    playbackRate: number;
}

export function make(startOffset: number, playbackRate: number): Type {
    return {
        startOffset: startOffset,
        playbackRate: playbackRate,
    };
}
