import { SongDocument } from "../../../SongDocument.js";
import { clamp } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import { type Operation } from "../Operation.js";
import { OperationKind } from "../OperationKind.js";
import { type OperationState } from "../OperationState.js";
import { type NoteTransform } from "../NoteTransform.js";

export class LeftStretchNote implements Operation {
    public kind: OperationKind;
    public notes: Map<Note.Type, NoteTransform> | undefined;

    private _operationState: OperationState;
    private _doc: SongDocument;
    private _cursorPpqn0: number;

    constructor(
        operationState: OperationState,
        doc: SongDocument,
        cursorPpqn0: number,
        notes: Map<Note.Type, NoteTransform>,
    ) {
        this.kind = OperationKind.Note;
        this.notes = notes;
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
    }

    private _move(pattern: Pattern.Type, x1: number): void {
        if (this.notes == null) {
            return;
        }

        for (let [note, transform] of this.notes.entries()) {
            const cursorPpqn0: number = this._cursorPpqn0 | 0;
            const cursorPpqn1: number = this._operationState.mouseToPpqn(x1) | 0;
            const cursorPpqnDeltaMin: number = 0 - note.start;
            const cursorPpqnDeltaMax: number = ((note.end - 1) - note.start);
            const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

            transform.newStart = note.start + cursorPpqnDelta;

            {
                const pointCount: number = note.pitchEnvelope != null ? note.pitchEnvelope.length : 0;
                for (let pointIndex: number = 0; pointIndex < pointCount; pointIndex++) {
                    const point: Breakpoint.Type = note.pitchEnvelope![pointIndex];
                    const transformedPoint: Breakpoint.Type = transform.newPitchEnvelope![pointIndex];
                    transformedPoint.time = point.time - cursorPpqnDelta;
                }
            }

            {
                const pointCount: number = note.volumeEnvelope != null ? note.volumeEnvelope.length : 0;
                for (let pointIndex: number = 0; pointIndex < pointCount; pointIndex++) {
                    const point: Breakpoint.Type = note.volumeEnvelope![pointIndex];
                    const transformedPoint: Breakpoint.Type = transform.newVolumeEnvelope![pointIndex];
                    transformedPoint.time = point.time - cursorPpqnDelta;
                }
            }

            // We only have one note to process.
            break;
        }

        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext, pattern: Pattern.Type): OperationResponse {
        if (this.notes == null) {
            return OperationResponse.Aborted;
        }

        if (isReleasing(context)) {
            // @TODO: Skip committing if the note properties didn't change.
            for (let [note, transform] of this.notes.entries()) {
                const newStart: number = clamp(transform.newStart, 0, pattern.duration - 1);

                this._doc.changeNote(pattern, note, newStart, note.end, note.pitch);
                this._operationState.lastCommittedNoteDuration = note.end - note.start;
                this._operationState.lastCommittedNoteVolumeEnvelope = note.volumeEnvelope;
                this._operationState.lastCommittedNotePitchEnvelope = note.pitchEnvelope;
                this._operationState.selectedNotes = [note];
                this._operationState.selectionOverlayIsDirty = true;

                // We only have one note to process.
                break;
            }

            return OperationResponse.Done;
        }

        if (gestureHasKind(context.gesture1, GestureKind.Drag) || gestureHasKind(context.gesture1, GestureKind.Move)) {
            this._move(pattern, context.x1);
        }

        return OperationResponse.Running;
    }
}
