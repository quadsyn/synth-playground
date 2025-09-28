import { H } from "@synth-playground/browser/dom.js";
import { SongDocument } from "../../SongDocument.js";
import { type PatternInfo } from "../../data/PatternInfo.js";
import { NotePitchBoundsTracker } from "../../data/NotePitchBoundsTracker.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import { unlerp, remap, clamp, insideRange } from "@synth-playground/common/math.js";
import * as IITree from "@synth-playground/common/iitree.js";
import * as Uint64ToUint32Table from "@synth-playground/common/hash/table/Uint64ToUint32Table.js";
import { StretchyScrollBar } from "../stretchyScrollBar/StretchyScrollBar.js";
import * as Constants from "@synth-playground/synthesizer/data/Constants.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Song from "@synth-playground/synthesizer/data/Song.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import * as Track from "@synth-playground/synthesizer/data/Track.js";
import * as Project from "@synth-playground/synthesizer/data/Project.js";
import { ActionKind, ActionResponse } from "../input/actions.js";
import { type OperationContext } from "../input/operations.js";
import * as Viewport from "../common/Viewport.js";
import * as Lane from "./Lane.js";
import { type LaneLayout } from "./LaneLayout.js";
import { TimeRuler } from "./TimeRuler.js";
import { TrackOutliner } from "./TrackOutliner.js";
import { LaneManager } from "./LaneManager.js";

export class Timeline implements Component {
    public element: HTMLDivElement;

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
    private _viewport: Viewport.Type;
    private _hoveredClipIndex: number;
    private _hoveredClipTrackIndex: number;
    private _selectedClipIndex: number;
    private _selectedClipTrackIndex: number;
    private _movingClip: boolean;
    private _movingStartOfClip: boolean;
    private _movingEndOfClip: boolean;
    private _clipStretchHandleSize: number; // In pixels.
    private _hoveringOverStartOfClip: boolean;
    private _hoveringOverEndOfClip: boolean;
    private _pointerIsDown: boolean;
    private _pointerX0: number;
    // private _pointerY0: number;
    private _tentativeClipStart: number;
    private _tentativeClipEnd: number;
    private _playhead: number;
    private _playheadIsVisible: boolean;

    private _renderedEnvelopesDirty: boolean;
    private _renderedClipsDirty: boolean;
    private _renderedSelectionOverlayDirty: boolean;
    private _renderedViewport: Viewport.Type | null;
    private _renderedPlayhead: number | null;
    private _renderedPlayheadIsVisible: boolean;
    private _tempoEnvelopeIsDirty: boolean;

