import { H } from "@synth-playground/browser/dom.js";
import { clamp, remap } from "@synth-playground/common/math.js";
import { UIContext } from "../UIContext.js";
import { type ManualComponent } from "../types.js";
import { SongDocument } from "../../SongDocument.js";

export class Oscilloscope implements ManualComponent {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _doc: SongDocument;
    private _width: number;
    private _height: number;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;
        this._doc = doc;

        this._width = 1;
        this._height = 1;

        this._canvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                position: absolute;
            `,
        });
        this._context = this._canvas.getContext("2d")!;
        this.element = H("div", {
            style: `
                position: relative;
            `,
        }, this._canvas);
    }

    public dispose(): void {}

    public render(): void {
        if (this._canvas.width !== this._width || this._canvas.height !== this._height) {
            this._canvas.width = this._width;
            this._canvas.height = this._height;
        }

        this._renderOscilloscope();
    }

    private _renderOscilloscope(): void {
        const data: Float32Array | null = this._doc.getOutputTimeDomainData(this._ui.frame);
        if (data == null) {
            return;
        }
        // const canvas: HTMLCanvasElement = this._canvas;
        const context: CanvasRenderingContext2D = this._context;
        const width: number = this._width;
        const height: number = this._height;
        const visualGain: number = 2;
        const samplesAvailable: number = data.length;
        const mask: number = samplesAvailable - 1;
        const windowSize: number = clamp(1000, 1, samplesAvailable);
        const halfWindowSize: number = windowSize >> 1;
        let start: number = Math.max(halfWindowSize, samplesAvailable - windowSize);
        const end: number = (samplesAvailable - halfWindowSize) - 1;
        // Find a zero crossing with a positive slope.
        while (start < end - 1) {
            const sample0: number = data[start];
            const sample1: number = data[start + 1];
            if (sample0 < 0 && sample1 >= 0) {
                break;
            }
            start++;
        }
        context.clearRect(0, 0, width, height);
        // @TODO: Find and draw peaks when we have more samples than pixels.
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2;
        context.beginPath();
        for (let i: number = 0; i < windowSize; i++) {
            const sample: number = data[(start - halfWindowSize + i) & mask];
            const x: number = remap(i, 0, windowSize - 1, 0, width);
            const y: number = remap(clamp(sample * visualGain, -1, 1), -1, 1, height, 0);
            if (i === 0) {
                context.moveTo(x, y);
            } else {
                context.lineTo(x, y);
            }
        }
        context.stroke();
    }

    public resize(width: number, height: number): void {
        this._width = width;
        this._height = height;
    }
}
