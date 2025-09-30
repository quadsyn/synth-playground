import { SongDocument } from "../../../SongDocument.js";
import { clamp } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import { OperationKind, type ClipOperation } from "../Operation.js";
import { type OperationState } from "../OperationState.js";
import { type ClipTransform } from "../ClipTransform.js";

export class RightStretchClip implements ClipOperation {
    public kind: OperationKind.Clip;
    public data: { clips: Map<Clip.Type, ClipTransform> };

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
        this.data = { clips: clips };
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
    }

    private _move(x1: number): void {
        const songDuration: number = this._doc.project.song.duration;

        for (let [clip, transform] of this.data.clips.entries()) {
            const cursorPpqn0: number = this._cursorPpqn0 | 0;
            const cursorPpqn1: number = this._operationState.mouseToPpqn(x1) | 0;
            const cursorPpqnDeltaMin: number = -((clip.end - 1) - clip.start);
            const cursorPpqnDeltaMax: number = songDuration - clip.end;
            const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

            transform.newEnd = clip.end + cursorPpqnDelta;

            // We only have one clip to process.
            break;
        }

        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext): OperationResponse {
        if (isReleasing(context)) {
            const songDuration: number = this._doc.project.song.duration;

            // @TODO: Skip committing if the clip properties didn't change.
            for (let [clip, transform] of this.data.clips.entries()) {
                // @TODO: Make sure duration can't end up as 0.
                const newEnd: number = clamp(transform.newEnd, 1, songDuration);
                const clipIndex: number = transform.clipIndex;
                const clipTrackIndex: number = transform.clipTrackIndex;

                this._doc.changeClip(clip, clipIndex, clip.start, newEnd, clipTrackIndex, clipTrackIndex);

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
