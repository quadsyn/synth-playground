import { H } from "@synth-playground/browser/dom.js";
import { SongDocument } from "../../SongDocument.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import { unlerp, remap, clamp, insideRange } from "@synth-playground/common/math.js";
import * as IITree from "@synth-playground/common/iitree.js";
import * as Uint64ToUint32Table from "@synth-playground/common/hash/table/Uint64ToUint32Table.js";
import { StretchyScrollBar } from "../stretchyScrollBar/StretchyScrollBar.js";
import * as Constants from "@synth-playground/synthesizer/data/Constants.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Song from "@synth-playground/synthesizer/data/Song.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import * as Track from "@synth-playground/synthesizer/data/Track.js";
import * as Project from "@synth-playground/synthesizer/data/Project.js";
import * as Sound from "@synth-playground/synthesizer/data/Sound.js";
import * as TempoMap from "@synth-playground/synthesizer/data/TempoMap.js";
import { ActionKind, ActionResponse } from "../input/actions.js";
import { isKeyboardGesture } from "../input/gestures.js";
import {
    OperationResponse,
    type OperationContext,
    mouseStartedInside,
    mouseIsInside,
} from "../input/operations.js";
import * as Viewport from "../common/Viewport.js";
import * as Lane from "./Lane.js";
import { type LaneLayout } from "./LaneLayout.js";
import { TimeRuler } from "./TimeRuler.js";
import { TrackOutliner } from "./TrackOutliner.js";
import { LaneManager } from "./LaneManager.js";
import { type OperationState } from "./OperationState.js";
import { OperationKind, type Operation } from "./Operation.js";
import { type ClipTransform } from "./ClipTransform.js";
import { LeftStretchClip } from "./operations/LeftStretchClip.js";
import { RightStretchClip } from "./operations/RightStretchClip.js";
import { MoveClips } from "./operations/MoveClips.js";
import { MoveTempoEnvelopePointBounded } from "./operations/MoveTempoEnvelopePointBounded.js";
import { drawClip, drawClipContents } from "./clipPainting.js";
import { type AppContext } from "../../AppContext.js";

export class Timeline implements Component {
    public element: HTMLDivElement;

    private _app: AppContext;
    private _ui: UIContext;
    private _mounted: boolean;
    private _doc: SongDocument;
    private _laneManager: LaneManager;
    private _width: number;
    private _height: number;
    private _timeScrollBar: StretchyScrollBar;
    private _trackScrollBar: StretchyScrollBar;
    private _gridCanvas: HTMLCanvasElement;
    private _gridContext: CanvasRenderingContext2D;
    private _gridCanvasResized: boolean;
    private _clipsCanvas: HTMLCanvasElement;
    private _clipsContext: CanvasRenderingContext2D;
    private _clipsCanvasResized: boolean;
    private _envelopesCanvas: HTMLCanvasElement;
    private _envelopesContext: CanvasRenderingContext2D;
    private _envelopesCanvasResized: boolean;
    private _selectionOverlayCanvas: HTMLCanvasElement;
    private _selectionOverlayContext: CanvasRenderingContext2D;
    private _selectionOverlayCanvasResized: boolean;
    private _playheadOverlayCanvas: HTMLCanvasElement;
    private _playheadOverlayContext: CanvasRenderingContext2D;
    private _playheadOverlayCanvasResized: boolean;
    private _canvasesContainer: HTMLDivElement;
    private _timeRuler: TimeRuler;
    private _trackOutliner: TrackOutliner;
    private _hoverQueryResult: HoverQueryResult;
    private _state: OperationState;
    private _activeOperation: Operation | null;
    private _playhead: number;
    private _playheadIsVisible: boolean;
    private _cursor: string;

    private _renderedClipsDirty: boolean;
    private _renderedViewport: Viewport.Type | null;
    private _renderedPlayhead: number | null;
    private _renderedPlayheadIsVisible: boolean;
    private _renderedCursor: string | null;
    private _renderedLanesVersion: number | null;

    constructor(
        app: AppContext,
        doc: SongDocument,
    ) {
        this._app = app;
        this._ui = app.ui;

        this._mounted = false;

        this._doc = doc;
        const song: Song.Type = this._doc.project.song;

        this._doc.onProjectChanged.addListener(this._onProjectChanged);
        this._doc.onSeekAndMoveTimeCursor.addListener(this._onSeekAndMoveTimeCursor);

        this._laneManager = new LaneManager(
            this._ui,
            this._doc,
        );

        this._width = 600;
        this._height = 500;

        const beatsPerBar: number = song.beatsPerBar;
        const ppqn: number = song.ppqn;
        const songDuration: number = song.duration;

        // @TODO: It's not really nice to have this, as it inhibits reentrancy,
        // but it saves doing allocations every time we use it.
        this._hoverQueryResult = {
            clipIndex: -1,
            clipTrackIndex: -1,
            clipHit: ClipHit.None,
        };

        this._state = {
            viewport: Viewport.make(
                /* x0 */ 0,
                /* y0 */ 0,
                /* x1 */ beatsPerBar * ppqn,
                /* y1 */ 0,
                /* minWidth */ 1,
                /* maxWidth */ Math.max(1, songDuration),
                /* minHeight */ 0,
                /* maxHeight */ 0,
            ),
            clipStretchHandleSize: 6,
            tempoEnvelopePointSize: 6,
            boxSelectionActive: false,
            boxSelectionX0: 0,
            boxSelectionX1: 0,
            boxSelectionY0: 0,
            boxSelectionY1: 0,
            envelopesAreDirty: true,
            tempoEnvelopeIsDirty: true,
            selectionOverlayIsDirty: true,
            selectedClipsByTrackIndex: new Map(),
            selectedTrackIndex: 0,
            mouseToPpqn: (clientX: number): number => {
                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const mouseX: number = clientX - bounds.left;
                const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                return this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth);
            },
            mouseToY: (clientY: number): number => {
                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                // const height: number = bounds.height;
                const mouseY: number = clientY - bounds.top;
                // const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                return mouseY;
            },
            getLaneY0: (laneIndex: number): number => {
                // const lanes: Lane.Type[] = this._laneManager.getLanes();
                const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
                // const lane: Lane.Type = lanes[laneIndex];
                const laneLayout: LaneLayout = laneLayouts[laneIndex];
                // const laneHeight: number = lane.height;
                const top: number = laneLayout.y0 - this._state.viewport.y0 + 2;
                return top;
            },
            getLaneY1: (laneIndex: number): number => {
                const lanes: Lane.Type[] = this._laneManager.getLanes();
                const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
                const lane: Lane.Type = lanes[laneIndex];
                const laneLayout: LaneLayout = laneLayouts[laneIndex];
                const laneHeight: number = lane.height;
                const top: number = laneLayout.y0 - this._state.viewport.y0 + 2;
                const bottom: number = top + laneHeight - 2;
                return bottom;
            },
            getCanvasBounds: (): DOMRect => {
                return this._canvasesContainer.getBoundingClientRect();
            },
        };
        this._activeOperation = null;

        this._playhead = 0;
        this._playheadIsVisible = false;
        this._renderedPlayhead = null;
        this._renderedPlayheadIsVisible = false;

        this._cursor = "default";

        this._renderedClipsDirty = true;
        this._state.selectionOverlayIsDirty = true;
        this._renderedViewport = null;
        this._renderedCursor = null;
        this._renderedLanesVersion = null;

        const initialTrackZoom: number = 1;
        const initialTrackPan: number = 0;

