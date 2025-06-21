import { H } from "@synth-playground/dom/index.js";
import { clamp, lerp, unlerp, remap } from "@synth-playground/common/math.js";
import {
    inferno_r as colormap_r,
    inferno_g as colormap_g,
    inferno_b as colormap_b,
} from "@synth-playground/common/colormaps.js";
import { type DockablePanel } from "./types.js";
import { UIContext } from "../UIContext.js";
import { type Component } from "../types.js";
import { SongDocument } from "../../SongDocument.js";
import {
    type GroupPanelPartInitParameters,
    type DockviewIDisposable,
} from "dockview-core";

// @TODO: Formalize how time advances here.

class Spectrogram implements Component {
    public element: HTMLDivElement;
    // private _ui: UIContext;
    private _doc: SongDocument;
    private _width: number;
    private _height: number;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _currentImage: ImageData | null;
    private _paletteSize: number;
    private _palette: Uint8ClampedArray;
    private _renderedCounter: number | null;

    constructor(ui: UIContext, doc: SongDocument) {
        // this._ui = ui;
        this._doc = doc;

        this._width = 1;
        this._height = 1;

        this._currentImage = null;
        this._paletteSize = 256;
        this._palette = new Uint8ClampedArray(this._paletteSize * 3);
        for (let i: number = 0; i < this._paletteSize; i++) {
            const t: number = remap(i, 0, this._paletteSize, 0, 1);
            const r: number = colormap_r(t);
            const g: number = colormap_g(t);
            const b: number = colormap_b(t);
            this._palette[i * 3 + 0] = r * 256;
            this._palette[i * 3 + 1] = g * 256;
            this._palette[i * 3 + 2] = b * 256;
        }

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
            const r: number = this._palette[0] * 256;
            const g: number = this._palette[1] * 256;
            const b: number = this._palette[2] * 256;
            this._context.fillStyle = `rgb(${r}, ${g}, ${b})`;
            this._context.fillRect(0, 0, this._width, this._height);
        }

        this._renderSpectrogram();
    }

    private _renderSpectrogram(): void {
        const fftSize: number = this._doc.fftSize;
        if (this._doc.outputAnalyserNode == null) return;
        const data: Float32Array | null = this._doc.getOutputFreqDomainData();
        if (data == null) return;
        const counter: number | null = this._doc.outputAnalyserFreqCounter;
        if (counter === this._renderedCounter) return;
        this._renderedCounter = counter;
        const canvas: HTMLCanvasElement = this._canvas;
        const context: CanvasRenderingContext2D = this._context;
        const width: number = this._width;
        const height: number = this._height;
        const samplesPerSecond: number = this._doc.samplesPerSecond;
        const binCount: number = data.length;
        // const mask: number = binCount - 1;
        // const binBandwidth: number = samplesPerSecond / fftSize;
        const invBinBandwidth: number = fftSize / samplesPerSecond;
        const minFreq: number = 10;
        const maxFreq: number = 22050;
        const minDb: number = this._doc.outputAnalyserNode.minDecibels;
        const maxDb: number = this._doc.outputAnalyserNode.maxDecibels;
        const minFreqLog: number = Math.log(minFreq);
        const maxFreqLog: number = Math.log(maxFreq);
        const freqRangeLog: number = maxFreqLog - minFreqLog;
        const imageWidth: number = 1;
        if (this._currentImage == null || this._currentImage.height !== height) {
            this._currentImage = context.createImageData(imageWidth, height);
        }
        const imageBits: Uint8ClampedArray = this._currentImage.data;
        const palette: Uint8ClampedArray = this._palette;
        const paletteSize: number = this._paletteSize;
        for (let y: number = 0; y < height; y++) {
            const t: number = remap(y, 0, height - 1, 1, 0);
            // const binIndex: number = t * binCount;
            const frequency: number = Math.exp(t * freqRangeLog + minFreqLog);
            const binIndex: number = frequency * invBinBandwidth;
            const binIndexInt: number = binIndex | 0;
            const binT: number = binIndex - binIndexInt;
            const bin0: number = data[binIndexInt];
            const bin1: number = data[clamp(binIndexInt + 1, 0, binCount - 1)];
            const amplitude: number = unlerp(
                clamp(lerp(binT, bin0, bin1), minDb, maxDb), minDb, maxDb
            );
            const paletteEntryIndex: number = clamp(
                (amplitude * paletteSize) | 0, 0, paletteSize - 1
            );
            const paletteIndex: number = paletteEntryIndex * 3;
            const r: number = palette[paletteIndex    ];
            const g: number = palette[paletteIndex + 1];
            const b: number = palette[paletteIndex + 2];
            for (let x: number = 0; x < imageWidth; x++) {
                imageBits[(x + y * imageWidth) * 4    ] = r;
                imageBits[(x + y * imageWidth) * 4 + 1] = g;
                imageBits[(x + y * imageWidth) * 4 + 2] = b;
                imageBits[(x + y * imageWidth) * 4 + 3] = 256;
            }
        }
        context.drawImage(canvas, -imageWidth, 0);
        context.putImageData(this._currentImage, width - imageWidth, 0);
    }

    public resize(width: number, height: number): void {
        this._width = width;
        this._height = height;
    }
}

export class SpectrogramPanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _onDidVisibilityChange: DockviewIDisposable | null;
    private _visible: boolean;
    private _spectrogram: Spectrogram;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;

        this._visible = false;
        this._onDidVisibilityChange = null;

        this._spectrogram = new Spectrogram(this._ui, doc);

        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
            `,
        }, this._spectrogram.element);

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
        this._spectrogram.dispose();
    }

    public render(): void {
        if (!this._visible) return;
        this._spectrogram.render();
    }

    private _resize(): void {
        if (!this._visible) return;
        this._spectrogram.resize(this._element.clientWidth, this._element.clientHeight);
        this._ui.scheduleMainRender();
    }
}
