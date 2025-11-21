import { insideRange } from "@synth-playground/common/math.js";
import { H } from "@synth-playground/browser/dom.js";
import { SongDocument } from "../../SongDocument.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import * as Track from "@synth-playground/synthesizer/data/Track.js";
import * as TrackMetadata from "@synth-playground/synthesizer/data/TrackMetadata.js";
import * as Viewport from "../common/Viewport.js";
import * as Lane from "./Lane.js";
import { type LaneLayout } from "./LaneLayout.js";
import { LaneManager } from "./LaneManager.js";
import { TrackOutlinerLane } from "./TrackOutlinerLane.js";
import * as TrackMeterState from "../../data/TrackMeterState.js";

// @TODO:
// - When one of the elements inside a lane gets focus, the lanes will shift
//   around incorrectly. I need to detect focus events there and scroll+render
//   I guess? Though I've only noticed this now because I don't have focus
//   trapping for dialogs at this point.

export class TrackOutliner implements Component {
    public element: HTMLDivElement;
    public size: number;

    private _ui: UIContext;
    private _doc: SongDocument;
    private _laneManager: LaneManager;
    private _width: number;
    private _height: number;
    private _viewport: Viewport.Type;
    private _laneElements: TrackOutlinerLane[];
    private _selectedTrackIndex: number;

    private _renderedViewport: Viewport.Type | null;
    private _renderedLanesVersion: number | null;
    private _renderedSelectedTrackIndex: number | null;

    constructor(
        ui: UIContext,
        doc: SongDocument,
        laneManager: LaneManager,
        size: number,
        initialHeight: number,
        viewportY0: number,
    ) {
        this._ui = ui;
        this._doc = doc;
        this._laneManager = laneManager;

        this.size = size;
        this._width = this.size;
        this._height = initialHeight;

        this._viewport = Viewport.make(
            /* x0 */ 0,
            /* y0 */ viewportY0,
            /* x1 */ 0,
            /* y1 */ 0,
            // These values don't matter here, since we only care about matching
            // with the parent component.
            /* minWidth */ 0,
            /* maxWidth */ 0,
            /* minHeight */ 0,
            /* maxHeight */ 0,
        );

        this._renderedViewport = null;
        this._renderedLanesVersion = null;
        this._renderedSelectedTrackIndex = null;

        this.element = H("div", {
            style: `
                position: relative;
                box-sizing: border-box;
                width: ${this._width}px;
                height: ${this._height}px;
                background-color: #2e2e2e;
                overflow: hidden;
                flex-shrink: 0;
            `,
        });

        this._laneElements = [];
        this._selectedTrackIndex = -1;
    }

    public dispose(): void {}

    public render(): void {
        const width: number = this._width;
        const height: number = this._height;
        const viewportY0: number = this._viewport.y0;
        const lanes: Lane.Type[] = this._laneManager.getLanes();
        const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
        const laneCount: number = lanes.length;
        const lanesVersion: number = this._laneManager.getLanesVersion();

        const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);
        const visibleLaneCount: number = this._laneManager.computeVisibleLaneCount(firstLaneIndex, viewportY0, height);

