import { H } from "@synth-playground/dom/index.js";
import { SongDocument } from "../SongDocument.js";
import { type Component } from "./types.js";
import { UIContext } from "./UIContext.js";
import { StretchyScrollBar } from "./StretchyScrollBar.js";
import { lerp, remap, clamp } from "@synth-playground/common/math.js";
import * as IITree from "@synth-playground/common/iitree.js";
import {
    type Note,
    type Song,
} from "@synth-playground/synthesizer/index.js";

export class PianoRoll implements Component {
    public element: HTMLDivElement;
    private _ui: UIContext;
    private _doc: SongDocument;
    private _width: number;
    private _height: number;
    private _timeScrollBar: StretchyScrollBar;
    private _pitchScrollBar: StretchyScrollBar;
    private _pitchScrollBarOverlayDirty: boolean;
    private _scrollBarSpacer: HTMLDivElement;
    private _gridCanvas: HTMLCanvasElement;
    private _gridContext: CanvasRenderingContext2D;
    private _notesCanvas: HTMLCanvasElement;
    private _notesContext: CanvasRenderingContext2D;
    private _selectionOverlayCanvas: HTMLCanvasElement;
    private _selectionOverlayContext: CanvasRenderingContext2D;
    private _playheadOverlayCanvas: HTMLCanvasElement;
    private _playheadOverlayContext: CanvasRenderingContext2D;
    private _canvasesContainer: HTMLDivElement;
    private _viewportX0: number;
    private _viewportX1: number;
    private _viewportY0: number;
    private _viewportY1: number;
    private _minViewportWidth: number;
    private _maxViewportWidth: number;
    private _minViewportHeight: number;
    private _maxViewportHeight: number;
    private _hoveredNoteIndex: number;
    private _selectedNoteIndex: number;
    private _movingNote: boolean;
    private _movingStartOfNote: boolean;
    private _movingEndOfNote: boolean;
    private _noteStretchHandleSize: number; // In pixels.
    private _hoveringOverStartOfNote: boolean;
    private _hoveringOverEndOfNote: boolean;
    private _lastCommittedSize: number;
    private _pointerIsDown: boolean;
    private _pointerX0: number;
    // private _pointerY0: number;
    private _tentativeNotePitch: number;
    private _tentativeNoteStart: number;
    private _tentativeNoteEnd: number;
    private _playhead: number;
    private _playheadIsVisible: boolean;
    private _animatePlayingNotes: boolean;
    private _renderedNotesDirty: boolean;
    private _renderedSelectionOverlayDirty: boolean;
    private _renderedViewportX0: number | null;
    private _renderedViewportY0: number | null;
    private _renderedViewportX1: number | null;
    private _renderedViewportY1: number | null;
    private _renderedPlayhead: number | null;
    private _renderedPlayheadIsVisible: boolean;

