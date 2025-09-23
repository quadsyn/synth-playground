import * as IITree from "@synth-playground/common/iitree.js";
import * as Note from "./Note.js";

export interface Type {
    // In pulses per quarter note.
    duration: number;

    // Should remain sorted and indexed for playback.
    notes: Note.Type[];

    // For the "implicit interval tree" acceleration structure.
    notesMaxLevel: number;

    // Internal ID. Don't serialize this.
    idLo: number;
    idHi: number;
}

export function make(
    ppqn: number,
    beatsPerBar: number,
    barCount: number,
    idLo: number,
    idHi: number,
): Type {
    return {
        duration: barCount * beatsPerBar * ppqn,
        notes: [],
        notesMaxLevel: -1,
        idLo: idLo,
        idHi: idHi,
    };
}

export function reindexNotes(pattern: Type): void {
    pattern.notes.sort(IITree.byStartAscending);
    pattern.notesMaxLevel = IITree.performIndexing(pattern.notes);
}
