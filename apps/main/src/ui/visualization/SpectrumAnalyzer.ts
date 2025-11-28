import { H } from "@synth-playground/browser/dom.js";
import { clamp, remap } from "@synth-playground/common/math.js";
import { UIContext } from "../UIContext.js";
import { type Component } from "../types.js";
import { SongDocument } from "../../SongDocument.js";

// @TODO:
// - Store min and max dB constants somewhere else.
// - Show pitch name and octave after frequency.
//   - Also a piano overlay?
// - Trim trailing zeros.
// - Consider merging the canvas elements here to save memory.
// - Slope option.

export class SpectrumAnalyzer implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _doc: SongDocument;
    private _width: number;
    private _height: number;
    private _resized: boolean;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _backgroundCanvas: HTMLCanvasElement;
    private _backgroundContext: CanvasRenderingContext2D;
    private _pitchInfo: HTMLDivElement;
    private _volumeInfo: HTMLDivElement;
    private _infoContainer: HTMLDivElement;
    private _infoVisible: boolean;
    private _mouseX: number | null;
    private _mouseY: number | null;
    private _mouseFrequency: string;
    private _mouseDecibels: string;

    private _renderedCounter: number | null;
    private _renderedInfoVisible: boolean;
    private _renderedMouseX: number | null;
    private _renderedMouseY: number | null;
    private _renderedMouseFrequency: string;
    private _renderedMouseDecibels: string;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;
        this._doc = doc;

        this._width = 1;
        this._height = 1;
        this._resized = true;

        this._renderedCounter = null;

        this._infoVisible = false;
        this._renderedInfoVisible = this._infoVisible;

        this._mouseX = null;
        this._mouseY = null;
        this._renderedMouseX = this._mouseX;
        this._renderedMouseY = this._mouseY;

        this._mouseFrequency = "";
        this._renderedMouseFrequency = this._mouseFrequency;
        this._mouseDecibels = "";
        this._renderedMouseDecibels = this._mouseDecibels;

        this._backgroundCanvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                position: absolute;
                width: ${this._width}px;
                height: ${this._height}px;
            `,
        });
        this._backgroundContext = this._backgroundCanvas.getContext("2d")!;

        this._canvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                position: absolute;
                width: ${this._width}px;
                height: ${this._height}px;
            `,
        });
        this._context = this._canvas.getContext("2d")!;

        this._pitchInfo = H("div", {
            style: `
                position: absolute;
                bottom: 10px;
                left: 10px;
                background-color: rgba(0, 0, 0, 0.75);
                padding: 5px;
            `,
        }, this._mouseFrequency);
        this._volumeInfo = H("div", {
            style: `
                position: absolute;
                bottom: 10px;
                right: 10px;
                background-color: rgba(0, 0, 0, 0.75);
                padding: 5px;
            `,
        }, this._mouseDecibels);
        this._infoContainer = H("div", {
            style: `
                display: none;
                position: relative;
                width: ${this._width}px;
                height: ${this._height}px;
            `,
        },
            this._pitchInfo,
            this._volumeInfo,
        );

        this.element = H("div", {
            style: `
                position: relative;
            `,
        },
            this._backgroundCanvas,
            this._canvas,
            this._infoContainer,
        );

        this.element.addEventListener("mouseout", this._handleMouseOut);
        this.element.addEventListener("mousemove", this._handleMouseMove);
    }

    public dispose(): void {
        this.element.removeEventListener("mouseout", this._handleMouseOut);
        this.element.removeEventListener("mousemove", this._handleMouseMove);
    }

    public render(): void {
        if (this._resized) {
            this._canvas.width = this._width;
            this._canvas.height = this._height;
            this._canvas.style.width = this._width + "px";
            this._canvas.style.height = this._height + "px";
            this._backgroundCanvas.width = this._width;
            this._backgroundCanvas.height = this._height;
            this._backgroundCanvas.style.width = this._width + "px";
            this._backgroundCanvas.style.height = this._height + "px";
            this._infoContainer.style.width = this._width + "px";
            this._infoContainer.style.height = this._height + "px";
        }

        this._renderInfo();
        this._renderBackground();
        this._renderSpectrumAnalyzer();

        this._resized = false;
        this._renderedInfoVisible = this._infoVisible;
        this._renderedMouseX = this._mouseX;
        this._renderedMouseY = this._mouseY;
    }

    private _renderSpectrumAnalyzer(): void {
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
        const fftSize: number = this._doc.fftSize;
        const binCount: number = data.length;
        // const mask: number = binCount - 1;
        const binBandwidth: number = samplesPerSecond / fftSize;
        const minDb: number = Constants.MinDecibels;
        const maxDb: number = Constants.MaxDecibels;
        const minFreqLog: number = Constants.MinFrequencyLog;
        const maxFreqLog: number = Constants.MaxFrequencyLog;

        context.clearRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.moveTo(0, height);
        let lastX: number = 0;
        for (let binIndex: number = 0; binIndex < binCount; binIndex++) {
            const amplitude: number = clamp(data[binIndex] + Constants.AmplitudeCorrectionFactor, minDb, maxDb);
            const frequency: number = binIndex * binBandwidth;
            const y: number = remap(amplitude, minDb, maxDb, height, 0);
            const x: number = binIndex === 0 ? 0 : remap(Math.log(frequency), minFreqLog, maxFreqLog, 0, width);
            lastX = x;

            context.lineTo(x, y);
        }
        context.lineTo(lastX, height);
        context.fill();
    }

    private _renderBackground(): void {
        const context: CanvasRenderingContext2D = this._backgroundContext;
        const width: number = this._width;
        const height: number = this._height;
        const mouseX: number | null = this._mouseX;
        const mouseY: number | null = this._mouseY;

        if (
            this._resized
            || this._infoVisible !== this._renderedInfoVisible
            || mouseX !== this._renderedMouseX
            || mouseY !== this._renderedMouseY
        ) {
            context.clearRect(0, 0, width, height);

            context.fillStyle = "#333333";

            for (let i: number = 1; i < 5; i++) {
                const start: number = Math.pow(10, i);
                const end: number = start * 9;
                const step: number = start;
                for (let frequency: number = start; frequency <= end; frequency += step) {
                    const x: number = remap(Math.log(frequency), Constants.MinFrequencyLog, Constants.MaxFrequencyLog, 0, width);

                    if (x < 0) {
                        continue;
                    }

                    if (x > width) {
                        break;
                    }

                    context.fillRect(x, 0, 1, height);
                }
            }

            for (let decibels: number = Constants.MaxDecibels; decibels > Constants.MinDecibels; decibels -= 6) {
                const y: number = remap(decibels, Constants.MinDecibels, Constants.MaxDecibels, height, 0);

                if (y < 0) {
                    continue;
                }

                if (y > height) {
                    break;
                }

                context.fillRect(0, y, width, 1);
            }

            if (this._infoVisible && mouseX != null && mouseY != null) {
                context.fillStyle = "#555555";

                context.fillRect(mouseX, 0, 1, height);
                context.fillRect(0, mouseY, width, 1);
            }
        }
    }

    private _renderInfo(): void {
        if (this._infoVisible !== this._renderedInfoVisible) {
            this._infoContainer.style.display = this._infoVisible ? "" : "none";
        }

        if (this._infoVisible) {
            if (this._mouseFrequency !== this._renderedMouseFrequency) {
                this._pitchInfo.textContent = this._mouseFrequency;
                this._renderedMouseFrequency = this._mouseFrequency;
            }

            if (this._mouseDecibels !== this._renderedMouseDecibels) {
                this._volumeInfo.textContent = this._mouseDecibels;
                this._renderedMouseDecibels = this._mouseDecibels;
            }
        }
    }

    public resize(width: number, height: number): void {
        this._width = width;
        this._height = height;
        this._resized = true;
    }

    private _handleMouseMove = (event: MouseEvent): void => {
        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;
        this._mouseX = mouseX;
        this._mouseY = mouseY;
        this._mouseFrequency = (frequencyFromMouse(mouseX, bounds.width) | 0) + " Hz";
        this._mouseDecibels = decibelsFromMouse(mouseY, bounds.height, Constants.MinDecibels, Constants.MaxDecibels).toFixed(2) + " dB";
        this._infoVisible = true;
        this._ui.scheduleMainRender();
    };

    private _handleMouseOut = (event: MouseEvent): void => {
        this._mouseX = null;
        this._mouseY = null;
        this._infoVisible = false;
        this._ui.scheduleMainRender();
    };
}

