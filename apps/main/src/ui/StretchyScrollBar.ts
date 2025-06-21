import { lerp, remap, clamp } from "@synth-playground/common/math.js";
import { H } from "@synth-playground/dom/index.js";
import { type Component } from "./types.js";
import { UIContext } from "./UIContext.js";

export type StretchyScrollBarOnChange = (zoom: number, pan: number) => void;

export type StretchyScrollBarOnRenderOverlay = (
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
) => void;

export class StretchyScrollBar implements Component {
    public element: HTMLDivElement;
    public size: number;
    public handleSize: number;
    private _ui: UIContext;
    private _thumb: HTMLDivElement;
    private _thumbStartHandle: HTMLDivElement;
    private _thumbEndHandle: HTMLDivElement;
    private _overlayCanvas: HTMLCanvasElement | null;
    private _overlayContext: CanvasRenderingContext2D | null;
    private _width: number;
    private _height: number;
    private _minThumbSize: number;
    private _vertical: boolean;
    private _flip: boolean;
    private _zoom: number;
    private _pan: number;
    private _zoom0: number;
    private _pan0: number;
    private _mouseX0: number;
    private _mouseY0: number;
    private _mouseIsDownOnThumb: boolean;
    private _mouseIsDownOnThumbStartHandle: boolean;
    private _mouseIsDownOnThumbEndHandle: boolean;
    private _onChange: StretchyScrollBarOnChange;
    private _onRenderOverlay: StretchyScrollBarOnRenderOverlay | null;
    private _renderedThumbIsActive: boolean | null;
    private _renderedThumbWidthStr: string | null;
    private _renderedThumbHeightStr: string | null;
    private _renderedThumbXStr: string | null;
    private _renderedThumbYStr: string | null;
    private _renderedScrollBarWidth: number | null;
    private _renderedScrollBarHeight: number | null;

