import { H } from "@synth-playground/dom/index.js";
import { clamp, remap } from "@synth-playground/common/math.js";
import { type DockablePanel } from "./types.js";
import { UIContext } from "../UIContext.js";
import { type Component } from "../types.js";
import { SongDocument } from "../../SongDocument.js";
import {
    type GroupPanelPartInitParameters,
    type DockviewIDisposable,
} from "dockview-core";

class SpectrumAnalyzer implements Component {
    public element: HTMLDivElement;
    // private _ui: UIContext;
    private _doc: SongDocument;
    private _width: number;
    private _height: number;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _renderedPlayhead: number | null;

    constructor(ui: UIContext, doc: SongDocument) {
        // this._ui = ui;
        this._doc = doc;

        this._width = 1;
        this._height = 1;

        this._renderedPlayhead = null;

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
        if (this._doc.outputAnalyserNode == null) return;
        const data: Float32Array | null = this._doc.getOutputFreqDomainData();
        if (data == null) return;
        const playhead: number | null = this._doc.outputAnalyserFreqRenderedPlayhead;
        if (playhead === this._renderedPlayhead) return;
        this._renderedPlayhead = playhead;
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
            const x: number = (
                binIndex === 0
                ? 0
                : remap(Math.log(frequency), minFreqLog, maxFreqLog, 0, width)
            );
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

export class SpectrumAnalyzerPanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _onDidVisibilityChange: DockviewIDisposable | null;
    private _visible: boolean;
    private _spectrumAnalyzer: SpectrumAnalyzer;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;

        this._visible = false;
        this._onDidVisibilityChange = null;

        this._spectrumAnalyzer = new SpectrumAnalyzer(this._ui, doc);

        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
            `,
        }, this._spectrumAnalyzer.element);

        this._ui.resizeObserver.register(this._element, () => {
            this._resize();
        });
    }

    public get element(): HTMLElement {
        return this._element;
    }

    public init(parameters: GroupPanelPartInitParameters): void {
        this._onDidVisibilityChange = parameters.api.onDidVisibilityChange(
            (event) => { this._visible = event.isVisible; }
        );
        this._visible = parameters.api.isVisible;
        this._ui.resizeObserver.observe(this._element);
    }

    public dispose(): void {
        this._onDidVisibilityChange?.dispose();
        this._ui.resizeObserver.unobserve(this._element);
        this._spectrumAnalyzer.dispose();
    }

    public render(): void {
        if (!this._visible) return;
        this._spectrumAnalyzer.render();
    }

    private _resize(): void {
        if (!this._visible) return;
        this._spectrumAnalyzer.resize(this._element.clientWidth, this._element.clientHeight);
        this._ui.scheduleMainRender();
    }
}
