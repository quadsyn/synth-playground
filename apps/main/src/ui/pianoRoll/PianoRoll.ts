import { H } from "@synth-playground/browser/dom.js";
import { SongDocument } from "../../SongDocument.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import { StretchyScrollBar } from "../stretchyScrollBar/StretchyScrollBar.js";
import { lerp, unlerp, remap, clamp, insideRange, rangesOverlap } from "@synth-playground/common/math.js";
import * as IITree from "@synth-playground/common/iitree.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Song from "@synth-playground/synthesizer/data/Song.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import { ActionKind, ActionResponse } from "../input/actions.js";
import { Mod, isKeyboardGesture } from "../input/gestures.js";
import {
    OperationResponse,
    type OperationContext,
    mouseStartedInside,
    mouseIsInside,
} from "../input/operations.js";
import * as Viewport from "../common/Viewport.js";
import { TimeRuler } from "./TimeRuler.js";
import { Piano } from "./Piano.js";
import { type Operation } from "./Operation.js";
import { type OperationState } from "./OperationState.js";
import { OperationKind } from "./OperationKind.js";
import { type NoteTransform } from "./NoteTransform.js";
import { PaintFlatNote } from "./operations/PaintFlatNote.js";
import { LeftStretchNote } from "./operations/LeftStretchNote.js";
import { RightStretchNote } from "./operations/RightStretchNote.js";
import { MoveNotes } from "./operations/MoveNotes.js";
import { MoveNoteVolumePointBounded } from "./operations/MoveNoteVolumePointBounded.js";
import { MoveNotePitchPointBounded } from "./operations/MoveNotePitchPointBounded.js";
import { SelectBox } from "./operations/SelectBox.js";
import { NoteDrawingStyle } from "./NoteDrawingStyle.js";
import * as BentNoteIterator from "./BentNoteIterator.js";
import { NoteHit, pointOverlapsNote } from "./noteHitTesting.js";
import {
    drawNoteBackground,
    drawNoteFlash,
    drawNoteForeground,
    drawNoteOutline,
    drawNoteLeftHandle,
    drawNoteRightHandle,
    drawNoteTopHandle,
    drawNoteBottomHandle,
} from "./notePainting.js";
import { tickToX, pitchToY, noteIsFlat } from "./common.js";
import { type PatternInfo } from "../../data/PatternInfo.js";

