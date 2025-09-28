import { SongDocument } from "../../../SongDocument.js";
import { clamp } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import { type Operation } from "../Operation.js";
import { OperationKind } from "../OperationKind.js";
import { type OperationState } from "../OperationState.js";
import { type ClipTransform } from "../ClipTransform.js";

export class LeftStretchClip implements Operation {
    public kind: OperationKind;
    public clips: Map<Clip.Type, ClipTransform> | undefined;

    private _operationState: OperationState;
    private _doc: SongDocument;
    private _cursorPpqn0: number;

    constructor(
        operationState: OperationState,
        doc: SongDocument,
        cursorPpqn0: number,
        clips: Map<Clip.Type, ClipTransform>,
    ) {
        this.kind = OperationKind.Clip;
        this.clips = clips;
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
    }

    private _move(x1: number): void {
        if (this.clips == null) {
            return;
        }

        for (let [clip, transform] of this.clips.entries()) {
            const cursorPpqn0: number = this._cursorPpqn0 | 0;
            const cursorPpqn1: number = this._operationState.mouseToPpqn(x1) | 0;
            const cursorPpqnDeltaMin: number = 0 - clip.start;
            const cursorPpqnDeltaMax: number = ((clip.end - 1) - clip.start);
            const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

            transform.newStart = clip.start + cursorPpqnDelta;

            // We only have one clip to process.
            break;
        }

        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext): OperationResponse {
        if (this.clips == null) {
            return OperationResponse.Aborted;
        }

        if (isReleasing(context)) {
            const songDuration: number = this._doc.project.song.duration;

            // @TODO: Skip committing if the clip properties didn't change.
            for (let [clip, transform] of this.clips.entries()) {
                const newStart: number = clamp(transform.newStart, 0, songDuration - 1);
                const clipIndex: number = transform.clipIndex;
                const clipTrackIndex: number = transform.clipTrackIndex;

                this._doc.changeClip(clip, clipIndex, newStart, clip.end, clipTrackIndex, clipTrackIndex);

                this._operationState.selectedClipsByTrackIndex.clear();
                this._operationState.selectedClipsByTrackIndex.set(clipTrackIndex, [clip]);
                this._operationState.selectionOverlayIsDirty = true;

                // We only have one clip to process.
                break;
            }

            return OperationResponse.Done;
        }

        if (gestureHasKind(context.gesture1, GestureKind.Drag) || gestureHasKind(context.gesture1, GestureKind.Move)) {
            this._move(context.x1);
        }

        return OperationResponse.Running;
    }
}
