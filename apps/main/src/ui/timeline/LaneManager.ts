import { SongDocument } from "../../SongDocument.js";
import { UIContext } from "../UIContext.js";
import * as Track from "@synth-playground/synthesizer/data/Track.js";
import * as TrackMetadata from "@synth-playground/synthesizer/data/TrackMetadata.js";
import * as Lane from "./Lane.js";
import { type LaneLayout } from "./LaneLayout.js";

export class LaneManager {
    // private _ui: UIContext;
    private _doc: SongDocument;
    private _lanes: Lane.Type[];
    private _laneLayouts: LaneLayout[];
    private _lanesVersion: number;
    private _totalHeight: number;
    private _lanesAreDirty: boolean;

    constructor(ui: UIContext, doc: SongDocument) {
        // this._ui = ui;
        this._doc = doc;

        this._lanes = [];
        this._laneLayouts = [];
        this._lanesVersion = 0;
        this._totalHeight = 0;
        this._lanesAreDirty = true;

        // @TODO: Listen to track-related events emitted by the document, and
        // call _markLanesAsDirty.
    }

    public dispose(): void {}

    public getLanes(): Lane.Type[] {
        if (this._lanesAreDirty) {
            this._determineVisibleLanes();
        }
        return this._lanes;
    }

    public getLaneLayouts(): LaneLayout[] {
        if (this._lanesAreDirty) {
            this._determineVisibleLanes();
        }
        return this._laneLayouts;
    }

    public getTotalHeight(): number {
        if (this._lanesAreDirty) {
            this._determineVisibleLanes();
        }
        return this._totalHeight;
    }

    public getLanesVersion(): number {
        if (this._lanesAreDirty) {
            this._determineVisibleLanes();
        }
        return this._lanesVersion;
    }

    public findFirstVisibleLaneIndex(viewportY0: number): number {
        if (this._lanesAreDirty) {
            this._determineVisibleLanes();
        }

        const laneCount: number = this._lanes.length;
        const laneLayouts: LaneLayout[] = this._laneLayouts;

        // https://en.wikipedia.org/wiki/Binary_search#Procedure_for_finding_the_rightmost_element
        let left: number = 0;
        let right: number = laneCount;
        while (left < right) {
            const middle: number = Math.floor(left + (right - left) / 2);
            if ((laneLayouts[middle].y1 - viewportY0) > 0) {
                // Consider the lower half.
                right = middle;
            } else {
                // Consider the upper half.
                left = middle + 1;
            }
        }
        // This is a more useful return value here, instead of right - 1. It also
        // matches C++'s std::upper_bound.
        return left;
    }

    public computeVisibleLaneCount(firstVisibleLaneIndex: number, viewportY0: number, canvasHeight: number): number {
        if (this._lanesAreDirty) {
            // @TODO: Since you're supposed to call findFirstVisibleLaneIndex
            // before calling this, maybe I should leave this out.
            this._determineVisibleLanes();
        }

        const laneCount: number = this._lanes.length;
        const laneLayouts: LaneLayout[] = this._laneLayouts;

        let visibleLaneCount: number = 0;

        for (let laneIndex: number = firstVisibleLaneIndex; laneIndex < laneCount; laneIndex++) {
            const laneLayout: LaneLayout = laneLayouts[laneIndex];
            const y0: number = laneLayout.y0 - viewportY0;
            if (y0 > canvasHeight) {
                // Out of bounds.
                break;
            } else {
                visibleLaneCount++;
            }
        }

        return visibleLaneCount;
    }

    // private _markLanesAsDirty(): void {
    //     this._lanesAreDirty = true;
    // }

    private _determineVisibleLanes(): void {
        const tracks: Track.Type[] = this._doc.project.song.tracks;
        const tracksMetadata: TrackMetadata.Type[] = this._doc.project.tracksMetadata;
        const trackCount: number = tracks.length;
        const shouldShowTempoAutomation: boolean = false;

        let laneCount: number = trackCount;
        // @TODO: Use this first pass to determine dirtiness as well?
        for (let trackIndex: number = 0; trackIndex < trackCount; trackIndex++) {
            // @TODO: Increment laneCount if there are any automation subtracks.
            // Also, if tracks can be hidden, decrement.
        }
        if (shouldShowTempoAutomation) {
            laneCount++;
        }

        let newTotalHeight: number = 0;

        // Allocate new lane objects if necessary.
        while (this._lanes.length < laneCount) {
            // This will be entirely overwritten so the values don't matter.
            this._lanes.push(Lane.make(
                Lane.Kind.Track,
                /* trackIndex */ -1,
                /* automationSubtrackIndex */ -1,
                /* height */ 1,
                /* depth */ 0,
            ));
            this._laneLayouts.push({
                y0: 0,
                y1: 0,
            });
        }
        // Trim the excess.
        this._lanes.length = laneCount;
        this._laneLayouts.length = laneCount;

        // Update lane objects.
        let laneIndex: number = 0;
        // Per-song lanes go first.
        if (shouldShowTempoAutomation) {
            const lane: Lane.Type = this._lanes[laneIndex];
            lane.kind = Lane.Kind.TempoAutomation;
            lane.trackIndex = -1;
            lane.automationSubtrackIndex = -1;
            lane.height = Lane.AutomationLaneHeight;
            lane.depth = 0;

            const laneLayout: LaneLayout = this._laneLayouts[laneIndex];
            laneLayout.y0 = newTotalHeight;
            laneLayout.y1 = laneLayout.y0 + lane.height;

            laneIndex++;

            newTotalHeight += lane.height;
        }
        // Now the track (and track automation) lanes.
        for (let trackIndex: number = 0; trackIndex < trackCount; trackIndex++) {
            // const track: Track = tracks[trackIndex];
            const trackMetadata: TrackMetadata.Type = tracksMetadata[trackIndex];
            const trackCollapsed: boolean = trackMetadata.collapsed;
            const trackHeight: number = trackCollapsed ? Lane.CollapsedHeight : trackMetadata.height;

            const lane: Lane.Type = this._lanes[laneIndex];
            lane.kind = Lane.Kind.Track;
            lane.trackIndex = trackIndex;
            lane.automationSubtrackIndex = -1;
            lane.height = trackHeight;
            lane.depth = 0;

            const laneLayout: LaneLayout = this._laneLayouts[laneIndex];
            laneLayout.y0 = newTotalHeight;
            laneLayout.y1 = laneLayout.y0 + lane.height;

            laneIndex++;

            newTotalHeight += lane.height;

            // @TODO: If there are automation subtracks open, process them here.
        }

        this._totalHeight = newTotalHeight;

        this._lanesVersion = (this._lanesVersion + 1) >>> 0;

        this._lanesAreDirty = false;
    }
}
