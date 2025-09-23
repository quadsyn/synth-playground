import { lerp, unlerp, clamp } from "@synth-playground/common/math.js";

export interface Type {
    x0: number;
    y0: number;
    x1: number;
    y1: number;

    // Can be ignored for components that should synchronize with the viewport
    // of their parent (e.g. time ruler).
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;

    // If y is unzoomable, then y1 doesn't really matter. minHeight and
    // maxHeight also don't matter.

    // @TODO: Store canvasWidth and canvasHeight here?
    // @TODO: Store pixelsPerX and pixelsPerY here?
}

export function make(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    minWidth: number,
    maxWidth: number,
    minHeight: number,
    maxHeight: number,
): Type {
    return {
        x0: x0,
        y0: y0,
        x1: x1,
        y1: y1,
        minWidth: minWidth,
        maxWidth: maxWidth,
        minHeight: minHeight,
        maxHeight: maxHeight,
    };
}

/** Doesn't copy (min|max)(Width|Height). */
export function copy(destination: Type, source: Type): Type {
    destination.x0 = source.x0;
    destination.y0 = source.y0;
    destination.x1 = source.x1;
    destination.y1 = source.y1;

    return destination;
}

export const enum DirtyCheckOptions {
    X    = 0b01,
    Y    = 0b10,
    Both = 0b11,
}

export function isDirty(
    rendered: Type | null,
    viewport: Type,
    options: DirtyCheckOptions,
): boolean {
    if (rendered == null) {
        return true;
    }

    if ((options & DirtyCheckOptions.X) !== 0) {
        if (viewport.x0 !== rendered.x0 || viewport.x1 !== rendered.x1) {
            return true;
        }
    }

    if ((options & DirtyCheckOptions.Y) !== 0) {
        if (viewport.y0 !== rendered.y0 || viewport.y1 !== rendered.y1) {
            return true;
        }
    }

    return false;
}

/**
 * You must assign the return value of this function to the rendered viewport
 * you're storing in order for this to work, as it will return a new object if
 * the rendered viewport is null.
 */
export function updateRendered(rendered: Type | null, viewport: Type): Type {
    if (rendered == null) {
        return make(
            viewport.x0,
            viewport.y0,
            viewport.x1,
            viewport.y1,
            // These values don't matter, because we only use rendered viewport
            // objects for dirty checking. No calculations should be done with
            // them.
            /* minWidth */ 0,
            /* maxWidth */ 0,
            /* minHeight */ 0,
            /* maxHeight */ 0,
        );
    }

    return copy(rendered, viewport);
}

export function clearRendered(rendered: Type | null): void {
    if (rendered != null) {
        // @TODO: Previously, I was setting these to null. At least NaN is a
        // float too. Is there a better option? The only option that comes to
        // mind is Infinity, which is similarly invalid.
        rendered.x0 = NaN;
        rendered.y0 = NaN;
        rendered.x1 = NaN;
        rendered.y1 = NaN;
    }
}

// The difference betwewen "compute" and "get" is that "get" is for when you
// have viewport objects and just want to have the applicable value. "Compute"
// is how I've split up these calculations, so I can reuse them.
// @TODO: I'm not convinced "get" is a good name here.

export function computeXZoom(width: number, minWidth: number, maxWidth: number): number {
    return clamp(unlerp(width, minWidth, maxWidth), 0, 1);
}

export function getXZoom(viewport: Type): number {
    return computeXZoom(viewport.x1 - viewport.x0, viewport.minWidth, viewport.maxWidth);
}

export function computeXPan(x0: number, width: number, maxWidth: number): number {
    const remaining: number = maxWidth - width;
    return clamp(remaining === 0 ? 0 : unlerp(x0, 0, remaining), 0, 1);
}

export function getXPan(viewport: Type): number {
    return computeXPan(viewport.x0, viewport.x1 - viewport.x0, viewport.maxWidth);
}

/**
 * @returns Whether the coordinates changed, useful for skipping rendering.
 */
export function zoomAndPanX(viewport: Type, zoom: number, pan: number): boolean {
    const x0: number = viewport.x0;
    const x1: number = viewport.x1;
    const w: number = lerp(zoom, viewport.minWidth, viewport.maxWidth);
    const x: number = lerp(pan, 0, viewport.maxWidth - w);

    viewport.x0 = x;
    viewport.x1 = x + w;

    return x0 !== viewport.x0 || x1 !== viewport.x1;
}

/**
 * @returns Whether the coordinates changed, useful for skipping rendering.
 */
export function zoomAroundPointX(viewport: Type, pan: number, widthFactor: number): boolean {
    const x0: number = viewport.x0;
    const x1: number = viewport.x1;
    const newW: number = clamp((x1 - x0) * widthFactor, viewport.minWidth, viewport.maxWidth);
    const newX: number = lerp(pan, x0, x1) - newW * pan;
    return zoomAndPanX(
        viewport,
        computeXZoom(newW, viewport.minWidth, viewport.maxWidth),
        computeXPan(newX, newW, viewport.maxWidth),
    );
}

export function computeYZoom(height: number, minHeight: number, maxHeight: number): number {
    return clamp(unlerp(height, minHeight, maxHeight), 0, 1);
}

export function getYZoom(viewport: Type): number {
    return computeYZoom(viewport.y1 - viewport.y0, viewport.minHeight, viewport.maxHeight);
}

export function computeYZoomWithUnzoomableY(
    canvasHeight: number,
    // @TODO: Better name. This is related to the canvas height, _not_ the
    // viewport height.
    totalHeight: number,
): number {
    return clamp(canvasHeight / totalHeight, 0, 1);
}

