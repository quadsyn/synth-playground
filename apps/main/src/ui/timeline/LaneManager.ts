import { SongDocument } from "../../SongDocument.js";
import { UIContext } from "../UIContext.js";
import * as Track from "@synth-playground/synthesizer/data/Track.js";
import * as TrackMetadata from "@synth-playground/synthesizer/data/TrackMetadata.js";
import * as Lane from "./Lane.js";

export class LaneManager {
    // private _ui: UIContext;
    private _doc: SongDocument;
    private _lanes: Lane.Type[];
    private _lanesVersion: number;
    private _totalHeight: number;
    private _lanesAreDirty: boolean;

    constructor(ui: UIContext, doc: SongDocument) {
        // this._ui = ui;
        this._doc = doc;

        this._lanes = [];
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
        }
        // Trim the excess.
        this._lanes.length = laneCount;

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
            laneIndex++;

            newTotalHeight += lane.height;

            // @TODO: If there are automation subtracks open, process them here.
        }

        this._totalHeight = newTotalHeight;

        this._lanesVersion = (this._lanesVersion + 1) >>> 0;

        this._lanesAreDirty = false;
    }
}
