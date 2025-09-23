import { SongDocument } from "../../../SongDocument.js";
import { clamp } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import { type Operation } from "../Operation.js";
import { OperationKind } from "../OperationKind.js";
import { type OperationState } from "../OperationState.js";
import { type NoteTransform } from "../NoteTransform.js";

export class MoveNotes implements Operation {
    public kind: OperationKind;
    public notes: Map<Note.Type, NoteTransform> | undefined;

    private _operationState: OperationState;
    private _doc: SongDocument;
    private _cursorPpqn0: number;
    private _cursorPitch0: number;
    private _timeDelta: number;
    private _timeDeltaMin: number;
    private _timeDeltaMax: number;
    private _pitchDelta: number;
    private _pitchDeltaMin: number;
    private _pitchDeltaMax: number;

    constructor(
        operationState: OperationState,
        doc: SongDocument,
        cursorPpqn0: number,
        cursorPitch0: number,
        notes: Map<Note.Type, NoteTransform>,
        timeDeltaMin: number,
        timeDeltaMax: number,
        pitchDeltaMin: number,
        pitchDeltaMax: number,
    ) {
        this.kind = OperationKind.Note;
        this.notes = notes;
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
        this._cursorPitch0 = cursorPitch0;
        this._timeDelta = 0;
        this._timeDeltaMin = timeDeltaMin;
        this._timeDeltaMax = timeDeltaMax;
        this._pitchDelta = 0;
        this._pitchDeltaMin = pitchDeltaMin;
        this._pitchDeltaMax = pitchDeltaMax;
    }

    private _move(pattern: Pattern.Type, x1: number, y1: number): void {
        if (this.notes == null) {
            return;
        }

        const cursorPpqn0: number = this._cursorPpqn0 | 0;
        const cursorPpqn1: number = this._operationState.mouseToPpqn(x1) | 0;
        const cursorPitch0: number = this._cursorPitch0 | 0;
        const cursorPitch1: number = this._operationState.mouseToPitch(y1) | 0;

        this._timeDelta = clamp(cursorPpqn1 - cursorPpqn0, this._timeDeltaMin, this._timeDeltaMax);
        this._pitchDelta = clamp(cursorPitch1 - cursorPitch0, this._pitchDeltaMin, this._pitchDeltaMax);

        for (const [note, transform] of this.notes.entries()) {
            transform.newStart = note.start + this._timeDelta;
            transform.newEnd = note.end + this._timeDelta;
            transform.newPitch = note.pitch + this._pitchDelta;
        }

        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext, pattern: Pattern.Type): OperationResponse {
        if (this.notes == null) {
            return OperationResponse.Aborted;
        }

        if (isReleasing(context)) {
            // @TODO: Skip committing if the note properties didn't change.
            const notes: Note.Type[] = Array.from(this.notes.keys());
            if (notes.length === 1) {
                this._operationState.lastCommittedNoteDuration = notes[0].end - notes[0].start;
            }
            const timeDelta: number = this._timeDelta;
            const pitchDelta: number = this._pitchDelta;

            this._operationState.selectedNotes = notes;
            this._operationState.selectionOverlayIsDirty = true;

            this._doc.changeNotes(pattern, notes, timeDelta, pitchDelta);

            return OperationResponse.Done;
        }

        if (gestureHasKind(context.gesture1, GestureKind.Drag) || gestureHasKind(context.gesture1, GestureKind.Move)) {
            this._move(pattern, context.x1, context.y1);
        }

        return OperationResponse.Running;
    }
}