    constructor(
        ui: UIContext,
        doc: SongDocument,
    ) {
        this._ui = ui;

        this._mounted = false;

        this._doc = doc;
        const song: Song.Type = this._doc.project.song;

        this._doc.onProjectChanged.addListener(this._onProjectChanged);

        this._laneManager = new LaneManager(
            this._ui,
            this._doc,
        );

        this._width = 600;
        this._height = 500;

        const beatsPerBar: number = song.beatsPerBar;
        const ppqn: number = song.ppqn;
        const songDuration: number = song.duration;

        this._viewport = Viewport.make(
            /* x0 */ 0,
            /* y0 */ 0,
            /* x1 */ beatsPerBar * ppqn,
            /* y1 */ 0,
            /* minWidth */ 1,
            /* maxWidth */ Math.max(1, songDuration),
            /* minHeight */ 0,
            /* maxHeight */ 0,
        );

        this._hoveredClipIndex = -1;
        this._hoveredClipTrackIndex = -1;
        this._selectedClipIndex = -1;
        this._selectedClipTrackIndex = -1;
        this._movingClip = false;
        this._movingStartOfClip = false;
        this._movingEndOfClip = false;
        this._clipStretchHandleSize = 4;
        this._hoveringOverStartOfClip = false;
        this._hoveringOverEndOfClip = false;

        this._playhead = 0;
        this._playheadIsVisible = false;
        this._renderedPlayhead = null;
        this._renderedPlayheadIsVisible = false;

        this._tempoEnvelopeIsDirty = true;

        this._pointerIsDown = false;
        this._pointerX0 = 0;
        // this._pointerY0 = 0;
        this._tentativeClipStart = 0;
        this._tentativeClipEnd = 0;

        this._renderedEnvelopesDirty = true;
        this._renderedClipsDirty = true;
        this._renderedSelectionOverlayDirty = true;
        this._renderedViewport = null;

        const initialTrackZoom: number = 1;
        const initialTrackPan: number = 0;

        this._timeScrollBar = new StretchyScrollBar(
            this._ui,
            /* vertical */ false,
            /* flip */ false,
            /* initialLongSideSize */ this._width,
            Viewport.getXZoom(this._viewport),
            Viewport.getXPan(this._viewport),
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
            this._viewport.x0,
            this._viewport.x1,
            this._doc.project.song.ppqn,
            this._doc.project.song.beatsPerBar,
        );
        this._trackOutliner = new TrackOutliner(
            this._ui,
            this._doc,
            this._laneManager,
            /* size */ 250,
            /* initialHeight */ this._height,
            this._viewport.y0,
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

        this._canvasesContainer.addEventListener("mousedown", this._onPointerDown);
        window.addEventListener("mousemove", this._onPointerMove);
        window.addEventListener("mouseup", this._onPointerUp);
        this._canvasesContainer.addEventListener("dblclick", this._onDoubleClick);
        this._canvasesContainer.addEventListener("wheel", this._onWheel);
    }

    public dispose(): void {
        this._doc.onProjectChanged.removeListener(this._onProjectChanged);
        this._canvasesContainer.removeEventListener("mousedown", this._onPointerDown);
        window.removeEventListener("mousemove", this._onPointerMove);
        window.removeEventListener("mouseup", this._onPointerUp);
        this._canvasesContainer.removeEventListener("dblclick", this._onDoubleClick);
        this._canvasesContainer.removeEventListener("wheel", this._onWheel);

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
                && insideRange(this._playhead, this._viewport.x0, this._viewport.x1)
            );
        } else {
            this._playhead = 0;
            this._playheadIsVisible = false;
        }

        this._renderGrid();
        this._renderClips();
        this._renderEnvelopes();
        this._renderSelectionOverlay();
        this._renderPlayhead();
        this._timeScrollBar.render();
        this._trackScrollBar.render();
        this._timeRuler.setViewport(this._viewport);
        this._timeRuler.setPpqn(this._doc.project.song.ppqn);
        this._timeRuler.setBeatsPerBar(this._doc.project.song.beatsPerBar);
        this._timeRuler.setTempoEnvelope(this._doc.project.song.tempoEnvelope);
        this._timeRuler.setTempoEnvelopeIsDirty(this._tempoEnvelopeIsDirty);
        this._timeRuler.render();
        this._trackOutliner.setViewport(this._viewport);
        this._trackOutliner.render();

