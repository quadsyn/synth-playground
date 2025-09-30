import { SongDocument } from "../../../SongDocument.js";
import { clamp } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind, Key } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import { OperationKind, type NoteOperation } from "../Operation.js";
import { type OperationState } from "../OperationState.js";
import { type NoteTransform } from "../NoteTransform.js";

export class MoveNotePitchPointBounded implements NoteOperation {
    public kind: OperationKind.Note;
    public data: { notes: Map<Note.Type, NoteTransform> };

    private _operationState: OperationState;
    private _doc: SongDocument;
    private _cursorPpqn0: number;
    private _cursorPitch0: number;
    private _pointIndex: number;
    private _constraint: ConstraintMode;
    private _quantize: boolean;

    constructor(
        operationState: OperationState,
        doc: SongDocument,
        cursorPpqn0: number,
        cursorPitch0: number,
        notes: Map<Note.Type, NoteTransform>,
        pointIndex: number,
    ) {
        this.kind = OperationKind.Note;
        this.data = { notes: notes };
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
        this._cursorPitch0 = cursorPitch0;
        this._pointIndex = pointIndex;
        this._constraint = ConstraintMode.Unconstrained;
        this._quantize = true;
    }

    private _move(pattern: Pattern.Type, x1: number, y1: number): void {
        for (let [note, transform] of this.data.notes.entries()) {
            const cursorPpqn0: number = this._cursorPpqn0;
            const cursorPpqn1: number = this._operationState.mouseToPpqn(x1);
            let ppqnDelta: number = cursorPpqn1 - cursorPpqn0;
            if (this._constraint === ConstraintMode.Vertical) {
                ppqnDelta = 0;
            }

            const cursorPitch0: number = this._cursorPitch0;
            const cursorPitch1: number = this._operationState.mouseToPitch(y1);
            let pitchDelta: number = cursorPitch1 - cursorPitch0;
            if (this._constraint === ConstraintMode.Horizontal) {
                pitchDelta = 0;
            }
            if (this._quantize) {
                pitchDelta = Math.round(pitchDelta);
            }

            const srcPoint: Breakpoint.Type = note.pitchEnvelope![this._pointIndex];
            const dstPoint: Breakpoint.Type = transform.newPitchEnvelope![this._pointIndex];

            let minTime: number = 0;
            let maxTime: number = note.end - note.start;
            const prevPointIndex: number = this._pointIndex - 1;
            if (prevPointIndex >= 0) {
                minTime = note.pitchEnvelope![prevPointIndex].time;
            }
            const nextPointIndex: number = this._pointIndex + 1;
            if (nextPointIndex < note.pitchEnvelope!.length) {
                maxTime = note.pitchEnvelope![nextPointIndex].time;
            }

            const maxPitch: number = this._doc.project.song.maxPitch;
            const minPitchOffset: number = -maxPitch;
            const maxPitchOffset: number = maxPitch;
            dstPoint.time = clamp((srcPoint.time + ppqnDelta) | 0, minTime, maxTime);
            dstPoint.value = clamp(srcPoint.value + pitchDelta, minPitchOffset, maxPitchOffset);

            // We only have one note to process.
            break;
        }

        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext, pattern: Pattern.Type): OperationResponse {
        if (context.gesture1 === (GestureKind.Press | Key.H)) {
            this._constraint = switchConstraint(this._constraint, ConstraintMode.Horizontal);
        } else if (context.gesture1 === (GestureKind.Press | Key.V)) {
            this._constraint = switchConstraint(this._constraint, ConstraintMode.Vertical);
        } else if (context.gesture1 === (GestureKind.Press | Key.Q)) {
            this._quantize = !this._quantize;
        }

        if (isReleasing(context)) {
            // @TODO: Skip committing if the note properties didn't change.
            for (let [note, transform] of this.data.notes.entries()) {
                const pointIndex: number = this._pointIndex;
                const dstPoint: Breakpoint.Type = transform.newPitchEnvelope![pointIndex];

                this._operationState.lastCommittedNoteDuration = note.end - note.start;
                this._operationState.lastCommittedNoteVolumeEnvelope = note.volumeEnvelope;
                this._operationState.lastCommittedNotePitchEnvelope = note.pitchEnvelope;
                this._operationState.selectedNotes = [note];
                this._operationState.selectionOverlayIsDirty = true;

                this._doc.changeNotePitchPoint(pattern, note, pointIndex, dstPoint.time, dstPoint.value);

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

const enum ConstraintMode {
    Unconstrained,
    Horizontal,
    Vertical,
}

function switchConstraint(state: ConstraintMode, desired: ConstraintMode): ConstraintMode {
    // We assume here that desired can only be set to horizontal or vertical.
    if (state === ConstraintMode.Unconstrained) {
        if (desired === ConstraintMode.Horizontal) {
            return ConstraintMode.Horizontal;
        } else if (desired === ConstraintMode.Vertical) {
            return ConstraintMode.Vertical;
        }
    } else if (state === ConstraintMode.Horizontal) {
        if (desired === ConstraintMode.Horizontal) {
            return ConstraintMode.Unconstrained;
        } else if (desired === ConstraintMode.Vertical) {
            return ConstraintMode.Vertical;
        }
    } else if (state === ConstraintMode.Vertical) {
        if (desired === ConstraintMode.Horizontal) {
            return ConstraintMode.Horizontal;
        } else if (desired === ConstraintMode.Vertical) {
            return ConstraintMode.Unconstrained;
        }
    }

    return state;
}