        const dirty: boolean = (
            Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.Y)
            || visibleLaneCount !== this._laneElements.length
            || this._selectedTrackIndex !== this._renderedSelectedTrackIndex
            || lanesVersion !== this._renderedLanesVersion
        );

        // Allocate new lane elements if necessary.
        while (this._laneElements.length < visibleLaneCount) {
            const laneElement: TrackOutlinerLane = new TrackOutlinerLane(this._ui, this._doc);
            this._laneElements.push(laneElement);
            this.element.appendChild(laneElement.element);
        }
        // Excess elements are hidden below.

        const laneElementCount: number = this._laneElements.length;
        let laneElementIndex: number = 0;

        // Update lane elements.
        if (dirty) {
            if (firstLaneIndex !== -1) {
                // Render all visible lanes.
                let laneIndex: number = firstLaneIndex;
                while (laneElementIndex < laneElementCount && laneIndex < laneCount) {
                    const laneElement: TrackOutlinerLane = this._laneElements[laneElementIndex];
                    const lane: Lane.Type = lanes[laneIndex];
                    const laneLayout: LaneLayout = laneLayouts[laneIndex];
                    const laneHeight: number = lane.height;
                    const depth: number = lane.depth;
                    const kind: Lane.Kind = lane.kind;
                    const trackIndex: number = lane.trackIndex;
                    const trackMeterState: TrackMeterState.Type | null = (
                        insideRange(trackIndex, 0, this._doc.trackMeterStates.length - 1)
                        ? this._doc.trackMeterStates[trackIndex]
                        : null
                    );
                    const indent: number = Lane.IndentSize * depth;
                    const y0: number = laneLayout.y0 - viewportY0;
                    // const y1: number = laneLayout.y1 - viewportY0;

                    if (y0 > height) {
                        break;
                    }

                    laneElement.setVisible(true);
                    laneElement.setHasTopBorder(laneIndex === 0);
                    laneElement.setTop(y0);
                    laneElement.setLeft(indent);
                    laneElement.setWidth(width - indent);
                    laneElement.setHeight(laneHeight);
                    laneElement.setKind(kind);

                    if (kind === Lane.Kind.Track) {
                        const track: Track.Type = this._doc.project.song.tracks[trackIndex];
                        const trackGain: number = track.gain;
                        const trackPan: number = track.pan;
                        const trackMetadata: TrackMetadata.Type = this._doc.project.tracksMetadata[trackIndex];
                        const trackName: string = trackMetadata.name;
                        laneElement.setTrackIndex(trackIndex);
                        laneElement.setTrackName(trackName);
                        laneElement.setTrackGain(trackGain);
                        laneElement.setTrackPan(trackPan);
                        laneElement.setTrackMeterState(trackMeterState);
                        laneElement.setSelected(trackIndex === this._selectedTrackIndex);
                    } else if (kind === Lane.Kind.TempoAutomation) {
                        // @TODO: Cached localization.
                        laneElement.setAutomationLabel("Tempo");
                        laneElement.setSelected(false); // @TODO: Track this?
                        laneElement.setTrackIndex(-1);
                        laneElement.setTrackMeterState(null);
                    } else if (kind === Lane.Kind.Automation) {
                        laneElement.setSelected(false);
                        laneElement.setTrackIndex(-1); // @TODO: Set this to the index of the associated track?
                        laneElement.setTrackMeterState(null);
                    }
                    laneElement.render();

                    laneElementIndex++;
                    laneIndex++;
                }
            }

            // Hide the excess.
            while (laneElementIndex < laneElementCount) {
                const laneElement: TrackOutlinerLane = this._laneElements[laneElementIndex];
                laneElement.setVisible(false);
                laneElement.render();

                laneElementIndex++;
            }
        } else if (this._doc.playing || this._doc.playingPianoNote) {
            // Special case: if there's audio playing, and no structural changes
            // have happened here (i.e. `dirty` is false), then we still need to
            // update track meters.

            if (firstLaneIndex !== -1) {
                // Iterate over all visible lanes.
                let laneIndex: number = firstLaneIndex;
                while (laneElementIndex < laneElementCount && laneIndex < laneCount) {
                    const laneElement: TrackOutlinerLane = this._laneElements[laneElementIndex];
                    const lane: Lane.Type = lanes[laneIndex];
                    const laneLayout: LaneLayout = laneLayouts[laneIndex];
                    const kind: Lane.Kind = lane.kind;
                    const trackIndex: number = lane.trackIndex;
                    const trackMeterState: TrackMeterState.Type | null = (
                        insideRange(trackIndex, 0, this._doc.trackMeterStates.length - 1)
                        ? this._doc.trackMeterStates[trackIndex]
                        : null
                    );
                    const y0: number = laneLayout.y0 - viewportY0;

                    if (y0 > height) {
                        break;
                    }

                    if (kind === Lane.Kind.Track) {
                        laneElement.setTrackMeterState(trackMeterState);
                        laneElement.render();
                    }

                    laneElementIndex++;
                    laneIndex++;
                }
            }
        }

        this._renderedViewport = Viewport.updateRendered(this._renderedViewport, this._viewport);
        this._renderedLanesVersion = lanesVersion;
        this._renderedSelectedTrackIndex = this._selectedTrackIndex;
    }

    public resize(size: number, height: number): void {
        this.size = size;
        this._width = this.size;
        this._height = height;

        this.element.style.width = this._width + "px";
        this.element.style.height = this._height + "px";

        Viewport.clearRendered(this._renderedViewport);

        this._ui.scheduleMainRender();
    }

    public setViewport(viewport: Viewport.Type): void {
        Viewport.copy(this._viewport, viewport);
    }

    public setSelectedTrackIndex(index: number): void {
        this._selectedTrackIndex = index;
    }
}