        this._renderedClipsDirty = false;
        this._renderedSelectionOverlayDirty = false;
        this._renderedViewport = Viewport.updateRendered(this._renderedViewport, this._viewport);
        this._renderedPlayhead = this._playhead;
        this._renderedPlayheadIsVisible = this._playheadIsVisible;
        this._renderedEnvelopesDirty = false;
        this._tempoEnvelopeIsDirty = false;
    }

    private _renderGrid(): void {
        if (
            !Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.Both)
            && !this._gridCanvasResized
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
        const viewportX0: number = this._viewport.x0;
        const viewportX1: number = this._viewport.x1;
        const viewportY0: number = this._viewport.y0;
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
            && !Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.Both)
            && !this._clipsCanvasResized
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
        const viewportX0: number = this._viewport.x0;
        const viewportX1: number = this._viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const viewportY0: number = this._viewport.y0;
        const selectedClipIndex: number = this._selectedClipIndex;
        const selectedClipTrackIndex: number = this._selectedClipTrackIndex;
        const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);

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
                        if (index === selectedClipIndex && trackIndex === selectedClipTrackIndex) return;
                        this._renderClip(
                            context,
                            clip,
                            clip.start,
                            clip.end,
                            viewportX0,
                            viewportY0,
                            pixelsPerTick,
                            top,
                            laneHeight,
                        );
                    },
                );
                if (selectedClipIndex !== -1 && trackIndex === selectedClipTrackIndex) {
                    this._renderClip(
                        context,
                        tracks[selectedClipTrackIndex].clips[selectedClipIndex],
                        this._tentativeClipStart,
                        this._tentativeClipEnd,
                        viewportX0,
                        viewportY0,
                        pixelsPerTick,
                        top,
                        laneHeight,
                    );
                }
            }
        }
    }

    public _renderClip(
        context: CanvasRenderingContext2D,
        clip: Clip.Type,
        start: number,
        end: number,
        viewportX0: number,
        viewportY0: number,
        pixelsPerTick: number,
        trackTop: number,
        trackHeight: number,
    ): void {
        const headerHeight: number = 14;
        const bodyHeight: number = (trackHeight - 1) - headerHeight;
        const x0: number = ((start - viewportX0) * pixelsPerTick);
        const x1: number = ((end - viewportX0) * pixelsPerTick);
        const w: number = Math.max(1, x1 - x0);
        const x: number = x0;
        const y: number = trackTop - 1;
        const h: number = headerHeight + bodyHeight;

        // Draw clip background.
        // context.fillStyle = "#3090d0";
        context.fillStyle = "#0c6735";
        context.strokeStyle = "#000000";
        context.lineWidth = 1;
        context.fillRect(x, y, w, h);

        // Draw clip title.
        context.fillStyle = "#ffffff";
        context.font = "8pt sans-serif";
        context.textBaseline = "top";
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
        const pattern: Pattern.Type = this._doc.project.song.patterns[patternIndex];
        // @TODO: Maybe use the ID instead. Although this probably should just
        // be an user-defined name.
        const title: string = `Pattern ${patternIndex}`;
        const titleLength: number = title.length;
        // Actually measuring this is too slow, so I'll just pretend this is
        // monospace. In this case there's no problem, we'll just start moving
        // the text back earlier.
        // @TODO: A remaining problem with this is that it will be incorrect for
        // fonts that are wider than they are tall. I could maybe try doing some
        // measuring for it first, trying to figure out if a larger width factor
        // would help.
        const titleWidthEstimate: number = titleLength * 8;
        const titleGapX: number = 2;
        const titleMinX: number = titleGapX;
        const titleMaxX: number = x + w - titleWidthEstimate;
        const titleX: number = Math.min(Math.max(titleMinX, x + titleGapX), titleMaxX);
        if (w > titleWidthEstimate + titleGapX) {
            context.fillText(title, titleX, y + 2);
        }

        if (w >= 4) {
            const notes: Note.Type[] = pattern.notes;
            const noteCount: number = notes.length;
            // @TODO: Loops
            // @TODO: startOffset
            if (noteCount > 0) {
                const patternInfo: PatternInfo = this._doc.patternInfoCache.get(pattern)!;
                const pitchBounds: NotePitchBoundsTracker = patternInfo.pitchBounds;
                const minPosition: number = 0;
                const maxPosition: number = minPosition + end - start;
                let minNotePitch: number = pitchBounds.getMin() - 1;
                let maxNotePitch: number = pitchBounds.getMax();

                // Prevent huge notes in the pattern preview.
                const minPitchCount: number = 12; // @TODO: Use pitchesPerOctave here
                const diff: number = Math.max(0, (minPitchCount + 1) - (maxNotePitch - minNotePitch));
                const halfDiff: number = diff >>> 1;
                minNotePitch -= halfDiff;
                maxNotePitch += halfDiff;
                const noteH: number = bodyHeight / (maxNotePitch - minNotePitch);
                context.fillStyle = "#17d15b";
                for (let noteIndex: number = 0; noteIndex < noteCount; noteIndex++) {
                    const note: Note.Type = notes[noteIndex];
                    const noteStart: number = note.start;
                    const noteEnd: number = note.end;
                    const notePitch: number = note.pitch;
                    const noteX0: number = clamp(remap(noteStart, 0, maxPosition, 0, w), 0, w - 1);
                    const noteX1: number = clamp(remap(noteEnd, 0, maxPosition, 0, w), 0, w - 1);
                    const noteX: number = x + noteX0;
                    const noteW: number = noteX1 - noteX0;
                    const noteY: number = y + headerHeight + remap(notePitch, minNotePitch, maxNotePitch, bodyHeight - 4, 2);
                    context.fillRect(noteX, noteY, noteW, noteH);
                }
            }
            context.strokeRect(x, y, w, h);
        }
    }

    private _renderEnvelopes(): void {
        if (
            !this._renderedEnvelopesDirty
            && !Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.Both)
            && !this._envelopesCanvasResized
        ) {
            return;
        }

        if (this._envelopesCanvasResized) {
            this._envelopesCanvasResized = false;
            this._envelopesCanvas.width = this._width;
            this._envelopesCanvas.height = this._height;
        }

        const song: Song.Type = this._doc.project.song;
        const tempoEnvelope: Breakpoint.Type[] | null = song.tempoEnvelope;
        const lanes: Lane.Type[] = this._laneManager.getLanes();
        const laneLayouts: LaneLayout[] = this._laneManager.getLaneLayouts();
        const laneCount: number = lanes.length;
        // const lanesVersion: number = this._laneManager.getLanesVersion();
        // const canvas: HTMLCanvasElement = this._envelopesCanvas;
        const context: CanvasRenderingContext2D = this._envelopesContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._viewport.x0;
        const viewportX1: number = this._viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const viewportY0: number = this._viewport.y0;
        const firstLaneIndex: number = this._laneManager.findFirstVisibleLaneIndex(viewportY0);

        context.clearRect(0, 0, width, height);

        // context.strokeStyle = "#4090ca";
        context.strokeStyle = "#17d15b";
        context.lineWidth = 2;

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
                    context.beginPath();
                    const startIndex: number = Math.min(pointCount - 1, Breakpoint.findIndex(tempoEnvelope, viewportX0));
                    let prevY: number = 0;
                    {
                        const pointIndex: number = startIndex <= 0 ? 0 : startIndex - 1;
                        const point: Breakpoint.Type = tempoEnvelope[pointIndex];
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
                }
            }
        }
    }

    private _renderSelectionOverlay(): void {
        if (
            !this._renderedSelectionOverlayDirty
            && !Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.Both)
            && !this._selectionOverlayCanvasResized
        ) {
            return;
        }

        if (this._selectionOverlayCanvasResized) {
            this._selectionOverlayCanvasResized = false;
            this._selectionOverlayCanvas.width = this._width;
            this._selectionOverlayCanvas.height = this._height;
        }

        // const canvas: HTMLCanvasElement = this._selectionOverlayCanvas;
        const context: CanvasRenderingContext2D = this._selectionOverlayContext;
        const width: number = this._width;
        const height: number = this._height;
        // const viewportX0: number = this._viewport.x0;
        // const viewportX1: number = this._viewport.x1;
        // const viewportWidth: number = viewportX1 - viewportX0;
        // const pixelsPerTick: number = width / viewportWidth;
        // const ticksPerPixel: number = viewportWidth / width;
        // const viewportY0: number = this._viewport.y0;
        // const hoveredClipIndex: number = this._hoveredClipIndex;

        context.clearRect(0, 0, width, height);

        // if (this._selectedClipIndex !== -1) return;
        // if (hoveredClipIndex === -1) return;

        context.fillStyle = "rgba(255, 255, 255, 0.8)";
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2;

        // const hoveredClipTrackIndex: number = this._hoveredClipTrackIndex;
        // const project: Project = this._doc.project;
        // const song: Song = project.song;
        // const tracks: Track[] = song.tracks;
        // const clips: Clip[] = tracks[hoveredClipTrackIndex].clips;

        // {
        //     const clipIndex: number = hoveredClipIndex;
        //     const clip: Clip = clips[clipIndex];
        //     const x0: number = ((clip.start - viewportX0) * pixelsPerTick);
        //     const x1: number = ((clip.end - viewportX0) * pixelsPerTick);
        //     let w: number = x1 - x0;
        //     if (w <= 1) w = 1;
        //     const x: number = x0;
        //     const y: number = ((hoveredClipTrackIndex - viewportY0) * trackHeight);
        //     const h: number = trackHeight;
        //     if (this._hoveringOverStartOfClip) {
        //         const hX0: number = x0;
        //         const hX1: number = x0 + this._clipStretchHandleSize;
        //         const hX: number = hX0;
        //         let hW: number = hX1 - hX0;
        //         if (hW <= 1) hW = 1;
        //         context.fillRect(hX, y, hW, h);
        //     } else if (this._hoveringOverEndOfClip) {
        //         const hX0: number = x1 - this._clipStretchHandleSize;
        //         const hX1: number = x1;
        //         const hX: number = hX0;
        //         let hW: number = hX1 - hX0;
        //         if (hW <= 1) hW = 1;
        //         context.fillRect(hX, y, hW, h);
        //     } else {
        //         context.strokeRect(x + 0.5, y + 0.5, w, h);
        //     }
        // }
    }

    private _renderPlayhead(): void {
        if (
            this._renderedPlayheadIsVisible === this._playheadIsVisible
            && this._renderedPlayhead === this._playhead
            && !Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.Both)
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
        // const ppqn: number = song.ppqn;
        // const beatsPerBar: number = song.beatsPerBar;
        // const canvas: HTMLCanvasElement = this._playheadOverlayCanvas;
        const context: CanvasRenderingContext2D = this._playheadOverlayContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._viewport.x0;
        const viewportX1: number = this._viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        // const pixelsPerBeat: number = pixelsPerTick * ppqn;
        // const ticksPerPixel: number = viewportWidth / width;
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
            this._viewport,
            oldWidth,
            oldHeight,
            newClipAreaWidth,
            newClipAreaHeight,
            lanesTotalHeight,
        );
        this._timeScrollBar.setZoom(Viewport.getXZoom(this._viewport));
        this._timeScrollBar.setPan(Viewport.getXPan(this._viewport));
        this._trackScrollBar.setZoom(Viewport.computeYZoomWithUnzoomableY(newClipAreaHeight, lanesTotalHeight));
        this._trackScrollBar.setPan(Viewport.getYPanWithUnzoomableY(this._viewport, newClipAreaHeight, lanesTotalHeight));

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
        this._renderedSelectionOverlayDirty = true;
        Viewport.clearRendered(this._renderedViewport);

        this._ui.scheduleMainRender();
    }

    private _onDidMount(): void {
        this._mounted = true;
    }

    private _onTimeScrollBarChange = (zoom: number, pan: number): void => {
        Viewport.zoomAndPanX(this._viewport, zoom, pan);
        this._ui.scheduleMainRender();
    };

    private _onTrackScrollBarChange = (zoom: number, pan: number): void => {
        Viewport.panYWithUnzoomableY(this._viewport, this._height, this._laneManager.getTotalHeight(), pan);
        this._ui.scheduleMainRender();
    };

    private _onPointerDown = (event: MouseEvent): void => {
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const width: number = bounds.width;
        // const height: number = bounds.height;
        const mouseX: number = event.clientX - bounds.left;
        // const mouseY: number = event.clientY - bounds.top;

        this._pointerX0 = mouseX;
        // this._pointerY0 = mouseY;

        if (this._hoveredClipIndex !== -1) {
            this._selectedClipIndex = this._hoveredClipIndex;
            this._selectedClipTrackIndex = this._hoveredClipTrackIndex;

            this._hoveredClipIndex = -1;
            this._hoveredClipTrackIndex = -1;

            const project: Project.Type = this._doc.project;
            const song: Song.Type = project.song;
            const tracks: Track.Type[] = song.tracks;
            const clips: Clip.Type[] = tracks[this._selectedClipTrackIndex].clips;
            const clip: Clip.Type = clips[this._selectedClipIndex];

            const viewportWidth: number = this._viewport.x1 - this._viewport.x0;
            // const viewportHeight: number = this._viewportY1 - this._viewportY0;

            const cursorPpqn0: number = (
                this._viewport.x0 + remap(this._pointerX0, 0, width, 0, viewportWidth)
            ) | 0;
            const cursorPpqn1: number = (
                this._viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
            ) | 0;

            if (this._hoveringOverStartOfClip) {
                const cursorPpqnDeltaMin: number = 0 - clip.start;
                const cursorPpqnDeltaMax: number = ((clip.end - 1) - clip.start);
                const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                this._movingStartOfClip = true;
                this._tentativeClipStart = clip.start + cursorPpqnDelta;
                this._tentativeClipEnd = clip.end;
            } else if (this._hoveringOverEndOfClip) {
                const cursorPpqnDeltaMin: number = 0 - clip.start;
                const cursorPpqnDeltaMax: number = song.duration - clip.end;
                const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                this._movingEndOfClip = true;
                this._tentativeClipStart = clip.start;
                this._tentativeClipEnd = clip.end + cursorPpqnDelta;
            } else {
                const cursorPpqnDeltaMin: number = 0 - clip.start;
                const cursorPpqnDeltaMax: number = song.duration - clip.end;
                const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                this._movingClip = true;
                this._tentativeClipStart = clip.start + cursorPpqnDelta;
                this._tentativeClipEnd = clip.end + cursorPpqnDelta;
            }
            this._hoveringOverStartOfClip = false;
            this._hoveringOverEndOfClip = false;

            this._renderedClipsDirty = true;
            this._renderedSelectionOverlayDirty = true;
        }

        this._pointerIsDown = true;

        this._ui.scheduleMainRender();
    };

    private _onPointerUp = (event: MouseEvent): void => {
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const width: number = bounds.width;
        const height: number = bounds.height;
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        if (this._selectedClipIndex !== -1) {
            // @TODO: Skip committing if the clip properties didn't change.

            const project: Project.Type = this._doc.project;
            const song: Song.Type = project.song;
            const tracks: Track.Type[] = song.tracks;
            const clipIndex: number = this._selectedClipIndex;
            const clip: Clip.Type = tracks[this._selectedClipTrackIndex].clips[clipIndex];
            let newStart: number = clip.start;
            let newEnd: number = clip.end;
            let oldTrackIndex: number = this._selectedClipTrackIndex;
            let newTrackIndex: number = this._selectedClipTrackIndex;
            if (this._movingStartOfClip) {
                newStart = clamp(this._tentativeClipStart, 0, song.duration - 1);
            } else if (this._movingEndOfClip) {
                newEnd = clamp(this._tentativeClipEnd, 1, song.duration);
            } else {
                newStart = clamp(this._tentativeClipStart, 0, song.duration - 1);
                newEnd = clamp(this._tentativeClipEnd, 1, song.duration);
            }
            this._doc.changeClip(
                clip,
                clipIndex,
                newStart,
                newEnd,
                oldTrackIndex,
                newTrackIndex,
            );

            this._movingClip = false;
            this._movingStartOfClip = false;
            this._movingEndOfClip = false;
            this._selectedClipIndex = -1;
            this._selectedClipTrackIndex = -1;

            this._renderedClipsDirty = true;
        }

        this._findHoveredClips(width, height, mouseX, mouseY, false);
        this._renderedSelectionOverlayDirty = true;

        this._pointerIsDown = false;

        this._ui.scheduleMainRender();
    };

    private _onPointerMove = (event: MouseEvent): void => {
        const canvasIsOccluded: boolean = (
            event.target !== this._canvasesContainer
            && event.target !== this._gridCanvas
            && event.target !== this._clipsCanvas
            && event.target !== this._envelopesCanvas
            && event.target !== this._selectionOverlayCanvas
            && event.target !== this._playheadOverlayCanvas
        );

        // @TODO: This is probably expensive to do every time the mouse moves.
        // For the width and height, we can probably rely on the values queried
        // at the point where resize is called. For the left and top, maybe
        // dockview can inform us of something, in which case we should maybe
        // add a move function that receives those values.
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const width: number = bounds.width;
        const height: number = bounds.height;
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;
        // const insideCanvas: boolean = insideRange(mouseX, 0, width) && insideRange(mouseY, 0, height);

        if (this._pointerIsDown) {
            if (this._selectedClipIndex !== -1) {
                const project: Project.Type = this._doc.project;
                const song: Song.Type = project.song;
                const tracks: Track.Type[] = song.tracks;
                const clips: Clip.Type[] = tracks[this._selectedClipTrackIndex].clips;
                const clip: Clip.Type = clips[this._selectedClipIndex];

                const viewportWidth: number = this._viewport.x1 - this._viewport.x0;
                const cursorPpqn0: number = (
                    this._viewport.x0 + remap(this._pointerX0, 0, width, 0, viewportWidth)
                ) | 0;
                const cursorPpqn1: number = (
                    this._viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
                ) | 0;

                if (this._movingClip) {
                    const cursorPpqnDeltaMin: number = 0 - clip.start;
                    const cursorPpqnDeltaMax: number = song.duration - clip.end;
                    const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                    this._tentativeClipStart = clip.start + cursorPpqnDelta;
                    this._tentativeClipEnd = clip.end + cursorPpqnDelta;
                } else if (this._movingStartOfClip) {
                    const cursorPpqnDeltaMin: number = 0 - clip.start;
                    const cursorPpqnDeltaMax: number = ((clip.end - 1) - clip.start);
                    const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                    this._tentativeClipStart = clip.start + cursorPpqnDelta;
                } else if (this._movingEndOfClip) {
                    const cursorPpqnDeltaMin: number = -((clip.end - 1) - clip.start);
                    const cursorPpqnDeltaMax: number = song.duration - clip.end;
                    const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                    this._tentativeClipEnd = clip.end + cursorPpqnDelta;
                }

                this._renderedClipsDirty = true;
                this._renderedSelectionOverlayDirty = true;
            }
        } else {
            const startingHoveredClipIndex: number = this._hoveredClipIndex;
            const startingHoveredClipTrackIndex: number = this._hoveredClipTrackIndex;
            const wasHoveringOverStartOfClip: boolean = this._hoveringOverStartOfClip;
            const wasHoveringOverEndOfClip: boolean = this._hoveringOverEndOfClip;

            this._findHoveredClips(width, height, mouseX, mouseY, canvasIsOccluded);

            this._renderedSelectionOverlayDirty = (
                startingHoveredClipIndex !== this._hoveredClipIndex
                || startingHoveredClipTrackIndex !== this._hoveredClipTrackIndex
                || wasHoveringOverStartOfClip !== this._hoveringOverStartOfClip
                || wasHoveringOverEndOfClip !== this._hoveringOverEndOfClip
            );
        }

        if (this._renderedClipsDirty || this._renderedSelectionOverlayDirty) {
            this._ui.scheduleMainRender();
        }
    };

    private _onDoubleClick = (event: MouseEvent): void => {
        if (this._selectedClipIndex === -1 && this._hoveredClipIndex === -1) {
        } else if (this._hoveredClipIndex !== -1) {
            // Double clicked while hovering over a clip, remove it.
            // this._doc.removeClip(this._hoveredClipTrackIndex, this._hoveredClipIndex);
            // this._selectedClipIndex = -1;
            // this._selectedClipTrackIndex = -1;
            // this._hoveredClipIndex = -1;
            // this._hoveredClipTrackIndex = -1;
            // this._hoveringOverStartOfClip = false;
            // this._hoveringOverEndOfClip = false;
            // this._renderedClipsDirty = true;
            // this._renderedSelectionOverlayDirty = true;
            const track: Track.Type = this._doc.project.song.tracks[this._hoveredClipTrackIndex];
            const clip: Clip.Type = track.clips[this._hoveredClipIndex];
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
            this._doc.setCurrentPattern(patternIndex, this._hoveredClipTrackIndex, this._hoveredClipIndex);
        }

        this._ui.scheduleMainRender();
    };

    private _findHoveredClips(
        width: number,
        height: number,
        mouseX: number,
        mouseY: number,
        canvasIsOccluded: boolean
    ): void {
        this._hoveredClipIndex = -1;
        this._hoveredClipTrackIndex = -1;
        this._hoveringOverStartOfClip = false;
        this._hoveringOverEndOfClip = false;

        const outsideCanvas: boolean = canvasIsOccluded || (
            !insideRange(mouseX, 0, width) || !insideRange(mouseY, 0, height)
        );
        if (!outsideCanvas) {
            const viewportX0: number = this._viewport.x0;
            const viewportX1: number = this._viewport.x1;
            const viewportY0: number = this._viewport.y0;
            const viewportWidth: number = viewportX1 - viewportX0;
            const pixelsPerTick: number = width / viewportWidth;
            const searchWindowStart: number = (
                this._viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
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

                if (top > height) {
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
                            this._hoveredClipIndex = index;
                            this._hoveredClipTrackIndex = trackIndex;
                            found = true;

                            const clipX0: number = ((clip.start - viewportX0) * pixelsPerTick);
                            const clipX1: number = ((clip.end - viewportX0) * pixelsPerTick);
                            const clipY0: number = top - 1;
                            const clipY1: number = clipY0 + laneHeight;
                            const clipStartStretchHandleX0: number = clipX0;
                            const clipStartStretchHandleX1: number = clamp(clipX0 + this._clipStretchHandleSize, clipX0, clipX1);
                            const clipEndStretchHandleX0: number = clamp(clipX1 - this._clipStretchHandleSize, clipX0, clipX1);
                            const clipEndStretchHandleX1: number = clipX1;

                            this._hoveringOverStartOfClip = (
                                insideRange(mouseX, clipStartStretchHandleX0, clipStartStretchHandleX1)
                                && insideRange(mouseY, clipY0, clipY1)
                            );
                            this._hoveringOverEndOfClip = (
                                insideRange(mouseX, clipEndStretchHandleX0, clipEndStretchHandleX1)
                                && insideRange(mouseY, clipY0, clipY1)
                            );
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

    private _onWheel = (event: WheelEvent): void => {
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const width: number = bounds.width;
        const mouseX: number = event.clientX - bounds.left;

        const zoomIn: boolean = event.deltaY < 0;

        let factor: number = 1.25;
        if (zoomIn) {
            factor = 1.0 / factor;
        }

        if (Viewport.zoomAroundPointX(this._viewport, unlerp(mouseX, 0, width), factor)) {
            this._timeScrollBar.setZoom(Viewport.getXZoom(this._viewport));
            this._timeScrollBar.setPan(Viewport.getXPan(this._viewport));

            this._renderedClipsDirty = true;
            this._renderedSelectionOverlayDirty = true;
            Viewport.clearRendered(this._renderedViewport);

            this._ui.scheduleMainRender();
        }
    };

    public onAction = (kind: ActionKind, operationContext: OperationContext): ActionResponse => {
        // @TODO: Move all the mouse event stuff to actions here.

        return ActionResponse.Done;
    };

    private _onProjectChanged = (): void => {
        // @TODO: Invalidate precisely.
        this._renderedClipsDirty = true;
        this._renderedSelectionOverlayDirty = true;
        this._renderedEnvelopesDirty = true;
        this._tempoEnvelopeIsDirty = true;
    };
}
