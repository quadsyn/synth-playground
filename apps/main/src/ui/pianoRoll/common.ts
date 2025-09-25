import { clamp } from "@synth-playground/common/math.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Viewport from "../common/Viewport.js";
import { NoteDrawingStyle } from "./NoteDrawingStyle.js";

export function tickToX(viewport: Viewport.Type, tickWidth: number, tick: number): number {
    return (tick - viewport.x0) * tickWidth;
}

/** Returns the top of the note. Add `pixelsPerPitch` to get the bottom. */
export function pitchToY(
    canvasHeight: number,
    viewport: Viewport.Type,
    noteHeight: number,
    maxPitch: number,
    pitch: number,
): number {
    return canvasHeight - (clamp(pitch, 0, maxPitch) - viewport.y0 + 1) * noteHeight;
}

export function noteIsFlat(noteDrawingStyle: NoteDrawingStyle, note: Note.Type): boolean {
    const pitchEnvelope: Breakpoint.Type[] | null = note.pitchEnvelope;
    const pitchEnvelopeLength: number = pitchEnvelope != null ? pitchEnvelope.length : 0;
    return (
        noteDrawingStyle === NoteDrawingStyle.Flat
        || (
            noteDrawingStyle === NoteDrawingStyle.Bent
            && pitchEnvelopeLength <= 1
            // The note could still be entirely flat, but that check is probably
            // not free once you have a lot of notes, so I won't bother.
        )
    );
}
