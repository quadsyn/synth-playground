import { SongDocument } from "../../../SongDocument.js";
import { clamp, remap } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Constants from "@synth-playground/synthesizer/data/Constants.js";
import { type Operation } from "../Operation.js";
import { OperationKind } from "../OperationKind.js";
import { type OperationState } from "../OperationState.js";
import { type ClipTransform } from "../ClipTransform.js";

export class MoveTempoEnvelopePointBounded implements Operation {
    public kind: OperationKind;
    public clips: Map<Clip.Type, ClipTransform> | undefined;
    public newTempoEnvelope: Breakpoint.Type[];

    private _operationState: OperationState;
    private _doc: SongDocument;
    private _cursorPpqn0: number;
    private _cursorY0: number;
    private _pointIndex: number;
    private _laneIndex: number;

    constructor(
        operationState: OperationState,
        doc: SongDocument,
        cursorPpqn0: number,
        cursorY0: number,
        pointIndex: number,
        laneIndex: number,
    ) {
        this.kind = OperationKind.Tempo;
        this.clips = undefined;
        this._operationState = operationState;
        this._doc = doc;
        this._cursorPpqn0 = cursorPpqn0;
        this._cursorY0 = cursorY0;
        this._pointIndex = pointIndex;
        this._laneIndex = laneIndex;
        // @TODO: I should check that this actually exists.
        this.newTempoEnvelope = Breakpoint.cloneArray(this._doc.project.song.tempoEnvelope!);
    }

    private _move(x1: number, y1: number): void {
        const cursorPpqn0: number = this._cursorPpqn0;
        const cursorPpqn1: number = this._operationState.mouseToPpqn(x1);
        const ppqnDelta: number = cursorPpqn1 - cursorPpqn0;

        const cursorY0: number = this._cursorY0;
        const cursorY1: number = this._operationState.mouseToY(y1);

        const laneY0: number = this._operationState.getLaneY0(this._laneIndex);
        const laneY1: number = this._operationState.getLaneY1(this._laneIndex);

        const remappedY0: number = remap(cursorY0, laneY0, laneY1, Constants.TempoMax, Constants.TempoMin);
        const remappedY1: number = remap(cursorY1, laneY0, laneY1, Constants.TempoMax, Constants.TempoMin);
        const remappedDelta: number = remappedY1 - remappedY0;

        const srcPoint: Breakpoint.Type = this._doc.project.song.tempoEnvelope![this._pointIndex];
        const dstPoint: Breakpoint.Type = this.newTempoEnvelope[this._pointIndex];

        let minTime: number = 0;
        let maxTime: number = this._doc.project.song.duration;
        const prevPointIndex: number = this._pointIndex - 1;
        if (prevPointIndex >= 0) {
            minTime = this._doc.project.song.tempoEnvelope![prevPointIndex].time;
        }
        const nextPointIndex: number = this._pointIndex + 1;
        if (nextPointIndex < this._doc.project.song.tempoEnvelope!.length) {
            maxTime = this._doc.project.song.tempoEnvelope![nextPointIndex].time;
        }

        dstPoint.time = clamp((srcPoint.time + ppqnDelta) | 0, minTime, maxTime);
        dstPoint.value = clamp((srcPoint.value + remappedDelta) | 0, Constants.TempoMin, Constants.TempoMax);

        this._operationState.envelopesAreDirty = true;
        this._operationState.tempoEnvelopeIsDirty = true;
        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext): OperationResponse {
        if (isReleasing(context)) {
            const pointIndex: number = this._pointIndex;
            const dstPoint: Breakpoint.Type = this.newTempoEnvelope![pointIndex];

            this._operationState.envelopesAreDirty = true;
            this._operationState.tempoEnvelopeIsDirty = true;
            this._operationState.selectionOverlayIsDirty = true;

            this._doc.changeTempoEnvelopePoint(pointIndex, dstPoint.time, dstPoint.value);

            return OperationResponse.Done;
        }

        if (gestureHasKind(context.gesture1, GestureKind.Drag) || gestureHasKind(context.gesture1, GestureKind.Move)) {
            this._move(context.x1, context.y1);
        }

        return OperationResponse.Running;
    }
}
