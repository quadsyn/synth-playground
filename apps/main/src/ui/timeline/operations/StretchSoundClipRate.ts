import { SongDocument } from "../../../SongDocument.js";
import { clamp } from "@synth-playground/common/math.js";
import { GestureKind, gestureHasKind } from "../../input/gestures.js";
import { OperationResponse, type OperationContext, isReleasing } from "../../input/operations.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import * as TempoMap from "@synth-playground/synthesizer/data/TempoMap.js";
import { OperationKind, type ClipOperation } from "../Operation.js";
import { type OperationState } from "../OperationState.js";
import { type ClipTransform } from "../ClipTransform.js";

export class StretchSoundClipRate implements ClipOperation {
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
        for (let [clip, transform] of this.data.clips.entries()) {
            if (clip.kind !== Clip.Kind.Sound) {
                return;
            }

            const minPlaybackRate: number = 0.01;
            const maxPlaybackRate: number = 1024;

            const cursorPpqn0: number = this._cursorPpqn0;
            const cursorPpqn1: number = this._operationState.mouseToPpqn(x1);

            const tempoMap: TempoMap.Type = this._doc.project.song.tempoMap;
            const clipStartInSeconds: number = TempoMap.computeSecondsFromTick(
                tempoMap.sections,
                TempoMap.findSectionIndexByTick(tempoMap.sections, clip.start),
                clip.start,
            );

            const cursorPpqn0InSeconds: number = TempoMap.computeSecondsFromTick(
                tempoMap.sections,
                TempoMap.findSectionIndexByTick(tempoMap.sections, cursorPpqn0),
                cursorPpqn0,
            );
            const cursorPpqn1InSeconds: number = TempoMap.computeSecondsFromTick(
                tempoMap.sections,
                TempoMap.findSectionIndexByTick(tempoMap.sections, cursorPpqn1),
                cursorPpqn1,
            );

            const oldDurationInSeconds: number = cursorPpqn0InSeconds - clipStartInSeconds;
            const newDurationInSeconds: number = cursorPpqn1InSeconds - clipStartInSeconds;

            const existingPlaybackRate: number = clip.soundClipData != null ? clip.soundClipData.playbackRate : 1;
            const existingStartOffset: number = clip.soundClipData != null ? clip.soundClipData.startOffset : 0;

            const ratio: number = oldDurationInSeconds / newDurationInSeconds;
            const newRawPlaybackRate: number = existingPlaybackRate * ratio;
            const clampedRatio: number = clamp(newRawPlaybackRate / existingPlaybackRate, minPlaybackRate, maxPlaybackRate);
            const newPlaybackRate: number = clamp(existingPlaybackRate * clampedRatio, minPlaybackRate, maxPlaybackRate);
            const newStartOffset: number = existingStartOffset;

            transform.newSoundPlaybackRate = newPlaybackRate;
            transform.newSoundStartOffset = newStartOffset;

            // We only have one clip to process.
            break;
        }

        this._operationState.selectionOverlayIsDirty = true;
    }

    public update(context: OperationContext): OperationResponse {
        if (isReleasing(context)) {
            // @TODO: Skip committing if the clip properties didn't change.
            for (let [clip, transform] of this.data.clips.entries()) {
                const newStartOffset: number = transform.newSoundStartOffset;
                const newPlaybackRate: number = transform.newSoundPlaybackRate;
                const clipTrackIndex: number = transform.clipTrackIndex;

                if (clip.kind === Clip.Kind.Sound) {
                    this._doc.changeSoundClipStartOffset(clip, newStartOffset);
                    this._doc.changeSoundClipPlaybackRate(clip, newPlaybackRate);
                }

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