export class PianoRoll implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _mounted: boolean;
    private _doc: SongDocument;
    private _pattern: Pattern.Type | null;
    private _clip: Clip.Type | null;
    private _width: number;
    private _height: number;
    private _timeScrollBar: StretchyScrollBar;
    private _pitchScrollBar: StretchyScrollBar;
    private _pitchScrollBarOverlayResized: boolean;
    private _gridCanvas: HTMLCanvasElement;
    private _gridContext: CanvasRenderingContext2D;
    private _gridCanvasResized: boolean;
    private _notesCanvas: HTMLCanvasElement;
    private _notesContext: CanvasRenderingContext2D;
    private _notesCanvasResized: boolean;
    private _selectionOverlayCanvas: HTMLCanvasElement;
    private _selectionOverlayContext: CanvasRenderingContext2D;
    private _selectionOverlayCanvasResized: boolean;
    private _playheadOverlayCanvas: HTMLCanvasElement;
    private _playheadOverlayContext: CanvasRenderingContext2D;
    private _playheadOverlayCanvasResized: boolean;
    private _offscreenNotesCanvas: HTMLCanvasElement;
    private _offscreenNotesContext: CanvasRenderingContext2D;
    private _offscreenNotesCanvasResized: boolean;
    private _canvasesContainer: HTMLDivElement;
    private _timeRuler: TimeRuler;
    private _piano: Piano;
    private _hoverQueryResult: HoverQueryResult;
    private _state: OperationState;
    private _activeOperation: Operation | null;
    private _bentNoteIterator: BentNoteIterator.Type;
    private _playhead: number;
    private _playheadIsVisible: boolean;
    private _animatePlayingNotes: boolean;
    private _cursor: string;
    private _hoveringNoteIndex: number;
    private _hoveringNoteHit: NoteHit;
    private _hoveringNoteVolumePointIndex: number;
    private _hoveringNotePitchPointIndex: number;

    private _pitchScrollBarOverlayDirty: boolean;
    private _renderedNotesDirty: boolean;
    private _renderedViewport: Viewport.Type | null;
    private _renderedPlayhead: number | null;
    private _renderedPlayheadIsVisible: boolean;
    private _renderedCursor: string | null;
    private _renderedHoveringNoteIndex: number | null;
    private _renderedHoveringNoteHit: NoteHit | null;
    private _renderedHoveringNoteVolumePointIndex: number | null;
    private _renderedHoveringNotePitchPointIndex: number | null;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;

        this._mounted = false;

        this._doc = doc;
        const song: Song.Type = this._doc.project.song;
        this._pattern = song.patterns[0];
        this._clip = song.tracks[0].clips[0];
        const patternDuration: number = this._pattern != null ? this._pattern.duration : song.ppqn * song.beatsPerBar;

        this._width = 600;
        this._height = 400;

        const minViewportWidth: number = 1;
        const maxViewportWidth: number = Math.max(minViewportWidth, patternDuration);
        const minViewportHeight: number = 1;
        const maxViewportHeight: number = Math.max(minViewportHeight, song.maxPitch + 1);

        const viewportX0: number = 0;
        const viewportX1: number = patternDuration;
        const visibleOctaves: number = 2;
        const startPitch: number = 12 * 4;
        const endPitch: number = startPitch + visibleOctaves * 12;
        const viewportY0: number = clamp(startPitch, 0, song.maxPitch - 1);
        const viewportY1: number = clamp(endPitch, 0, song.maxPitch + 1);

        // @TODO: It's not really nice to have this, as it inhibits reentrancy,
        // but it saves doing allocations every time we use it.
        this._hoverQueryResult = { index: -1, hit: NoteHit.None };

        this._state = {
            viewport: Viewport.make(
                viewportX0,
                viewportY0,
                viewportX1,
                viewportY1,
                minViewportWidth,
                maxViewportWidth,
                minViewportHeight,
                maxViewportHeight,
            ),
            noteStretchHandleSize: 6,
            noteVolumeHandleSizeFactor: 3,
            notePitchHandleSizeFactor: 3,
            noteEnvelopePointSizeFactor: 1.1,
            lastCommittedNoteDuration: song.ppqn,
            lastCommittedNoteVolumeEnvelope: null,
            lastCommittedNotePitchEnvelope: null,
            boxSelectionActive: false,
            boxSelectionX0: 0,
            boxSelectionX1: 0,
            boxSelectionY0: 0,
            boxSelectionY1: 0,
            selectionOverlayIsDirty: true,
            selectedNotes: [],
            mouseToPpqn: (clientX: number): number => {
                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const mouseX: number = clientX - bounds.left;
                const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                return this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth);
            },
            mouseToPitch: (clientY: number): number => {
                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const height: number = bounds.height;
                const mouseY: number = clientY - bounds.top;
                const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                return this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight);
            },
            getCanvasBounds: (): DOMRect => {
                return this._canvasesContainer.getBoundingClientRect();
            },
            noteDrawingStyle: NoteDrawingStyle.Bent,
        };
        this._activeOperation = null;

        // @TODO: It's not really nice to have this, as it inhibits reentrancy,
        // but it saves doing allocations every time we use it.
        this._bentNoteIterator = BentNoteIterator.make();

        this._playhead = 0;
        this._playheadIsVisible = false;
        this._animatePlayingNotes = true;

        this._cursor = "default";
        this._hoveringNoteIndex = -1;
        this._hoveringNoteHit = NoteHit.None;
        this._hoveringNoteVolumePointIndex = -1;
        this._hoveringNotePitchPointIndex = -1;

        this._renderedPlayhead = null;
        this._renderedPlayheadIsVisible = false;
        this._renderedCursor = null;
        this._renderedNotesDirty = true;
        this._state.selectionOverlayIsDirty = true;
        this._renderedViewport = null;
        this._pitchScrollBarOverlayDirty = true;
        this._renderedHoveringNoteIndex = null;
        this._renderedHoveringNoteHit = null;
        this._renderedHoveringNoteVolumePointIndex = null;
        this._renderedHoveringNotePitchPointIndex = null;

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
        this._pitchScrollBarOverlayResized = true;
        this._pitchScrollBar = new StretchyScrollBar(
            this._ui,
            /* vertical */ true,
            /* flip */ true,
            /* initialLongSideSize */ this._height,
            Viewport.getYZoom(this._state.viewport),
            Viewport.getYPan(this._state.viewport),
            this._onPitchScrollBarChange,
            this._onPitchScrollBarRenderOverlay,
        );
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
        this._notesCanvasResized = true;
        this._notesCanvas = H("canvas", {
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
        this._notesContext = this._notesCanvas.getContext("2d")!;
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
            this._notesCanvas,
            this._selectionOverlayCanvas,
            this._playheadOverlayCanvas,
        );
        this._timeRuler = new TimeRuler(
            this._ui,
            /* initialWidth */ this._width,
            // @TODO: Pass the entire state? Or the entire viewport?
            this._state.viewport,
            this._doc.project.song.ppqn,
            this._doc.project.song.beatsPerBar,
        );
        this._offscreenNotesCanvasResized = true;
        this._offscreenNotesCanvas = H("canvas", {
            style: `
                display: block;
                position: absolute;
                left: 0;
                top: 0;
                box-sizing: border-box;
                pointer-events: none;
                opacity: 0.5;
            `,
        });
        this._offscreenNotesContext = this._offscreenNotesCanvas.getContext("2d")!;
        this._piano = new Piano(
            this._ui,
            /* initialHeight */ this._height,
            this._state.viewport,
            this._doc.project.song.maxPitch,
            this._onPianoKeyDown,
            this._onPianoKeyUp,
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
            this._piano.element,
            H("div", {
                style: `
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                    position: relative;
                `,
            },
                this._timeRuler.element,
                this._canvasesContainer,
                this._timeScrollBar.element,
                this._offscreenNotesCanvas,
            ),
            this._pitchScrollBar.element,
        );

        this._canvasesContainer.addEventListener("mouseout", this._onMouseOut);
        this._canvasesContainer.addEventListener("mousemove", this._onMouseMove);
        this._piano.element.addEventListener("wheel", this._onPianoWheel);
        this._doc.onChangedPianoRollPattern.addListener(this._onChangedPianoRollPattern);
    }

    private _onMouseOut = (event: MouseEvent): void => {
        this._hoveringNoteIndex = -1;
        this._hoveringNoteHit = NoteHit.None;
        this._hoveringNoteVolumePointIndex = -1;
        this._hoveringNotePitchPointIndex = -1;

        const changed: boolean = (
            this._hoveringNoteIndex !== this._renderedHoveringNoteIndex
            || this._hoveringNoteHit !== this._renderedHoveringNoteHit
            || this._hoveringNoteVolumePointIndex !== this._renderedHoveringNoteVolumePointIndex
            || this._hoveringNotePitchPointIndex !== this._renderedHoveringNotePitchPointIndex
        );

        if (changed) {
            this._state.selectionOverlayIsDirty = true;
            this._ui.scheduleMainRender();
        }
    };

    private _onMouseMove = (event: MouseEvent): void => {
        if (this._activeOperation != null) {
            this._clearHoveredNoteState();
            return;
        }

        // @TODO: I have to guard the checks here based on what bindings are
        // active (e.g. if you can disable stretching notes from the left, then
        // the left handle shouldn't show up).

        // @TODO: It's expensive to query for the bounds here. I don't have a
        // good way to solve this yet though.
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const width: number = bounds.width;
        const height: number = bounds.height;
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        this._computeHoveredNoteState(width, height, mouseX, mouseY);
        if (this._hoveredNoteStateChanged()) {
            this._state.selectionOverlayIsDirty = true;
            this._ui.scheduleMainRender();
        }
    };

    private _computeHoveredNoteState(
        canvasWidth: number,
        canvasHeight: number,
        mouseX: number,
        mouseY: number,
    ): void {
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = canvasWidth / viewportWidth;
        const viewportY0: number = this._state.viewport.y0;
        const viewportY1: number = this._state.viewport.y1;
        const viewportHeight: number = viewportY1 - viewportY0;
        const pixelsPerPitch: number = canvasHeight / viewportHeight;
        const maxPitch: number = this._doc.project.song.maxPitch;

        this._findNoteUnderMouse(canvasWidth, canvasHeight, mouseX, mouseY, this._hoverQueryResult);
        this._hoveringNoteIndex = this._hoverQueryResult.index;
        this._hoveringNoteHit = this._hoverQueryResult.hit;
        this._hoveringNoteVolumePointIndex = -1;
        this._hoveringNotePitchPointIndex = -1;

        if (this._hoveringNoteIndex <= -1) {
            return;
        }

        const note: Note.Type = this._pattern!.notes[this._hoveringNoteIndex];

        if ((this._hoveringNoteHit & NoteHit.Top) !== 0) {
            const pointCount: number = note.volumeEnvelope != null ? note.volumeEnvelope.length : 0;
            for (let pointIndex: number = pointCount - 1; pointIndex >= 0; pointIndex--) {
                const point: Breakpoint.Type = note.volumeEnvelope![pointIndex];
                const pointTime: number = point.time;
                const pitchIndex1: number = Breakpoint.findIndex(note.pitchEnvelope, pointTime);
                const clampedPitchIndex1: number = pitchIndex1 > -1 ? Math.min(pitchIndex1, note.pitchEnvelope!.length - 1) : 0;
                const pitchIndex0: number = Math.max(0, pitchIndex1 - 1);
                const pitch1Value: number = pitchIndex1 > -1 ? note.pitchEnvelope![clampedPitchIndex1].value : 0;
                const pitch0Value: number = pitchIndex1 > -1 ? note.pitchEnvelope![pitchIndex0].value : 0;
                const pitch1Time: number = pitchIndex1 > -1 ? note.pitchEnvelope![clampedPitchIndex1].time : 0;
                const pitch0Time: number = pitchIndex1 > -1 ? note.pitchEnvelope![pitchIndex0].time : 0;
                const pitch1: number = note.pitch + pitch1Value;
                const pitch0: number = note.pitch + pitch0Value;
                const pitch0Y: number = pitchToY(canvasHeight, this._state.viewport, pixelsPerPitch, maxPitch, pitch0);
                const pitch1Y: number = pitchToY(canvasHeight, this._state.viewport, pixelsPerPitch, maxPitch, pitch1);
                const t: number = (
                    pitchIndex1 <= -1
                    ? 0 // In this case, there's no pitch envelope.
                    : pitch0Time === pitch1Time
                        ? 0 // In this case, the pitch bent segment has a duration of 0.
                        : unlerp(pointTime, pitch0Time, pitch1Time)
                );
                const x: number = tickToX(this._state.viewport, pixelsPerTick, note.start + pointTime);
                const baseR: number = (pixelsPerPitch / this._state.noteVolumeHandleSizeFactor) * 0.5;
                const r: number = baseR * this._state.noteEnvelopePointSizeFactor;
                const y: number = lerp(t, pitch0Y, pitch1Y) + baseR;
                const distanceX: number = mouseX - x;
                const distanceY: number = mouseY - y;
                const distanceSquared: number = distanceX * distanceX + distanceY * distanceY;
                if (distanceSquared < r * r) {
                    this._hoveringNoteVolumePointIndex = pointIndex;
                    break;
                }
                if (x + r < mouseX) {
                    // Stop here, since any other points must be entirely to the
                    // left of mouseX now.
                    break;
                }
            }
        }

        if ((this._hoveringNoteHit & NoteHit.Bottom) !== 0) {
            const pointCount: number = note.pitchEnvelope != null ? note.pitchEnvelope.length : 0;
            for (let pointIndex: number = pointCount - 1; pointIndex >= 0; pointIndex--) {
                const point: Breakpoint.Type = note.pitchEnvelope![pointIndex];
                const pointTime: number = point.time;
                const pointValue: number = point.value;
                const pitch: number = note.pitch + pointValue;
                const x: number = tickToX(this._state.viewport, pixelsPerTick, note.start + pointTime);
                const baseR: number = (pixelsPerPitch / this._state.notePitchHandleSizeFactor) * 0.5;
                const r: number = baseR * this._state.noteEnvelopePointSizeFactor;
                const y: number = pitchToY(canvasHeight, this._state.viewport, pixelsPerPitch, maxPitch, pitch) + pixelsPerPitch - baseR;
                const distanceX: number = mouseX - x;
                const distanceY: number = mouseY - y;
                const distanceSquared: number = distanceX * distanceX + distanceY * distanceY;
                if (distanceSquared < r * r) {
                    this._hoveringNotePitchPointIndex = pointIndex;
                    break;
                }
                if (x + r < mouseX) {
                    // Stop here, since any other points must be entirely to the
                    // left of mouseX now.
                    break;
                }
            }
        }
    }

    private _clearHoveredNoteState(): void {
        this._hoveringNoteIndex = -1;
        this._hoveringNoteHit = NoteHit.None;
        this._hoveringNoteVolumePointIndex = -1;
        this._hoveringNotePitchPointIndex = -1;
    }

    private _hoveredNoteStateChanged(): boolean {
        return (
            this._hoveringNoteIndex !== this._renderedHoveringNoteIndex
            || this._hoveringNoteHit !== this._renderedHoveringNoteHit
            || this._hoveringNoteVolumePointIndex !== this._renderedHoveringNoteVolumePointIndex
            || this._hoveringNotePitchPointIndex !== this._renderedHoveringNotePitchPointIndex
        );
    }

    private _onChangedPianoRollPattern = (): void => {
        this.setPattern(this._doc.pianoRollPatternIndex, this._doc.pianoRollTrackIndex, this._doc.pianoRollClipIndex);
    };

    public dispose(): void {
        this._canvasesContainer.removeEventListener("mouseout", this._onMouseOut);
        this._canvasesContainer.removeEventListener("mousemove", this._onMouseMove);
        this._piano.element.removeEventListener("wheel", this._onPianoWheel);

        this._timeScrollBar.dispose();
        this._pitchScrollBar.dispose();
        this._timeRuler.dispose();
        this._piano.dispose();
    }

    public setPattern(patternIndex: number, trackIndex: number, clipIndex: number): void {
        if (this._pattern != null) {
            const patternInfo: PatternInfo | undefined = this._doc.patternInfoCache.get(this._pattern);
            if (patternInfo != null) {
                // @TODO: I may need to save this more often. Haven't really
                // thought about this very much.
                patternInfo.viewportX0 = this._state.viewport.x0;
                patternInfo.viewportY0 = this._state.viewport.y0;
                patternInfo.viewportX1 = this._state.viewport.x1;
                patternInfo.viewportY1 = this._state.viewport.y1;
            }
        }

        const song: Song.Type = this._doc.project.song;

        const clip: Clip.Type = song.tracks[trackIndex].clips[clipIndex];
        this._clip = clip;

        const pattern: Pattern.Type = song.patterns[patternIndex];
        const patternDuration: number = pattern.duration;
        this._pattern = pattern;

        const patternInfo: PatternInfo | undefined = this._doc.patternInfoCache.get(this._pattern);

        const minWidth: number = 1;
        const maxWidth: number = Math.max(minWidth, patternDuration);
        const minHeight: number = 1;
        const maxHeight: number = Math.max(minHeight, song.maxPitch + 1);

        if (
            patternInfo != null
            && patternInfo.viewportX0 != null
            && patternInfo.viewportX1 != null
            && patternInfo.viewportY0 != null
            && patternInfo.viewportY1 != null
        ) {
            const savedX0: number = patternInfo.viewportX0!;
            const savedX1: number = patternInfo.viewportX1!;
            const savedY0: number = patternInfo.viewportY0!;
            const savedY1: number = patternInfo.viewportY1!;

            const newW: number = clamp(savedX1 - savedX0, minWidth, maxWidth);
            const newX: number = lerp(Viewport.computeXPan(savedX0, newW, maxWidth), 0, maxWidth - newW);
            const newH: number = clamp(savedY1 - savedY0, minHeight, maxHeight);
            const newY: number = lerp(Viewport.computeYPan(savedY0, newH, maxHeight), 0, maxHeight - newH);

            this._state.viewport.x0 = newX;
            this._state.viewport.x1 = newX + newW;
            this._state.viewport.y0 = newY;
            this._state.viewport.y1 = newY + newH;

            this._state.viewport.minWidth = minWidth;
            this._state.viewport.maxWidth = maxWidth;
            this._state.viewport.minHeight = minHeight;
            this._state.viewport.maxHeight = maxHeight;
        } else {
            const visibleOctaves: number = 3;
            const startPitch: number = 12 * 4;
            const endPitch: number = startPitch + visibleOctaves * 12;

            this._state.viewport.x0 = 0;
            this._state.viewport.x1 = patternDuration;
            this._state.viewport.y0 = clamp(startPitch, 0, song.maxPitch - 1);
            this._state.viewport.y1 = clamp(endPitch, 0, song.maxPitch + 1);

            this._state.viewport.minWidth = minWidth;
            this._state.viewport.maxWidth = maxWidth;
            this._state.viewport.minHeight = minHeight;
            this._state.viewport.maxHeight = maxHeight;
        }
        if (this._activeOperation != null) {
            this._ui.inputManager.abortSpecificOperationHandler(this._onUpdateOperation);
            this._activeOperation = null;
        }
        this._state.lastCommittedNoteDuration = song.ppqn;
        this._state.lastCommittedNoteVolumeEnvelope = null;
        this._state.lastCommittedNotePitchEnvelope = null;

        this._timeScrollBar.setZoom(Viewport.getXZoom(this._state.viewport));
        this._timeScrollBar.setPan(Viewport.getXPan(this._state.viewport));
        this._pitchScrollBar.setZoom(Viewport.getYZoom(this._state.viewport));
        this._pitchScrollBar.setPan(Viewport.getYPan(this._state.viewport));

        this._renderedPlayhead = null;
        this._renderedPlayheadIsVisible = false;
        this._renderedNotesDirty = true;
        this._state.selectedNotes = [];
        this._state.selectionOverlayIsDirty = true;
        this._clearHoveredNoteState();
        Viewport.clearRendered(this._renderedViewport);

        this._ui.scheduleMainRender();
    }

    public resize(): void {
        if (!this._mounted) {
            return;
        }

        const pitchScrollBarSize: number = this._pitchScrollBar.size;
        const timeScrollBarSize: number = this._timeScrollBar.size;
        const timeRulerSize: number = this._timeRuler.size;
        const pianoSize: number = this._piano.size;
        const rightGapW: number = pitchScrollBarSize;
        const bottomRightGapH: number = timeScrollBarSize;
        const topRightGapH: number = timeRulerSize;
        const oldWidth: number = this._width;
        const oldHeight: number = this._height;
        const newClientWidth: number = this.element.clientWidth;
        const newClientHeight: number = this.element.clientHeight;
        const newWidth: number = Math.max(1, newClientWidth - pianoSize - rightGapW);
        const newHeight: number = Math.max(1, newClientHeight - topRightGapH - bottomRightGapH);

        Viewport.resize(this._state.viewport, oldWidth, oldHeight, newWidth, newHeight);
        this._timeScrollBar.setZoom(Viewport.getXZoom(this._state.viewport));
        this._timeScrollBar.setPan(Viewport.getXPan(this._state.viewport));
        this._pitchScrollBar.setZoom(Viewport.getYZoom(this._state.viewport));
        this._pitchScrollBar.setPan(Viewport.getYPan(this._state.viewport));

        // @TODO: I probably should really be driving this mostly from CSS.

        this._width = newWidth;
        this._height = newHeight;
        this._canvasesContainer.style.width = newWidth + "px";
        this._canvasesContainer.style.height = newHeight + "px";
        this._timeScrollBar.resize(newWidth, timeScrollBarSize);
        this._pitchScrollBar.element.style.top = `${topRightGapH}px`;
        this._pitchScrollBar.resize(pitchScrollBarSize, newHeight);
        this._timeRuler.resize(newWidth);
        this._piano.element.style.top = `${topRightGapH}px`;
        this._piano.resize(newHeight);

        this._gridCanvasResized = true;
        this._notesCanvasResized = true;
        this._offscreenNotesCanvasResized = true;
        this._selectionOverlayCanvasResized = true;
        this._playheadOverlayCanvasResized = true;
        this._pitchScrollBarOverlayResized = true;
        this._renderedNotesDirty = true;
        this._state.selectionOverlayIsDirty = true;
        Viewport.clearRendered(this._renderedViewport);

        this._ui.scheduleMainRender();
    }

    public render(): void {
        if (!this._mounted) {
            this._onDidMount();
        }

        if (this._doc.playing) {
            let targetPlayhead: number | null = this._doc.getPlayheadInTicks(this._ui.frame);
            if (targetPlayhead != null) {
                if (this._clip != null) {
                    const clip: Clip.Type = this._clip;
                    const clipStart: number = clip.start;
                    const clipEnd: number = clip.end;
                    const patternDuration: number = this._pattern!.duration;

                    if (insideRange(targetPlayhead, clipStart, clipEnd)) {
                        targetPlayhead = (targetPlayhead - clipStart) % patternDuration;
                        this._playheadIsVisible = true;
                    } else {
                        this._playheadIsVisible = false;
                        targetPlayhead = 0;
                    }
                }

                // @TODO: Non-hacky smoothing of the playhead position.
                if (targetPlayhead < this._playhead) {
                    this._playhead = targetPlayhead;
                } else {
                    this._playhead += (targetPlayhead - this._playhead) * 0.5;
                }
            }

            // @TODO: Optimize this case. The problem here is if we zoom in and
            // a long note is playing, the playing note indicator should still
            // fade out, even though the playhead is not actually visible.
            // Thinking more about it, maybe I just shouldn't do anything about
            // this case. We only do work linearly proportional to the amount of
            // notes that intersect the playhead, which can't be very large or
            // we'll have other issues anyway. So it's probably fine already.
            // this._playheadIsVisible = this._playhead != null && (
            //     insideRange(this._playhead, this._viewportX0, this._viewportX1)
            // );
        } else {
            this._playhead = 0;
            this._playheadIsVisible = false;
        }

        const hoveringOverStartOfNote: boolean = (this._hoveringNoteHit & NoteHit.Left) !== 0;
        const hoveringOverEndOfNote: boolean = (this._hoveringNoteHit & NoteHit.Right) !== 0;
        const hoveringOverTopOfNote: boolean = (this._hoveringNoteHit & NoteHit.Top) !== 0;
        const hoveringOverBottomOfNote: boolean = (this._hoveringNoteHit & NoteHit.Bottom) !== 0;

        if (hoveringOverTopOfNote) {
            const hoveringOverVolumePoint: boolean = this._hoveringNoteVolumePointIndex !== -1;
            if (hoveringOverVolumePoint) {
                this._cursor = "n-resize";
            } else {
                this._cursor = "copy";
            }
        } else if (hoveringOverBottomOfNote) {
            const hoveringOverPitchPoint: boolean = this._hoveringNotePitchPointIndex !== -1;
            if (hoveringOverPitchPoint) {
                this._cursor = "s-resize";
            } else {
                this._cursor = "copy";
            }
        } else if (this._activeOperation instanceof MoveNoteVolumePointBounded) {
            this._cursor = "n-resize";
        } else if (this._activeOperation instanceof MoveNotePitchPointBounded) {
            this._cursor = "s-resize";
        } else if (hoveringOverStartOfNote || this._activeOperation instanceof LeftStretchNote) {
            this._cursor = "w-resize";
        } else if (hoveringOverEndOfNote || this._activeOperation instanceof RightStretchNote) {
            this._cursor = "e-resize";
        } else {
            this._cursor = "default";
        }
        if (this._cursor !== this._renderedCursor) {
            this.element.style.cursor = this._cursor;
            this._renderedCursor = this._cursor;
        }

        this._renderGrid();
        this._renderNotes();
        this._renderSelectionOverlay();
        this._renderPlayhead();
        this._pitchScrollBar.render();
        this._timeScrollBar.render();
        this._timeRuler.setViewport(this._state.viewport);
        this._timeRuler.setPpqn(this._doc.project.song.ppqn);
        this._timeRuler.setBeatsPerBar(this._doc.project.song.beatsPerBar);
        this._timeRuler.render();
        this._piano.setViewport(this._state.viewport);
        this._piano.render();

        this._renderedHoveringNoteIndex = this._hoveringNoteIndex;
        this._renderedHoveringNoteHit = this._hoveringNoteHit;
        this._renderedHoveringNoteVolumePointIndex = this._hoveringNoteVolumePointIndex;
        this._renderedHoveringNotePitchPointIndex = this._hoveringNotePitchPointIndex;
        this._renderedNotesDirty = false;
        this._state.selectionOverlayIsDirty = false;
        this._renderedViewport = Viewport.updateRendered(this._renderedViewport, this._state.viewport);
        this._renderedPlayhead = this._playhead;
        this._renderedPlayheadIsVisible = this._playheadIsVisible;
    }

    private _renderGrid(): void {
        if (
            !Viewport.isDirty(this._renderedViewport, this._state.viewport, Viewport.DirtyCheckOptions.Both)
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
        const context: CanvasRenderingContext2D = this._gridContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportY0: number = this._state.viewport.y0;
        const viewportY1: number = this._state.viewport.y1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;

        context.fillStyle = "#303030";
        context.fillRect(0, 0, width, height);

        {
            // Octaves.
            context.fillStyle = "#886644";

            let worldY: number = Math.max(0, Math.floor(viewportY0) - 1);
            while (worldY < viewportY1) {
                if (worldY % 12 === 0) {
                    const screenY: number = remap(worldY, viewportY0, viewportY1, height, 0);
                    const x: number = 0;
                    const w: number = width;
                    const h: number = screenY - remap(worldY + 1, viewportY0, viewportY1, height, 0);
                    const y: number = screenY - h;

                    context.fillRect(x, y, w, h);
                }

                worldY++;
            }
        }

        {
            // Fifths.
            context.fillStyle = "#446688";

            let worldY: number = Math.max(0, Math.floor(viewportY0) - 1);
            while (worldY < viewportY1) {
                if (worldY % 12 === 7) {
                    const screenY: number = remap(worldY, viewportY0, viewportY1, height, 0);
                    const x: number = 0;
                    const w: number = width;
                    const h: number = screenY - remap(worldY + 1, viewportY0, viewportY1, height, 0);
                    const y: number = screenY - h;

                    context.fillRect(x, y, w, h);
                }

                worldY++;
            }
        }

        {
            // Pitch grid.
            context.strokeStyle = "#000000";

            let worldY: number = Math.max(0, Math.floor(viewportY0) - 1);
            while (worldY < viewportY1) {
                const screenY: number = remap(worldY, viewportY0, viewportY1, height, 0) | 0;

                context.beginPath();
                context.moveTo(0, screenY);
                context.lineTo(width, screenY);
                context.stroke();

                worldY++;
            }
        }

        {
            // Time grid.

            // @TODO: I think this needs to use an iterator, based on the time
            // signature markers.

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

    private _renderNotes(): void {
        if (
            !this._renderedNotesDirty
            && !Viewport.isDirty(this._renderedViewport, this._state.viewport, Viewport.DirtyCheckOptions.Both)
            && !this._notesCanvasResized
            && !this._offscreenNotesCanvasResized
        ) {
            return;
        }

        if (this._notesCanvasResized) {
            this._notesCanvasResized = false;
            this._notesCanvas.width = this._width;
            this._notesCanvas.height = this._height;
        }

        if (this._offscreenNotesCanvasResized) {
            this._offscreenNotesCanvasResized = false;
            this._offscreenNotesCanvas.width = this._width;
            this._offscreenNotesCanvas.height = this._timeRuler.size + this._height + this._timeScrollBar.size;
        }

        const offscreenNotesContext: CanvasRenderingContext2D = this._offscreenNotesContext;
        const context: CanvasRenderingContext2D = this._notesContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const viewportY0: number = this._state.viewport.y0;
        const viewportY1: number = this._state.viewport.y1;
        const viewportHeight: number = viewportY1 - viewportY0;
        const pixelsPerPitch: number = height / viewportHeight;
        const maxPitch: number = this._doc.project.song.maxPitch;

        let selectedNotes: Map<Note.Type, NoteTransform> | undefined = undefined;
        if (this._activeOperation != null && this._activeOperation.kind === OperationKind.Note) {
            selectedNotes = this._activeOperation.notes;
        }

        context.strokeStyle = "#000000";
        context.lineWidth = 1;

        offscreenNotesContext.clearRect(0, 0, width, this._timeRuler.size + this._height + this._timeScrollBar.size);
        context.clearRect(0, 0, width, height);

        if (this._pattern == null) {
            return;
        }

        // @TODO: Batch these? The issue is that it changes how they look.

        // @TODO: Inline findOverlapping manually.
        IITree.findOverlapping(
            this._pattern.notes,
            this._pattern.notesMaxLevel,
            viewportX0,
            viewportX1,
            (note: Note.Type, index: number) => {
                if (selectedNotes != null && selectedNotes.has(note)) {
                    return;
                }

                context.fillStyle = "#0c6735";
                const backgroundIsVisible: boolean = drawNoteBackground(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    note.start,
                    note.end,
                    note.pitch,
                    note.pitchEnvelope,
                    note.volumeEnvelope,
                );
                context.fillStyle = "#17d15b";
                drawNoteForeground(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    note.start,
                    note.end,
                    note.pitch,
                    note.pitchEnvelope,
                    note.volumeEnvelope,
                );

                const noteIsVisible: boolean = (
                    noteIsFlat(this._state.noteDrawingStyle, note)
                    ? insideRange(note.pitch, viewportY0, viewportY1)
                    : backgroundIsVisible
                );

                if (!noteIsVisible) {
                    offscreenNotesContext.fillStyle = "#17d15b";
                    const x0: number = tickToX(this._state.viewport, pixelsPerTick, note.start);
                    const x1: number = tickToX(this._state.viewport, pixelsPerTick, note.end);
                    const x: number = x0;
                    const w: number = Math.max(1, x1 - x0);
                    const h: number = 4;
                    const y: number = (
                        note.pitch >= this._state.viewport.y1
                        ? this._timeRuler.size - h
                        : this._timeRuler.size + this._height
                    );
                    offscreenNotesContext.fillRect(x, y, w, h);
                }
            },
        );
        if (selectedNotes != null && this._activeOperation != null) {
            for (const [_, transform] of selectedNotes) {
                context.fillStyle = "#0c6735";
                drawNoteBackground(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    transform.newStart,
                    transform.newEnd,
                    transform.newPitch,
                    transform.newPitchEnvelope,
                    transform.newVolumeEnvelope,
                );
                context.fillStyle = "#17d15b";
                drawNoteForeground(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    transform.newStart,
                    transform.newEnd,
                    transform.newPitch,
                    transform.newPitchEnvelope,
                    transform.newVolumeEnvelope,
                );
            }
        }
    }

    private _renderSelectionOverlay(): void {
        if (
            !this._state.selectionOverlayIsDirty
            && !Viewport.isDirty(this._renderedViewport, this._state.viewport, Viewport.DirtyCheckOptions.Both)
            && !this._selectionOverlayCanvasResized
        ) {
            return;
        }

        if (this._selectionOverlayCanvasResized) {
            this._selectionOverlayCanvasResized = false;
            this._selectionOverlayCanvas.width = this._width;
            this._selectionOverlayCanvas.height = this._height;
        }

        const context: CanvasRenderingContext2D = this._selectionOverlayContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const viewportY0: number = this._state.viewport.y0;
        const viewportY1: number = this._state.viewport.y1;
        const viewportHeight: number = viewportY1 - viewportY0;
        const pixelsPerPitch: number = height / viewportHeight;
        const maxPitch: number = this._doc.project.song.maxPitch;

        context.clearRect(0, 0, width, height);

        if (this._pattern == null) {
            return;
        }

        context.fillStyle = "rgba(255, 255, 255, 0.8)";
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2;

        const selectedNoteCount: number = this._state.selectedNotes.length;
        if (selectedNoteCount > 0) {
            for (let i: number = 0; i < selectedNoteCount; i++) {
                const note: Note.Type = this._state.selectedNotes[i];
                if (!rangesOverlap(note.start, note.end, viewportX0, viewportX1)) {
                    continue;
                }

                if (
                    this._activeOperation != null
                    && this._activeOperation.notes != null
                    && this._activeOperation.notes.has(note)
                ) {
                    continue;
                }

                drawNoteOutline(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    note.start,
                    note.end,
                    note.pitch,
                    note.pitchEnvelope,
                    note.volumeEnvelope,
                );
            }
        }

        if (this._state.boxSelectionActive) {
            const bx0: number = this._state.boxSelectionX0;
            const bx1: number = this._state.boxSelectionX1;
            const by0: number = this._state.boxSelectionY0;
            const by1: number = this._state.boxSelectionY1;

            const x0: number = (bx0 - viewportX0) * pixelsPerTick;
            const x1: number = (bx1 - viewportX0) * pixelsPerTick;
            const y0: number = (height - pixelsPerPitch) - ((by0 - viewportY0) * pixelsPerPitch);
            const y1: number = (height - pixelsPerPitch) - ((by1 - viewportY0) * pixelsPerPitch);
            const x: number = x0;
            const y: number = y0;
            const w: number = x1 - x0;
            const h: number = y1 - y0;

            context.fillStyle = "rgba(255, 255, 255, 0.2)";
            context.fillRect(x, y, w, h);
            context.strokeRect(x, y, w, h);
        }

        if (this._hoveringNoteIndex !== -1) {
            // @TODO: This is a bit error prone, e.g. the index could be out of
            // bounds. Maybe I should be defensive about that, but also that's
            // just a bug elsewhere. Maybe this should be loud and throw an
            // exception in those cases.
            const note: Note.Type = this._pattern.notes[this._hoveringNoteIndex];

            if (this._hoveringNoteHit !== NoteHit.None) {
                context.fillStyle = "rgba(255, 255, 255, 0.4)";
            }

            const hoveringOverStartOfNote: boolean = (this._hoveringNoteHit & NoteHit.Left) !== 0;
            const hoveringOverEndOfNote: boolean = (this._hoveringNoteHit & NoteHit.Right) !== 0;
            const hoveringOverTopOfNote: boolean = (this._hoveringNoteHit & NoteHit.Top) !== 0;
            const hoveringOverBottomOfNote: boolean = (this._hoveringNoteHit & NoteHit.Bottom) !== 0;

            if (hoveringOverTopOfNote) {
                drawNoteTopHandle(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    this._state.noteVolumeHandleSizeFactor,
                    note.start,
                    note.end,
                    note.pitch,
                    note.pitchEnvelope,
                    note.volumeEnvelope,
                );

                context.lineWidth = 1;
                context.strokeStyle = "rgb(255, 255, 255)";
                context.fillStyle = "rgb(255, 255, 255)";
                const pointCount: number = note.volumeEnvelope != null ? note.volumeEnvelope.length : 0;
                for (let pointIndex: number = 0; pointIndex < pointCount; pointIndex++) {
                    const hovering: boolean = pointIndex === this._hoveringNoteVolumePointIndex;
                    const point: Breakpoint.Type = note.volumeEnvelope![pointIndex];
                    const pointTime: number = point.time;
                    if (note.start + pointTime > note.end) {
                        break;
                    }
                    const pitchIndex1: number = Breakpoint.findIndex(note.pitchEnvelope, pointTime);
                    const clampedPitchIndex1: number = pitchIndex1 > -1 ? Math.min(pitchIndex1, note.pitchEnvelope!.length - 1) : 0;
                    const pitchIndex0: number = Math.max(0, pitchIndex1 - 1);
                    const pitch1Value: number = pitchIndex1 > -1 ? note.pitchEnvelope![clampedPitchIndex1].value : 0;
                    const pitch0Value: number = pitchIndex1 > -1 ? note.pitchEnvelope![pitchIndex0].value : 0;
                    const pitch1Time: number = pitchIndex1 > -1 ? note.pitchEnvelope![clampedPitchIndex1].time : 0;
                    const pitch0Time: number = pitchIndex1 > -1 ? note.pitchEnvelope![pitchIndex0].time : 0;
                    const pitch1: number = note.pitch + pitch1Value;
                    const pitch0: number = note.pitch + pitch0Value;
                    const pitch0Y: number = pitchToY(height, this._state.viewport, pixelsPerPitch, maxPitch, pitch0);
                    const pitch1Y: number = pitchToY(height, this._state.viewport, pixelsPerPitch, maxPitch, pitch1);
                    const t: number = (
                        pitchIndex1 <= -1
                        ? 0 // In this case, there's no pitch envelope.
                        : pitch0Time === pitch1Time
                            ? 0 // In this case, the pitch bent segment has a duration of 0.
                            : unlerp(pointTime, pitch0Time, pitch1Time)
                    );
                    const x: number = tickToX(this._state.viewport, pixelsPerTick, note.start + pointTime);
                    const baseR: number = (pixelsPerPitch / this._state.noteVolumeHandleSizeFactor) * 0.5;
                    const r: number = baseR * this._state.noteEnvelopePointSizeFactor;
                    const y: number = lerp(t, pitch0Y, pitch1Y) + baseR;
                    context.beginPath();
                    context.arc(x, y, r * (hovering ? 1 : 0.5), 0, Math.PI * 2.0, false);
                    if (hovering) {
                        context.fill();
                    } else {
                        context.stroke();
                    }
                }
            } else if (hoveringOverBottomOfNote) {
                drawNoteBottomHandle(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    this._state.notePitchHandleSizeFactor,
                    note.start,
                    note.end,
                    note.pitch,
                    note.pitchEnvelope,
                    note.volumeEnvelope,
                );

                context.lineWidth = 1;
                context.strokeStyle = "rgb(255, 255, 255)";
                context.fillStyle = "rgb(255, 255, 255)";
                const pointCount: number = note.pitchEnvelope != null ? note.pitchEnvelope.length : 0;
                for (let pointIndex: number = 0; pointIndex < pointCount; pointIndex++) {
                    const hovering: boolean = pointIndex === this._hoveringNotePitchPointIndex;
                    const point: Breakpoint.Type = note.pitchEnvelope![pointIndex];
                    const pointTime: number = point.time;
                    if (note.start + pointTime > note.end) {
                        break;
                    }
                    const pointValue: number = point.value;
                    const pitch: number = note.pitch + pointValue;
                    const x: number = tickToX(this._state.viewport, pixelsPerTick, note.start + pointTime);
                    const baseR: number = (pixelsPerPitch / this._state.notePitchHandleSizeFactor) * 0.5;
                    const r: number = baseR * this._state.noteEnvelopePointSizeFactor;
                    const y: number = pitchToY(height, this._state.viewport, pixelsPerPitch, maxPitch, pitch) + pixelsPerPitch - baseR;
                    context.beginPath();
                    context.arc(x, y, r * (hovering ? 1 : 0.5), 0, Math.PI * 2.0, false);
                    if (hovering) {
                        context.fill();
                    } else {
                        context.stroke();
                    }
                }
            } else if (hoveringOverStartOfNote) {
                drawNoteLeftHandle(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    this._state.noteStretchHandleSize,
                    note.start,
                    note.end,
                    note.pitch,
                    note.pitchEnvelope,
                    note.volumeEnvelope,
                );
            } else if (hoveringOverEndOfNote) {
                drawNoteRightHandle(
                    this._bentNoteIterator,
                    this._state.noteDrawingStyle,
                    context,
                    width,
                    height,
                    this._state.viewport,
                    pixelsPerTick,
                    pixelsPerPitch,
                    maxPitch,
                    this._state.noteStretchHandleSize,
                    note.start,
                    note.end,
                    note.pitch,
                    note.pitchEnvelope,
                    note.volumeEnvelope,
                );
            }
        }
    }

    private _renderPlayhead(): void {
        // I've experimented with using a div instead of an entire canvas for
        // this, but it seems that (at least on Firefox here) it's cheaper to
        // paint this than a DOM element. Didn't matter if I used top/left or
        // translate(x, y).

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

        const context: CanvasRenderingContext2D = this._playheadOverlayContext;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportY0: number = this._state.viewport.y0;
        const viewportY1: number = this._state.viewport.y1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        const viewportHeight: number = viewportY1 - viewportY0;
        const pixelsPerPitch: number = height / viewportHeight;
        const playhead: number | null = this._playhead;
        const maxPitch: number = this._doc.project.song.maxPitch;

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
            if (this._animatePlayingNotes && this._pattern != null) {
                IITree.findOverlapping(
                    this._pattern.notes,
                    this._pattern.notesMaxLevel,
                    playhead,
                    playhead,
                    (note: Note.Type, index: number) => {
                        drawNoteFlash(
                            this._bentNoteIterator,
                            this._state.noteDrawingStyle,
                            context,
                            width,
                            height,
                            this._state.viewport,
                            pixelsPerTick,
                            pixelsPerPitch,
                            maxPitch,
                            playhead,
                            note.start,
                            note.end,
                            note.pitch,
                            note.pitchEnvelope,
                            note.volumeEnvelope,
                        );
                    },
                );
            }
        }
    }

    private _onDidMount(): void {
        this._mounted = true;
    }

    private _onTimeScrollBarChange = (zoom: number, pan: number): void => {
        if (Viewport.zoomAndPanX(this._state.viewport, zoom, pan)) {
            this._ui.scheduleMainRender();
        }
    };

    private _onPitchScrollBarChange = (zoom: number, pan: number): void => {
        if (Viewport.zoomAndPanY(this._state.viewport, zoom, pan)) {
            this._ui.scheduleMainRender();
        }
    };

    private _onPitchScrollBarRenderOverlay = (
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
    ): void => {
        if (this._pitchScrollBarOverlayResized) {
            this._pitchScrollBarOverlayResized = false;
            canvas.width = width;
            canvas.height = height;
            this._pitchScrollBarOverlayDirty = true;
        }

        if (this._pitchScrollBarOverlayDirty) {
            this._pitchScrollBarOverlayDirty = false;

            const maxViewportHeight: number = this._state.viewport.maxHeight;

            context.clearRect(0, 0, width, height);
            context.fillStyle = "#886644";
            let worldY: number = 0;
            while (worldY < maxViewportHeight) {
                const screenY: number = remap(worldY, 0, maxViewportHeight, height, 0);
                if (worldY % 12 === 0) {
                    const x: number = 1;
                    const w: number = width - 2;
                    const h: number = screenY - remap(worldY + 1, 0, maxViewportHeight, height, 0);
                    const y: number = screenY - h;
                    context.fillRect(x, y, w, h);
                }
                worldY++;
            }
        }
    };

    private _hoveringOverAnyNote(width: number, height: number, mouseX: number, mouseY: number): boolean {
        this._findNoteUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
        return this._hoverQueryResult.index !== -1;
    }

    private _findNoteUnderMouse(
        canvasWidth: number,
        canvasHeight: number,
        mouseX: number,
        mouseY: number,
        result: HoverQueryResult,
    ): void {
        result.index = -1;
        result.hit = NoteHit.None;

        if (this._pattern == null) {
            return;
        }

        const outsideCanvas: boolean = !insideRange(mouseX, 0, canvasWidth) || !insideRange(mouseY, 0, canvasHeight);
        if (!outsideCanvas) {
            const viewportX0: number = this._state.viewport.x0;
            const viewportX1: number = this._state.viewport.x1;
            const viewportY0: number = this._state.viewport.y0;
            const viewportY1: number = this._state.viewport.y1;
            const viewportWidth: number = viewportX1 - viewportX0;
            const pixelsPerTick: number = canvasWidth / viewportWidth;
            const viewportHeight: number = viewportY1 - viewportY0;
            const pixelsPerPitch: number = canvasHeight / viewportHeight;
            const maxPitch: number = this._doc.project.song.maxPitch;
            const searchWindowStart: number = (
                this._state.viewport.x0 + remap(mouseX, 0, canvasWidth, 0, viewportWidth)
            ) | 0;
            const searchWindowEnd: number = searchWindowStart + 1;

            // @TODO: Inline findOverlapping manually.
            IITree.findOverlapping(
                this._pattern.notes,
                this._pattern.notesMaxLevel,
                searchWindowStart,
                searchWindowEnd,
                (note: Note.Type, index: number) => {
                    const overlapResult: NoteHit = pointOverlapsNote(
                        this._bentNoteIterator,
                        mouseX,
                        mouseY,
                        note,
                        this._state.noteDrawingStyle,
                        this._state.noteStretchHandleSize,
                        this._state.noteVolumeHandleSizeFactor,
                        this._state.notePitchHandleSizeFactor,
                        canvasWidth,
                        canvasHeight,
                        this._state.viewport,
                        pixelsPerTick,
                        pixelsPerPitch,
                        maxPitch,
                    );
                    const isInsideNote: boolean = (overlapResult & NoteHit.Inside) !== 0;

                    if (isInsideNote) {
                        // We keep rewriting these until we hit the latest note.
                        // If we only wrote once, we'd report the earliest note.
                        result.index = index;
                        result.hit = overlapResult;
                    }
                },
            );
        }
    }

    public _mouseIsOnStartOfNote(
        index: number,
        canvasWidth: number,
        canvasHeight: number,
        mouseX: number,
        mouseY: number,
    ): boolean {
        if (index === -1 || this._pattern == null) {
            return false;
        }

        const note: Note.Type = this._pattern.notes[index];

        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportY0: number = this._state.viewport.y0;
        const viewportY1: number = this._state.viewport.y1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = canvasWidth / viewportWidth;
        const viewportHeight: number = viewportY1 - viewportY0;
        const pixelsPerPitch: number = canvasHeight / viewportHeight;
        const maxPitch: number = this._doc.project.song.maxPitch;

        const overlapResult: NoteHit = pointOverlapsNote(
            this._bentNoteIterator,
            mouseX,
            mouseY,
            note,
            this._state.noteDrawingStyle,
            this._state.noteStretchHandleSize,
            this._state.noteVolumeHandleSizeFactor,
            this._state.notePitchHandleSizeFactor,
            canvasWidth,
            canvasHeight,
            this._state.viewport,
            pixelsPerTick,
            pixelsPerPitch,
            maxPitch,
        );
        const isOnStartHandle: boolean = (overlapResult & NoteHit.Left) !== 0;

        return isOnStartHandle;
    }

    public _mouseIsOnEndOfNote(
        index: number,
        canvasWidth: number,
        canvasHeight: number,
        mouseX: number,
        mouseY: number,
    ): boolean {
        if (index === -1 || this._pattern == null) {
            return false;
        }

        const note: Note.Type = this._pattern.notes[index];

        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportY0: number = this._state.viewport.y0;
        const viewportY1: number = this._state.viewport.y1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = canvasWidth / viewportWidth;
        const viewportHeight: number = viewportY1 - viewportY0;
        const pixelsPerPitch: number = canvasHeight / viewportHeight;
        const maxPitch: number = this._doc.project.song.maxPitch;

        const overlapResult: NoteHit = pointOverlapsNote(
            this._bentNoteIterator,
            mouseX,
            mouseY,
            note,
            this._state.noteDrawingStyle,
            this._state.noteStretchHandleSize,
            this._state.noteVolumeHandleSizeFactor,
            this._state.notePitchHandleSizeFactor,
            canvasWidth,
            canvasHeight,
            this._state.viewport,
            pixelsPerTick,
            pixelsPerPitch,
            maxPitch,
        );
        const isOnEndHandle: boolean = (overlapResult & NoteHit.Right) !== 0;

        return isOnEndHandle;
    }

    public _mouseIsOnMiddleOfNote(
        index: number,
        canvasWidth: number,
        canvasHeight: number,
        mouseX: number,
        mouseY: number,
    ): boolean {
        if (index === -1 || this._pattern == null) {
            return false;
        }

        const note: Note.Type = this._pattern.notes[index];

        const viewportX0: number = this._state.viewport.x0;
        const viewportX1: number = this._state.viewport.x1;
        const viewportY0: number = this._state.viewport.y0;
        const viewportY1: number = this._state.viewport.y1;
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = canvasWidth / viewportWidth;
        const viewportHeight: number = viewportY1 - viewportY0;
        const pixelsPerPitch: number = canvasHeight / viewportHeight;
        const maxPitch: number = this._doc.project.song.maxPitch;

        const overlapResult: NoteHit = pointOverlapsNote(
            this._bentNoteIterator,
            mouseX,
            mouseY,
            note,
            this._state.noteDrawingStyle,
            this._state.noteStretchHandleSize,
            this._state.noteVolumeHandleSizeFactor,
            this._state.notePitchHandleSizeFactor,
            canvasWidth,
            canvasHeight,
            this._state.viewport,
            pixelsPerTick,
            pixelsPerPitch,
            maxPitch,
        );
        const isOnStartHandle: boolean = (overlapResult & NoteHit.Left) !== 0;
        const isOnEndHandle: boolean = (overlapResult & NoteHit.Right) !== 0;
        const isInsideNote: boolean = (overlapResult & NoteHit.Inside) !== 0;

        // @TODO: Ignore start and end handles once the note width is so tiny
        // that it can't fit the start and end handles + the gap in the middle.

        return isInsideNote && !isOnStartHandle && !isOnEndHandle;
    }

    private _zoomAroundMouseHorizontally(zoomIn: boolean, clientX: number): void {
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const width: number = bounds.width;
        const mouseX: number = clientX - bounds.left;

        let factor: number = 1.25;
        if (zoomIn) {
            factor = 1.0 / factor;
        }

        if (Viewport.zoomAroundPointX(this._state.viewport, unlerp(mouseX, 0, width), factor)) {
            this._timeScrollBar.setZoom(Viewport.getXZoom(this._state.viewport));
            this._timeScrollBar.setPan(Viewport.getXPan(this._state.viewport));

            this._renderedNotesDirty = true;
            this._state.selectionOverlayIsDirty = true;
            Viewport.clearRendered(this._renderedViewport);

            this._ui.scheduleMainRender();
        }
    }

    private _zoomAroundMouseVertically(zoomIn: boolean, clientY: number): void {
        const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
        const height: number = bounds.height;
        const mouseY: number = clientY - bounds.top;

        let factor: number = 1.25;
        if (zoomIn) {
            factor = 1.0 / factor;
        }

        if (Viewport.zoomAroundPointY(this._state.viewport, unlerp(mouseY, height, 0), factor)) {
            this._pitchScrollBar.setZoom(Viewport.getYZoom(this._state.viewport));
            this._pitchScrollBar.setPan(Viewport.getYPan(this._state.viewport));

            this._renderedNotesDirty = true;
            this._state.selectionOverlayIsDirty = true;
            Viewport.clearRendered(this._renderedViewport);

            this._ui.scheduleMainRender();
        }
    }

    private _scrollVertically(up: boolean): void {
        const factor: number = (up ? 1 : -1) / 24;

        if (Viewport.scrollY(this._state.viewport, factor)) {
            this._pitchScrollBar.setPan(Viewport.getYPan(this._state.viewport));

            this._renderedNotesDirty = true;
            this._state.selectionOverlayIsDirty = true;
            Viewport.clearRendered(this._renderedViewport);

            this._ui.scheduleMainRender();
        }
    }

    // @TODO: Use actions for this.
    private _onPianoWheel = (event: WheelEvent): void => {
        const bounds: DOMRect = this._piano.element.getBoundingClientRect();
        const width: number = bounds.width;
        const height: number = bounds.height;
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        if (!insideRange(mouseX, 0, width) || !insideRange(mouseY, 0, height)) {
            return;
        }

        this._scrollVertically(event.deltaY < 0);
    };

    public onAction = (kind: ActionKind, context: OperationContext): ActionResponse => {
        if (this._pattern == null) {
            return ActionResponse.NotApplicable;
        }

        switch (kind) {
            case ActionKind.CreateNote: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                if (!this._hoveringOverAnyNote(width, height, mouseX, mouseY)) {
                    this._clearHoveredNoteState();
                    this._state.selectedNotes = [];
                    this._state.selectionOverlayIsDirty = true;

                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                    const cursorPpqn: number = (this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)) | 0;
                    const cursorPitch: number = (this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight)) | 0;
                    const song: Song.Type = this._doc.project.song;
                    const duration: number = this._state.lastCommittedNoteDuration;
                    const start: number = clamp(cursorPpqn, 0, this._pattern.duration - 1);
                    const end: number = clamp(cursorPpqn + duration, 0, this._pattern.duration);
                    const actualDuration: number = end - start;
                    const absActualDuration: number = Math.abs(actualDuration);
                    const pitch: number = clamp(cursorPitch, 0, song.maxPitch);
                    if (absActualDuration > 0) {
                        const pitchEnvelope: Breakpoint.Type[] | null = (
                            this._state.lastCommittedNotePitchEnvelope == null
                            ? null
                            : Breakpoint.cloneArray(this._state.lastCommittedNotePitchEnvelope)
                        );

                        if (pitchEnvelope != null && pitchEnvelope.length > 0) {
                            // The pitch envelope that we're inheriting may have a first point with some non-0 value.
                            // This is confusing, because when you click, the note won't show up where you clicked,
                            // but a bit above or below it, so here we make at least the first point match our click.
                            const difference: number = pitchEnvelope[0].value;
                            const pointCount: number = pitchEnvelope.length;
                            for (let pointIndex: number = 0; pointIndex < pointCount; pointIndex++) {
                                const point: Breakpoint.Type = pitchEnvelope[pointIndex];
                                point.value -= difference;
                            }
                        }

                        const volumeEnvelope: Breakpoint.Type[] | null = (
                            this._state.lastCommittedNoteVolumeEnvelope == null
                            ? null
                            : Breakpoint.cloneArray(this._state.lastCommittedNoteVolumeEnvelope)
                        );

                        this._doc.insertNote(
                            this._pattern,
                            start,
                            end,
                            pitch,
                            pitchEnvelope,
                            volumeEnvelope,
                        );

                        this._renderedNotesDirty = true;
                        this._ui.scheduleMainRender();

                        return ActionResponse.Done;
                    }
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.PaintFlatNote: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX0: number = context.x0 - bounds.left;
                const mouseY0: number = context.y0 - bounds.top;

                if (!this._hoveringOverAnyNote(width, height, mouseX0, mouseY0)) {
                    const mouseX1: number = context.x1 - bounds.left;

                    this._clearHoveredNoteState();
                    this._state.selectedNotes = [];
                    this._state.selectionOverlayIsDirty = true;

                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                    const cursorPpqn0: number = (this._state.viewport.x0 + remap(mouseX0, 0, width, 0, viewportWidth)) | 0;
                    const cursorPpqn1: number = (this._state.viewport.x0 + remap(mouseX1, 0, width, 0, viewportWidth)) | 0;
                    const cursorPitch: number = (this._state.viewport.y0 + remap(mouseY0, height, 0, 0, viewportHeight)) | 0;
                    const song: Song.Type = this._doc.project.song;
                    const start: number = clamp(cursorPpqn0, 0, this._pattern.duration - 1);
                    const end: number = clamp(cursorPpqn1, 0, this._pattern.duration);
                    const pitch: number = clamp(cursorPitch, 0, song.maxPitch);
                    const fakeNote: Note.Type = Note.make(
                        start,
                        end,
                        pitch,
                        // The id being 0 is okay. We won't insert this into any
                        // of our custom hash tables, since it's fake. We just
                        // need this because of NoteTransform.
                        // @TODO: Change NoteTransform for this?
                        /* idLo */ 0,
                        /* idHi */ 0,
                        /* pitchEnvelope */ null,
                        /* volumeEnvelope */ null,
                    );

                    this._activeOperation = new PaintFlatNote(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        new Map([[fakeNote, {
                            newStart: start,
                            newEnd: end,
                            newPitch: pitch,
                            newPitchEnvelope: null,
                            newVolumeEnvelope: null,
                        }]]),
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);
                    this._ui.scheduleMainRender();

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.RemoveNote: {
                if (isKeyboardGesture(context.gesture1)) {
                    if (this._state.selectedNotes.length > 0) {
                        const notes: Note.Type[] = this._state.selectedNotes;

                        this._clearHoveredNoteState();
                        this._state.selectedNotes = [];
                        this._state.selectionOverlayIsDirty = true;

                        this._doc.removeNotes(this._pattern, notes);

                        this._renderedNotesDirty = true;
                        this._ui.scheduleMainRender();

                        return ActionResponse.Done;
                    }
                } else {
                    if (!mouseStartedInside(context, this._canvasesContainer)) {
                        return ActionResponse.NotApplicable;
                    }

                    const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                    const width: number = bounds.width;
                    const height: number = bounds.height;
                    const mouseX: number = context.x0 - bounds.left;
                    const mouseY: number = context.y0 - bounds.top;

                    this._findNoteUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                    const index: number = this._hoverQueryResult.index;
                    const hit: number = this._hoverQueryResult.hit;
                    if (
                        index !== -1
                        && (hit & NoteHit.Top) === 0
                        && (hit & NoteHit.Bottom) === 0
                    ) {
                        this._clearHoveredNoteState();
                        this._state.selectedNotes = [];
                        this._state.selectionOverlayIsDirty = true;

                        this._doc.removeNote(this._pattern, index);

                        this._renderedNotesDirty = true;
                        this._ui.scheduleMainRender();

                        return ActionResponse.Done;
                    }
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.LeftStretchNote: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._findNoteUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const index: number = this._hoverQueryResult.index;
                const hit: NoteHit = this._hoverQueryResult.hit;
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                if (
                    (hit & NoteHit.Left) !== 0
                    && (hit & NoteHit.Top) === 0
                    && (hit & NoteHit.Bottom) === 0
                ) {
                    const note: Note.Type = this._pattern.notes[index];
                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const cursorPpqn0: number = (this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)) | 0;

                    this._clearHoveredNoteState();
                    this._state.selectedNotes = [];
                    this._state.selectionOverlayIsDirty = true;

                    this._activeOperation = new LeftStretchNote(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        new Map([[note, {
                            newStart: note.start,
                            newEnd: note.end,
                            newPitch: note.pitch,
                            newPitchEnvelope: note.pitchEnvelope,
                            newVolumeEnvelope: note.volumeEnvelope,
                        }]]),
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.RightStretchNote: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._findNoteUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const index: number = this._hoverQueryResult.index;
                const hit: NoteHit = this._hoverQueryResult.hit;
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                if (
                    (hit & NoteHit.Right) !== 0
                    && (hit & NoteHit.Top) === 0
                    && (hit & NoteHit.Bottom) === 0
                ) {
                    const note: Note.Type = this._pattern.notes[index];
                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const cursorPpqn0: number = (this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)) | 0;

                    this._clearHoveredNoteState();
                    this._state.selectedNotes = [];
                    this._state.selectionOverlayIsDirty = true;

                    this._activeOperation = new RightStretchNote(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        new Map([[note, {
                            newStart: note.start,
                            newEnd: note.end,
                            newPitch: note.pitch,
                            newPitchEnvelope: note.pitchEnvelope,
                            newVolumeEnvelope: note.volumeEnvelope,
                        }]]),
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.MoveNotes: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._findNoteUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const index: number = this._hoverQueryResult.index;
                const hit: NoteHit = this._hoverQueryResult.hit;
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                // @TODO: Probably shouldn't be overloading this with a
                // hardcoded check here, but rather defining a new action.

                // @TODO:
                //   mouse is on middle of note AND ctrl is not held
                //   OR mouse is on note and ctrl is held
                // Note, gesture1 has to be checked, so we can press a mouse
                // button then hold ctrl to duplicate, in addition to holding
                // ctrl first then pressing a mouse button. Checking gesture0
                // means we can only hold ctrl first.

                if (
                    (hit & NoteHit.Inside) !== 0
                    && (hit & NoteHit.Left) === 0
                    && (hit & NoteHit.Right) === 0
                    && (hit & NoteHit.Top) === 0
                    && (hit & NoteHit.Bottom) === 0
                ) {
                    const note: Note.Type = this._pattern.notes[index];

                    let noteBoundsX0: number = note.start;
                    let noteBoundsX1: number = note.end; // exclusive
                    let noteBoundsY0: number = note.pitch;
                    let noteBoundsY1: number = note.pitch; // inclusive

                    const noteMap: Map<Note.Type, NoteTransform> = new Map();
                    if (this._state.selectedNotes.length > 0 && this._state.selectedNotes.includes(note)) {
                        // Copy and start moving selected notes.

                        let candidates: Note.Type[] = this._state.selectedNotes;

                        if ((context.gesture1 & Mod.Ctrl) !== 0) {
                            // @TODO: Make fake copies instead of real copies.
                            candidates = this._doc.copyNotes(this._pattern, candidates);
                        }

                        for (let i: number = 0; i < candidates.length; i++) {
                            const note: Note.Type = candidates[i];

                            if (note.start < noteBoundsX0) {
                                noteBoundsX0 = note.start;
                            }
                            if (note.end > noteBoundsX1) {
                                noteBoundsX1 = note.end;
                            }
                            if (note.pitch < noteBoundsY0) {
                                noteBoundsY0 = note.pitch;
                            } else if (note.pitch > noteBoundsY1) {
                                noteBoundsY1 = note.pitch;
                            }

                            noteMap.set(note, {
                                newStart: note.start,
                                newEnd: note.end,
                                newPitch: note.pitch,
                                newPitchEnvelope: note.pitchEnvelope,
                                newVolumeEnvelope: note.volumeEnvelope,
                            });
                        }
                    } else {
                        if ((context.gesture1 & Mod.Ctrl) !== 0) {
                            // Copy and start moving note.

                            // @TODO: Make fake copies instead of real copies.
                            for (const newNote of this._doc.copyNotes(this._pattern, [note])) {
                                noteMap.set(newNote, {
                                    newStart: newNote.start,
                                    newEnd: newNote.end,
                                    newPitch: newNote.pitch,
                                    newPitchEnvelope: newNote.pitchEnvelope,
                                    newVolumeEnvelope: newNote.volumeEnvelope,
                                });
                            }
                        } else {
                            noteMap.set(note, {
                                newStart: note.start,
                                newEnd: note.end,
                                newPitch: note.pitch,
                                newPitchEnvelope: note.pitchEnvelope,
                                newVolumeEnvelope: note.volumeEnvelope,
                            });
                        }
                    }

                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                    const cursorPpqn0: number = (
                        this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
                    ) | 0;
                    const cursorPitch0: number = (
                        this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight)
                    ) | 0;
                    const timeDeltaMin: number = 0 - noteBoundsX0;
                    const timeDeltaMax: number = this._pattern.duration - noteBoundsX1;
                    const pitchDeltaMin: number = 0 - noteBoundsY0;
                    const pitchDeltaMax: number = this._doc.project.song.maxPitch - noteBoundsY1;

                    this._clearHoveredNoteState();
                    this._state.selectedNotes = [];
                    this._state.selectionOverlayIsDirty = true;

                    this._activeOperation = new MoveNotes(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        cursorPitch0,
                        noteMap,
                        timeDeltaMin,
                        timeDeltaMax,
                        pitchDeltaMin,
                        pitchDeltaMax,
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.CreateNoteVolumePoint: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                const index: number = this._hoveringNoteIndex;
                const hit: NoteHit = this._hoveringNoteHit;
                const hoveringVolumePointIndex: number = this._hoveringNoteVolumePointIndex;
                // const hoveringPitchPointIndex: number = this._hoveringNotePitchPointIndex;
                this._clearHoveredNoteState();
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                const note: Note.Type = this._pattern.notes[index];

                if ((hit & NoteHit.Top) !== 0 && hoveringVolumePointIndex === -1) {
                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                    const cursorPpqn: number = Math.round(this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth));
                    const duration: number = note.end - note.start;
                    const time: number = clamp(cursorPpqn - note.start, 0, duration);
                    const existingVolumeIndex: number = Breakpoint.findIndex(note.volumeEnvelope, time);
                    const value: number = (
                        existingVolumeIndex !== -1
                        ? Breakpoint.evaluateNoteEnvelope(note.volumeEnvelope!, time, existingVolumeIndex, 1)
                        : 1
                    );

                    // Creating and starting a move operation:
                    const newPoint: Breakpoint.Type = this._doc.insertNoteVolumePoint(this._pattern, note, time, value);
                    const newPointIndex: number = note.volumeEnvelope!.indexOf(newPoint);
                    if (newPointIndex === -1) {
                        throw new Error("New point wasn't found in the volume envelope?");
                    }
                    const cursorPpqn0: number = this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth);
                    const cursorPitch0: number = this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight);
                    const noteMap: Map<Note.Type, NoteTransform> = new Map([[note, {
                        newStart: note.start,
                        newEnd: note.end,
                        newPitch: note.pitch,
                        newPitchEnvelope: note.pitchEnvelope,
                        newVolumeEnvelope: Breakpoint.cloneArray(note.volumeEnvelope!),
                    }]]);
                    this._activeOperation = new MoveNoteVolumePointBounded(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        cursorPitch0,
                        noteMap,
                        newPointIndex,
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);
                    return ActionResponse.StartedOperation;

                    // Creating without starting a move operation:
                    // this._doc.insertNoteVolumePoint(this._pattern, note, time, value);
                    // this._computeHoveredNoteState(width, height, mouseX, mouseY);
                    // this._renderedNotesDirty = true;
                    // this._state.selectedNotes = [];
                    // this._state.selectionOverlayIsDirty = true;
                    // this._ui.scheduleMainRender();
                    // return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.RemoveNoteVolumePoint: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                const index: number = this._hoveringNoteIndex;
                // const hit: NoteHit = this._hoveringNoteHit;
                const hoveringVolumePointIndex: number = this._hoveringNoteVolumePointIndex;
                // const hoveringPitchPointIndex: number = this._hoveringNotePitchPointIndex;
                this._clearHoveredNoteState();
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                const note: Note.Type = this._pattern.notes[index];

                if (hoveringVolumePointIndex !== -1) {
                    this._doc.removeNoteVolumePoint(
                        this._pattern,
                        note,
                        hoveringVolumePointIndex,
                    );

                    this._computeHoveredNoteState(width, height, mouseX, mouseY);

                    this._renderedNotesDirty = true;
                    this._state.selectedNotes = [];
                    this._state.selectionOverlayIsDirty = true;

                    this._ui.scheduleMainRender();

                    return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.CreateNotePitchPoint: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                const index: number = this._hoveringNoteIndex;
                const hit: NoteHit = this._hoveringNoteHit;
                // const hoveringVolumePointIndex: number = this._hoveringNoteVolumePointIndex;
                const hoveringPitchPointIndex: number = this._hoveringNotePitchPointIndex;
                this._clearHoveredNoteState();
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                const note: Note.Type = this._pattern.notes[index];

                if ((hit & NoteHit.Bottom) !== 0 && hoveringPitchPointIndex === -1) {
                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                    const cursorPpqn: number = Math.round(this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth));
                    // const cursorPitch: number = (
                    //     this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight)
                    // );
                    const duration: number = note.end - note.start;
                    const time: number = clamp(cursorPpqn - note.start, 0, duration);
                    const existingPitchIndex: number = Breakpoint.findIndex(note.pitchEnvelope, time);
                    const value: number = (
                        existingPitchIndex !== -1
                        ? Breakpoint.evaluateNoteEnvelope(note.pitchEnvelope!, time, existingPitchIndex, 0)
                        : 0
                    );

                    // Creating and starting a move operation:
                    const newPoint: Breakpoint.Type = this._doc.insertNotePitchPoint(this._pattern, note, time, value);
                    const newPointIndex: number = note.pitchEnvelope!.indexOf(newPoint);
                    if (newPointIndex === -1) {
                        throw new Error("New point wasn't found in the pitch envelope?");
                    }
                    const cursorPpqn0: number = this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth);
                    const cursorPitch0: number = this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight);
                    const noteMap: Map<Note.Type, NoteTransform> = new Map([[note, {
                        newStart: note.start,
                        newEnd: note.end,
                        newPitch: note.pitch,
                        newPitchEnvelope: Breakpoint.cloneArray(note.pitchEnvelope!),
                        newVolumeEnvelope: note.volumeEnvelope,
                    }]]);
                    this._activeOperation = new MoveNotePitchPointBounded(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        cursorPitch0,
                        noteMap,
                        newPointIndex,
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);
                    return ActionResponse.StartedOperation;

                    // Creating without starting a move operation:
                    // this._doc.insertNotePitchPoint(this._pattern, note, time, value);
                    // this._computeHoveredNoteState(width, height, mouseX, mouseY);
                    // this._renderedNotesDirty = true;
                    // this._state.selectedNotes = [];
                    // this._state.selectionOverlayIsDirty = true;
                    // this._ui.scheduleMainRender();
                    // return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.RemoveNotePitchPoint: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                const index: number = this._hoveringNoteIndex;
                // const hit: NoteHit = this._hoveringNoteHit;
                // const hoveringVolumePointIndex: number = this._hoveringNoteVolumePointIndex;
                const hoveringPitchPointIndex: number = this._hoveringNotePitchPointIndex;
                this._clearHoveredNoteState();
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                const note: Note.Type = this._pattern.notes[index];

                if (hoveringPitchPointIndex !== -1) {
                    this._doc.removeNotePitchPoint(
                        this._pattern,
                        note,
                        hoveringPitchPointIndex,
                    );

                    this._computeHoveredNoteState(width, height, mouseX, mouseY);

                    this._renderedNotesDirty = true;
                    this._state.selectedNotes = [];
                    this._state.selectionOverlayIsDirty = true;

                    this._ui.scheduleMainRender();

                    return ActionResponse.Done;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.MoveNoteVolumePointBounded: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                const index: number = this._hoveringNoteIndex;
                // const hit: NoteHit = this._hoveringNoteHit;
                const hoveringVolumePointIndex: number = this._hoveringNoteVolumePointIndex;
                // const hoveringPitchPointIndex: number = this._hoveringNotePitchPointIndex;
                this._clearHoveredNoteState();
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                const note: Note.Type = this._pattern.notes[index];

                if (hoveringVolumePointIndex !== -1) {
                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                    const cursorPpqn0: number = (
                        this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
                    );
                    const cursorPitch0: number = (
                        this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight)
                    );

                    const noteMap: Map<Note.Type, NoteTransform> = new Map([[note, {
                        newStart: note.start,
                        newEnd: note.end,
                        newPitch: note.pitch,
                        newPitchEnvelope: note.pitchEnvelope,
                        newVolumeEnvelope: Breakpoint.cloneArray(note.volumeEnvelope!),
                    }]]);

                    this._activeOperation = new MoveNoteVolumePointBounded(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        cursorPitch0,
                        noteMap,
                        hoveringVolumePointIndex,
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.MoveNotePitchPointBounded: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x0 - bounds.left;
                const mouseY: number = context.y0 - bounds.top;

                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                const index: number = this._hoveringNoteIndex;
                // const hit: NoteHit = this._hoveringNoteHit;
                // const hoveringVolumePointIndex: number = this._hoveringNoteVolumePointIndex;
                const hoveringPitchPointIndex: number = this._hoveringNotePitchPointIndex;
                this._clearHoveredNoteState();
                if (index === -1) {
                    return ActionResponse.NotApplicable;
                }

                const note: Note.Type = this._pattern.notes[index];

                if (hoveringPitchPointIndex !== -1) {
                    const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                    const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                    const cursorPpqn0: number = (
                        this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
                    );
                    const cursorPitch0: number = (
                        this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight)
                    );

                    const noteMap: Map<Note.Type, NoteTransform> = new Map([[note, {
                        newStart: note.start,
                        newEnd: note.end,
                        newPitch: note.pitch,
                        newPitchEnvelope: Breakpoint.cloneArray(note.pitchEnvelope!),
                        newVolumeEnvelope: note.volumeEnvelope,
                    }]]);

                    this._activeOperation = new MoveNotePitchPointBounded(
                        this._state,
                        this._doc,
                        cursorPpqn0,
                        cursorPitch0,
                        noteMap,
                        hoveringPitchPointIndex,
                    );
                    this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                    return ActionResponse.StartedOperation;
                }

                return ActionResponse.NotApplicable;
            };
            case ActionKind.PianoRollSelectBox: {
                // @TODO: Revisit this? Mostly I'm just not sure what can be done
                // if there's no sensible initial mouse position. In Blender I
                // have seen special cases added that would wait for a mouse
                // drag, after executing an operator via e.g. a toolbar.
                // If there's no good options, then I should introduce the
                // notion of restricting bindings to certain types of gestures.
                if (!mouseStartedInside(context, this._canvasesContainer)) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x1 - bounds.left;
                const mouseY: number = context.y1 - bounds.top;

                this._findNoteUnderMouse(width, height, mouseX, mouseY, this._hoverQueryResult);
                const index: number = this._hoverQueryResult.index;
                if (index !== -1) {
                    return ActionResponse.NotApplicable;
                }

                const viewportWidth: number = this._state.viewport.x1 - this._state.viewport.x0;
                const viewportHeight: number = this._state.viewport.y1 - this._state.viewport.y0;
                const cursorPpqn0: number = (
                    this._state.viewport.x0 + remap(mouseX, 0, width, 0, viewportWidth)
                );
                const cursorPitch0: number = (
                    this._state.viewport.y0 + remap(mouseY, height, 0, 0, viewportHeight) - 1
                );

                this._clearHoveredNoteState();
                this._state.selectedNotes = [];
                this._state.selectionOverlayIsDirty = true;

                this._activeOperation = new SelectBox(this._doc, this._state, cursorPpqn0, cursorPitch0);
                this._ui.inputManager.setActiveOperationHandler(this._onUpdateOperation);

                return ActionResponse.StartedOperation;
            };
            case ActionKind.PianoRollSelectAll: {
                this._clearHoveredNoteState();

                this._state.selectedNotes = [];
                const notes: Note.Type[] = this._pattern.notes;
                const noteCount: number = notes.length;
                for (let noteIndex: number = 0; noteIndex < noteCount; noteIndex++) {
                    const note: Note.Type = notes[noteIndex];
                    this._state.selectedNotes.push(note);
                }

                this._state.selectionOverlayIsDirty = true;

                this._ui.scheduleMainRender();

                return ActionResponse.Done;
            };
            case ActionKind.PianoRollZoomInAroundMouseHorizontally: {
                // To not conflict with the piano scrolling.
                if (
                    !mouseIsInside(context, this._canvasesContainer)
                    && !mouseIsInside(context, this._timeRuler.element)
                ) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x1 - bounds.left;
                const mouseY: number = context.y1 - bounds.top;
                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                if (this._hoveredNoteStateChanged()) {
                    this._state.selectionOverlayIsDirty = true;
                    this._ui.scheduleMainRender();
                }

                this._zoomAroundMouseHorizontally(/* zoomIn */ true, context.x1);

                return ActionResponse.Done;
            };
            case ActionKind.PianoRollZoomOutAroundMouseHorizontally: {
                // To not conflict with the piano scrolling.
                if (
                    !mouseIsInside(context, this._canvasesContainer)
                    && !mouseIsInside(context, this._timeRuler.element)
                ) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x1 - bounds.left;
                const mouseY: number = context.y1 - bounds.top;
                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                if (this._hoveredNoteStateChanged()) {
                    this._state.selectionOverlayIsDirty = true;
                    this._ui.scheduleMainRender();
                }

                this._zoomAroundMouseHorizontally(/* zoomIn */ false, context.x1);

                return ActionResponse.Done;
            };
            case ActionKind.PianoRollZoomInAroundMouseVertically: {
                // To not conflict with the piano scrolling.
                if (
                    !mouseIsInside(context, this._canvasesContainer)
                    && !mouseIsInside(context, this._timeRuler.element)
                ) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x1 - bounds.left;
                const mouseY: number = context.y1 - bounds.top;
                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                if (this._hoveredNoteStateChanged()) {
                    this._state.selectionOverlayIsDirty = true;
                    this._ui.scheduleMainRender();
                }

                this._zoomAroundMouseVertically(/* zoomIn */ true, context.y1);

                return ActionResponse.Done;
            };
            case ActionKind.PianoRollZoomOutAroundMouseVertically: {
                // To not conflict with the piano scrolling.
                if (
                    !mouseIsInside(context, this._canvasesContainer)
                    && !mouseIsInside(context, this._timeRuler.element)
                ) {
                    return ActionResponse.NotApplicable;
                }

                const bounds: DOMRect = this._canvasesContainer.getBoundingClientRect();
                const width: number = bounds.width;
                const height: number = bounds.height;
                const mouseX: number = context.x1 - bounds.left;
                const mouseY: number = context.y1 - bounds.top;
                this._computeHoveredNoteState(width, height, mouseX, mouseY);
                if (this._hoveredNoteStateChanged()) {
                    this._state.selectionOverlayIsDirty = true;
                    this._ui.scheduleMainRender();
                }

                this._zoomAroundMouseVertically(/* zoomIn */ false, context.y1);

                return ActionResponse.Done;
            };
        }

        return ActionResponse.NotApplicable;
    };

    private _onUpdateOperation = (context: OperationContext): OperationResponse => {
        if (this._activeOperation == null) {
            return OperationResponse.Aborted;
        }

        let response: OperationResponse = OperationResponse.Aborted;
        if (this._pattern != null) {
            response = this._activeOperation.update(context, this._pattern);
        }

        // @TODO: Invalidate precisely.
        if (this._activeOperation.kind === OperationKind.Note) {
            this._renderedNotesDirty = true;
        }
        this._state.selectionOverlayIsDirty = true;

        if (response === OperationResponse.Done || response === OperationResponse.Aborted) {
            // @TODO: Call _computeHoveredNoteState here.
            this._activeOperation = null;
        }

        this._ui.scheduleMainRender();

        return response;
    };

    private _onPianoKeyDown = (pitch: number): void => {
        // @TODO: I probably will need to grab the associated track for this.
        // Note that clips can be moved around, so I can't store that eagerly,
        // unless I also updated it so it follows the clip correctly.
        this._doc.playPianoNote(pitch);
    };

    private _onPianoKeyUp = (pitch: number): void => {
        // @TODO: See above.
        this._doc.stopPianoNote(pitch);
    };
}

interface HoverQueryResult {
    index: number;
    hit: NoteHit;
}