    constructor(
        ui: UIContext,
        vertical: boolean,
        flip: boolean,
        zoom: number,
        pan: number,
        onChange: StretchyScrollBarOnChange,
        onRenderOverlay: StretchyScrollBarOnRenderOverlay | null
    ) {
        this._ui = ui;

        this._vertical = vertical;
        this._flip = flip;
        this._onChange = onChange;
        this._onRenderOverlay = onRenderOverlay;
        this._zoom = zoom;
        this._pan = pan;
        this._zoom0 = 0;
        this._pan0 = 0;
        this._mouseX0 = 0;
        this._mouseY0 = 0;
        this._mouseIsDownOnThumb = false;
        this._mouseIsDownOnThumbStartHandle = false;
        this._mouseIsDownOnThumbEndHandle = false;
        this._renderedThumbIsActive = null;
        this._renderedThumbWidthStr = null;
        this._renderedThumbHeightStr = null;
        this._renderedThumbXStr = null;
        this._renderedThumbYStr = null;
        this._renderedScrollBarWidth = null;
        this._renderedScrollBarHeight = null;
        this.size = 20;
        this.handleSize = 10;

        // Anything much smaller than this means we can't pan, only zoom.
        // The actual minimum for this is something slightly above 2, which is
        // annoyingly tiny if too close to 2.
        this._minThumbSize = this.handleSize * 3;

        // These values don't really matter because they'll be overwritten as
        // our parent element is resized.
        this._width  = this._vertical ? this.size : 500;
        this._height = this._vertical ? 500 : this.size;

        const scrollBarSize: number = this._vertical ? this._height : this._width;
        const thumbSize: number = lerp(this._zoom, this._minThumbSize, scrollBarSize);
        const thumbPosition: number = lerp(this._pan, 0, scrollBarSize - thumbSize);

        const thumbWidthStr: string = this._vertical ? "100%" : `${thumbSize}px`;
        const thumbHeightStr: string = this._vertical ? `${thumbSize}px` : "100%";
        const thumbXStr: string = this._vertical ? "unset" : `${thumbPosition}px`;
        const thumbYStr: string = this._vertical ? `${thumbPosition}px` : "unset";

        const containerWidthStr: string = this._vertical ? `${this.size}px` : `${this._width}px`;
        const containerHeightStr: string = this._vertical ? `${this._height}px` : `${this.size}px`;

        const handleWidthStr: string = this._vertical ? "100%" : `${this.handleSize}px`;
        const handleHeightStr: string = this._vertical ? `${this.handleSize}px` : "100%";
        const startHandleXStr: string = this._vertical ? "unset" : "0";
        const startHandleYStr: string = this._vertical ? "0" : "unset";
        const endHandleXStr: string = this._vertical ? "unset" : "0";
        const endHandleYStr: string = this._vertical ? "0" : "unset";

        this._thumbStartHandle = H("div", {
            class: "stretchy-scrollbar-thumb-handle",
            draggable: "false",
            style: `
                box-sizing: border-box;
                width: ${handleWidthStr};
                height: ${handleHeightStr};
                position: absolute;
                left: ${startHandleXStr};
                top: ${startHandleYStr};
            `,
        });
        this._thumbEndHandle = H("div", {
            class: "stretchy-scrollbar-thumb-handle",
            draggable: "false",
            style: `
                box-sizing: border-box;
                width: ${handleWidthStr};
                height: ${handleHeightStr};
                position: absolute;
                right: ${endHandleXStr};
                bottom: ${endHandleYStr};
            `,
        });
        this._thumb = H("div", {
            class: "stretchy-scrollbar-thumb",
            draggable: "false",
            style: `
                box-sizing: border-box;
                width: ${thumbWidthStr};
                height: ${thumbHeightStr};
                left: ${thumbXStr};
                top: ${thumbYStr};
                position: relative;
            `,
        }, this._thumbStartHandle, this._thumbEndHandle);
        this._overlayCanvas = null;
        this._overlayContext = null;
        this.element = H("div", {
            class: "stretchy-scrollbar",
            style: `
                box-sizing: border-box;
                width: ${containerWidthStr};
                height: ${containerHeightStr};
                position: relative;
                flex-shrink: 0;
            `,
        }, this._thumb);
        if (this._onRenderOverlay != null) {
            // Save a bit of memory.
            this._overlayCanvas = H("canvas", {
                width: this._width + "",
                height: this._height + "",
                style: `
                    display: block;
                    box-sizing: border-box;
                    pointer-events: none;
                    left: 0;
                    top: 0;
                    position: absolute;
                `,
            });
            this._overlayContext = this._overlayCanvas.getContext("2d")!;
            this.element.appendChild(this._overlayCanvas);
        }

        this._thumb.addEventListener("dragstart", this._disableDragging);
        this._thumb.addEventListener("mousedown", this._onPointerDownForThumb);
        window.addEventListener("mouseup", this._onPointerUpForThumb);
        window.addEventListener("mousemove", this._onPointerMoveForThumb);

        this._thumbStartHandle.addEventListener("dragstart", this._disableDragging);
        this._thumbStartHandle.addEventListener("mousedown", this._onPointerDownForThumbStartHandle);
        window.addEventListener("mouseup", this._onPointerUpForThumbStartHandle);
        window.addEventListener("mousemove", this._onPointerMoveForThumbStartHandle);

        this._thumbEndHandle.addEventListener("dragstart", this._disableDragging);
        this._thumbEndHandle.addEventListener("mousedown", this._onPointerDownForThumbEndHandle);
        window.addEventListener("mouseup", this._onPointerUpForThumbEndHandle);
        window.addEventListener("mousemove", this._onPointerMoveForThumbEndHandle);
    }