    constructor(
        ui: UIContext,
        doc: SongDocument,
    ) {
        this._ui = ui;

        this._doc = doc;
        const song: Song = this._doc.song;

        this._width = 200;
        this._height = 200;

        this._minViewportWidth = 1;
        this._maxViewportWidth = Math.max(this._minViewportWidth, song.patternDuration);
        this._minViewportHeight = 2;
        this._maxViewportHeight = Math.max(this._minViewportHeight, song.maxPitch + 1);

        this._viewportX0 = 0;
        this._viewportX1 = song.beatsPerBar * song.ppqn;
        const visibleOctaves: number = 3;
        const startPitch: number = 12 * 4;
        const endPitch: number = startPitch + visibleOctaves * 12;
        this._viewportY0 = clamp(startPitch, 0, song.maxPitch - 1);
        this._viewportY1 = clamp(endPitch, 0, song.maxPitch + 1);

        this._hoveredNoteIndex = -1;
        this._selectedNoteIndex = -1;
        this._movingNote = false;
        this._movingStartOfNote = false;
        this._movingEndOfNote = false;
        this._noteStretchHandleSize = 4;
        this._hoveringOverStartOfNote = false;
        this._hoveringOverEndOfNote = false;
        this._lastCommittedSize = song.ppqn;

        this._playhead = 0;
        this._playheadIsVisible = false;
        this._renderedPlayhead = null;
        this._renderedPlayheadIsVisible = false;
        this._animatePlayingNotes = true;

        this._pointerIsDown = false;
        this._pointerX0 = 0;
        // this._pointerY0 = 0;
        this._tentativeNotePitch = 0;
        this._tentativeNoteStart = 0;
        this._tentativeNoteEnd = 0;

        this._renderedNotesDirty = true;
        this._renderedSelectionOverlayDirty = true;
        this._renderedViewportX0 = null;
        this._renderedViewportY0 = null;
        this._renderedViewportX1 = null;
        this._renderedViewportY1 = null;

        const viewportPositionX: number = this._viewportX0;
        const viewportPositionY: number = this._viewportY0;
        const viewportWidth: number = this._viewportX1 - this._viewportX0;
        const viewportHeight: number = this._viewportY1 - this._viewportY0;
        const initialTimeZoom: number = remap(viewportWidth, this._minViewportWidth, this._maxViewportWidth, 0, 1);
        const initialTimePan: number = (
            this._maxViewportWidth - viewportWidth === 0
            ? 0
            : remap(viewportPositionX, 0, this._maxViewportWidth - viewportWidth, 0, 1)
        );
        const initialPitchZoom: number = remap(viewportHeight, this._minViewportHeight, this._maxViewportHeight, 0, 1);
        const initialPitchPan: number = (
            this._maxViewportHeight - viewportHeight === 0
            ? 0
            : remap(viewportPositionY, 0, this._maxViewportHeight - viewportHeight, 1, 0)
        );

        this._timeScrollBar = new StretchyScrollBar(
            this._ui,
            /* vertical */ false,
            /* flip */ false,
            initialTimeZoom,
            initialTimePan,
            this._onTimeScrollBarChange,
            /* onRenderOverlay */ null,
        );
        this._pitchScrollBarOverlayDirty = true;
        this._pitchScrollBar = new StretchyScrollBar(
            this._ui,
            /* vertical */ true,
            /* flip */ true,
            initialPitchZoom,
            initialPitchPan,
            this._onPitchScrollBarChange,
            this._onPitchScrollBarRenderOverlay,
        );
        this._scrollBarSpacer = H("div", {
            style: `
                width: 100%;
                height: 20px;
                flex-shrink: 0;
                background-color: #000000;
            `,
        });
        this._gridCanvas = H("canvas", {
            width: "100",
            height: "100",
            style: `
                flex-grow: 1;
                width: 100%;
                height: 100%;
                display: block;
                box-sizing: border-box;
                position: absolute;
                left: 0;
                top: 0;
            `,
        });
        this._gridContext = this._gridCanvas.getContext("2d")!;
        this._notesCanvas = H("canvas", {
            width: "100",
            height: "100",
            style: `
                flex-grow: 1;
                width: 100%;
                height: 100%;
                display: block;
                box-sizing: border-box;
                position: absolute;
                left: 0;
                top: 0;
            `,
        });
        this._notesContext = this._notesCanvas.getContext("2d")!;
        this._selectionOverlayCanvas = H("canvas", {
            width: "100",
            height: "100",
            style: `
                flex-grow: 1;
                width: 100%;
                height: 100%;
                display: block;
                box-sizing: border-box;
                position: absolute;
                left: 0;
                top: 0;
            `,
        });
        this._selectionOverlayContext = this._selectionOverlayCanvas.getContext("2d")!;
        this._playheadOverlayCanvas = H("canvas", {
            width: "100",
            height: "100",
            style: `
                flex-grow: 1;
                width: 100%;
                height: 100%;
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
                width: 100%;
                height: 100%;
                position: relative;
            `,
        },
            this._gridCanvas,
            this._notesCanvas,
            this._selectionOverlayCanvas,
            this._playheadOverlayCanvas,
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
            H("div", {
                style: `
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                `,
            },
                this._canvasesContainer,
                this._timeScrollBar.element,
            ),
            H("div", {
                style: `
                    display: flex;
                    flex-direction: column;
                    width: 20px;
                    height: 100%;
                `,
            },
                this._pitchScrollBar.element,
                this._scrollBarSpacer,
             ),
        );

        this._canvasesContainer.addEventListener("mousedown", this._onPointerDown);
        window.addEventListener("mousemove", this._onPointerMove);
        window.addEventListener("mouseup", this._onPointerUp);
        this._canvasesContainer.addEventListener("dblclick", this._onDoubleClick);

        // this._gridCanvas.width = this._gridCanvas.clientWidth;
        // this._gridCanvas.height = this._gridCanvas.clientHeight;

        // this.render();
    }

    public dispose(): void {
        this._canvasesContainer.removeEventListener("mousedown", this._onPointerDown);
        window.removeEventListener("mousemove", this._onPointerMove);
        window.removeEventListener("mouseup", this._onPointerUp);
        this._canvasesContainer.removeEventListener("dblclick", this._onDoubleClick);
    }

    public resize(): void {
        this._width = this._canvasesContainer.clientWidth;
        this._height = this._canvasesContainer.clientHeight;

        this._timeScrollBar.resize(Math.min(this.element.clientWidth - 20, this._timeScrollBar.element.clientWidth), this._timeScrollBar.element.clientHeight);
        this._pitchScrollBar.resize(this._pitchScrollBar.element.clientWidth, Math.min(this.element.clientHeight - 20, this._pitchScrollBar.element.clientHeight));

        this._renderedNotesDirty = true;
        this._renderedSelectionOverlayDirty = true;
        this._renderedViewportX0 = null;
        this._renderedViewportY0 = null;
        this._renderedViewportX1 = null;
        this._renderedViewportY1 = null;

        this._ui.scheduleMainRender();
    }

