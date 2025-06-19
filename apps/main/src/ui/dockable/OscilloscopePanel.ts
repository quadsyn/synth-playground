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

class Oscilloscope implements Component {
    public element: HTMLDivElement;
    // private _ui: UIContext;
    private _doc: SongDocument;
    private _width: number;
    private _height: number;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;

    constructor(ui: UIContext, doc: SongDocument) {
        // this._ui = ui;
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
        const data: Float32Array | null = this._doc.getOutputTimeDomainData();
        if (data == null) return;
        // const canvas: HTMLCanvasElement = this._canvas;
        const context: CanvasRenderingContext2D = this._context;
        const width: number = this._width;
        const height: number = this._height;
        const visualGain: number = 2;
        const samplesAvailable: number = data.length;
        const mask: number = samplesAvailable - 1;
        const windowSize: number = clamp(1000, 1, samplesAvailable);
        const halfWindowSize: number = windowSize >> 1;
        let start: number = halfWindowSize;
        const end: number = (samplesAvailable - halfWindowSize) - 1;
        while (start < end - 1) {
            const sample0: number = data[start];
            const sample1: number = data[start + 1];
            if (sample0 < 0 && sample1 >= 0) {
                break;
            }
            start++;
        }
        context.clearRect(0, 0, width, height);
        // @TODO: Find and draw peaks.
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

export class OscilloscopePanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _onDidVisibilityChange: DockviewIDisposable | null;
    private _visible: boolean;
    private _oscilloscope: Oscilloscope;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;

        this._visible = false;
        this._onDidVisibilityChange = null;

        this._oscilloscope = new Oscilloscope(this._ui, doc);

        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
            `,
        }, this._oscilloscope.element);

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
        this._oscilloscope.dispose();
    }

    public render(): void {
        if (!this._visible) return;
        this._oscilloscope.render();
    }

    private _resize(): void {
        if (!this._visible) return;
        this._oscilloscope.resize(this._element.clientWidth, this._element.clientHeight);
        this._ui.scheduleMainRender();
    }
}