    public dispose(): void {
        this._thumb.removeEventListener("dragstart", this._disableDragging);
        this._thumb.removeEventListener("mousedown", this._onPointerDownForThumb);
        window.removeEventListener("mouseup", this._onPointerUpForThumb);
        window.removeEventListener("mousemove", this._onPointerMoveForThumb);

        this._thumbStartHandle.removeEventListener("dragstart", this._disableDragging);
        this._thumbStartHandle.removeEventListener("mousedown", this._onPointerDownForThumbStartHandle);
        window.removeEventListener("mouseup", this._onPointerUpForThumbStartHandle);
        window.removeEventListener("mousemove", this._onPointerMoveForThumbStartHandle);

        this._thumbEndHandle.removeEventListener("dragstart", this._disableDragging);
        this._thumbEndHandle.removeEventListener("mousedown", this._onPointerDownForThumbEndHandle);
        window.removeEventListener("mouseup", this._onPointerUpForThumbEndHandle);
        window.removeEventListener("mousemove", this._onPointerMoveForThumbEndHandle);
    }

    public render(): void {
        this._renderScrollBar();
        this._renderOverlay();
    }

    public getZoom(): number {
        return this._zoom;
    }

    public getPan(): number {
        return this._flip ? 1.0 - this._pan : this._pan;
    }

    private _getDeltaDivisor(event: MouseEvent): number {
        return event.shiftKey ? 128 : 1;
    }

    private _disableDragging = (event: Event): boolean => {
        event.preventDefault();
        event.stopPropagation();
        return false;
    };

    private _onPointerDownForThumb = (event: MouseEvent): void => {
        if (event.target !== this._thumb) return;

        // If I don't put this here, then the text in other panels remains
        // selectable, which I don't want.
        event.preventDefault();

        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        this._pan0 = this._pan;
        this._mouseX0 = mouseX;
        this._mouseY0 = mouseY;

        this._mouseIsDownOnThumb = true;
        this._ui.scheduleMainRender();
    };

    private _onPointerUpForThumb = (event: MouseEvent): void => {
        if (this._mouseIsDownOnThumb) {
            this._onCursorMoveForThumb(event);
            this._mouseIsDownOnThumb = false;
            this._ui.scheduleMainRender();
        }
    };

    private _onPointerMoveForThumb = (event: MouseEvent): void => {
        if (this._mouseIsDownOnThumb) {
            this._onCursorMoveForThumb(event);
        }
    };

    private _onCursorMoveForThumb(event: MouseEvent): void {
        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        const mouseDeltaX: number = mouseX - this._mouseX0;
        const mouseDeltaY: number = mouseY - this._mouseY0;

        const deltaDivisor: number = this._getDeltaDivisor(event);
        const scrollBarSize: number = this._vertical ? this._height : this._width;
        const positionDelta: number = (this._vertical ? mouseDeltaY : mouseDeltaX) / deltaDivisor;
        const thumbSize: number = lerp(this._zoom, this._minThumbSize, scrollBarSize);
        const thumbPosition0: number = lerp(this._pan0, 0, scrollBarSize - thumbSize);
        const thumbPosition: number = clamp(thumbPosition0 + positionDelta, 0, scrollBarSize - thumbSize);
        this._pan = (
            scrollBarSize - thumbSize === 0
            ? 0 // In this case, the track and the thumb have the same size.
            : remap(thumbPosition, 0, scrollBarSize - thumbSize, 0, 1)
        );
        this._pan0 = this._pan;
        this._mouseX0 = mouseX;
        this._mouseY0 = mouseY;

        this._onChange(this.getZoom(), this.getPan());
        this._ui.scheduleMainRender();
    }

    private _onPointerDownForThumbStartHandle = (event: MouseEvent): void => {
        if (event.target !== this._thumbStartHandle) return;

        // If I don't put this here, then the text in other panels remains
        // selectable, which I don't want.
        event.preventDefault();

        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        this._zoom0 = this._zoom;
        this._pan0 = this._pan;
        this._mouseX0 = mouseX;
        this._mouseY0 = mouseY;

        this._mouseIsDownOnThumbStartHandle = true;
        this._ui.scheduleMainRender();
    };