function frequencyFromMouse(x: number, width: number): number {
    return Math.exp(remap(x, 0, width, Constants.MinFrequencyLog, Constants.MaxFrequencyLog));
}

function decibelsFromMouse(y: number, height: number, minDb: number, maxDb: number): number {
    return clamp(remap(clamp(y, 1, height - 1), height, 0, minDb, maxDb), minDb, maxDb);
}

const enum Constants {
    MinFrequency = 10,
    MaxFrequency = 22050,
    MinFrequencyLog = 2.302585092994046, // Math.log(10)
    MaxFrequencyLog = 10.001067880874992, // Math.log(22050)

    MinDecibels = -90,
    MaxDecibels = 0,

    // The window function used in AnalyserNode causes amplitude loss, so this
    // lets us compensate for that. We also compensate for the downmixing of
    // its stereo input to mono (i.e. it does `(L+R)/2`).
    // See also:
    // - https://community.sw.siemens.com/s/article/window-correction-factors
    // - https://dsp.stackexchange.com/questions/85277/what-is-the-energycorrection-or-amplitude-correction-for-a-tukey-window/85279#85279
    AmplitudeCorrectionFactor = 13.555614113586907, // 20 * Math.log10(computeAmplitudeCorrectionFactor(computeWindowTable(2048, blackmanWindow)) * 2)
}

// @TODO: Put this stuff somewhere else.
export function computeWindowTable(count: number, windowFunction: (index: number, count: number) => number): Float32Array {
    const windowTable: Float32Array = new Float32Array(count);
    for (let index: number = 0; index < count; index++) {
        windowTable[index] = windowFunction(index, count);
    }
    return windowTable;
}

export function blackmanWindow(index: number, count: number): number {
    // Used in AnalyserNode: https://webaudio.github.io/web-audio-api/#fft-windowing-and-smoothing-over-time
    const a: number = 0.16;
    const a0: number = (1.0 - a) / 2.0;
    const a1: number = 1.0 / 2.0;
    const a2: number = a / 2.0;
    return a0 - a1 * Math.cos((2.0 * Math.PI * index) / count) + a2 * Math.cos((4.0 * Math.PI * index) / count);
}

export function computeAmplitudeCorrectionFactor(windowTable: Float32Array): number {
    const count: number = windowTable.length;
    let accumulator: number = 0.0;
    for (let index: number = 0; index < count; index++) {
        const value: number = windowTable[index];
        accumulator += value;
    }
    const mean: number = accumulator / count;
    return 1.0 / mean;
}
