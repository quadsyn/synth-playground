import { SongDocument } from "../../../SongDocument.js";
import { clamp } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import { type Operation } from "../Operation.js";
import { OperationKind } from "../OperationKind.js";
import { type OperationState } from "../OperationState.js";
import { type ClipTransform } from "../ClipTransform.js";

export class MoveClips implements Operation {
    public kind: OperationKind;
    public clips: Map<Clip.Type, ClipTransform> | undefined;

    private _operationState: OperationState;
    private _doc: SongDocument;
    private _cursorPpqn0: number;
    private _timeDelta: number;
    private _timeDeltaMin: number;
    private _timeDeltaMax: number;

    constructor(
        operationState: OperationState,
        doc: SongDocument,
        cursorPpqn0: number,
        clips: Map<Clip.Type, ClipTransform>,
        timeDeltaMin: number,
        timeDeltaMax: number,
    ) {
        this.kind = OperationKind.Clip;
        this.clips = clips;
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
        this._timeDelta = 0;
        this._timeDeltaMin = timeDeltaMin;
        this._timeDeltaMax = timeDeltaMax;
    }

    private _move(x1: number): void {
        if (this.clips == null) {
            return;
        }

        const cursorPpqn0: number = this._cursorPpqn0 | 0;
        const cursorPpqn1: number = this._operationState.mouseToPpqn(x1) | 0;

        this._timeDelta = clamp(cursorPpqn1 - cursorPpqn0, this._timeDeltaMin, this._timeDeltaMax);

        for (const [clip, transform] of this.clips.entries()) {
            transform.newStart = clip.start + this._timeDelta;
            transform.newEnd = clip.end + this._timeDelta;
        }

        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext): OperationResponse {
        if (this.clips == null) {
            return OperationResponse.Aborted;
        }

        if (isReleasing(context)) {
            // @TODO: Skip committing if the clip properties didn't change.
            const timeDelta: number = this._timeDelta;

            const clipsAndTrackIndices: [Clip.Type, number][] = [];
            for (const [clip, transform] of this.clips.entries()) {
                clipsAndTrackIndices.push([clip, transform.clipTrackIndex]);
            }
            this._doc.changeClips(clipsAndTrackIndices, timeDelta);

            this._operationState.selectedClipsByTrackIndex.clear();
            for (const [clip, transform] of this.clips.entries()) {
                let selectedClips: Clip.Type[] | undefined = this._operationState.selectedClipsByTrackIndex.get(transform.clipTrackIndex);
                if (selectedClips == null) {
                    selectedClips = [];
                }
                selectedClips.push(clip);
                this._operationState.selectedClipsByTrackIndex.set(transform.clipTrackIndex, selectedClips);
            }
            this._operationState.selectionOverlayIsDirty = true;

            return OperationResponse.Done;
        }

        if (gestureHasKind(context.gesture1, GestureKind.Drag) || gestureHasKind(context.gesture1, GestureKind.Move)) {
            this._move(context.x1);
        }

        return OperationResponse.Running;
    }
}