    public render(): void {
        if (this._doc.playing) {
            const targetPlayhead: number | null = this._doc.getPlayheadInTicks();
            if (targetPlayhead != null) {
                // @TODO: Non-hacky smoothing of the playhead position.
                if (targetPlayhead < this._playhead) {
                    this._playhead = targetPlayhead;
                } else {
                    this._playhead += (targetPlayhead - this._playhead) * 0.6;
                }
            }
            this._playheadIsVisible = true;
            // @TODO: Optimize this case. The problem here is if we zoom in and
            // a long note is playing, the playing note indicator should still
            // fade out, even though the playhead is not actually visible.
            // this._playheadIsVisible = this._playhead != null && (
            //     this._playhead >= this._viewportX0
            //     && this._playhead <= this._viewportX1
            // );
        } else {
            this._playhead = 0;
            this._playheadIsVisible = false;
        }

        this._renderGrid();
        this._renderNotes();
        this._renderSelectionOverlay();
        this._renderPlayhead();
        this._pitchScrollBar.render();
        this._timeScrollBar.render();

        this._renderedNotesDirty = false;
        this._renderedSelectionOverlayDirty = false;
        this._renderedViewportX0 = this._viewportX0;
        this._renderedViewportY0 = this._viewportY0;
        this._renderedViewportX1 = this._viewportX1;
        this._renderedViewportY1 = this._viewportY1;
        this._renderedPlayhead = this._playhead;
        this._renderedPlayheadIsVisible = this._playheadIsVisible;
    }

    private _renderGrid(): void {
        // @TODO: Is grabbing these dimensions expensive? Cache them here if so.
        if (
            this._renderedViewportX0 === this._viewportX0
            && this._renderedViewportY0 === this._viewportY0
            && this._renderedViewportX1 === this._viewportX1
            && this._renderedViewportY1 === this._viewportY1
            && this._gridCanvas.width === this._width
            && this._gridCanvas.height === this._height
        ) return;

        if (
            this._gridCanvas.width !== this._width
            || this._gridCanvas.height !== this._height
        ) {
            this._gridCanvas.width = this._width;
            this._gridCanvas.height = this._height;
        }

        const song: Song = this._doc.song;
        const ppqn: number = song.ppqn;
        // const beatsPerBar: number = song.beatsPerBar;
        const canvas: HTMLCanvasElement = this._gridCanvas;
        const context: CanvasRenderingContext2D = this._gridContext;
        const width: number = canvas.width;
        const height: number = canvas.height;
        const viewportWidth: number = this._viewportX1 - this._viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const pixelsPerBeat: number = pixelsPerTick * ppqn;
        // const ticksPerPixel: number = viewportWidth / width;
        context.fillStyle = "#303030";
        context.fillRect(0, 0, width, height);
        context.strokeStyle = "#000000";
        {
            // Odd time grid cells.
            let worldX: number = Math.max(0, Math.floor(this._viewportX0 / ppqn) * ppqn);
            let isOdd: boolean = worldX % (ppqn * 2) === ppqn;
            context.fillStyle = "rgba(0, 0, 0, 0.1)";
            if (pixelsPerBeat >= 2) while (worldX < this._viewportX1) {
                const screenX: number = (worldX - this._viewportX0) * pixelsPerTick;
                if (isOdd) {
                    const x: number = screenX;
                    const w: number = pixelsPerTick * ppqn;
                    const h: number = height;
                    const y: number = 0;
                    context.fillRect(x, y, w, h);
                }
                isOdd = !isOdd;
                worldX += ppqn;
            }
        }
        {
            // Octaves.
            context.fillStyle = "#886644";
            let worldY: number = Math.max(0, Math.floor(this._viewportY0) - 1);
            while (worldY < this._viewportY1) {
                const screenY: number = remap(worldY, this._viewportY0, this._viewportY1, height, 0);
                if (worldY % 12 === 0) {
                    const x: number = 0;
                    const w: number = width;
                    const h: number = screenY - remap(worldY + 1, this._viewportY0, this._viewportY1, height, 0);
                    const y: number = screenY - h;
                    context.fillRect(x, y, w, h);
                }
                worldY++;
            }
        }
        {
            // Fifths.
            context.fillStyle = "#446688";
            let worldY: number = Math.max(0, Math.floor(this._viewportY0) - 1);
            while (worldY < this._viewportY1) {
                const screenY: number = remap(worldY, this._viewportY0, this._viewportY1, height, 0);
                if (worldY % 12 === 7) {
                    const x: number = 0;
                    const w: number = width;
                    const h: number = screenY - remap(worldY + 1, this._viewportY0, this._viewportY1, height, 0);
                    const y: number = screenY - h;
                    context.fillRect(x, y, w, h);
                }
                worldY++;
            }
        }
        {
            // Pitch grid.
            let worldY: number = Math.max(0, Math.floor(this._viewportY0) - 1);
            while (worldY < this._viewportY1) {
                const screenY: number = remap(worldY, this._viewportY0, this._viewportY1, height, 0) | 0;
                context.beginPath();
                context.moveTo(0, screenY);
                context.lineTo(width, screenY);
                context.stroke();
                worldY++;
            }
        }
        {
            // Time grid.
            let worldX: number = Math.max(0, Math.floor(this._viewportX0 / ppqn) * ppqn);
            if (pixelsPerBeat >= 5) while (worldX < this._viewportX1) {
                const screenX: number = ((worldX - this._viewportX0) * pixelsPerTick) | 0;
                context.beginPath();
                context.moveTo(screenX, 0);
                context.lineTo(screenX, height);
                context.stroke();
                worldX += ppqn;
            }
        }
    }

