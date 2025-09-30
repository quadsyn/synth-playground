import { SongDocument } from "../../../SongDocument.js";
import { clamp } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import { OperationKind, type NoteOperation } from "../Operation.js";
import { type OperationState } from "../OperationState.js";
import { type NoteTransform } from "../NoteTransform.js";

export class PaintFlatNote implements NoteOperation {
    public kind: OperationKind.Note;
    public data: { notes: Map<Note.Type, NoteTransform> };

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
        this.data = { notes: notes };
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
    }

    private _move(pattern: Pattern.Type, x1: number): void {
        for (let [_, transform] of this.data.notes.entries()) {
            let cursorPpqn0: number = this._cursorPpqn0 | 0;
            let cursorPpqn1: number = this._operationState.mouseToPpqn(x1) | 0;

            // Swap so we have ppqn0 < ppqn1 (ppqn0 == ppqn1 is fine, that's a
            // zero-length note).
            if (cursorPpqn0 > cursorPpqn1) {
                const t: number = cursorPpqn1;
                cursorPpqn1 = cursorPpqn0;
                cursorPpqn0 = t;
            }

            // Normally we'd clamp cursorPpqn0 to [0, pattern.duration - 1], but
            // here it's okay to have a zero-length note (which is what that is
            // trying to prevent).
            transform.newStart = clamp(cursorPpqn0, 0, pattern.duration);
            transform.newEnd = clamp(cursorPpqn1, 0, pattern.duration);

            // We only have one note to process.
            break;
        }

        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext, pattern: Pattern.Type): OperationResponse {
        if (isReleasing(context)) {
            for (let [note, transform] of this.data.notes.entries()) {
                const newStart: number = transform.newStart;
                const newEnd: number = transform.newEnd;
                const newDuration: number = newEnd - newStart;
                const newPitch: number = note.pitch;

                if (newDuration <= 0) {
                    // Zero-length note means we don't have anything to create.
                    break;
                }

                this._doc.insertNote(
                    pattern,
                    newStart,
                    newEnd,
                    newPitch,
                    /* pitchEnvelope */ null,
                    /* volumeEnvelope */ null,
                );

                this._operationState.lastCommittedNoteDuration = newDuration;
                this._operationState.lastCommittedNoteVolumeEnvelope = note.volumeEnvelope;
                this._operationState.lastCommittedNotePitchEnvelope = note.pitchEnvelope;
                this._operationState.selectedNotes = [];
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
