import { H } from "@synth-playground/browser/dom.js";
import { type ManualComponent } from "../types.js";
import { UIContext } from "../UIContext.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Viewport from "../common/Viewport.js";

export class TimeRuler implements ManualComponent {
    public element: HTMLDivElement;
    public size: number;

    private _ui: UIContext;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _width: number;
    private _height: number;
    private _resized: boolean;
    private _viewport: Viewport.Type;
    private _ppqn: number;
    private _beatsPerBar: number;
    private _tempoEnvelope: Breakpoint.Type[] | null;

    // @TODO: I need to add a version for the tempo envelope instead of this.
    private _tempoEnvelopeIsDirty: boolean;
    private _renderedViewport: Viewport.Type | null;
    private _renderedPpqn: number | null;
    private _renderedBeatsPerBar: number | null;

    constructor(
        ui: UIContext,
        initialWidth: number,
        viewportX0: number,
        viewportX1: number,
        ppqn: number,
        beatsPerBar: number,
    ) {
        this._ui = ui;

        this.size = 25;
        this._width = initialWidth;
        this._height = this.size;
        this._resized = true;

        this._viewport = Viewport.make(
            /* x0 */ viewportX0,
            /* y0 */ 0,
            /* x1 */ viewportX1,
            /* y1 */ 0,
            // These values don't matter here, since we only care about matching
            // with the parent component.
            /* minWidth */ 0,
            /* maxWidth */ 0,
            /* minHeight */ 0,
            /* maxHeight */ 0,
        );
        this._renderedViewport = null;
        this._ppqn = ppqn;
        this._renderedPpqn = null;
        this._beatsPerBar = beatsPerBar;
        this._renderedBeatsPerBar = null;
        this._tempoEnvelope = null;
        this._tempoEnvelopeIsDirty = true;

        this._canvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                display: block;
                box-sizing: border-box;
            `,
        });
        this._context = this._canvas.getContext("2d")!;
        this.element = H("div", {
            style: `
                box-sizing: border-box;
            `,
        }, this._canvas);
    }

    public dispose(): void {}

    public render(): void {
        const canvas: HTMLCanvasElement = this._canvas;
        const context: CanvasRenderingContext2D = this._context;
        const width: number = this._width;
        const height: number = this._height;
        const viewportX0: number = this._viewport.x0;
        const viewportX1: number = this._viewport.x1;
        const ppqn: number = this._ppqn;
        const beatsPerBar: number = this._beatsPerBar;

        const dirty: boolean = (
            Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.X)
            || ppqn !== this._renderedPpqn
            || beatsPerBar !== this._renderedBeatsPerBar
            || this._tempoEnvelopeIsDirty
            || this._resized
        );

        if (this._resized) {
            this._resized = false;
            canvas.width = width;
            canvas.height = height;
        }

        if (!dirty) {
            return;
        }

        context.clearRect(0, 0, width, height);

        // @TODO: Look into some flickering that can happen here when resizing.
        const viewportWidth: number = viewportX1 - viewportX0;
        const pixelsPerTick: number = width / viewportWidth;
        // const pixelsPerBeat: number = ppqn * pixelsPerTick;
        const viewportWidthInBeats: number = Math.floor(viewportWidth / ppqn);
        // @TODO: Need to measure this based on font size and pattern position+duration
        const minBeatWidth: number = 50;
        const minBarWidth: number = minBeatWidth * beatsPerBar;
        const exponent: number = width > 0 ? Math.max(0, Math.floor(
            Math.log(viewportWidthInBeats / (width / minBarWidth))
            / Math.log(beatsPerBar)
        )) : 1;
        const ppqnScaled: number = ppqn * Math.pow(beatsPerBar, exponent);
        const ppqnScaledBar: number = exponent >= 1 ? ppqnScaled : beatsPerBar * ppqnScaled;

        const fontSize: number = 10;
        context.font = "10px sans-serif";
        context.textBaseline = "top";
        context.fillStyle = "#ffffff";
        context.strokeStyle = "#ffffff";
        {
            context.lineWidth = 2;
            let worldX: number = Math.max(0, Math.floor(viewportX0 / ppqnScaledBar) * ppqnScaledBar);
            while (worldX < viewportX1) {
                const screenX: number = ((worldX - viewportX0) * pixelsPerTick) | 0;
                let beat: number = Math.floor(worldX / ppqn);
                const bar: number = Math.floor(beat / beatsPerBar);
                // beat %= beatsPerBar;
                context.beginPath();
                context.moveTo(screenX, Math.min(10, height));
                context.lineTo(screenX, height);
                context.stroke();
                context.fillText((bar + 1) + "", screenX + 5, height - fontSize);
                worldX += ppqnScaledBar;
            }
        }
        if (exponent <= 0) {
            context.lineWidth = 1;
            let worldX: number = Math.max(0, Math.floor(viewportX0 / ppqnScaled) * ppqnScaled);
            while (worldX < viewportX1) {
                let beat: number = Math.floor(worldX / ppqn);
                const bar: number = Math.floor(beat / beatsPerBar);
                beat %= beatsPerBar;
                if (beat > 0) {
                    const screenX: number = ((worldX - viewportX0) * pixelsPerTick) | 0;
                    context.beginPath();
                    context.moveTo(screenX, Math.min(20, height));
                    context.lineTo(screenX, height);
                    context.stroke();
                    context.fillText((bar + 1) + "." + (beat + 1), screenX + 5, height - fontSize);
                }
                worldX += ppqnScaled;
            }
        }

        // Render tempo envelope if it exists.
        // @TODO: REAPER apparently works this way, but it also automatically
        // inserts an envelope point with the current song tempo if you try to
        // view the tempo envelope and it's the first time you see it (also it
        // stops showing it if you delete all of its points).
        if (this._tempoEnvelope != null && this._tempoEnvelope.length > 0) {
            context.lineWidth = 1;
            const pointCount: number = this._tempoEnvelope.length;
            for (let pointIndex: number = 0; pointIndex < pointCount; pointIndex++) {
                const point: Breakpoint.Type = this._tempoEnvelope[pointIndex];
                const x: number = (point.time - viewportX0) * pixelsPerTick;
                const nextPoint: Breakpoint.Type = pointIndex + 1 < pointCount ? this._tempoEnvelope[pointIndex + 1] : point;
                const nextX: number = (nextPoint.time - viewportX0) * pixelsPerTick;
                // @TODO: These checks have to be based on the font size.
                if (x < -30) {
                    continue;
                }
                if (x > width) {
                    break;
                }
                const value: number = point.value;
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, 10);
                context.stroke();
                if (pointIndex === pointCount - 1 || Math.abs(x - nextX) > 30) {
                    context.fillText(value + "", x + 5, 1);
                }
            }
        }
        // @TODO: Draw the tempo if the tempo envelope doesn't exist?

        this._renderedViewport = Viewport.updateRendered(this._renderedViewport, this._viewport);
        this._renderedPpqn = ppqn;
        this._renderedBeatsPerBar = beatsPerBar;
    }

    public resize(width: number): void {
        this._width = width;
        this._resized = true;
        Viewport.clearRendered(this._renderedViewport);
        this._ui.scheduleMainRender();
    }

    public setViewport(viewport: Viewport.Type): void {
        Viewport.copy(this._viewport, viewport);
    }

    public setPpqn(ppqn: number): void {
        this._ppqn = ppqn;
    }

    public setBeatsPerBar(beatsPerBar: number): void {
        this._beatsPerBar = beatsPerBar;
    }

    public setTempoEnvelope(envelope: Breakpoint.Type[] | null): void {
        this._tempoEnvelope = envelope;
    }

    public setTempoEnvelopeIsDirty(value: boolean): void {
        this._tempoEnvelopeIsDirty = value;
    }
}
