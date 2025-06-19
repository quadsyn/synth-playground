import { H } from "@synth-playground/dom/index.js";
// import { SongDocument } from "../SongDocument.js";
import { type Component } from "./types.js";
import { UIContext } from "./UIContext.js";
// import { StretchyScrollBar } from "./StretchyScrollBar.js";

export class Timeline implements Component {
    public element: HTMLDivElement;
    private _ui: UIContext;
    private _backgroundColor: string;
    private _circleColor: string;
    private _width: number;
    private _height: number;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _dirty: boolean;

    constructor(
        ui: UIContext,
    ) {
        this._ui = ui;

        this._backgroundColor = `rgb(${(Math.random() * 0xFF) | 0}, ${(Math.random() * 0xFF) | 0}, ${(Math.random() * 0xFF) | 0})`;
        this._circleColor = `rgb(${(Math.random() * 0xFF) | 0}, ${(Math.random() * 0xFF) | 0}, ${(Math.random() * 0xFF) | 0})`;

        this._width = 1;
        this._height = 1;
        this._dirty = true;

        this._canvas = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                width: 100%;
                height: 100%;
                display: block;
                box-sizing: border-box;
            `,
        });
        this._context = this._canvas.getContext("2d")!;
        this.element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
            `,
        }, this._canvas);
    }

    public dispose(): void {}

    public render(): void {
        const context = this._context;
        const width = this._width;
        const height = this._height;
        if (width !== this._canvas.width || height !== this._canvas.height) {
            this._canvas.width = this._width;
            this._canvas.height = this._height;
            this._dirty = true;
        }
        if (this._dirty) {
            this._dirty = false;
            context.fillStyle = this._backgroundColor;
            context.fillRect(0, 0, width, height);
            context.fillStyle = this._circleColor;
            context.beginPath();
            context.arc(
                width * 0.5,
                height * 0.5,
                Math.min(width * 0.5, height * 0.5),
                0,
                Math.PI * 2
            );
            context.fill();
        }
    }

    public resize(): void {
        this._width = this._canvas.clientWidth;
        this._height = this._canvas.clientHeight;

        this._ui.scheduleMainRender();
    }
}
