import * as IITree from "@synth-playground/common/iitree.js";
import * as Clip from "./Clip.js";

export interface Type {
    // Should remain sorted and indexed for playback.
    clips: Clip.Type[];

    // For the "implicit interval tree" acceleration structure.
    clipsMaxLevel: number;

    // 0: silent, 1: 0dBFS
    gain: number;

    // -1: left, 0: center, 1: right
    pan: number;

    muted: boolean;
}

export function make(
    gain: number,
    pan: number,
): Type {
    return {
        clips: [],
        clipsMaxLevel: -1,
        gain: gain,
        pan: pan,
        muted: false,
    };
}

export function reindexClips(track: Type): void {
    track.clips.sort(IITree.byStartAscending);
    track.clipsMaxLevel = IITree.performIndexing(track.clips);
}
