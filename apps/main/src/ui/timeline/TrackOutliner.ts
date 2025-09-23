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

    private _renderedViewport: Viewport.Type | null;
    // private _renderedLanesVersion: number | null;

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

        // const project: Project = this._doc.project;
        // const song: Song = project.song;

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
        // this._renderedLanesVersion = null;

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
    }

    public dispose(): void {}

    public render(): void {
        const width: number = this._width;
        const height: number = this._height;
        const viewportY0: number = this._viewport.y0;
        const lanes: Lane.Type[] = this._laneManager.getLanes();
        const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
        const laneCount: number = lanes.length;
        // const lanesVersion: number = this._laneManager.getLanesVersion();

        const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);
        const visibleLaneCount: number = this._laneManager.computeVisibleLaneCount(firstLaneIndex, viewportY0, height);

        const dirty: boolean = (
            Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.Y)
            || visibleLaneCount !== this._laneElements.length
            // || lanesVersion !== this._renderedLanesVersion
        );

        // Allocate new lane elements if necessary.
        while (this._laneElements.length < visibleLaneCount) {
            const laneElement: TrackOutlinerLane = new TrackOutlinerLane(this._ui);
            this._laneElements.push(laneElement);
            this.element.appendChild(laneElement.element);
        }
        // Excess elements are hidden below.

        // Update lane elements.
        if (dirty) {
            const laneElementCount: number = this._laneElements.length;
            let laneElementIndex: number = 0;
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
                        laneElement.setTrackName(trackName);
                        laneElement.setTrackGain(trackGain);
                        laneElement.setTrackPan(trackPan);
                    } else if (kind === Lane.Kind.TempoAutomation) {
                        // @TODO: Cached localization.
                        laneElement.setAutomationLabel("Tempo");
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
        }

        this._renderedViewport = Viewport.updateRendered(this._renderedViewport, this._viewport);
        // this._renderedLanesVersion = lanesVersion;
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
}