    private _renderNotes(): void {
        // @TODO: Is grabbing these dimensions expensive? Cache them here if so.
        if (
            this._renderedNotesDirty === false
            && this._renderedViewportX0 === this._viewportX0
            && this._renderedViewportY0 === this._viewportY0
            && this._renderedViewportX1 === this._viewportX1
            && this._renderedViewportY1 === this._viewportY1
            && this._notesCanvas.width === this._width
            && this._notesCanvas.height === this._height
        ) return;

        if (
            this._notesCanvas.width !== this._width
            || this._notesCanvas.height !== this._height
        ) {
            this._notesCanvas.width = this._width;
            this._notesCanvas.height = this._height;
        }

        const song: Song = this._doc.song;
        // const ppqn: number = song.ppqn;
        const canvas: HTMLCanvasElement = this._notesCanvas;
        const context: CanvasRenderingContext2D = this._notesContext;
        const width: number = canvas.width;
        const height: number = canvas.height;
        const viewportWidth: number = this._viewportX1 - this._viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        // const pixelsPerBeat: number = pixelsPerTick * ppqn;
        // const ticksPerPixel: number = viewportWidth / width;
        const viewportHeight: number = this._viewportY1 - this._viewportY0;
        const pixelsPerPitch: number = height / viewportHeight;
        context.fillStyle = "#17d15b";
        context.strokeStyle = "#000000";
        context.lineWidth = 1;
        context.clearRect(0, 0, width, height);
        IITree.findOverlapping(
            song.notes,
            song.notesMaxLevel,
            this._viewportX0,
            this._viewportX1,
            (note: Note, index: number) => {
                if (index === this._selectedNoteIndex) return;
                const noteStart: number = note.start;
                const noteEnd: number = note.end;
                const notePitch: number = note.pitch;
                const x0: number = ((noteStart - this._viewportX0) * pixelsPerTick);
                const x1: number = ((noteEnd - this._viewportX0) * pixelsPerTick);
                let w: number = x1 - x0;
                if (w <= 1) w = 1;
                const x: number = x0;
                const y: number = (height - pixelsPerPitch) - ((notePitch - this._viewportY0) * pixelsPerPitch);
                const h: number = pixelsPerPitch;
                if (w >= 0.5) {
                    context.fillRect(x, y, w, h);
                    if (w >= 4) {
                        context.strokeRect(x, y, w, h);
                    }
                }
            },
        );
        if (this._selectedNoteIndex !== -1) {
            const noteStart: number = this._tentativeNoteStart;
            const noteEnd: number = this._tentativeNoteEnd;
            const notePitch: number = this._tentativeNotePitch;
            const x0: number = ((noteStart - this._viewportX0) * pixelsPerTick);
            const x1: number = ((noteEnd - this._viewportX0) * pixelsPerTick);
            let w: number = x1 - x0;
            if (w <= 1) w = 1;
            const x: number = x0;
            const y: number = (height - pixelsPerPitch) - ((notePitch - this._viewportY0) * pixelsPerPitch);
            const h: number = pixelsPerPitch;
            context.fillRect(x, y, w, h);
            if (w >= 4) {
                context.strokeRect(x, y, w, h);
            }
        }
    }

