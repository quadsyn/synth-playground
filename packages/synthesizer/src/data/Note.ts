import * as Breakpoint from "./Breakpoint.js";

export interface Type {
    // In pulses per quarter note.
    start: number;
    end: number;

    // Not necessarily in semitones, depends on the song tuning.
    pitch: number;

    // For the "implicit interval tree" acceleration structure.
    // Don't serialize this.
    maxEnd: number;

    // Internal ID. Don't serialize this.
    idLo: number;
    idHi: number;

    pitchEnvelope: Breakpoint.Type[] | null;
    volumeEnvelope: Breakpoint.Type[] | null;
}

export function make(
    start: number,
    end: number,
    pitch: number,
    idLo: number,
    idHi: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): Type {
    return {
        start: start,
        end: end,
        pitch: pitch,
        maxEnd: end,
        idLo: idLo,
        idHi: idHi,
        pitchEnvelope: pitchEnvelope,
        volumeEnvelope: volumeEnvelope,
    };
}
