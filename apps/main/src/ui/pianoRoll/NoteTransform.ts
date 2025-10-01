import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";

// @TODO: Maybe I should just have a "FakeNote" newtype instead of this.
export interface NoteTransform {
    newStart: number;
    newEnd: number;
    newPitch: number;
    newPitchEnvelope: Breakpoint.Type[] | null;
    newVolumeEnvelope: Breakpoint.Type[] | null;
}
