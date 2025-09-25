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

export class MoveNoteVolumePointBounded implements Operation {
    public kind: OperationKind;
    public notes: Map<Note.Type, NoteTransform> | undefined;

    private _operationState: OperationState;
    private _doc: SongDocument;
    private _cursorPpqn0: number;
    private _cursorPitch0: number;
    private _pointIndex: number;

    constructor(
        operationState: OperationState,
        doc: SongDocument,
        cursorPpqn0: number,
        cursorPitch0: number,
        notes: Map<Note.Type, NoteTransform>,
        pointIndex: number,
    ) {
        this.kind = OperationKind.Note;
        this.notes = notes;
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
        this._cursorPitch0 = cursorPitch0;
        this._pointIndex = pointIndex;
    }

    private _move(pattern: Pattern.Type, x1: number, y1: number): void {
        if (this.notes == null) {
            return;
        }

        for (let [note, transform] of this.notes.entries()) {
            const cursorPpqn0: number = this._cursorPpqn0;
            const cursorPpqn1: number = this._operationState.mouseToPpqn(x1);
            const ppqnDelta: number = cursorPpqn1 - cursorPpqn0;

            const cursorPitch0: number = this._cursorPitch0;
            const cursorPitch1: number = this._operationState.mouseToPitch(y1);
            const pitchDelta: number = cursorPitch1 - cursorPitch0;

            const srcPoint: Breakpoint.Type = note.volumeEnvelope![this._pointIndex];
            const dstPoint: Breakpoint.Type = transform.newVolumeEnvelope![this._pointIndex];

            let minTime: number = 0;
            let maxTime: number = note.end - note.start;
            const prevPointIndex: number = this._pointIndex - 1;
            if (prevPointIndex >= 0) {
                minTime = note.volumeEnvelope![prevPointIndex].time;
            }
            const nextPointIndex: number = this._pointIndex + 1;
            if (nextPointIndex < note.volumeEnvelope!.length) {
                maxTime = note.volumeEnvelope![nextPointIndex].time;
            }

            dstPoint.time = clamp((srcPoint.time + ppqnDelta) | 0, minTime, maxTime);
            dstPoint.value = clamp(srcPoint.value + pitchDelta * (1 / 4), 0, 1);

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
                const pointIndex: number = this._pointIndex;
                const dstPoint: Breakpoint.Type = transform.newVolumeEnvelope![pointIndex];

                this._operationState.lastCommittedNoteDuration = note.end - note.start;
                this._operationState.lastCommittedNoteVolumeEnvelope = note.volumeEnvelope;
                this._operationState.lastCommittedNotePitchEnvelope = note.pitchEnvelope;
                this._operationState.selectedNotes = [note];
                this._operationState.selectionOverlayIsDirty = true;

                this._doc.changeNoteVolumePoint(pattern, note, pointIndex, dstPoint.time, dstPoint.value);

                // We only have one note to process.
                break;
            }

            return OperationResponse.Done;
        }

        if (gestureHasKind(context.gesture1, GestureKind.Drag) || gestureHasKind(context.gesture1, GestureKind.Move)) {
            this._move(pattern, context.x1, context.y1);
        }

        return OperationResponse.Running;
    }
}
