import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";

export interface NoteTransform {
    newStart: number;
    newEnd: number;
    newPitch: number;
    newPitchEnvelope: Breakpoint.Type[] | null;
    newVolumeEnvelope: Breakpoint.Type[] | null;
}
