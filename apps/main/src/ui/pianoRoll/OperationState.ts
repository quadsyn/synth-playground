import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Viewport from "../common/Viewport.js";
import { NoteDrawingStyle } from "./NoteDrawingStyle.js";

export interface OperationState {
    viewport: Viewport.Type;

    /**
     * In pixels.
     */
    noteStretchHandleSize: number;

    /**
     * This will divide the height (in pixels) of the note.
     */
    noteVolumeHandleSizeFactor: number;

    /**
     * This will divide the height (in pixels) of the note.
     */
    notePitchHandleSizeFactor: number;

    /**
     * This will be multiplied with the size of the relevant handle.
     */
    noteEnvelopePointSizeFactor: number;

    /**
     * In pulses per quarter note.
     */
    lastCommittedNoteDuration: number;

    /**
     * This is a reference - **always** make a copy with `Breakpoint.cloneArray`
     * if you're going to use it with another note.
     */
    lastCommittedNoteVolumeEnvelope: Breakpoint.Type[] | null;

    /**
     * This is a reference - **always** make a copy with `Breakpoint.cloneArray`
     * if you're going to use it with another note.
     */
    lastCommittedNotePitchEnvelope: Breakpoint.Type[] | null;

    boxSelectionActive: boolean;
    boxSelectionX0: number;
    boxSelectionX1: number;
    boxSelectionY0: number;
    boxSelectionY1: number;

    selectionOverlayIsDirty: boolean;

    selectedNotes: Note.Type[];

    mouseToPpqn: (clientX: number) => number;
    mouseToPitch: (clientY: number) => number;
    // ppqnToMouse: (ppqn: number) => number;
    // pitchToMouse: (pitch: number) => number;

    // @TODO: Add shortcuts for the hit testing functions here? That way, the
    // operations don't need to look at the note drawing style I think.

    getCanvasBounds: () => DOMRect;

    noteDrawingStyle: NoteDrawingStyle;
}
