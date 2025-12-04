import * as IITree from "@synth-playground/common/iitree.js";
import * as Clip from "./Clip.js";
import { decibelsToLinear, linearToDecibels } from "@synth-playground/common/math.js";

export interface Type {
    // Should remain sorted and indexed for playback.
    clips: Clip.Type[];

    // For the "implicit interval tree" acceleration structure.
    clipsMaxLevel: number;

    // Normalized.
    gain: number;

    // Normalized.
    pan: number;

    muted: boolean;
}

export const enum Constants {
    GainMinDb = -60,
    GainMaxDb = 12,

    // @TODO: Would be nice to generate these when building.
    GainDefault = 0.8333333333333333, // gainInternalToNormalized(1)
    GainStep = 0.01387416980315015, // gainInternalToNormalized(1) - gainInternalToNormalized(decibelsToLinear(-1))
    GainMinLinear = 0.001, // Math.pow(10, GainMinDb / 20)
    GainOneMinusMinLinear = 0.999, // 1 - GainMinLinear
    GainInvOneMinusMinLinear = 1.001001001001001, // 1 / GainOneMinusMinLinear
    GainRangeDb = 72, // GainMaxDb - GainMinDb
    GainInvRangeDb = 0.013888888888888888, // 1 / GainRangeDb

    PanDefault = 0.5,
    PanStep = 0.01,
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

// https://www.kvraudio.com/forum/viewtopic.php?p=4911306#p4911306

export function gainNormalizedToInternal(normalized: number): number {
    const gainDb: number = Constants.GainMinDb + Constants.GainRangeDb * normalized;
    return (decibelsToLinear(gainDb) - Constants.GainMinLinear) * Constants.GainInvOneMinusMinLinear;
}

export function gainInternalToNormalized(internal: number): number {
    return ((
        linearToDecibels(internal * Constants.GainOneMinusMinLinear + Constants.GainMinLinear)
    ) - Constants.GainMinDb) * Constants.GainInvRangeDb;
}

export function gainNormalizedToString(normalized: number): string {
    // @TODO: Remove trailling zeros and normalize -0 to 0, since that's ugly.
    if (normalized <= 0.0) return "-∞ dB";
    return linearToDecibels(gainNormalizedToInternal(normalized)).toFixed(2) + " dB";
}

// -3dB pan law, aka "constant power".
// Doesn't boost, so things in the center are attenuated by -3dB.
// That's to avoid clipping.
//
// This is also really "stereo balance".

// @TODO:
// - Option for different pan laws (e.g. -4.5dB/"compromise", ...)
// - Option for different curves (e.g. linear, ...)?
// - Option for boosting instead of attenuating.
// - Other panning modes (like REAPER's "stereo pan" or "dual pan")?
// - Verify that this polynomial approximation is helping with anything...

export function panNormalizedToInternalL(normalized: number): number {
    const t: number = 1.0 - normalized;
    return t * (1.63057 + t * ((-0.234845) + t * (-0.395722)));
    // return Math.cos(normalized * 1.5707963267948966 /* Math.PI / 2 */);
}

export function panNormalizedToInternalR(normalized: number): number {
    // Computed by running a cubic regression in Desmos:
    // https://www.desmos.com/calculator/gufjx7mkqx
    const t: number = normalized;
    return t * (1.63057 + t * ((-0.234845) + t * (-0.395722)));
    // return Math.sin(normalized * 1.5707963267948966 /* Math.PI / 2 */);
}

export function panNormalizedToString(normalized: number): string {
    if (normalized === 0.5) {
        return "Center";
    } else if (normalized < 0.5) {
        return Math.round((0.5 - normalized) * 200) + "% L";
    } else {
        return Math.round((normalized - 0.5) * 200) + "% R";
    }
}