    private _onPointerUpForThumbStartHandle = (event: MouseEvent): void => {
        if (this._mouseIsDownOnThumbStartHandle) {
            this._onCursorMoveForThumbStartHandle(event);
            this._mouseIsDownOnThumbStartHandle = false;
            this._ui.scheduleMainRender();
        }
    };

    private _onPointerMoveForThumbStartHandle = (event: MouseEvent): void => {
        if (this._mouseIsDownOnThumbStartHandle) {
            this._onCursorMoveForThumbStartHandle(event);
        }
    };

    private _onCursorMoveForThumbStartHandle(event: MouseEvent): void {
        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        const mouseDeltaX: number = mouseX - this._mouseX0;
        const mouseDeltaY: number = mouseY - this._mouseY0;

        const deltaDivisor: number = this._getDeltaDivisor(event);
        const scrollBarSize: number = this._vertical ? this._height : this._width;
        const positionDelta: number = (this._vertical ? mouseDeltaY : mouseDeltaX) / deltaDivisor;
        const thumbSize0: number = lerp(this._zoom0, this._minThumbSize, scrollBarSize);
        const thumbPosition0: number = lerp(this._pan0, 0, scrollBarSize - thumbSize0);
        const endGap0: number = scrollBarSize - (thumbSize0 + thumbPosition0);
        const thumbSize: number = clamp(thumbSize0 - positionDelta, this._minThumbSize, scrollBarSize - endGap0);
        const thumbPosition: number = clamp(thumbPosition0 + positionDelta, 0, scrollBarSize - thumbSize - endGap0);
        this._zoom = remap(thumbSize, this._minThumbSize, scrollBarSize, 0, 1);
        this._pan = (
            scrollBarSize - thumbSize === 0
            ? 0 // In this case, the track and the thumb have the same size.
            : remap(thumbPosition, 0, scrollBarSize - thumbSize, 0, 1)
        );
        this._zoom0 = this._zoom;
        this._pan0 = this._pan;
        this._mouseX0 = mouseX;
        this._mouseY0 = mouseY;

        this._onChange(this.getZoom(), this.getPan());
        this._ui.scheduleMainRender();
    }

    private _onPointerDownForThumbEndHandle = (event: MouseEvent): void => {
        if (event.target !== this._thumbEndHandle) return;

        // If I don't put this here, then the text in other panels remains
        // selectable, which I don't want.
        event.preventDefault();

        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        this._zoom0 = this._zoom;
        this._pan0 = this._pan;
        this._mouseX0 = mouseX;
        this._mouseY0 = mouseY;

        this._mouseIsDownOnThumbEndHandle = true;
        this._ui.scheduleMainRender();
    };

    private _onPointerUpForThumbEndHandle = (event: MouseEvent): void => {
        if (this._mouseIsDownOnThumbEndHandle) {
            this._onCursorMoveForThumbEndHandle(event);
            this._mouseIsDownOnThumbEndHandle = false;
            this._ui.scheduleMainRender();
        }
    };

    private _onPointerMoveForThumbEndHandle = (event: MouseEvent): void => {
        if (this._mouseIsDownOnThumbEndHandle) {
            this._onCursorMoveForThumbEndHandle(event);
        }
    };