export function computeYPan(y0: number, height: number, maxHeight: number): number {
    const remaining: number = maxHeight - height;
    return clamp(remaining === 0 ? 0 : unlerp(y0, 0, remaining), 0, 1);
}

export function getYPan(viewport: Type): number {
    return computeYPan(viewport.y0, viewport.y1 - viewport.y0, viewport.maxHeight);
}

export function computeYPanWithUnzoomableY(
    y0: number,
    canvasHeight: number,
    // @TODO: Better name. This is related to the canvas height, _not_ the
    // viewport height.
    totalHeight: number,
): number {
    return clamp(totalHeight > canvasHeight ? unlerp(y0, 0, totalHeight - canvasHeight) : 0, 0, 1);
}

export function getYPanWithUnzoomableY(
    viewport: Type,
    canvasHeight: number,
    // @TODO: Better name. This is related to the canvas height, _not_ the
    // viewport height.
    totalHeight: number,
): number {
    return computeYPanWithUnzoomableY(viewport.y0, canvasHeight, totalHeight);
}

/**
 * @returns Whether the coordinates changed, useful for skipping rendering.
 */
export function zoomAndPanY(viewport: Type, zoom: number, pan: number): boolean {
    const y0: number = viewport.y0;
    const y1: number = viewport.y1;
    const h: number = lerp(zoom, viewport.minHeight, viewport.maxHeight);
    const y: number = lerp(pan, 0, viewport.maxHeight - h);

    viewport.y0 = y;
    viewport.y1 = y + h;

    return y0 !== viewport.y0 || y1 !== viewport.y1;
}

export function panYWithUnzoomableY(
    viewport: Type,
    canvasHeight: number,
    // @TODO: Better name. This is related to the canvas height, _not_ the
    // viewport height.
    totalHeight: number,
    pan: number,
): boolean {
    const y0: number = viewport.y0;
    const y: number = totalHeight > canvasHeight ? lerp(pan, 0, totalHeight - canvasHeight) : 0;

    viewport.y0 = y;
    viewport.y1 = y;

    return y0 !== viewport.y0;
}

/**
 * @returns Whether the coordinates changed, useful for skipping rendering.
 */
export function scrollY(viewport: Type, heightFactor: number): boolean {
    const h: number = viewport.y1 - viewport.y0;
    return zoomAndPanY(
        viewport,
        computeYZoom(h, viewport.minHeight, viewport.maxHeight),
        computeYPan(viewport.y0 + h * heightFactor, h, viewport.maxHeight),
    );
}

// @TODO: I don't think this resizing math would work if I wanted to allow the
// coordinates to be negative.

export function resize(
    viewport: Type,
    oldCanvasWidth: number,
    oldCanvasHeight: number,
    newCanvasWidth: number,
    newCanvasHeight: number,
): void {
    const oldX0: number = viewport.x0;
    const oldY0: number = viewport.y0;
    const oldX1: number = viewport.x1;
    const oldY1: number = viewport.y1;
    const minWidth: number = viewport.minWidth;
    const maxWidth: number = viewport.maxWidth;
    const minHeight: number = viewport.minHeight;
    const maxHeight: number = viewport.maxHeight;

    const newX0: number = oldX0;
    const newX1: number = oldX0 + (oldX1 - oldX0) * (newCanvasWidth / oldCanvasWidth);
    const newW: number = clamp(newX1 - newX0, minWidth, maxWidth);
    const newX: number = lerp(computeXPan(newX0, newW, maxWidth), 0, maxWidth - newW);

    // These have Y0 and Y1 flipped to anchor resizes to the top part of the viewport.
    const newY0: number = oldY1;
    const newY1: number = oldY1 + (oldY0 - oldY1) * (newCanvasHeight / oldCanvasHeight);
    const newH: number = clamp(newY0 - newY1, minHeight, maxHeight);
    const newY: number = lerp(computeYPan(newY1, newH, maxHeight), 0, maxHeight - newH);

    viewport.x0 = newX;
    viewport.x1 = newX + newW;
    viewport.y0 = newY;
    viewport.y1 = newY + newH;

    // @TODO: Return a boolean indicating if this did change? Not very useful
    // because when this is used, we will probably render anyway.
}

export function resizeWithUnzoomableY(
    viewport: Type,
    oldCanvasWidth: number,
    oldCanvasHeight: number,
    newCanvasWidth: number,
    newCanvasHeight: number,
    // @TODO: Better name. This is related to the canvas height, _not_ the
    // viewport height.
    newTotalHeight: number,
): void {
    const oldX0: number = viewport.x0;
    const oldY0: number = viewport.y0;
    const oldX1: number = viewport.x1;
    const minWidth: number = viewport.minWidth;
    const maxWidth: number = viewport.maxWidth;

    const newX0: number = oldX0;
    const newX1: number = oldX0 + (oldX1 - oldX0) * (newCanvasWidth / oldCanvasWidth);
    const newW: number = clamp(newX1 - newX0, minWidth, maxWidth);
    const newX: number = lerp(computeXPan(newX0, newW, maxWidth), 0, maxWidth - newW);

    const newY: number = newTotalHeight > newCanvasHeight ? lerp(
        computeYPanWithUnzoomableY(oldY0, newCanvasHeight, newTotalHeight),
        0,
        newTotalHeight - newCanvasHeight
    ) : 0;

    viewport.x0 = newX;
    viewport.x1 = newX + newW;
    viewport.y0 = newY;
    viewport.y1 = newY;

    // @TODO: Return a boolean indicating if this did change? Not very useful
    // because when this is used, we will probably render anyway.
}
