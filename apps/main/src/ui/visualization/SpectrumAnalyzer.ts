import { H } from "@synth-playground/browser/dom.js";
import { clamp, remap } from "@synth-playground/common/math.js";
import { UIContext } from "../UIContext.js";
import { type Component } from "../types.js";
import { SongDocument } from "../../SongDocument.js";

export class SpectrumAnalyzer implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _doc: SongDocument;
    private _width: number;
    private _height: number;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;

    private _renderedCounter: number | null;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;
        this._doc = doc;

        this._width = 1;
        this._height = 1;

        this._renderedCounter = null;

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

        this._renderSpectrumAnalyzer();
    }

    private _renderSpectrumAnalyzer(): void {
        const fftSize: number = this._doc.fftSize;
        if (this._doc.outputAnalyserNode == null) {
            return;
        }
        const data: Float32Array | null = this._doc.getOutputFreqDomainData(this._ui.frame);
        if (data == null) {
            return;
        }
        const counter: number | null = this._doc.outputAnalyserFreqCounter;
        if (counter === this._renderedCounter) {
            return;
        }
        this._renderedCounter = counter;
        // const canvas: HTMLCanvasElement = this._canvas;
        const context: CanvasRenderingContext2D = this._context;
        const width: number = this._width;
        const height: number = this._height;
        const samplesPerSecond: number = this._doc.samplesPerSecond;
        const binCount: number = data.length;
        // const mask: number = binCount - 1;
        const binBandwidth: number = samplesPerSecond / fftSize;
        const minFreq: number = 10;
        const maxFreq: number = 22050;
        const minDb: number = this._doc.outputAnalyserNode.minDecibels;
        const maxDb: number = this._doc.outputAnalyserNode.maxDecibels;
        const minFreqLog: number = Math.log(minFreq);
        const maxFreqLog: number = Math.log(maxFreq);
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.moveTo(0, height);
        let lastX: number = 0;
        for (let binIndex: number = 0; binIndex < binCount; binIndex++) {
            const amplitude: number = clamp(data[binIndex], minDb, maxDb);
            const frequency: number = binIndex * binBandwidth;
            const y: number = remap(amplitude, minDb, maxDb, height, 0);
            const x: number = binIndex === 0 ? 0 : remap(Math.log(frequency), minFreqLog, maxFreqLog, 0, width);
            lastX = x;
            context.lineTo(x, y);
        }
        context.lineTo(lastX, height);
        context.fill();
    }

    public resize(width: number, height: number): void {
        this._width = width;
        this._height = height;
    }
}
