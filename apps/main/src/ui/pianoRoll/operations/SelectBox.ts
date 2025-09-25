import * as IITree from "@synth-playground/common/iitree.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import { type Operation } from "../Operation.js";
import { OperationKind } from "../OperationKind.js";
import { type OperationState } from "../OperationState.js";
import { type NoteTransform } from "../NoteTransform.js";
import { tickToX, pitchToY } from "../common.js";
import * as BentNoteIterator from "../BentNoteIterator.js";
import { NoteHit, rectOverlapsNote } from "../noteHitTesting.js";
import { SongDocument } from "../../../SongDocument.js";

export class SelectBox implements Operation {
    public kind: OperationKind;
    public notes: Map<Note.Type, NoteTransform> | undefined;

    private _doc: SongDocument;
    private _operationState: OperationState;
    private _cursorPpqn0: number;
    private _cursorPitch0: number;
    private _cursorPpqn1: number;
    private _cursorPitch1: number;
    private _bentNoteIterator: BentNoteIterator.Type;

    constructor(
        doc: SongDocument,
        operationState: OperationState,
        cursorPpqn0: number,
        cursorPitch0: number,
    ) {
        this._doc = doc;
        this.kind = OperationKind.Selection;
        this.notes = undefined;
        this._operationState = operationState;
        this._cursorPpqn0 = cursorPpqn0;
        this._cursorPitch0 = cursorPitch0;
        this._cursorPpqn1 = cursorPpqn0;
        this._cursorPitch1 = cursorPitch0;
        this._operationState.boxSelectionX0 = this._cursorPpqn0;
        this._operationState.boxSelectionX1 = this._cursorPpqn1;
        this._operationState.boxSelectionY0 = this._cursorPitch0;
        this._operationState.boxSelectionY1 = this._cursorPitch1;
        this._operationState.boxSelectionActive = true;
        this._bentNoteIterator = BentNoteIterator.make();
    }

    private _updateSelection(x1: number, y1: number): void {
        this._cursorPpqn1 = this._operationState.mouseToPpqn(x1);
        this._cursorPitch1 = this._operationState.mouseToPitch(y1) - 1;
        this._operationState.boxSelectionX0 = this._cursorPpqn0;
        this._operationState.boxSelectionX1 = this._cursorPpqn1;
        this._operationState.boxSelectionY0 = this._cursorPitch0;
        this._operationState.boxSelectionY1 = this._cursorPitch1;
    }

    public update(context: OperationContext, pattern: Pattern.Type): OperationResponse {
        if (isReleasing(context)) {
            this._updateSelection(context.x1, context.y1);

            const bx0: number = Math.min(this._operationState.boxSelectionX0, this._operationState.boxSelectionX1);
            const bx1: number = Math.max(this._operationState.boxSelectionX0, this._operationState.boxSelectionX1);
            const by0: number = Math.min(this._operationState.boxSelectionY0, this._operationState.boxSelectionY1);
            const by1: number = Math.max(this._operationState.boxSelectionY0, this._operationState.boxSelectionY1);

            const canvasBounds: DOMRect = this._operationState.getCanvasBounds();
            const canvasWidth: number = canvasBounds.width;
            const canvasHeight: number = canvasBounds.height;
            const viewportX0: number = this._operationState.viewport.x0;
            const viewportX1: number = this._operationState.viewport.x1;
            const viewportY0: number = this._operationState.viewport.y0;
            const viewportY1: number = this._operationState.viewport.y1;
            const viewportWidth: number = viewportX1 - viewportX0;
            const pixelsPerTick: number = canvasWidth / viewportWidth;
            const viewportHeight: number = viewportY1 - viewportY0;
            const pixelsPerPitch: number = canvasHeight / viewportHeight;
            const maxPitch: number = this._doc.project.song.maxPitch;

            // @TODO: Inline findOverlapping manually.
            IITree.findOverlapping(
                pattern.notes,
                pattern.notesMaxLevel,
                Math.floor(bx0),
                Math.ceil(bx1),
                (note: Note.Type, index: number) => {
                    if ((rectOverlapsNote(
                        this._bentNoteIterator,
                        tickToX(this._operationState.viewport, pixelsPerTick, bx0),
                        pitchToY(canvasHeight, this._operationState.viewport, pixelsPerPitch, maxPitch, by1),
                        tickToX(this._operationState.viewport, pixelsPerTick, bx1),
                        pitchToY(canvasHeight, this._operationState.viewport, pixelsPerPitch, maxPitch, by0),
                        note,
                        this._operationState.noteDrawingStyle,
                        this._operationState.noteStretchHandleSize,
                        canvasWidth,
                        canvasHeight,
                        this._operationState.viewport,
                        pixelsPerTick,
                        pixelsPerPitch,
                        maxPitch,
                    ) & NoteHit.Inside) !== 0) {
                        this._operationState.selectedNotes.push(note);
                    }
                },
            );

            this._operationState.boxSelectionActive = false;
            this._operationState.selectionOverlayIsDirty = true;

            return OperationResponse.Done;
        }

        if (gestureHasKind(context.gesture1, GestureKind.Drag) || gestureHasKind(context.gesture1, GestureKind.Move)) {
            this._updateSelection(context.x1, context.y1);
        }

        return OperationResponse.Running;
    }
}
