import * as PatternClipData from "./PatternClipData.js";

export interface Type {
    // In pulses per quarter note.
    start: number;
    end: number;

    // For the "implicit interval tree" acceleration structure.
    maxEnd: number;

    // Normally I'd use optional fields in here, but I'm trying to keep object
    // shapes consistent, so those optional fields have been put in their own
    // related sub-objects. The exceptions are the IDs below.
    kind: Kind;
    patternClipData: PatternClipData.Type | null;

    // Internal ID. Don't serialize this.
    // @TODO: This means that we need to do an extra hash table lookup per tick
    // to find the pattern. Maybe this is bad and should be replaced with an
    // index into song.patterns, but then every edit to that array must remap
    // all indices in all clips in the song.
    patternIdLo: number;
    patternIdHi: number;

    // Internal ID. Don't serialize this.
    soundId: number;

    // Internal ID. Don't serialize this.
    idLo: number;
    idHi: number;
}

export function make(
    start: number,
    end: number,
    kind: Kind,
    patternClipData: PatternClipData.Type | null,
    patternIdLo: number,
    patternIdHi: number,
    soundId: number,
    idLo: number,
    idHi: number,
): Type {
    return {
        start: start,
        end: end,
        maxEnd: end,
        kind: kind,
        patternClipData: patternClipData,
        patternIdLo: patternIdLo,
        patternIdHi: patternIdHi,
        soundId: soundId,
        idLo: idLo,
        idHi: idHi,
    };
}

export const enum Kind {
    Pattern,
    Sound,
}