    private _renderSelectionOverlay(): void {
        // @TODO: Is grabbing these dimensions expensive? Cache them here if so.
        if (
            this._renderedSelectionOverlayDirty === false
            && this._renderedViewportX0 === this._viewportX0
            && this._renderedViewportY0 === this._viewportY0
            && this._renderedViewportX1 === this._viewportX1
            && this._renderedViewportY1 === this._viewportY1
            && this._selectionOverlayCanvas.width === this._width
            && this._selectionOverlayCanvas.height === this._height
        ) return;

        if (
            this._selectionOverlayCanvas.width !== this._width
            || this._selectionOverlayCanvas.height !== this._height
        ) {
            this._selectionOverlayCanvas.width = this._width;
            this._selectionOverlayCanvas.height = this._height;
        }

        const canvas: HTMLCanvasElement = this._selectionOverlayCanvas;
        const context: CanvasRenderingContext2D = this._selectionOverlayContext;
        const width: number = canvas.width;
        const height: number = canvas.height;
        const viewportWidth: number = this._viewportX1 - this._viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        // const ticksPerPixel: number = viewportWidth / width;
        const viewportHeight: number = this._viewportY1 - this._viewportY0;
        const pixelsPerPitch: number = height / viewportHeight;
        context.clearRect(0, 0, width, height);
        if (this._selectedNoteIndex !== -1) return;
        if (this._hoveredNoteIndex === -1) return;
        context.fillStyle = "rgba(255, 255, 255, 0.8)";
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2;
        const hoveredNoteIndex: number = this._hoveredNoteIndex;
        const notes: Note[] = this._doc.song.notes;
        {
            const noteIndex: number = hoveredNoteIndex;
            const note: Note = notes[noteIndex];
            const x0: number = ((note.start - this._viewportX0) * pixelsPerTick);
            const x1: number = ((note.end - this._viewportX0) * pixelsPerTick);
            let w: number = x1 - x0;
            if (w <= 1) w = 1;
            const x: number = x0;
            const y: number = (height - pixelsPerPitch) - ((note.pitch - this._viewportY0) * pixelsPerPitch);
            const h: number = pixelsPerPitch;
            if (this._hoveringOverStartOfNote) {
                const hX0: number = x0;
                const hX1: number = x0 + this._noteStretchHandleSize;
                const hX: number = hX0;
                let hW: number = hX1 - hX0;
                if (hW <= 1) hW = 1;
                context.fillRect(hX, y, hW, h);
            } else if (this._hoveringOverEndOfNote) {
                const hX0: number = x1 - this._noteStretchHandleSize;
                const hX1: number = x1;
                const hX: number = hX0;
                let hW: number = hX1 - hX0;
                if (hW <= 1) hW = 1;
                context.fillRect(hX, y, hW, h);
            } else {
                context.strokeRect(x + 0.5, y + 0.5, w, h);
            }
        }
    }

    private _renderPlayhead(): void {
        // @TODO: Is grabbing these dimensions expensive? Cache them here if so.
        if (
            this._renderedPlayheadIsVisible === this._playheadIsVisible
            && this._renderedPlayhead === this._playhead
            && this._renderedViewportX0 === this._viewportX0
            && this._renderedViewportY0 === this._viewportY0
            && this._renderedViewportX1 === this._viewportX1
            && this._renderedViewportY1 === this._viewportY1
            && this._playheadOverlayCanvas.width === this._width
            && this._playheadOverlayCanvas.height === this._height
        ) return;

        if (
            this._playheadOverlayCanvas.width !== this._width
            || this._playheadOverlayCanvas.height !== this._height
        ) {
            this._playheadOverlayCanvas.width = this._width;
            this._playheadOverlayCanvas.height = this._height;
        }

        const song: Song = this._doc.song;
        // const ppqn: number = song.ppqn;
        // const beatsPerBar: number = song.beatsPerBar;
        const canvas: HTMLCanvasElement = this._playheadOverlayCanvas;
        const context: CanvasRenderingContext2D = this._playheadOverlayContext;
        const width: number = canvas.width;
        const height: number = canvas.height;
        const viewportX0: number = this._viewportX0;
        const viewportX1: number = this._viewportX1;
        const viewportY0: number = this._viewportY0;
        const viewportY1: number = this._viewportY1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        // const pixelsPerBeat: number = pixelsPerTick * ppqn;
        // const ticksPerPixel: number = viewportWidth / width;
        const viewportHeight: number = viewportY1 - viewportY0;
        const pixelsPerPitch: number = height / viewportHeight;
        const playhead: number | null = this._playhead;
        context.clearRect(0, 0, width, height);
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2;
        if (this._playheadIsVisible && playhead != null) {
            const x: number = (playhead - viewportX0) * pixelsPerTick;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();

            // @TODO: Inline findOverlapping manually.
            if (this._animatePlayingNotes) IITree.findOverlapping(
                song.notes,
                song.notesMaxLevel,
                playhead,
                playhead + 1,
                (note: Note, index: number) => {
                    const noteStart: number = note.start;
                    const noteEnd: number = note.end;
                    const notePitch: number = note.pitch;
                    const progress: number = clamp(remap(playhead, noteStart, noteEnd, 0, 1), 0, 1);
                    const alpha: number = 1.0 - progress;
                    const x0: number = ((noteStart - viewportX0) * pixelsPerTick);
                    const x1: number = ((noteEnd - viewportX0) * pixelsPerTick);
                    let w: number = x1 - x0;
                    if (w <= 1) w = 1;
                    const x: number = x0;
                    const y: number = (height - pixelsPerPitch) - ((notePitch - viewportY0) * pixelsPerPitch);
                    const h: number = pixelsPerPitch;
                    const noteIsVisible: boolean = (
                        x <= width
                        && (x + w) >= 0
                        && y <= height
                        && (y + h) >= 0
                    );
                    if (w >= 0.5 && noteIsVisible) {
                        // @TODO: Cache these colors. Although this is rather
                        // slow regardless.
                        context.fillStyle = "rgba(255, 255, 255, " + alpha + ")";
                        context.fillRect(x, y, w, h);
                    }
                },
            );
        }
    }