        this._timeScrollBar = new StretchyScrollBar(
            this._ui,
            /* vertical */ false,
            /* flip */ false,
            /* initialLongSideSize */ this._width,
            Viewport.getXZoom(this._state.viewport),
            Viewport.getXPan(this._state.viewport),
            this._onTimeScrollBarChange,
            /* onRenderOverlay */ null,
        );
        this._trackScrollBar = new StretchyScrollBar(
            this._ui,
            /* vertical */ true,
            /* flip */ false,
            /* initialLongSideSize */ this._height,
            initialTrackZoom,
            initialTrackPan,
            this._onTrackScrollBarChange,
            /* onRenderOverlay */ null,
        );
        this._trackScrollBar.setZoomEnabled(false);
        this._gridCanvasResized = true;
        this._gridCanvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                flex-grow: 1;
                display: block;
                box-sizing: border-box;
                position: absolute;
                left: 0;
                top: 0;
            `,
        });
        this._gridContext = this._gridCanvas.getContext("2d")!;
        this._clipsCanvasResized = true;
        this._clipsCanvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                flex-grow: 1;
                display: block;
                box-sizing: border-box;
                position: absolute;
                left: 0;
                top: 0;
            `,
        });
        this._clipsContext = this._clipsCanvas.getContext("2d")!;
        this._envelopesCanvasResized = true;
        this._envelopesCanvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                flex-grow: 1;
                display: block;
                box-sizing: border-box;
                position: absolute;
                left: 0;
                top: 0;
            `,
        });
        this._envelopesContext = this._envelopesCanvas.getContext("2d")!;
        this._selectionOverlayCanvasResized = true;
        this._selectionOverlayCanvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                flex-grow: 1;
                display: block;
                box-sizing: border-box;
                position: absolute;
                left: 0;
                top: 0;
            `,
        });
        this._selectionOverlayContext = this._selectionOverlayCanvas.getContext("2d")!;
        this._playheadOverlayCanvasResized = true;
        this._playheadOverlayCanvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                flex-grow: 1;
                display: block;
                box-sizing: border-box;
                position: absolute;
                left: 0;
                top: 0;
            `,
        });
        this._playheadOverlayContext = this._playheadOverlayCanvas.getContext("2d")!;
        this._canvasesContainer = H("div", {
            style: `
                width: ${this._width}px;
                height: ${this._height}px;
                position: relative;
                box-sizing: border-box;
            `,
        },
            this._gridCanvas,
            this._clipsCanvas,
            this._envelopesCanvas,
            this._selectionOverlayCanvas,
            this._playheadOverlayCanvas,
        );
        this._timeRuler = new TimeRuler(
            this._ui,
            /* initialWidth */ this._width,
            this._state.viewport.x0,
            this._state.viewport.x1,
            this._doc.project.song.ppqn,
            this._doc.project.song.beatsPerBar,
        );
        this._trackOutliner = new TrackOutliner(
            this._ui,
            this._doc,
            this._laneManager,
            /* size */ 250,
            /* initialHeight */ this._height,
            this._state.viewport.y0,
        );
        this.element = H("div", {
            style: `
                display: flex;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
            `,
        },
            this._trackOutliner.element,
            H("div", {
                style: `
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                `,
            },
                this._timeRuler.element,
                this._canvasesContainer,
                this._timeScrollBar.element,
            ),
            this._trackScrollBar.element,
        );
    }

    public dispose(): void {
        this._doc.onProjectChanged.removeListener(this._onProjectChanged);

        this._timeScrollBar.dispose();
        this._trackScrollBar.dispose();
        this._timeRuler.dispose();
        this._trackOutliner.dispose();
        this._laneManager.dispose();
    }

    public render(): void {
        if (!this._mounted) {
            this._onDidMount();
        }

        if (this._renderedLanesVersion !== this._laneManager.getLanesVersion()) {
            // @TODO: Is there a cheaper thing I can do here? I need to recompute
            // the viewport (and thus the scrollbars), but the overall DOM element
            // may not have changed sizes.
            this.resize();
        }

        if (this._doc.playing) {
            const targetPlayhead: number | null = this._doc.getPlayheadInTicks(this._ui.frame);
            if (targetPlayhead != null) {
                // @TODO: Non-hacky smoothing of the playhead position.
                if (targetPlayhead < this._playhead) {
                    this._playhead = targetPlayhead;
                } else {
                    this._playhead += (targetPlayhead - this._playhead) * 0.5;
                }
            }

            this._playheadIsVisible = (
                this._playhead != null
                && insideRange(this._playhead, this._state.viewport.x0, this._state.viewport.x1)
            );
        } else {
            this._playhead = this._doc.timeCursor;
            this._playheadIsVisible = false;
        }

        if (this._activeOperation instanceof LeftStretchClip) {
            this._cursor = "w-resize";
        } else if (this._activeOperation instanceof RightStretchClip) {
            this._cursor = "e-resize";
        } else {
            this._cursor = "default";
        }
        if (this._cursor !== this._renderedCursor) {
            this.element.style.cursor = this._cursor;
            this._renderedCursor = this._cursor;
        }

        this._renderGrid();
        this._renderClips();
        this._renderEnvelopes();
        this._renderSelectionOverlay();
        this._renderPlayhead();
        this._timeScrollBar.render();
        this._trackScrollBar.render();
        this._timeRuler.setViewport(this._state.viewport);
        this._timeRuler.setPpqn(this._doc.project.song.ppqn);
        this._timeRuler.setBeatsPerBar(this._doc.project.song.beatsPerBar);
        this._timeRuler.setTempoEnvelope(
            this._activeOperation != null && this._activeOperation.kind === OperationKind.TempoEnvelope
            ? this._activeOperation.data.newTempoEnvelope
            : this._doc.project.song.tempoEnvelope
        );
        this._timeRuler.setTempoEnvelopeIsDirty(this._state.tempoEnvelopeIsDirty);
        this._timeRuler.render();
        this._trackOutliner.setViewport(this._state.viewport);
        this._trackOutliner.setSelectedTrackIndex(this._state.selectedTrackIndex);
        this._trackOutliner.render();

        this._renderedClipsDirty = false;
        this._state.selectionOverlayIsDirty = false;
        this._renderedViewport = Viewport.updateRendered(this._renderedViewport, this._state.viewport);
        this._renderedPlayhead = this._playhead;
        this._renderedPlayheadIsVisible = this._playheadIsVisible;
        this._state.envelopesAreDirty = false;
        this._state.tempoEnvelopeIsDirty = false;
        this._renderedLanesVersion = this._laneManager.getLanesVersion();
    }

    private _renderGrid(): void {
        if (
            !Viewport.isDirty(this._renderedViewport, this._state.viewport, Viewport.DirtyCheckOptions.Both)
            && !this._gridCanvasResized
            && this._renderedLanesVersion === this._laneManager.getLanesVersion()
        ) {
            return;
        }

        if (this._gridCanvasResized) {
            this._gridCanvasResized = false;
            this._gridCanvas.width = this._width;
            this._gridCanvas.height = this._height;
        }

        const song: Song.Type = this._doc.project.song;
        const ppqn: number = song.ppqn;
        const beatsPerBar: number = song.beatsPerBar;
        const lanes: Lane.Type[] = this._laneManager.getLanes();
        const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
        const laneCount: number = lanes.length;
        // const lanesVersion: number = this._laneManager.getLanesVersion();
        // const canvas: HTMLCanvasElement = this._gridCanvas;
        const context: CanvasRenderingContext2D = this._gridContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportY0: number = this._state.viewport.y0;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);

        context.fillStyle = "#303030";
        context.fillRect(0, 0, width, height);
        context.strokeStyle = "#191919";
        {
            // Lane grid.
            for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
                const lane: Lane.Type = lanes[laneIndex];
                const laneLayout: LaneLayout = laneLayouts[laneIndex];
                const laneHeight: number = lane.height;
                const top: number = laneLayout.y0 - viewportY0;
                const bottom: number = top + laneHeight;

                if (bottom > height) {
                    break;
                }

                context.beginPath();
                context.moveTo(0, bottom);
                context.lineTo(width, bottom);
                context.stroke();
            }
        }
        {
            // Time grid.
            // @TODO: Avoid this duplication
            const viewportWidthInBeats: number = Math.floor(viewportWidth / ppqn);
            // @TODO: Need to measure this based on font size and pattern position+duration
            const minBeatWidth: number = 50;
            const minBarWidth: number = minBeatWidth * beatsPerBar;
            const exponent: number = width > 0 ? Math.max(0, Math.floor(
                Math.log(viewportWidthInBeats / (width / minBarWidth))
                / Math.log(beatsPerBar)
            )) : 1;
            const ppqnScaled: number = ppqn * Math.pow(beatsPerBar, exponent);
            let worldX: number = Math.max(0, Math.floor(viewportX0 / ppqnScaled) * ppqnScaled);
            while (worldX < viewportX1) {
                const screenX: number = ((worldX - viewportX0) * pixelsPerTick) | 0;
                context.beginPath();
                context.moveTo(screenX, 0);
                context.lineTo(screenX, height);
                context.stroke();
                worldX += ppqnScaled;
            }
        }
    }

    private _renderClips(): void {
        if (
            !this._renderedClipsDirty
            && !Viewport.isDirty(this._renderedViewport, this._state.viewport, Viewport.DirtyCheckOptions.Both)
            && !this._clipsCanvasResized
            && this._renderedLanesVersion === this._laneManager.getLanesVersion()
        ) return;

        if (this._clipsCanvasResized) {
            this._clipsCanvasResized = false;
            this._clipsCanvas.width = this._width;
            this._clipsCanvas.height = this._height;
        }

        const song: Song.Type = this._doc.project.song;
        const tracks: Track.Type[] = song.tracks;
        const lanes: Lane.Type[] = this._laneManager.getLanes();
        const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
        const laneCount: number = lanes.length;
        // const canvas: HTMLCanvasElement = this._clipsCanvas;
        const context: CanvasRenderingContext2D = this._clipsContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const viewportY0: number = this._state.viewport.y0;
        const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);

        let selectedClips: Map<Clip.Type, ClipTransform> | undefined = undefined;
        if (this._activeOperation != null && this._activeOperation.kind === OperationKind.Clip) {
            selectedClips = this._activeOperation.data.clips;
        }

        context.clearRect(0, 0, width, height);

        for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
            const lane: Lane.Type = lanes[laneIndex];
            const laneLayout: LaneLayout = laneLayouts[laneIndex];
            const laneHeight: number = lane.height;
            const kind: Lane.Kind = lane.kind;
            const top: number = laneLayout.y0 - viewportY0 + 2;
            // const bottom: number = top + laneHeight - 2;

            if (top > height) {
                break;
            }

            if (kind === Lane.Kind.Track) {
                const trackIndex: number = lane.trackIndex;
                if (trackIndex === -1) {
                    throw new Error("Expected track index");
                }
                const track: Track.Type = tracks[trackIndex];
                IITree.findOverlapping(
                    track.clips,
                    track.clipsMaxLevel,
                    viewportX0,
                    viewportX1,
                    (clip: Clip.Type, index: number) => {
                        // @TODO: One annoying thing about doing this is that when we're moving
                        // a clip, it won't show up on top of all the others on the same track.
                        // Normally, I'd draw the transformed clips afterwards, but here it's
                        // awkward because for every transformed clip we have to find its lane,
                        // which is not 1:1 with tracks. Maybe the cheapest thing to do is to
                        // iterate over the visible lanes again, and find the transformed clips
                        // by storing whatever other information is necessary in the operations.
                        const transform: ClipTransform | undefined = selectedClips?.get(clip);
                        drawClip(
                            width,
                            height,
                            context,
                            this._doc.project,
                            clip,
                            transform != null ? transform.newStart : clip.start,
                            transform != null ? transform.newEnd : clip.end,
                            this._state.viewport,
                            pixelsPerTick,
                            top,
                            laneHeight,
                        );
                    },
                );

                IITree.findOverlapping(
                    track.clips,
                    track.clipsMaxLevel,
                    viewportX0,
                    viewportX1,
                    (clip: Clip.Type, index: number) => {
                        const transform: ClipTransform | undefined = selectedClips?.get(clip);
                        drawClipContents(
                            width,
                            height,
                            context,
                            this._doc.project,
                            this._doc.patternInfoCache,
                            this._doc.project.song.tempoMap,
                            this._doc.samplesPerSecond,
                            clip,
                            transform != null ? transform.newStart : clip.start,
                            transform != null ? transform.newEnd : clip.end,
                            transform != null ? transform.newSoundStartOffset : (
                                clip.kind === Clip.Kind.Sound && clip.soundClipData != null
                                ? clip.soundClipData.startOffset
                                : 0
                            ),
                            this._state.viewport,
                            pixelsPerTick,
                            top,
                            laneHeight,
                        );
                    },
                );
            }
        }
    }

    private _renderEnvelopes(): void {
        if (
            !this._state.envelopesAreDirty
            && !this._state.tempoEnvelopeIsDirty
            && !Viewport.isDirty(this._renderedViewport, this._state.viewport, Viewport.DirtyCheckOptions.Both)
            && !this._envelopesCanvasResized
            && this._renderedLanesVersion === this._laneManager.getLanesVersion()
        ) {
            return;
        }

        if (this._envelopesCanvasResized) {
            this._envelopesCanvasResized = false;
            this._envelopesCanvas.width = this._width;
            this._envelopesCanvas.height = this._height;
        }

        const song: Song.Type = this._doc.project.song;
        const tempoEnvelope: Breakpoint.Type[] | null = (
            this._activeOperation != null && this._activeOperation.kind === OperationKind.TempoEnvelope
            ? this._activeOperation.data.newTempoEnvelope
            : song.tempoEnvelope
        );
        const lanes: Lane.Type[] = this._laneManager.getLanes();
        const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
        const laneCount: number = lanes.length;
        // const lanesVersion: number = this._laneManager.getLanesVersion();
        // const canvas: HTMLCanvasElement = this._envelopesCanvas;
        const context: CanvasRenderingContext2D = this._envelopesContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const viewportY0: number = this._state.viewport.y0;
        const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);

        context.clearRect(0, 0, width, height);

        // context.strokeStyle = "#4090ca";
        context.strokeStyle = "#17d15b";
        context.lineWidth = 1;

        for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
            const lane: Lane.Type = lanes[laneIndex];
            const laneLayout: LaneLayout = laneLayouts[laneIndex];
            const laneHeight: number = lane.height;
            const kind: Lane.Kind = lane.kind;
            const top: number = laneLayout.y0 - viewportY0 + 2;
            const bottom: number = top + laneHeight - 4;

            if (top > height) {
                break;
            }

            if (kind === Lane.Kind.TempoAutomation) {
                if (tempoEnvelope == null || tempoEnvelope.length === 0) {
                    const y = remap(song.tempo, Constants.TempoMin, Constants.TempoMax, bottom, top);
                    context.beginPath();
                    context.moveTo(0, y);
                    context.lineTo(width, y);
                    context.stroke();
                } else if (tempoEnvelope.length > 0) {
                    const pointCount: number = tempoEnvelope.length;
                    const startIndex: number = Math.max(0, Math.min(pointCount - 1, Breakpoint.findIndex(tempoEnvelope, viewportX0) - 1));

                    context.beginPath();
                    let prevY: number = 0;
                    {
                        const point: Breakpoint.Type = tempoEnvelope[startIndex];
                        const tempo: number = point.value;
                        const y = remap(
                            clamp(tempo, Constants.TempoMin, Constants.TempoMax),
                            Constants.TempoMin,
                            Constants.TempoMax,
                            bottom,
                            top
                        );
                        prevY = y;
                        context.moveTo(0, y);
                    }
                    let lastIndex: number = startIndex;
                    for (let pointIndex: number = startIndex; pointIndex < pointCount; pointIndex++) {
                        const point: Breakpoint.Type = tempoEnvelope[pointIndex];
                        const tempo: number = point.value;
                        const tempoTime: number = point.time;
                        const y = remap(
                            clamp(tempo, Constants.TempoMin, Constants.TempoMax),
                            Constants.TempoMin,
                            Constants.TempoMax,
                            bottom,
                            top
                        );
                        const x = (tempoTime - viewportX0) * pixelsPerTick;
                        lastIndex = pointIndex;
                        context.lineTo(x, prevY);
                        context.lineTo(x, y);
                        prevY = y;
                        if (x > width) {
                            break;
                        }
                    }
                    {
                        const point: Breakpoint.Type = tempoEnvelope[lastIndex];
                        const tempo: number = point.value;
                        const y: number = remap(
                            clamp(tempo, Constants.TempoMin, Constants.TempoMax),
                            Constants.TempoMin,
                            Constants.TempoMax,
                            bottom,
                            top
                        );
                        context.lineTo(width, y);
                    }
                    context.stroke();

                    const r: number = this._state.tempoEnvelopePointSize;
                    for (let pointIndex: number = startIndex; pointIndex < pointCount; pointIndex++) {
                        const point: Breakpoint.Type = tempoEnvelope[pointIndex];
                        const tempo: number = point.value;
                        const tempoTime: number = point.time;
                        const x = (tempoTime - viewportX0) * pixelsPerTick;
                        const y = remap(
                            clamp(tempo, Constants.TempoMin, Constants.TempoMax),
                            Constants.TempoMin,
                            Constants.TempoMax,
                            bottom,
                            top
                        );
                        if (x + r > width) {
                            break;
                        }
                        context.beginPath();
                        context.arc(x, y, r, 0, Math.PI * 2, false);
                        context.stroke();
                    }
                }
            }
        }
    }

    private _renderSelectionOverlay(): void {
        if (
            !this._state.selectionOverlayIsDirty
            && !Viewport.isDirty(this._renderedViewport, this._state.viewport, Viewport.DirtyCheckOptions.Both)
            && !this._selectionOverlayCanvasResized
            && this._renderedLanesVersion === this._laneManager.getLanesVersion()
        ) {
            return;
        }

        if (this._selectionOverlayCanvasResized) {
            this._selectionOverlayCanvasResized = false;
            this._selectionOverlayCanvas.width = this._width;
            this._selectionOverlayCanvas.height = this._height;
        }

        const lanes: Lane.Type[] = this._laneManager.getLanes();
        const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
        const laneCount: number = lanes.length;
        // const lanesVersion: number = this._laneManager.getLanesVersion();
        // const canvas: HTMLCanvasElement = this._selectionOverlayCanvas;
        const context: CanvasRenderingContext2D = this._selectionOverlayContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const viewportY0: number = this._state.viewport.y0;
        const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);

        context.clearRect(0, 0, width, height);

        context.fillStyle = "rgba(255, 255, 255, 0.8)";

        context.lineWidth = 1;
        context.strokeStyle = "rgba(255, 255, 255, 0.5)";

        {
            const x: number = (this._doc.timeCursor - viewportX0) * pixelsPerTick;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }

        context.lineWidth = 2;
        context.strokeStyle = "#ffffff";

        for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
            const lane: Lane.Type = lanes[laneIndex];
            const laneLayout: LaneLayout = laneLayouts[laneIndex];
            const laneHeight: number = lane.height;
            const kind: Lane.Kind = lane.kind;
            const top: number = laneLayout.y0 - viewportY0 + 2;
            // const bottom: number = top + laneHeight - 2;

            if (top > height) {
                break;
            }

            if (kind === Lane.Kind.Track) {
                const trackIndex: number = lane.trackIndex;
                if (trackIndex === -1) {
                    continue;
                }

                const selectedClips: Clip.Type[] | undefined = this._state.selectedClipsByTrackIndex.get(trackIndex);
                if (selectedClips == null) {
                    continue;
                }

                const clipCount: number = selectedClips.length;
                for (let clipIndex: number = 0; clipIndex < clipCount; clipIndex++) {
                    const clip: Clip.Type = selectedClips[clipIndex];

                    if (
                        this._activeOperation != null
                        && this._activeOperation.kind === OperationKind.Clip
                        && this._activeOperation.data.clips.has(clip)
                    ) {
                        continue;
                    }

                    const x0: number = (clip.start - viewportX0) * pixelsPerTick;
                    const x1: number = (clip.end - viewportX0) * pixelsPerTick;
                    const w: number = Math.max(1, x1 - x0);
                    const x: number = x0;
                    const y: number = top;
                    const h: number = laneHeight;
                    context.strokeRect(x + 0.5, y + 0.5, w, h);
                }
            }
        }
    }

    private _renderPlayhead(): void {
        if (
            this._renderedPlayheadIsVisible === this._playheadIsVisible
            && this._renderedPlayhead === this._playhead
            && !Viewport.isDirty(this._renderedViewport, this._state.viewport, Viewport.DirtyCheckOptions.Both)
            && !this._playheadOverlayCanvasResized
        ) {
            return;
        }

        if (this._playheadOverlayCanvasResized) {
            this._playheadOverlayCanvasResized = false;
            this._playheadOverlayCanvas.width = this._width;
            this._playheadOverlayCanvas.height = this._height;
        }

        // const song: Song = this._doc.song;
        // const canvas: HTMLCanvasElement = this._playheadOverlayCanvas;
        const context: CanvasRenderingContext2D = this._playheadOverlayContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const playhead: number | null = this._playhead;

        context.clearRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        if (this._playheadIsVisible && playhead != null) {
            const x: number = (playhead - viewportX0) * pixelsPerTick;
            context.fillRect(x - 1, 0, 2, height);
        }
    }

    public resize(): void {
        if (!this._mounted) {
            return;
        }

        const trackScrollBarSize: number = this._trackScrollBar.size;
        const timeScrollBarSize: number = this._timeScrollBar.size;
        const timeRulerSize: number = this._timeRuler.size;
        const trackOutlinerSize: number = this._trackOutliner.size;
        const rightGapW: number = trackScrollBarSize;
        const bottomRightGapH: number = timeScrollBarSize;
        const topRightGapH: number = timeRulerSize;
        const oldWidth: number = this._width;
        const oldHeight: number = this._height;
        const newWidth: number = this.element.clientWidth;
        const newHeight: number = this.element.clientHeight;
        const lanesTotalHeight: number = this._laneManager.getTotalHeight();
        const newClipAreaWidth: number = Math.max(1, newWidth - trackOutlinerSize - rightGapW);
        const newClipAreaHeight: number = Math.max(1, newHeight - topRightGapH - bottomRightGapH);

        Viewport.resizeWithUnzoomableY(
            this._state.viewport,
            oldWidth,
            oldHeight,
            newClipAreaWidth,
            newClipAreaHeight,
            lanesTotalHeight,
        );
        this._timeScrollBar.setZoom(Viewport.getXZoom(this._state.viewport));
        this._timeScrollBar.setPan(Viewport.getXPan(this._state.viewport));
        this._trackScrollBar.setZoom(Viewport.computeYZoomWithUnzoomableY(newClipAreaHeight, lanesTotalHeight));
        this._trackScrollBar.setPan(Viewport.getYPanWithUnzoomableY(this._state.viewport, newClipAreaHeight, lanesTotalHeight));

        // @TODO: I probably should really be driving this mostly from CSS.

        this._width = newClipAreaWidth;
        this._height = newClipAreaHeight;
        this._canvasesContainer.style.width = newClipAreaWidth + "px";
        this._canvasesContainer.style.height = newClipAreaHeight + "px";
        this._timeScrollBar.resize(newClipAreaWidth, timeScrollBarSize);
        this._trackScrollBar.element.style.top = `${topRightGapH}px`;
        this._trackScrollBar.resize(trackScrollBarSize, newClipAreaHeight);
        this._timeRuler.resize(newClipAreaWidth);
        this._trackOutliner.element.style.top = `${topRightGapH}px`;
        this._trackOutliner.resize(trackOutlinerSize, newClipAreaHeight);

        this._gridCanvasResized = true;
        this._envelopesCanvasResized = true;
        this._clipsCanvasResized = true;
        this._selectionOverlayCanvasResized = true;
        this._playheadOverlayCanvasResized = true;
        this._renderedClipsDirty = true;
        this._state.selectionOverlayIsDirty = true;
        this._renderedLanesVersion = null;
        Viewport.clearRendered(this._renderedViewport);

        this._ui.scheduleMainRender();
    }

    private _onDidMount(): void {
        this._mounted = true;
    }

    private _onTimeScrollBarChange = (zoom: number, pan: number): void => {
        Viewport.zoomAndPanX(this._state.viewport, zoom, pan);
        this._ui.scheduleMainRender();
    };

    private _onTrackScrollBarChange = (zoom: number, pan: number): void => {
        Viewport.panYWithUnzoomableY(this._state.viewport, this._height, this._laneManager.getTotalHeight(), pan);
        this._ui.scheduleMainRender();
    };

    private _findClipUnderMouse(
        canvasWidth: number,
        canvasHeight: number,
        mouseX: number,
        mouseY: number,
        result: HoverQueryResult,
    ): void {
        result.clipIndex = -1;
        result.clipTrackIndex = -1;
        result.clipHit = ClipHit.None;

        const outsideCanvas: boolean = !insideRange(mouseX, 0, canvasWidth) || !insideRange(mouseY, 0, canvasHeight);
        if (!outsideCanvas) {
            const viewportX0: number = this._state.viewport.x0;
            const viewportX1: number = this._state.viewport.x1;
            const viewportY0: number = this._state.viewport.y0;
            const viewportWidth: number = viewportX1 - viewportX0;
            const pixelsPerTick: number = canvasWidth / viewportWidth;
            const searchWindowStart: number = (
                this._state.viewport.x0 + remap(mouseX, 0, canvasWidth, 0, viewportWidth)
            ) | 0;
            const searchWindowEnd: number = searchWindowStart + 1;

            const project: Project.Type = this._doc.project;
            const song: Song.Type = project.song;
            const tracks: Track.Type[] = song.tracks;
            // const trackCount: number = tracks.length;
            const lanes: Lane.Type[] = this._laneManager.getLanes();
            const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
            const laneCount: number = lanes.length;
            const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);

            let found: boolean = false;
            for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
                const lane: Lane.Type = lanes[laneIndex];
                const laneLayout: LaneLayout = laneLayouts[laneIndex];
                const laneHeight: number = lane.height;
                const kind: Lane.Kind = lane.kind;
                const top: number = laneLayout.y0 - viewportY0 + 2;
                const bottom: number = top + laneHeight - 2;

                if (top > canvasHeight) {
                    break;
                }

                if (kind === Lane.Kind.Track) {
                    const trackIndex: number = lane.trackIndex;
                    if (trackIndex === -1) {
                        throw new Error("Expected track index");
                    }
                    const track: Track.Type = tracks[trackIndex];
                    if (insideRange(mouseY, top, bottom)) IITree.findOverlapping(
                        track.clips,
                        track.clipsMaxLevel,
                        searchWindowStart,
                        searchWindowEnd,
                        (clip: Clip.Type, index: number) => {
                            result.clipIndex = index;
                            result.clipTrackIndex = trackIndex;
                            result.clipHit |= ClipHit.Inside;
                            found = true;

                            const clipX0: number = ((clip.start - viewportX0) * pixelsPerTick);
                            const clipX1: number = ((clip.end - viewportX0) * pixelsPerTick);
                            const clipY0: number = top - 1;
                            const clipY1: number = clipY0 + laneHeight;
                            const clipStartStretchHandleX0: number = clipX0;
                            const clipStartStretchHandleX1: number = clamp(clipX0 + this._state.clipStretchHandleSize, clipX0, clipX1);
                            const clipEndStretchHandleX0: number = clamp(clipX1 - this._state.clipStretchHandleSize, clipX0, clipX1);
                            const clipEndStretchHandleX1: number = clipX1;

                            if (
                                insideRange(mouseX, clipStartStretchHandleX0, clipStartStretchHandleX1)
                                && insideRange(mouseY, clipY0, clipY1)
                            ) {
                                result.clipHit |= ClipHit.Left;
                            }

                            if (
                                insideRange(mouseX, clipEndStretchHandleX0, clipEndStretchHandleX1)
                                && insideRange(mouseY, clipY0, clipY1)
                            ) {
                                result.clipHit |= ClipHit.Right;
                            }
                        },
                    );
                    if (found) {
                        break;
                    }
                }
            }
        }
    }

    // @TODO: _onOutlinerWheel (based on PianoRoll._onPianoWheel)

    private _zoomAroundMouseHorizontally(zoomIn: boolean, clientX: number): void {
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const width: number = bounds.width;
        const mouseX: number = clientX - bounds.left;

        let factor: number = 1.25;
        if (zoomIn) {
            factor = 1.0 / factor;
        }

        // @TODO: Maybe instead of making this a factor of the viewport width, it
        // should be a fixed amount. Or maybe the factor should change for longer
        // songs.
        if (Viewport.zoomAroundPointX(this._state.viewport, unlerp(mouseX, 0, width), factor)) {
            this._timeScrollBar.setZoom(Viewport.getXZoom(this._state.viewport));
            this._timeScrollBar.setPan(Viewport.getXPan(this._state.viewport));

            this._renderedClipsDirty = true;
            this._state.selectionOverlayIsDirty = true;
            Viewport.clearRendered(this._renderedViewport);

            this._ui.scheduleMainRender();
        }
    };

    public onAction = (kind: ActionKind, context: OperationContext): ActionResponse => {
        switch (kind) {
            case ActionKind.TimelineImportSample: {
                // @TODO: This is here in the timeline because I need to know
                // the selected track. If I want this to be global then I need
                // to make that accessible elsewhere.
                this._app.importSample().then(({ samplesPerSecond, dataL, dataR }) => {
                    const sound: Sound.Type = this._doc.insertSound(samplesPerSecond, dataL, dataR);
                    const ticksPerBar: number = this._doc.project.song.beatsPerBar * this._doc.project.song.ppqn;
                    const timeCursor: number = this._doc.timeCursor;
                    this._doc.insertClip(
                        clamp(this._state.selectedTrackIndex, 0, this._doc.project.song.tracks.length - 1),
                        timeCursor + ticksPerBar * 0,
                        timeCursor + ticksPerBar * 4,
                        0,
                        0,
                        sound.id,
                        0,
                    );

                    this._state.selectionOverlayIsDirty = true;
                    this._renderedClipsDirty = true;
                    this._ui.scheduleMainRender();
                }).catch((error) => {
                    // @TODO: Show something on failures.
                    console.error(error);
                });

                return ActionResponse.Done;
            };
            case ActionKind.SplitClip: {
                let didSplit: boolean = false;
                const tempoMap: TempoMap.Type = this._doc.project.song.tempoMap;
                const timeCursor: number = this._doc.timeCursor;
                const timeCursorInSeconds: number = TempoMap.computeSecondsFromTick(
                    tempoMap.sections,
                    TempoMap.findSectionIndexByTick(tempoMap.sections, timeCursor),
                    timeCursor,
                );
                for (const [trackIndex, clips] of this._state.selectedClipsByTrackIndex.entries()) {
                    const tracks: Track.Type[] = this._doc.project.song.tracks;
                    if (!insideRange(trackIndex, 0, tracks.length - 1)) {
                        continue;
                    }
                    const track: Track.Type = tracks[trackIndex];
                    for (const clip of clips) {
                        const newStart: number = timeCursor;
                        const newEnd: number = timeCursor;
                        if (newStart <= clip.start || newEnd >= clip.end) {
                            continue;
                        }
                        if (clip.kind === Clip.Kind.Pattern) {
                            // @TODO: Implement startOffset for pattern clips and remove this.
                            continue;
                        }
                        let existingSoundStartOffset: number | null = null;
                        let newSoundStartOffset: number | null = null;
                        if (clip.kind === Clip.Kind.Sound) {
                            const clipStartInSeconds: number = TempoMap.computeSecondsFromTick(
                                tempoMap.sections,
                                TempoMap.findSectionIndexByTick(tempoMap.sections, clip.start),
                                clip.start,
                            );
                            existingSoundStartOffset = clip.soundClipData != null ? clip.soundClipData.startOffset : 0;
                            newSoundStartOffset = existingSoundStartOffset + (timeCursorInSeconds - clipStartInSeconds);
                        }
                        if (newStart < clip.end) {
                            this._doc.insertClip(
                                trackIndex,
                                newStart,
                                clip.end,
                                clip.patternIdLo,
                                clip.patternIdHi,
                                clip.soundId,
                                newSoundStartOffset,
                            );
                            this._doc.changeClip(
                                clip,
                                track.clips.indexOf(clip),
                                clip.start,
                                newEnd,
                                existingSoundStartOffset,
                                trackIndex,
                                trackIndex,
                            );
                            didSplit = true;
                        }
                    }
                }

                if (didSplit) {
                    this._state.selectedClipsByTrackIndex.clear();
                    this._state.selectionOverlayIsDirty = true;
                    this._renderedClipsDirty = true;
                    this._ui.scheduleMainRender();
                    return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.CreateClipAndPattern: {
                if (isKeyboardGesture(context.gesture1)) {
                    if (insideRange(this._state.selectedTrackIndex, 0, this._doc.project.song.tracks.length - 1)) {
                        const ticksPerBar: number = 1 * this._doc.project.song.beatsPerBar * this._doc.project.song.ppqn;

                        const pattern: Pattern.Type = this._doc.insertPattern();
                        const start: number = this._doc.timeCursor;
                        const end: number = start + ticksPerBar * 4;
                        const clip: Clip.Type = this._doc.insertClip(
                            this._state.selectedTrackIndex,
                            start,
                            end,
                            pattern.idLo,
                            pattern.idHi,
                            0,
                            null,
                        );
                        this._doc.timeCursor = clip.end;

                        // this._clearHoverState();
                        this._state.selectedClipsByTrackIndex.clear();
                        this._state.selectionOverlayIsDirty = true;

                        this._renderedClipsDirty = true;
                        this._ui.scheduleMainRender();

                        return ActionResponse.Done;
                    }
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.LeftStretchClip: {
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._findClipUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const clipIndex: number = this._hoverQueryResult.clipIndex;
                const clipTrackIndex: number = this._hoverQueryResult.clipTrackIndex;
                const clipHit: ClipHit = this._hoverQueryResult.clipHit;
                if (clipIndex === -1) {
                    return ActionResponse.NotApplicable;
                }

                if ((clipHit & ClipHit.Left) !== 0) {
                    const track: Track.Type = this._doc.project.song.tracks[clipTrackIndex];
                    const clip: Clip.Type = track.clips[clipIndex];

                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const cursorPpqn0: number = (this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)) | 0;

                    // this._clearHoverState();
                    this._state.selectedTrackIndex = clipTrackIndex;
                    this._state.selectedClipsByTrackIndex.clear();
                    this._state.selectionOverlayIsDirty = true;

                    this._activeOperation = new LeftStretchClip(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        new Map([[clip, {
                            newStart: clip.start,
                            newEnd: clip.end,
                            newSoundStartOffset: (
                                clip.kind === Clip.Kind.Sound && clip.soundClipData != null
                                ? clip.soundClipData.startOffset
                                : 0
                            ),
                            clipIndex: clipIndex,
                            clipTrackIndex: clipTrackIndex,
                        }]]),
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.RightStretchClip: {
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._findClipUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const clipIndex: number = this._hoverQueryResult.clipIndex;
                const clipTrackIndex: number = this._hoverQueryResult.clipTrackIndex;
                const clipHit: ClipHit = this._hoverQueryResult.clipHit;
                if (clipIndex === -1) {
                    return ActionResponse.NotApplicable;
                }

                if ((clipHit & ClipHit.Right) !== 0) {
                    const track: Track.Type = this._doc.project.song.tracks[clipTrackIndex];
                    const clip: Clip.Type = track.clips[clipIndex];

                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const cursorPpqn0: number = (this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)) | 0;

                    // this._clearHoverState();
                    this._state.selectedTrackIndex = clipTrackIndex;
                    this._state.selectedClipsByTrackIndex.clear();
                    this._state.selectionOverlayIsDirty = true;

                    this._activeOperation = new RightStretchClip(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        new Map([[clip, {
                            newStart: clip.start,
                            newEnd: clip.end,
                            newSoundStartOffset: (
                                clip.kind === Clip.Kind.Sound && clip.soundClipData != null
                                ? clip.soundClipData.startOffset
                                : 0
                            ),
                            clipIndex: clipIndex,
                            clipTrackIndex: clipTrackIndex,
                        }]]),
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.MoveClips: {
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._findClipUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const clipIndex: number = this._hoverQueryResult.clipIndex;
                const clipTrackIndex: number = this._hoverQueryResult.clipTrackIndex;
                const clipHit: ClipHit = this._hoverQueryResult.clipHit;
                if (clipIndex === -1) {
                    return ActionResponse.NotApplicable;
                }

                if (
                    (clipHit & ClipHit.Inside) !== 0
                    && (clipHit & ClipHit.Left) === 0
                    && (clipHit & ClipHit.Right) === 0
                ) {
                    const track: Track.Type = this._doc.project.song.tracks[clipTrackIndex];
                    const clip: Clip.Type = track.clips[clipIndex];

                    let clipBoundsX0: number = clip.start;
                    let clipBoundsX1: number = clip.end; // exclusive

                    const clipMap: Map<Clip.Type, ClipTransform> = new Map();

                    let clipToMoveWasSelected: boolean = false;

                    // @TODO: Move selected clips if one of them was clicked on.

                    if (!clipToMoveWasSelected) {
                        clipMap.set(clip, {
                            newStart: clip.start,
                            newEnd: clip.end,
                            newSoundStartOffset: (
                                clip.kind === Clip.Kind.Sound && clip.soundClipData != null
                                ? clip.soundClipData.startOffset
                                : 0
                            ),
                            clipIndex: clipIndex,
                            clipTrackIndex: clipTrackIndex,
                        });
                    }

                    const songDuration: number = this._doc.project.song.duration;

                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const cursorPpqn0: number = (
                        this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
                    ) | 0;
                    const timeDeltaMin: number = 0 - clipBoundsX0;
                    const timeDeltaMax: number = songDuration - clipBoundsX1;

                    // this._clearHoverState();
                    if (clipMap.size === 1) {
                        this._state.selectedTrackIndex = clipTrackIndex;
                    } else {
                        // @TODO: Select all the relevant tracks?
                    }
                    this._state.selectedClipsByTrackIndex.clear();
                    this._state.selectionOverlayIsDirty = true;

                    this._activeOperation = new MoveClips(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        clipMap,
                        timeDeltaMin,
                        timeDeltaMax,
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.SelectClip: {
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                const cursorPpqn: number = (
                    this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
                ) | 0;

                this._findClipUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const clipIndex: number = this._hoverQueryResult.clipIndex;
                const clipTrackIndex: number = this._hoverQueryResult.clipTrackIndex;
                const clipHit: ClipHit = this._hoverQueryResult.clipHit;
                if (clipIndex === -1) {
                    // @TODO: This will conflict with the box selection operation,
                    // so this should be removed once that's implemented.
                    const viewportY0: number = this._state.viewport.y0;
                    const lanes: Lane.Type[] = this._laneManager.getLanes();
                    const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
                    const laneCount: number = lanes.length;
                    const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);
                    let selectedATrack: boolean = false;
                    for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
                        const lane: Lane.Type = lanes[laneIndex];
                        const laneLayout: LaneLayout = laneLayouts[laneIndex];
                        const laneHeight: number = lane.height;
                        const kind: Lane.Kind = lane.kind;
                        const top: number = laneLayout.y0 - viewportY0 + 2;
                        const bottom: number = top + laneHeight - 2;
                        if (top > height) {
                            break;
                        }
                        if (kind === Lane.Kind.Track) {
                            const trackIndex: number = lane.trackIndex;
                            if (insideRange(mouseY, top, bottom)) {
                                this._state.selectedTrackIndex = trackIndex;
                                selectedATrack = true;
                                break;
                            }
                        }
                    }
                    if (selectedATrack) {
                        this._doc.timeCursor = cursorPpqn;
                        this._state.selectedClipsByTrackIndex.clear();
                        this._state.selectionOverlayIsDirty = true;

                        this._ui.scheduleMainRender();

                        return ActionResponse.Done;
                    }
                }

                if ((clipHit & ClipHit.Inside) !== 0) {
                    const track: Track.Type = this._doc.project.song.tracks[clipTrackIndex];
                    const clip: Clip.Type = track.clips[clipIndex];

                    this._doc.timeCursor = cursorPpqn;
                    this._state.selectedTrackIndex = clipTrackIndex;
                    this._state.selectedClipsByTrackIndex.clear();
                    this._state.selectedClipsByTrackIndex.set(clipTrackIndex, [clip]);
                    this._state.selectionOverlayIsDirty = true;

                    this._ui.scheduleMainRender();

                    return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.OpenPatternFromClip: {
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._findClipUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const clipIndex: number = this._hoverQueryResult.clipIndex;
                const clipTrackIndex: number = this._hoverQueryResult.clipTrackIndex;
                const clipHit: ClipHit = this._hoverQueryResult.clipHit;
                if (clipIndex === -1) {
                    return ActionResponse.NotApplicable;
                }

                if ((clipHit & ClipHit.Inside) !== 0) {
                    const track: Track.Type = this._doc.project.song.tracks[clipTrackIndex];
                    const clip: Clip.Type = track.clips[clipIndex];
                    if (clip.kind === Clip.Kind.Pattern) {
                        const patternsById: Uint64ToUint32Table.Type = this._doc.project.song.patternsById;
                        const patternTableIndex: number = Uint64ToUint32Table.getIndexFromKey(
                            patternsById,
                            clip.patternIdLo,
                            clip.patternIdHi,
                        );
                        if (patternTableIndex === -1) {
                            throw new Error("Couldn't find pattern index");
                        }
                        const patternIndex: number = Uint64ToUint32Table.getValueFromIndex(patternsById, patternTableIndex);
                        this._doc.setCurrentPattern(patternIndex, clipTrackIndex, clipIndex);

                        this._state.selectedTrackIndex = clipTrackIndex;
                        this._state.selectedClipsByTrackIndex.clear();
                        this._state.selectedClipsByTrackIndex.set(clipTrackIndex, [clip]);
                        this._state.selectionOverlayIsDirty = true;

                        this._ui.scheduleMainRender();

                        return ActionResponse.Done;
                    }
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.RemoveClip: {
                if (isKeyboardGesture(context.gesture1)) {
                    if (this._state.selectedClipsByTrackIndex.size > 0) {
                        for (const [clipTrackIndex, selectedClips] of this._state.selectedClipsByTrackIndex.entries()) {
                            this._doc.removeClips(clipTrackIndex, selectedClips);
                            // @TODO: Also remove the patterns if their ref count goes to 0?
                            // It's lossy compared to BeepBox but I have seen people complain
                            // about clutter (in the context of other audio programs).
                        }

                        // this._clearHoverState();
                        this._state.selectedClipsByTrackIndex.clear();
                        this._state.selectionOverlayIsDirty = true;

                        this._renderedClipsDirty = true;
                        this._ui.scheduleMainRender();

                        return ActionResponse.Done;
                    }
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.TimelineZoomInAroundMouseHorizontally: {
                // To not conflict with the outliner scrolling.
                if (
                    !mouseIsInside(context, this._canvasesContainer)
                    && !mouseIsInside(context, this._timeRuler.element)
                ) {
                    return ActionResponse.NotApplicable;
                }

                // const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                // const width: number = bounds.width;
                // const height: number = bounds.height;
                // const mouseX: number = context.x1 - bounds.left;
                // const mouseY: number = context.y1 - bounds.top;
                // this._computeHoverState(width, height, mouseX, mouseY);
                // if (this._hoverStateChanged()) {
                //     this._state.selectionOverlayIsDirty = true;
                //     this._ui.scheduleMainRender();
                // }

                this._zoomAroundMouseHorizontally(/* zoomIn */ true, context.x1);

                return ActionResponse.Done;
            };
            case ActionKind.TimelineZoomOutAroundMouseHorizontally: {
                // To not conflict with the outliner scrolling.
                if (
                    !mouseIsInside(context, this._canvasesContainer)
                    && !mouseIsInside(context, this._timeRuler.element)
                ) {
                    return ActionResponse.NotApplicable;
                }

                // const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                // const width: number = bounds.width;
                // const height: number = bounds.height;
                // const mouseX: number = context.x1 - bounds.left;
                // const mouseY: number = context.y1 - bounds.top;
                // this._computeHoverState(width, height, mouseX, mouseY);
                // if (this._hoverStateChanged()) {
                //     this._state.selectionOverlayIsDirty = true;
                //     this._ui.scheduleMainRender();
                // }

                this._zoomAroundMouseHorizontally(/* zoomIn */ false, context.x1);

                return ActionResponse.Done;
            };
            case ActionKind.TimelineSeek: {
                if (mouseStartedInside(context, this._timeRuler.element)) {
                    const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                    const width: number = bounds.width;
                    const mouseX: number = context.x1 - bounds.left;

                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const cursorPpqn: number = (
                        this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
                    ) | 0;

                    const duration: number = this._doc.project.song.duration;
                    this._doc.timeCursor = clamp(cursorPpqn, 0, duration);
                    this._doc.seek(this._doc.timeCursor);
                    this._state.selectionOverlayIsDirty = true;

                    this._ui.scheduleMainRender();

                    return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.ToggleTempoEnvelope: {
                this._doc.toggleTempoEnvelope();
                this._ui.scheduleMainRender();
                return ActionResponse.Done;
            };
            case ActionKind.CreateTempoEnvelopePoint: {
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                const viewportX0: number = this._state.viewport.x0;
                const viewportX1: number = this._state.viewport.x1;
                const viewportWidth: number = viewportX1 - viewportX0;
                const pixelsPerTick: number = width / viewportWidth;
                const viewportY0: number = this._state.viewport.y0;
                // const viewportY1: number = this._state.viewport.y1;
                // const viewportHeight: number = viewportY1 - viewportY0;

                // @TODO: Consider only creating an interpolated point if we're
                // clicking on a line segment? That way, this wouldn't conflict
                // with a box selection that started on this lane.

                // @TODO: Move this hit testing to another file and generalize
                // so the code can be reused in more places, similarly to how
                // it was done for the piano roll.

                let mouseIsInsideTempoAutomationLane: boolean = false;
                let tempoAutomationLaneIndex: number = -1;
                let laneY0: number = 0;
                let laneY1: number = 0;

                const lanes: Lane.Type[] = this._laneManager.getLanes();
                const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
                const laneCount: number = lanes.length;
                // @TODO: This could start searching closer to where  we clicked,
                // but it's fine for now to search a bit more.
                const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);
                for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
                    const lane: Lane.Type = lanes[laneIndex];
                    const laneLayout: LaneLayout = laneLayouts[laneIndex];
                    const laneHeight: number = lane.height;
                    const kind: Lane.Kind = lane.kind;
                    const top: number = laneLayout.y0 - viewportY0 + 2;
                    const bottom: number = top + laneHeight - 2;
                    if (top > height) {
                        break;
                    }
                    if (kind === Lane.Kind.TempoAutomation) {
                        if (insideRange(mouseY, top, bottom)) {
                            mouseIsInsideTempoAutomationLane = true;
                            tempoAutomationLaneIndex = laneIndex;
                            laneY0 = top;
                            laneY1 = bottom;
                            break;
                        }
                    }
                }

                if (mouseIsInsideTempoAutomationLane) {
                    const tempoEnvelope: Breakpoint.Type[] | null = this._doc.project.song.tempoEnvelope;

                    // In order to have this not interfere with the other actions,
                    // here I test to see if the mouse is over an existing point.
                    // If it is, then we really want to either move that or remove it.
                    const pointCount: number = tempoEnvelope != null ? tempoEnvelope.length : 0;
                    const r: number = this._state.tempoEnvelopePointSize;

                    let overlappingPointIndex: number = -1;
                    // @TODO: Use binary search here.
                    for (let pointIndex: number = pointCount - 1; pointIndex >= 0; pointIndex--) {
                        const point: Breakpoint.Type = tempoEnvelope![pointIndex];
                        const tempo: number = point.value;
                        const tempoTime: number = point.time;
                        const x = (tempoTime - viewportX0) * pixelsPerTick;
                        const y = remap(
                            clamp(tempo, Constants.TempoMin, Constants.TempoMax),
                            Constants.TempoMin,
                            Constants.TempoMax,
                            laneY1,
                            laneY0
                        );
                        const distanceX: number = mouseX - x;
                        const distanceY: number = mouseY - y;
                        const distanceSquared: number = distanceX * distanceX + distanceY * distanceY;
                        if (distanceSquared < r * r) {
                            overlappingPointIndex = pointIndex;
                            break;
                        }
                    }

                    if (overlappingPointIndex !== -1) {
                        return ActionResponse.NotApplicable;
                    }

                    const duration: number = this._doc.project.song.duration;
                    const cursorPpqn: number = Math.round(this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth));
                    const time: number = clamp(cursorPpqn, 0, duration);
                    const existingTempoIndex: number = Breakpoint.findIndex(tempoEnvelope, time);
                    const value: number = (
                        existingTempoIndex !== -1
                        ? Breakpoint.evaluateTempoEnvelope(tempoEnvelope!, time, existingTempoIndex, 1)
                        : Constants.TempoDefault
                    );

                    // Creating and starting a move operation:
                    const newPoint: Breakpoint.Type = this._doc.insertTempoEnvelopePoint(time, value);
                    const newPointIndex: number = this._doc.project.song.tempoEnvelope!.indexOf(newPoint);
                    if (newPointIndex === -1) {
                        throw new Error("New point wasn't found in the volume envelope?");
                    }
                    const cursorPpqn0: number = this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth);
                    const cursorY: number = mouseY;
                    this._activeOperation = new MoveTempoEnvelopePointBounded(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        cursorY,
                        newPointIndex,
                        tempoAutomationLaneIndex,
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);
                    return ActionResponse.StartedOperation;

                    // Creating without starting a move operation:
                    // this._doc.insertTempoEnvelopePoint(time, value);
                    // this._state.envelopesAreDirty = true;
                    // this._state.tempoEnvelopeIsDirty = true;
                    // // Note that we should re-render the clips too because this
                    // // might change the peaks of an audio clip visually.
                    // this._renderedClipsDirty = true;
                    // this._state.selectedClipsByTrackIndex.clear();
                    // this._state.selectionOverlayIsDirty = true;
                    // this._ui.scheduleMainRender();
                    // return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.RemoveTempoEnvelopePoint: {
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                const viewportX0: number = this._state.viewport.x0;
                const viewportX1: number = this._state.viewport.x1;
                const viewportWidth: number = viewportX1 - viewportX0;
                const pixelsPerTick: number = width / viewportWidth;
                const viewportY0: number = this._state.viewport.y0;

                let mouseIsInsideTempoAutomationLane: boolean = false;
                let laneY0: number = 0;
                let laneY1: number = 0;

                const lanes: Lane.Type[] = this._laneManager.getLanes();
                const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
                const laneCount: number = lanes.length;
                // @TODO: This could start searching closer to where  we clicked,
                // but it's fine for now to search a bit more.
                const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);
                for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
                    const lane: Lane.Type = lanes[laneIndex];
                    const laneLayout: LaneLayout = laneLayouts[laneIndex];
                    const laneHeight: number = lane.height;
                    const kind: Lane.Kind = lane.kind;
                    const top: number = laneLayout.y0 - viewportY0 + 2;
                    const bottom: number = top + laneHeight - 2;
                    if (top > height) {
                        break;
                    }
                    if (kind === Lane.Kind.TempoAutomation) {
                        if (insideRange(mouseY, top, bottom)) {
                            mouseIsInsideTempoAutomationLane = true;
                            laneY0 = top;
                            laneY1 = bottom;
                            break;
                        }
                    }
                }

                if (mouseIsInsideTempoAutomationLane) {
                    const tempoEnvelope: Breakpoint.Type[] | null = this._doc.project.song.tempoEnvelope;
                    const pointCount: number = tempoEnvelope != null ? tempoEnvelope.length : 0;
                    const r: number = this._state.tempoEnvelopePointSize;

                    let overlappingPointIndex: number = -1;
                    // @TODO: Use binary search here.
                    for (let pointIndex: number = pointCount - 1; pointIndex >= 0; pointIndex--) {
                        const point: Breakpoint.Type = tempoEnvelope![pointIndex];
                        const tempo: number = point.value;
                        const tempoTime: number = point.time;
                        const x = (tempoTime - viewportX0) * pixelsPerTick;
                        const y = remap(
                            clamp(tempo, Constants.TempoMin, Constants.TempoMax),
                            Constants.TempoMin,
                            Constants.TempoMax,
                            laneY1,
                            laneY0
                        );
                        const distanceX: number = mouseX - x;
                        const distanceY: number = mouseY - y;
                        const distanceSquared: number = distanceX * distanceX + distanceY * distanceY;
                        if (distanceSquared < r * r) {
                            overlappingPointIndex = pointIndex;
                            break;
                        }
                    }

                    if (overlappingPointIndex === -1) {
                        return ActionResponse.NotApplicable;
                    }

                    this._doc.removeTempoEnvelopePoint(overlappingPointIndex);

                    this._state.envelopesAreDirty = true;
                    this._state.tempoEnvelopeIsDirty = true;
                    // Note that we should re-render the clips too because this
                    // might change the peaks of an audio clip visually.
                    this._renderedClipsDirty = true;
                    this._state.selectedClipsByTrackIndex.clear();
                    this._state.selectionOverlayIsDirty = true;

                    this._ui.scheduleMainRender();

                    return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.MoveTempoEnvelopePointBounded: {
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                const viewportX0: number = this._state.viewport.x0;
                const viewportX1: number = this._state.viewport.x1;
                const viewportWidth: number = viewportX1 - viewportX0;
                const pixelsPerTick: number = width / viewportWidth;
                const viewportY0: number = this._state.viewport.y0;
                // const viewportY1: number = this._state.viewport.y1;
                // const viewportHeight: number = viewportY1 - viewportY0;

                let mouseIsInsideTempoAutomationLane: boolean = false;
                let tempoAutomationLaneIndex: number = -1;
                let laneY0: number = 0;
                let laneY1: number = 0;

                const lanes: Lane.Type[] = this._laneManager.getLanes();
                const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
                const laneCount: number = lanes.length;
                // @TODO: This could start searching closer to where  we clicked,
                // but it's fine for now to search a bit more.
                const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);
                for (let laneIndex: number = firstLaneIndex; laneIndex < laneCount; laneIndex++) {
                    const lane: Lane.Type = lanes[laneIndex];
                    const laneLayout: LaneLayout = laneLayouts[laneIndex];
                    const laneHeight: number = lane.height;
                    const kind: Lane.Kind = lane.kind;
                    const top: number = laneLayout.y0 - viewportY0 + 2;
                    const bottom: number = top + laneHeight - 2;
                    if (top > height) {
                        break;
                    }
                    if (kind === Lane.Kind.TempoAutomation) {
                        if (insideRange(mouseY, top, bottom)) {
                            mouseIsInsideTempoAutomationLane = true;
                            tempoAutomationLaneIndex = laneIndex;
                            laneY0 = top;
                            laneY1 = bottom;
                            break;
                        }
                    }
                }

                if (mouseIsInsideTempoAutomationLane) {
                    const tempoEnvelope: Breakpoint.Type[] | null = this._doc.project.song.tempoEnvelope;

                    // In order to have this not interfere with the other actions,
                    // here I test to see if the mouse is over an existing point.
                    // If it is, then we really want to either move that or remove it.
                    const pointCount: number = tempoEnvelope != null ? tempoEnvelope.length : 0;
                    const r: number = this._state.tempoEnvelopePointSize;

                    let overlappingPointIndex: number = -1;
                    // @TODO: Use binary search here.
                    for (let pointIndex: number = pointCount - 1; pointIndex >= 0; pointIndex--) {
                        const point: Breakpoint.Type = tempoEnvelope![pointIndex];
                        const tempo: number = point.value;
                        const tempoTime: number = point.time;
                        const x = (tempoTime - viewportX0) * pixelsPerTick;
                        const y = remap(
                            clamp(tempo, Constants.TempoMin, Constants.TempoMax),
                            Constants.TempoMin,
                            Constants.TempoMax,
                            laneY1,
                            laneY0
                        );
                        const distanceX: number = mouseX - x;
                        const distanceY: number = mouseY - y;
                        const distanceSquared: number = distanceX * distanceX + distanceY * distanceY;
                        if (distanceSquared < r * r) {
                            overlappingPointIndex = pointIndex;
                            break;
                        }
                    }

                    if (overlappingPointIndex === -1) {
                        return ActionResponse.NotApplicable;
                    }

                    const cursorPpqn0: number = this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth);
                    const cursorY: number = mouseY;
                    this._activeOperation = new MoveTempoEnvelopePointBounded(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        cursorY,
                        overlappingPointIndex,
                        tempoAutomationLaneIndex,
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);
                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
        }

        return ActionResponse.NotApplicable;
    };

    private _onUpdateOperation = (context: OperationContext): OperationResponse => {
        if (this._activeOperation == null) {
            return OperationResponse.Aborted;
        }

        let response: OperationResponse = OperationResponse.Aborted;
        response = this._activeOperation.update(context);

        // @TODO: Invalidate precisely.
        if (this._activeOperation.kind === OperationKind.Clip) {
            this._renderedClipsDirty = true;
        }
        this._state.selectionOverlayIsDirty = true;

        if (response === OperationResponse.Done || response === OperationResponse.Aborted) {
            // @TODO: Call _computeHoverState here.
            this._activeOperation = null;
        }

        this._ui.scheduleMainRender();

        return response;
    };

    private _onProjectChanged = (): void => {
        // @TODO: Invalidate precisely.
        this._renderedClipsDirty = true;
        this._state.selectionOverlayIsDirty = true;
        this._state.envelopesAreDirty = true;
        this._state.tempoEnvelopeIsDirty = true;
    };

    private _onSeekAndMoveTimeCursor = (): void => {
        // @TODO: Scroll if time cursor isn't in view?
        this._state.selectionOverlayIsDirty = true;
    };
}

const enum ClipHit {
    None   = 0b0000,
    Inside = 0b0001,
    Left   = 0b0010,
    Right  = 0b0100,
}

interface HoverQueryResult {
    clipIndex: number;
    clipTrackIndex: number;
    clipHit: ClipHit;
}
