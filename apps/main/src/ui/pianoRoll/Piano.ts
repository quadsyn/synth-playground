import { H } from "@synth-playground/browser/dom.js";
import { type ManualComponent } from "../types.js";
import { UIContext } from "../UIContext.js";
import { remap, clamp } from "@synth-playground/common/math.js";
import * as Viewport from "../common/Viewport.js";
import {
    pianoNaturalKeyColor,
    pianoAccidentalKeyColor,
    noteForegroundColor,
} from "./colors.js";

export type PianoOnKeyDownCallback = (pitch: number) => void;
export type PianoOnKeyUpCallback = (pitch: number) => void;

const keyColors: number[] = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

export class Piano implements ManualComponent {
    public element: HTMLDivElement;
    public size: number;

    private _ui: UIContext;
    private _maxPitch: number;
    private _width: number;
    private _height: number;
    private _resized: boolean;
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _viewport: Viewport.Type;
    private _cursorPitch: number | null;
    private _pointerIsDown: boolean;
    private _onKeyDown: PianoOnKeyDownCallback;
    private _onKeyUp: PianoOnKeyUpCallback;

    private _renderedViewport: Viewport.Type | null;
    private _renderedCursorPitch: number | null;

    constructor(
        ui: UIContext,
        initialHeight: number,
        viewport: Viewport.Type,
        maxPitch: number,
        onKeyDown: PianoOnKeyDownCallback,
        onKeyUp: PianoOnKeyUpCallback,
    ) {
        this._ui = ui;

        this._onKeyDown = onKeyDown;
        this._onKeyUp = onKeyUp;

        this.size = 50;
        this._width = this.size;
        this._height = initialHeight;
        this._resized = true;

        this._maxPitch = maxPitch;

        this._viewport = Viewport.make(
            /* x0 */ 0,
            /* y0 */ viewport.y0,
            /* x1 */ 0,
            /* y1 */ viewport.y1,
            // These values don't matter here, since we only care about matching
            // with the parent component.
            /* minWidth */ 0,
            /* maxWidth */ 0,
            /* minHeight */ 0,
            /* maxHeight */ 0,
        );
        this._renderedViewport = null;

        this._pointerIsDown = false;
        this._cursorPitch = null;
        this._renderedCursorPitch = null;

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
                position: relative;
                box-sizing: border-box;
            `,
        }, this._canvas);

        this.element.addEventListener("mousedown", this._onPointerDown);
        window.addEventListener("mousemove", this._onPointerMove);
        window.addEventListener("mouseup", this._onPointerUp);
    }

    public dispose(): void {
        this.element.removeEventListener("mousedown", this._onPointerDown);
        window.removeEventListener("mousemove", this._onPointerMove);
        window.removeEventListener("mouseup", this._onPointerUp);
    }

    public render(): void {
        const canvas: HTMLCanvasElement = this._canvas;
        const context: CanvasRenderingContext2D = this._context;
        const width: number = this._width;
        const height: number = this._height;
        const viewportY0: number = this._viewport.y0;
        const viewportY1: number = this._viewport.y1;
        // const maxPitch: number = this._maxPitch;
        const cursorPitch: number | null = this._cursorPitch;

        const dirty: boolean = (
            Viewport.isDirty(this._renderedViewport, this._viewport, Viewport.DirtyCheckOptions.Y)
            || cursorPitch !== this._renderedCursorPitch
            || this._resized
        );

        const cleared: boolean = this._resized;

        if (this._resized) {
            this._resized = false;
            this.element.style.height = height + "px";
            canvas.width = width;
            canvas.height = height;
        }

        if (!dirty) {
            return;
        }

        if (!cleared) {
            context.clearRect(0, 0, width, height);
        }

        let worldY: number = Math.max(0, Math.floor(viewportY0) - 1);
        while (worldY < viewportY1) {
            const screenY: number = remap(worldY, viewportY0, viewportY1, height, 0);
            context.fillStyle = (
                worldY === cursorPitch
                ? noteForegroundColor
                : keyColors[worldY % 12] === 0
                    ? pianoNaturalKeyColor
                    : pianoAccidentalKeyColor
            );
            const x: number = 0;
            const w: number = width;
            const h: number = screenY - remap(worldY + 1, viewportY0, viewportY1, height, 0);
            const y: number = screenY - h;
            context.fillRect(x, y, w, h);
            context.strokeRect(x, y, w, h);
            worldY++;
        }

        this._renderedViewport = Viewport.updateRendered(this._renderedViewport, this._viewport);
        this._renderedCursorPitch = cursorPitch;
    }

    public resize(height: number): void {
        this._height = height;
        this._resized = true;
        Viewport.clearRendered(this._renderedViewport);
        this._ui.scheduleMainRender();
    }

    public setViewport(viewport: Viewport.Type): void {
        Viewport.copy(this._viewport, viewport);
    }

    private _onPointerDown = (event: MouseEvent): void => {
        const bounds: DOMRect = this.element.getBoundingClientRect();
        // const width: number = bounds.width;
        // const height: number = bounds.height;
        const height: number = this._height;
        // const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        const viewportY0: number = this._viewport.y0;
        const viewportY1: number = this._viewport.y1;
        const viewportHeight: number = viewportY1 - viewportY0;
        const cursorPitch: number = clamp((
            viewportY0 + remap(mouseY, height, 0, 0, viewportHeight)
        ) | 0, 0, this._maxPitch);
        if (this._cursorPitch != null) {
            this._onKeyUp(this._cursorPitch);
            this._cursorPitch = null;
        }
        if (this._cursorPitch !== cursorPitch) {
            this._onKeyDown(cursorPitch);
        }
        this._cursorPitch = cursorPitch;

        this._pointerIsDown = true;

        this._ui.scheduleMainRender();
    };

    private _onPointerUp = (event: MouseEvent): void => {
        if (this._cursorPitch != null) {
            this._onKeyUp(this._cursorPitch);
        }
        this._cursorPitch = null;

        this._pointerIsDown = false;

        this._ui.scheduleMainRender();
    };

    private _onPointerMove = (event: MouseEvent): void => {
        if (!this._pointerIsDown) {
            return;
        }

        const bounds: DOMRect = this.element.getBoundingClientRect();
        // const width: number = bounds.width;
        // const height: number = bounds.height;
        const height: number = this._height;
        // const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        const viewportY0: number = this._viewport.y0;
        const viewportY1: number = this._viewport.y1;
        const viewportHeight: number = viewportY1 - viewportY0;
        const cursorPitch: number = clamp((
            viewportY0 + remap(mouseY, height, 0, 0, viewportHeight)
        ) | 0, 0, this._maxPitch);

        if (this._cursorPitch !== cursorPitch) {
            if (this._cursorPitch != null) {
                this._onKeyUp(this._cursorPitch);
            }
            this._onKeyDown(cursorPitch);
        }

        this._cursorPitch = cursorPitch;
    };
}
