import { TimeStretchMode } from "./TimeStretchMode.js";

export interface Type {
    /** In seconds. */
    startOffset: number;

    /**
     * Normalized percentage, i.e. 1 is the original speed, 2 is twice as fast,
     * etc.
     */
    playbackRate: number;

    timeStretchMode: TimeStretchMode;

    /**
     * Multiplication factor, i.e. 1 is the original pitch, 2 is an octave above,
     * etc.
     *
     * Only works if `timeStretchMode` is set to something else other than
     * `TimeStretchMode.None`.
     */
    pitchShift: number;
}

export function make(
    startOffset: number,
    playbackRate: number,
    timeStretchMode: TimeStretchMode,
    pitchShift: number,
): Type {
    return {
        startOffset: startOffset,
        playbackRate: playbackRate,
        timeStretchMode: timeStretchMode,
        pitchShift: pitchShift,
    };
}