    private _onCursorMoveForThumbEndHandle(event: MouseEvent): void {
        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseX: number = event.clientX - bounds.left;
        const mouseY: number = event.clientY - bounds.top;

        const mouseDeltaX: number = mouseX - this._mouseX0;
        const mouseDeltaY: number = mouseY - this._mouseY0;

        const deltaDivisor: number = this._getDeltaDivisor(event);
        const scrollBarSize: number = this._vertical ? this._height : this._width;
        const positionDelta: number = (this._vertical ? mouseDeltaY : mouseDeltaX) / deltaDivisor;
        const thumbSize0: number = lerp(this._zoom0, this._minThumbSize, scrollBarSize);
        const thumbPosition0: number = lerp(this._pan0, 0, scrollBarSize - thumbSize0);
        const thumbSize: number = clamp(thumbSize0 + positionDelta, this._minThumbSize, scrollBarSize - thumbPosition0);
        this._zoom = remap(thumbSize, this._minThumbSize, scrollBarSize, 0, 1);
        this._pan = (
            scrollBarSize - thumbSize === 0
            ? 0 // In this case, the track and the thumb have the same size.
            : remap(thumbPosition0, 0, scrollBarSize - thumbSize, 0, 1)
        );
        this._zoom0 = this._zoom;
        this._pan0 = this._pan;
        this._mouseX0 = mouseX;
        this._mouseY0 = mouseY;

        this._onChange(this.getZoom(), this.getPan());
        this._ui.scheduleMainRender();
    }

    public resize(width: number, height: number): void {
        this._width = width;
        this._height = height;

        // If rendering is deferred, this will look a bit weird while resizing,
        // so render synchronously here.
        this._renderScrollBar();

        // We leave resizing the overlay canvas to the parent.

        this._ui.scheduleMainRender();
    }

    private _renderScrollBar(): void {
        const thumbIsActive: boolean = (
            this._mouseIsDownOnThumb
            || this._mouseIsDownOnThumbStartHandle
            || this._mouseIsDownOnThumbEndHandle
        );
        if (thumbIsActive != this._renderedThumbIsActive) {
            if (thumbIsActive) {
                this._thumb.classList.add("active");
            } else {
                this._thumb.classList.remove("active");
            }
            this._renderedThumbIsActive = thumbIsActive;
        }

        const scrollBarSize: number = this._vertical ? this._height : this._width;
        // @TODO: Hide or make handles smaller when scrollBarSize < minThumbSize?
        const minThumbSize: number = Math.min(scrollBarSize, this._minThumbSize);
        const thumbSize: number = lerp(this._zoom, minThumbSize, scrollBarSize);
        const thumbPosition: number = lerp(this._pan, 0, scrollBarSize - thumbSize);

        const containerWidth: number = this._vertical ? this.size : scrollBarSize;
        const containerHeight: number = this._vertical ? scrollBarSize : this.size;
        // @TODO: Avoid these string allocations...
        const thumbWidthStr: string = this._vertical ? "100%" : `${thumbSize}px`;
        const thumbHeightStr: string = this._vertical ? `${thumbSize}px` : "100%";
        const thumbXStr: string = this._vertical ? "unset" : `${thumbPosition}px`;
        const thumbYStr: string = this._vertical ? `${thumbPosition}px` : "unset";

        if (this._renderedScrollBarWidth != containerWidth) {
            this.element.style.width = `${containerWidth}px`;
            this._renderedScrollBarWidth = containerWidth;
        }
        if (this._renderedScrollBarHeight != containerHeight) {
            this.element.style.height = `${containerHeight}px`;
            this._renderedScrollBarHeight = containerHeight;
        }
        if (this._renderedThumbWidthStr != thumbWidthStr) {
            this._thumb.style.width = thumbWidthStr;
            this._renderedThumbWidthStr = thumbWidthStr;
        }
        if (this._renderedThumbHeightStr != thumbHeightStr) {
            this._thumb.style.height = thumbHeightStr;
            this._renderedThumbHeightStr = thumbHeightStr;
        }
        if (this._renderedThumbXStr != thumbXStr) {
            this._thumb.style.left = thumbXStr;
            this._renderedThumbXStr = thumbXStr;
        }
        if (this._renderedThumbYStr != thumbYStr) {
            this._thumb.style.top = thumbYStr;
            this._renderedThumbYStr = thumbYStr;
        }
    }

    private _renderOverlay(): void {
        this._onRenderOverlay?.(
            this._overlayCanvas!,
            this._overlayContext!,
            this._width,
            this._height,
        );
    }
}