    private _onTimeScrollBarChange = (zoom: number, pan: number): void => {
        const viewportWidth: number = lerp(zoom, this._minViewportWidth, this._maxViewportWidth);
        const viewportPositionX: number = lerp(pan, 0, this._maxViewportWidth - viewportWidth);
        this._viewportX0 = viewportPositionX;
        this._viewportX1 = viewportPositionX + viewportWidth;

        this._ui.scheduleMainRender();
    };

    private _onPitchScrollBarChange = (zoom: number, pan: number): void => {
        const viewportHeight: number = lerp(zoom, this._minViewportHeight, this._maxViewportHeight);
        const viewportPositionY: number = lerp(pan, 0, this._maxViewportHeight - viewportHeight);
        this._viewportY0 = viewportPositionY;
        this._viewportY1 = viewportPositionY + viewportHeight;

        this._ui.scheduleMainRender();
    };

    private _onPitchScrollBarRenderOverlay = (
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
    ): void => {
        // @TODO: Is grabbing these dimensions expensive? Cache them here if so.
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            this._pitchScrollBarOverlayDirty = true;
        }

        if (this._pitchScrollBarOverlayDirty) {
            this._pitchScrollBarOverlayDirty = false;

            context.clearRect(0, 0, width, height);
            context.fillStyle = "#886644";
            let worldY: number = 0;
            while (worldY < this._maxViewportHeight) {
                const screenY: number = remap(worldY, 0, this._maxViewportHeight, height, 0);
                if (worldY % 12 === 0) {
                    const x: number = 1;
                    const w: number = width - 2;
                    const h: number = screenY - remap(worldY + 1, 0, this._maxViewportHeight, height, 0);
                    const y: number = screenY - h;
                    context.fillRect(x, y, w, h);
                }
                worldY++;
            }
        }
    };

    private _onPointerDown = (event: MouseEvent): void => {
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const width: number = bounds.width;
        const height: number = bounds.height;
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        this._pointerX0 = mouseX;
        // this._pointerY0 = mouseY;

        if (this._hoveredNoteIndex !== -1) {
            this._selectedNoteIndex = this._hoveredNoteIndex;

            this._hoveredNoteIndex = -1;

            const note: Note = this._doc.song.notes[this._selectedNoteIndex];

            const viewportWidth: number = this._viewportX1 - this._viewportX0;
            // const pixelsPerTick: number = width / viewportWidth;
            // const ticksPerPixel: number = viewportWidth / width;
            const viewportHeight: number = this._viewportY1 - this._viewportY0;
            // const pixelsPerPitch: number = height / viewportHeight;

            const cursorPpqn0: number = (
                this._viewportX0 + remap(this._pointerX0, 0, width, 0, viewportWidth)
            ) | 0;
            const cursorPpqn1: number = (
                this._viewportX0 + remap(mouseX, 0, width, 0, viewportWidth)
            ) | 0;

            const cursorPitch: number = (
                this._viewportY0 + remap(mouseY, height, 0, 0, viewportHeight)
            ) | 0;

            if (this._hoveringOverStartOfNote) {
                const cursorPpqnDeltaMin: number = 0 - note.start;
                const cursorPpqnDeltaMax: number = ((note.end - 1) - note.start);
                const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                this._movingStartOfNote = true;
                this._tentativeNoteStart = note.start + cursorPpqnDelta;
                this._tentativeNoteEnd = note.end;
                this._tentativeNotePitch = note.pitch;
            } else if (this._hoveringOverEndOfNote) {
                const cursorPpqnDeltaMin: number = 0 - note.start;
                const cursorPpqnDeltaMax: number = this._doc.song.patternDuration - note.end;
                const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                this._movingEndOfNote = true;
                this._tentativeNoteStart = note.start;
                this._tentativeNoteEnd = note.end + cursorPpqnDelta;
                this._tentativeNotePitch = note.pitch;
            } else {
                const cursorPpqnDeltaMin: number = 0 - note.start;
                const cursorPpqnDeltaMax: number = this._doc.song.patternDuration - note.end;
                const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                this._movingNote = true;
                this._tentativeNoteStart = note.start + cursorPpqnDelta;
                this._tentativeNoteEnd = note.end + cursorPpqnDelta;
                this._tentativeNotePitch = clamp(cursorPitch, 0, this._doc.song.maxPitch);
            }
            this._hoveringOverStartOfNote = false;
            this._hoveringOverEndOfNote = false;

            this._renderedNotesDirty = true;
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

        if (this._selectedNoteIndex !== -1) {
            // @TODO: Skip committing if the note properties didn't change.

            const note: Note = this._doc.song.notes[this._selectedNoteIndex];
            if (this._movingStartOfNote) {
                note.start = clamp(this._tentativeNoteStart, 0, this._doc.song.patternDuration - 1);
            } else if (this._movingEndOfNote) {
                note.end = clamp(this._tentativeNoteEnd, 1, this._doc.song.patternDuration);
            } else {
                note.start = clamp(this._tentativeNoteStart, 0, this._doc.song.patternDuration - 1);
                note.end = clamp(this._tentativeNoteEnd, 1, this._doc.song.patternDuration);
                note.pitch = clamp(this._tentativeNotePitch, 0, this._doc.song.maxPitch);
            }
            this._lastCommittedSize = note.end - note.start;

            // @TODO: Skip sorting if not needed. Reindexing is always necessary
            // though, I think.
            this._doc.markSongAsDirty();

            this._movingNote = false;
            this._movingStartOfNote = false;
            this._movingEndOfNote = false;
            this._selectedNoteIndex = -1;

            this._renderedNotesDirty = true;
        }

        this._findHoveredNotes(width, height, mouseX, mouseY, false);
        this._renderedSelectionOverlayDirty = true;

        this._pointerIsDown = false;

        this._ui.scheduleMainRender();
    };

    private _onPointerMove = (event: MouseEvent): void => {
        const canvasIsOccluded: boolean = (
            event.target !== this._canvasesContainer
            && event.target !== this._gridCanvas
            && event.target !== this._notesCanvas
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
        // const insideCanvas: boolean = (
        //     mouseX >= 0
        //     && mouseX < width
        //     && mouseY >= 0
        //     && mouseY < height
        // );

        if (this._pointerIsDown) {
            if (this._selectedNoteIndex !== -1) {
                const note: Note = this._doc.song.notes[this._selectedNoteIndex];

                const viewportWidth: number = this._viewportX1 - this._viewportX0;
                // const pixelsPerTick: number = width / viewportWidth;
                // const ticksPerPixel: number = viewportWidth / width;
                const viewportHeight: number = this._viewportY1 - this._viewportY0;
                // const pixelsPerPitch: number = height / viewportHeight;
                const cursorPpqn0: number = (
                    this._viewportX0 + remap(this._pointerX0, 0, width, 0, viewportWidth)
                ) | 0;
                const cursorPpqn1: number = (
                    this._viewportX0 + remap(mouseX, 0, width, 0, viewportWidth)
                ) | 0;
                const cursorPitch: number = (
                    this._viewportY0 + remap(mouseY, height, 0, 0, viewportHeight)
                ) | 0;

                if (this._movingNote) {
                    const cursorPpqnDeltaMin: number = 0 - note.start;
                    const cursorPpqnDeltaMax: number = this._doc.song.patternDuration - note.end;
                    const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                    this._tentativeNoteStart = note.start + cursorPpqnDelta;
                    this._tentativeNoteEnd = note.end + cursorPpqnDelta;
                    this._tentativeNotePitch = clamp(cursorPitch, 0, this._doc.song.maxPitch);
                } else if (this._movingStartOfNote) {
                    const cursorPpqnDeltaMin: number = 0 - note.start;
                    const cursorPpqnDeltaMax: number = ((note.end - 1) - note.start);
                    const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                    this._tentativeNoteStart = note.start + cursorPpqnDelta;
                } else if (this._movingEndOfNote) {
                    const cursorPpqnDeltaMin: number = -((note.end - 1) - note.start);
                    const cursorPpqnDeltaMax: number = this._doc.song.patternDuration - note.end;
                    const cursorPpqnDelta: number = clamp(cursorPpqn1 - cursorPpqn0, cursorPpqnDeltaMin, cursorPpqnDeltaMax);

                    this._tentativeNoteEnd = note.end + cursorPpqnDelta;
                }

                this._renderedNotesDirty = true;
                this._renderedSelectionOverlayDirty = true;
            }
        } else {
            const startingHoveredNoteIndex: number = this._hoveredNoteIndex;
            const wasHoveringOverStartOfNote: boolean = this._hoveringOverStartOfNote;
            const wasHoveringOverEndOfNote: boolean = this._hoveringOverEndOfNote;

            this._findHoveredNotes(width, height, mouseX, mouseY, canvasIsOccluded);

            this._renderedSelectionOverlayDirty = (
                startingHoveredNoteIndex !== this._hoveredNoteIndex
                || wasHoveringOverStartOfNote !== this._hoveringOverStartOfNote
                || wasHoveringOverEndOfNote !== this._hoveringOverEndOfNote
            );
        }

        this._ui.scheduleMainRender();
    };

    private _onDoubleClick = (event: MouseEvent): void => {
        if (this._selectedNoteIndex === -1 && this._hoveredNoteIndex === -1) {
            // Double clicked in an empty spot, add a note.
            const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
            const width: number = bounds.width;
            const height: number = bounds.height;
            const mouseX: number = event.clientX - bounds.left;
            const mouseY: number = event.clientY - bounds.top;
            const viewportWidth: number = this._viewportX1 - this._viewportX0;
            const viewportHeight: number = this._viewportY1 - this._viewportY0;
            const cursorPpqn: number = (
                this._viewportX0 + remap(mouseX, 0, width, 0, viewportWidth)
            ) | 0;
            const cursorPitch: number = (
                this._viewportY0 + remap(mouseY, height, 0, 0, viewportHeight)
            ) | 0;
            const song: Song = this._doc.song;
            const duration: number = this._lastCommittedSize;
            const start: number = clamp(cursorPpqn, 0, song.patternDuration - 1);
            const end: number = clamp(cursorPpqn + duration, 0, song.patternDuration);
            const actualDuration: number = end - start;
            const pitch: number = clamp(cursorPitch, 0, song.maxPitch);
            if (Math.abs(actualDuration) > 0) {
                this._doc.insertNote(start, end, pitch);
                this._renderedNotesDirty = true;
                this._renderedSelectionOverlayDirty = true;
            }
        } else if (this._hoveredNoteIndex !== -1) {
            // Double clicked while hovering over a note, remove it.
            this._doc.song.notes.splice(this._hoveredNoteIndex, 1);
            this._doc.markSongAsDirty();
            this._selectedNoteIndex = -1;
            this._hoveredNoteIndex = -1;
            this._hoveringOverStartOfNote = false;
            this._hoveringOverEndOfNote = false;
            this._renderedNotesDirty = true;
            this._renderedSelectionOverlayDirty = true;
        }

        this._ui.scheduleMainRender();
    };

    private _findHoveredNotes(
        width: number,
        height: number,
        mouseX: number,
        mouseY: number,
        canvasIsOccluded: boolean
    ): void {
        this._hoveredNoteIndex = -1;
        this._hoveringOverStartOfNote = false;
        this._hoveringOverEndOfNote = false;

        const outsideCanvas: boolean = canvasIsOccluded || (
            mouseX < 0
            || mouseX > width
            || mouseY < 0
            || mouseY > height
        );
        if (!outsideCanvas) {
            const viewportWidth: number = this._viewportX1 - this._viewportX0;
            const pixelsPerTick: number = width / viewportWidth;
            // const ticksPerPixel: number = viewportWidth / width;
            const viewportHeight: number = this._viewportY1 - this._viewportY0;
            const pixelsPerPitch: number = height / viewportHeight;
            const searchWindowStart: number = (
                this._viewportX0 + remap(mouseX, 0, width, 0, viewportWidth)
            ) | 0;
            const searchWindowEnd: number = searchWindowStart + 1;
            const cursorPitch: number = (
                this._viewportY0 + remap(mouseY, height, 0, 0, viewportHeight)
            ) | 0;

            IITree.findOverlapping(
                this._doc.song.notes,
                this._doc.song.notesMaxLevel,
                searchWindowStart,
                searchWindowEnd,
                (note: Note, index: number) => {
                    if (note.pitch === cursorPitch) {
                        this._hoveredNoteIndex = index;

                        const noteX0: number = ((note.start - this._viewportX0) * pixelsPerTick);
                        const noteX1: number = ((note.end - this._viewportX0) * pixelsPerTick);
                        const noteY0: number = (height - pixelsPerPitch) - ((note.pitch - this._viewportY0) * pixelsPerPitch);
                        const noteY1: number = noteY0 + pixelsPerPitch;
                        const noteStartStretchHandleX0: number = noteX0;
                        const noteStartStretchHandleX1: number = noteX0 + this._noteStretchHandleSize;
                        const noteEndStretchHandleX0: number = noteX1 - this._noteStretchHandleSize;
                        const noteEndStretchHandleX1: number = noteX1;

                        this._hoveringOverStartOfNote = (
                            mouseX >= noteStartStretchHandleX0
                            && mouseX <= noteStartStretchHandleX1
                            && mouseY >= noteY0
                            && mouseY <= noteY1
                        );
                        this._hoveringOverEndOfNote = (
                            mouseX >= noteEndStretchHandleX0
                            && mouseX <= noteEndStretchHandleX1
                            && mouseY >= noteY0
                            && mouseY <= noteY1
                        );
                    }
                },
            );
        }
    }
}
