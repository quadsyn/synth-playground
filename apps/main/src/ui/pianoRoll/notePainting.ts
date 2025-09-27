import { lerp, unlerp, remap, clamp, rangesOverlap } from "@synth-playground/common/math.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Viewport from "../common/Viewport.js";
import { NoteDrawingStyle } from "./NoteDrawingStyle.js";
import * as BentNoteIterator from "./BentNoteIterator.js";
import { tickToX, pitchToY } from "./common.js";

/** The return value indicates whether the background was drawn or not. */
export function drawNoteBackgroundPath(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
    force: boolean,
): boolean {
    if (end <= start) {
        // Don't draw zero-length notes.
        return false;
    }

    const x0: number = tickToX(viewport, pixelsPerTick, start);
    const x1: number = tickToX(viewport, pixelsPerTick, end);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    if (!rangesOverlap(x, x + w, 0, canvasWidth)) {
        // Quit early if note is horizontally out of bounds.
        return false;
    }
    const y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch);
    const h: number = pixelsPerPitch;
    const pitchEnvelopeLength: number = pitchEnvelope != null ? pitchEnvelope.length : 0;
    const volumeEnvelopeLength: number = volumeEnvelope != null ? volumeEnvelope.length : 0;
    const hasPitchEnvelope: boolean = pitchEnvelopeLength > 0;
    const hasVolumeEnvelope: boolean = volumeEnvelopeLength > 0;

    if (
        style === NoteDrawingStyle.Flat
        || (style === NoteDrawingStyle.Bent && !hasPitchEnvelope)
    ) {
        if (!rangesOverlap(y, y + h, 0, canvasHeight)) {
            // Quit early if note is vertically out of bounds.
            return false;
        }

        if (
            hasVolumeEnvelope
            || force // We have this here for outlines and note flashing at least.
        ) {
            context.beginPath();
            context.rect(x, y, w, h);
            return true;
        }

        return false;
    } else if (style === NoteDrawingStyle.Bent) {
        // @TODO: Use first value for culling if pitchEnvelopeLength === 1

        // @TODO: Figure out bounding box, and use that for culling? Maybe not
        // worth it. Actually hmm, I need this for the overlay that shows the
        // out of bounds notes. Right now I'm just going with recording the min
        // and max y values, and drawing anyway (since the browser will clip the
        // path). But maybe this is in fact worth it, despite being another pass
        // over the pitch envelope.

        let minY: number = Infinity;
        let maxY: number = -Infinity;

        context.beginPath();
        {
            // Top left -> top right
            let firstLine: boolean = true;
            let prevSegmentX1: number = 0;
            let prevSegmentY1: number = 0;
            BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Forward);
            while (!BentNoteIterator.isDone(it)) {
                BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
                const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
                if (adjustedDuration > 0) {
                    const segmentX0: number = it.segmentX0;
                    const segmentX1: number = it.segmentX1;
                    const segmentY0: number = it.segmentY0;
                    const segmentY1: number = it.segmentY1;
                    if (firstLine) {
                        firstLine = false;
                        context.moveTo(segmentX0, segmentY0);
                    } else if (segmentX0 !== prevSegmentX1 || segmentY0 !== prevSegmentY1) {
                        context.lineTo(segmentX0, segmentY0);
                    }
                    context.lineTo(segmentX1, segmentY1);
                    prevSegmentX1 = segmentX1;
                    prevSegmentY1 = segmentY1;
                    if (segmentY0 < minY) {
                        minY = segmentY0;
                    }
                    if (segmentY0 > maxY) {
                        maxY = segmentY0;
                    }
                    if (segmentY1 < minY) {
                        minY = segmentY1;
                    }
                    if (segmentY1 > maxY) {
                        maxY = segmentY1;
                    }
                }
                BentNoteIterator.advance(it);
            }
        }
        {
            // Bottom right -> bottom left
            let prevSegmentX0: number = 0;
            let prevSegmentY0: number = 0;
            BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Backward);
            while (!BentNoteIterator.isDone(it)) {
                BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
                const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
                if (adjustedDuration > 0) {
                    const segmentX0: number = it.segmentX0;
                    const segmentX1: number = it.segmentX1;
                    const segmentY0: number = it.segmentY0 + pixelsPerPitch;
                    const segmentY1: number = it.segmentY1 + pixelsPerPitch;
                    if (segmentX1 !== prevSegmentX0 || segmentY1 !== prevSegmentY0) {
                        context.lineTo(segmentX1, segmentY1);
                    }
                    context.lineTo(segmentX0, segmentY0);
                    prevSegmentX0 = segmentX0;
                    prevSegmentY0 = segmentY0;
                    if (segmentY0 < minY) {
                        minY = segmentY0;
                    }
                    if (segmentY0 > maxY) {
                        maxY = segmentY0;
                    }
                    if (segmentY1 < minY) {
                        minY = segmentY1;
                    }
                    if (segmentY1 > maxY) {
                        maxY = segmentY1;
                    }
                }
                BentNoteIterator.advance(it);
            }
        }
        BentNoteIterator.teardown(it);
        context.closePath();

        // See the bounding box note above.
        return rangesOverlap(minY, maxY, 0, canvasHeight);
    }

    return false;
}

/** The return value indicates whether the foreground was drawn or not. */
export function drawNoteForegroundPath(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): boolean {
    if (end <= start) {
        // Don't draw zero-length notes.
        return false;
    }

    const x0: number = tickToX(viewport, pixelsPerTick, start);
    const x1: number = tickToX(viewport, pixelsPerTick, end);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    if (!rangesOverlap(x, x + w, 0, canvasWidth)) {
        // Quit early if note is horizontally out of bounds.
        return false;
    }
    const y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch);
    const h: number = pixelsPerPitch;
    const pitchEnvelopeLength: number = pitchEnvelope != null ? pitchEnvelope.length : 0;
    const volumeEnvelopeLength: number = volumeEnvelope != null ? volumeEnvelope.length : 0;
    const hasPitchEnvelope: boolean = pitchEnvelopeLength > 0;
    const hasVolumeEnvelope: boolean = volumeEnvelopeLength > 0;

    if (
        style === NoteDrawingStyle.Flat
        || (style === NoteDrawingStyle.Bent && !hasPitchEnvelope && !hasVolumeEnvelope)
    ) {
        if (!rangesOverlap(y, y + h, 0, canvasHeight)) {
            // Quit early if note is vertically out of bounds.
            return false;
        }

        // @TODO: if volumeEnvelopeLength >= 1: draw two rectangles, take first
        // value as the foreground height?

        // @TODO: Add rect fast path if volumeEnvelopeLength === 1

        context.beginPath();
        context.rect(x, y, w, h);

        return true;
    } else if (style === NoteDrawingStyle.Bent) {
        if (!hasPitchEnvelope) {
            if (!rangesOverlap(y, y + h, 0, canvasHeight)) {
                // Quit early if note is vertically out of bounds.
                return false;
            }
        }

        // @TODO: Use first value for culling if pitchEnvelopeLength === 1

        // @TODO: Figure out bounding box, and use that for culling? Maybe not
        // worth it. Actually hmm, I need this for the overlay that shows the
        // out of bounds notes. Right now I'm just going with recording the min
        // and max y values, and drawing anyway (since the browser will clip the
        // path). But maybe this is in fact worth it, despite being another pass
        // over the pitch envelope.

        let minY: number = Infinity;
        let maxY: number = -Infinity;

        const defaultVolume: number = 1; // @TODO: Constant

        context.beginPath();
        {
            // Top left -> top right
            let firstLine: boolean = true;
            let prevSegmentX1: number = 0;
            let prevSegmentY1: number = 0;
            BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Forward);
            while (!BentNoteIterator.isDone(it)) {
                BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
                const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
                if (adjustedDuration > 0) {
                    const volumeStartIndex: number = Breakpoint.findIndex(volumeEnvelope, it.adjustedPitchTime0);
                    const startVolume: number = clamp(Breakpoint.evaluateNoteEnvelope(volumeEnvelope!, it.adjustedPitchTime0, volumeStartIndex, defaultVolume), 0, 1);
                    const segmentX0: number = it.segmentX0;
                    const segmentY0: number = it.segmentY0 + pixelsPerPitch * 0.5 - pixelsPerPitch * 0.5 * startVolume;
                    if (firstLine) {
                        firstLine = false;
                        context.moveTo(segmentX0, segmentY0);
                    } else if (segmentX0 !== prevSegmentX1 || segmentY0 !== prevSegmentY1) {
                        context.lineTo(segmentX0, segmentY0);
                    }
                    if (volumeStartIndex > -1 && it.adjustedPitchTime0 !== it.adjustedPitchTime1) {
                        for (let volumeIndex: number = volumeStartIndex; volumeIndex < volumeEnvelopeLength; volumeIndex++) {
                            const volumePoint: Breakpoint.Type = volumeEnvelope![volumeIndex];
                            const volumeTime: number = volumePoint.time;
                            if (volumeTime < it.adjustedPitchTime0) {
                                continue;
                            }
                            if (volumeTime > it.adjustedPitchTime1) {
                                break;
                            }
                            const t: number = clamp(unlerp(volumeTime, it.adjustedPitchTime0, it.adjustedPitchTime1), 0, 1);
                            const segmentX: number = tickToX(viewport, pixelsPerTick, start + volumeTime);
                            const segmentY: number = lerp(t, it.segmentY0, it.segmentY1) + pixelsPerPitch * 0.5 - pixelsPerPitch * 0.5 * clamp(volumePoint.value, 0, 1);
                            if (segmentX !== prevSegmentX1 || segmentY !== prevSegmentY1) {
                                context.lineTo(segmentX, segmentY);
                                prevSegmentX1 = segmentX;
                                prevSegmentY1 = segmentY;
                            }
                        }
                    }
                    const volumeEndIndex: number = Breakpoint.findIndex(volumeEnvelope, it.adjustedPitchTime1);
                    const endVolume: number = clamp(Breakpoint.evaluateNoteEnvelope(volumeEnvelope!, it.adjustedPitchTime1, volumeEndIndex, defaultVolume), 0, 1);
                    const segmentX1: number = it.segmentX1;
                    const segmentY1: number = it.segmentY1 + pixelsPerPitch * 0.5 - pixelsPerPitch * 0.5 * endVolume;
                    if (segmentX1 !== prevSegmentX1 || segmentY1 !== prevSegmentY1) {
                        context.lineTo(segmentX1, segmentY1);
                        prevSegmentX1 = segmentX1;
                        prevSegmentY1 = segmentY1;
                    }
                    if (segmentY0 < minY) {
                        minY = segmentY0;
                    }
                    if (segmentY0 > maxY) {
                        maxY = segmentY0;
                    }
                    if (segmentY1 < minY) {
                        minY = segmentY1;
                    }
                    if (segmentY1 > maxY) {
                        maxY = segmentY1;
                    }
                }
                BentNoteIterator.advance(it);
            }
        }
        {
            // Bottom right -> bottom left
            let prevSegmentX0: number = 0;
            let prevSegmentY0: number = 0;
            BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Backward);
            while (!BentNoteIterator.isDone(it)) {
                BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
                const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
                if (adjustedDuration > 0) {
                    const volumeEndIndex: number = Breakpoint.findIndex(volumeEnvelope, it.adjustedPitchTime1);
                    const endVolume: number = Breakpoint.evaluateNoteEnvelope(volumeEnvelope!, it.adjustedPitchTime1, volumeEndIndex, defaultVolume);
                    const segmentX1: number = it.segmentX1;
                    const segmentY1: number = it.segmentY1 + pixelsPerPitch * 0.5 + pixelsPerPitch * 0.5 * endVolume;
                    if (segmentX1 !== prevSegmentX0 || segmentY1 !== prevSegmentY0) {
                        context.lineTo(segmentX1, segmentY1);
                    }
                    if (volumeEndIndex > -1 && it.adjustedPitchTime0 !== it.adjustedPitchTime1) {
                        for (let volumeIndex: number = volumeEndIndex - 1; volumeIndex >= 0; volumeIndex--) {
                            const volumePoint: Breakpoint.Type = volumeEnvelope![volumeIndex];
                            const volumeTime: number = volumePoint.time;
                            if (volumeTime < it.adjustedPitchTime0) {
                                break;
                            }
                            if (volumeTime > it.adjustedPitchTime1) {
                                continue;
                            }
                            const t: number = clamp(unlerp(volumeTime, it.adjustedPitchTime0, it.adjustedPitchTime1), 0, 1);
                            const segmentX: number = tickToX(viewport, pixelsPerTick, start + volumeTime);
                            const segmentY: number = lerp(t, it.segmentY0, it.segmentY1) + pixelsPerPitch * 0.5 + pixelsPerPitch * 0.5 * volumePoint.value;
                            if (segmentX !== prevSegmentX0 || segmentY !== prevSegmentY0) {
                                context.lineTo(segmentX, segmentY);
                                prevSegmentX0 = segmentX;
                                prevSegmentY0 = segmentY;
                            }
                        }
                    }
                    const volumeStartIndex: number = Breakpoint.findIndex(volumeEnvelope, it.adjustedPitchTime0);
                    const startVolume: number = Breakpoint.evaluateNoteEnvelope(volumeEnvelope!, it.adjustedPitchTime0, volumeStartIndex, defaultVolume);
                    const segmentX0: number = it.segmentX0;
                    const segmentY0: number = it.segmentY0 + pixelsPerPitch * 0.5 + pixelsPerPitch * 0.5 * startVolume;
                    if (segmentX0 !== prevSegmentX0 || segmentY0 !== prevSegmentY0) {
                        context.lineTo(segmentX0, segmentY0);
                        prevSegmentX0 = segmentX0;
                        prevSegmentY0 = segmentY0;
                    }
                    if (segmentY0 < minY) {
                        minY = segmentY0;
                    }
                    if (segmentY0 > maxY) {
                        maxY = segmentY0;
                    }
                    if (segmentY1 < minY) {
                        minY = segmentY1;
                    }
                    if (segmentY1 > maxY) {
                        maxY = segmentY1;
                    }
                }
                BentNoteIterator.advance(it);
            }
        }
        BentNoteIterator.teardown(it);
        context.closePath();

        // See the bounding box note above.
        return rangesOverlap(minY, maxY, 0, canvasHeight);
    }

    return false;
}

export function drawNoteBackground(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): boolean {
    const hasPath: boolean = drawNoteBackgroundPath(
        it,
        style,
        context,
        canvasWidth,
        canvasHeight,
        viewport,
        pixelsPerTick,
        pixelsPerPitch,
        maxPitch,
        start,
        end,
        pitch,
        pitchEnvelope,
        volumeEnvelope,
        /* force */ false,
    );
    if (hasPath) {
        context.fill();
    }
    return hasPath;
}

/** The return value indicates whether the foreground was drawn or not. */
export function drawNoteForeground(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): boolean {
    const hasPath: boolean = drawNoteForegroundPath(
        it,
        style,
        context,
        canvasWidth,
        canvasHeight,
        viewport,
        pixelsPerTick,
        pixelsPerPitch,
        maxPitch,
        start,
        end,
        pitch,
        pitchEnvelope,
        volumeEnvelope,
    );
    if (hasPath) {
        context.fill();
    }
    return hasPath;
}

export function drawNoteOutline(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): void {
    if (drawNoteBackgroundPath(
        it,
        style,
        context,
        canvasWidth,
        canvasHeight,
        viewport,
        pixelsPerTick,
        pixelsPerPitch,
        maxPitch,
        start,
        end,
        pitch,
        pitchEnvelope,
        volumeEnvelope,
        /* force */ true,
    )) {
        context.stroke();
    }
}

export function drawNoteFlash(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    playhead: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
    colorTable: string[],
): void {
    const progress: number = clamp(unlerp(playhead, start, end), 0, 1);
    const alpha: number = 1.0 - progress;

    if (drawNoteForegroundPath(
        it,
        style,
        context,
        canvasWidth,
        canvasHeight,
        viewport,
        pixelsPerTick,
        pixelsPerPitch,
        maxPitch,
        start,
        end,
        pitch,
        pitchEnvelope,
        volumeEnvelope,
    )) {
        const colorTableSize: number = colorTable.length;
        const colorIndex: number = clamp((alpha * colorTableSize) | 0, 0, colorTableSize - 1);
        context.fillStyle = colorTable[colorIndex];
        context.fill();
    }
}

export function drawNoteLeftHandle(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    handleSize: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): void {
    if (end <= start) {
        // Don't draw for zero-length notes.
        return;
    }

    // @TODO: Binary search for the segment we care about.

    const x0: number = tickToX(viewport, pixelsPerTick, start);
    const x1: number = tickToX(viewport, pixelsPerTick, end);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    if (!rangesOverlap(x, x + w, 0, canvasWidth)) {
        // Quit early if note is horizontally out of bounds.
        return;
    }
    const y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch);
    const h: number = pixelsPerPitch;
    const pitchEnvelopeLength: number = pitchEnvelope != null ? pitchEnvelope.length : 0;
    const hasPitchEnvelope: boolean = pitchEnvelopeLength > 0;

    if (
        style === NoteDrawingStyle.Flat
        || (style === NoteDrawingStyle.Bent && !hasPitchEnvelope)
    ) {
        if (!rangesOverlap(y, y + h, 0, canvasHeight)) {
            // Quit early if note is vertically out of bounds.
            return;
        }

        context.beginPath();
        context.rect(x, y, Math.min(w, handleSize), h);
        context.fill();
    } else if (style === NoteDrawingStyle.Bent) {
        // @TODO: Use first value for culling if pitchEnvelopeLength === 1

        // @TODO: Figure out bounding box, and use that for culling? Maybe not
        // worth it.

        let handleX0: number = 0;
        let handleX1: number = 0;
        let handleY0: number = 0;
        let handleY1: number = 0;

        context.beginPath();

        // Top left -> top right (for the handle shape!)
        BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Forward);
        while (!BentNoteIterator.isDone(it)) {
            BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
            const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
            if (adjustedDuration > 0) {
                handleX0 = it.segmentX0;
                handleX1 = clamp(handleX0 + handleSize, it.segmentX0, it.segmentX1);
                handleY0 = it.segmentY0;
                handleY1 = remap(handleX1, it.segmentX0, it.segmentX1, it.segmentY0, it.segmentY1);

                context.moveTo(handleX0, handleY0);
                context.lineTo(handleX1, handleY1);

                // We only care about the first visible segment.
                break;
            }
            BentNoteIterator.advance(it);
        }
        BentNoteIterator.teardown(it);
        
        // Bottom right -> bottom left (for the handle shape!)
        context.lineTo(handleX1, handleY1 + pixelsPerPitch);
        context.lineTo(handleX0, handleY0 + pixelsPerPitch);

        context.closePath();
        context.fill();
    }
}

export function drawNoteRightHandle(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    handleSize: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): void {
    if (end <= start) {
        // Don't draw for zero-length notes.
        return;
    }

    // @TODO: Binary search for the segment we care about.

    const x0: number = tickToX(viewport, pixelsPerTick, start);
    const x1: number = tickToX(viewport, pixelsPerTick, end);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    if (!rangesOverlap(x, x + w, 0, canvasWidth)) {
        // Quit early if note is horizontally out of bounds.
        return;
    }
    const y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch);
    const h: number = pixelsPerPitch;
    const pitchEnvelopeLength: number = pitchEnvelope != null ? pitchEnvelope.length : 0;
    const hasPitchEnvelope: boolean = pitchEnvelopeLength > 0;

    if (
        style === NoteDrawingStyle.Flat
        || (style === NoteDrawingStyle.Bent && !hasPitchEnvelope)
    ) {
        if (!rangesOverlap(y, y + h, 0, canvasHeight)) {
            // Quit early if note is vertically out of bounds.
            return;
        }

        context.beginPath();
        context.rect(Math.max(x, x1 - handleSize), y, Math.min(w, handleSize), h);
        context.fill();
    } else if (style === NoteDrawingStyle.Bent) {
        // @TODO: Use first value for culling if pitchEnvelopeLength === 1

        // @TODO: Figure out bounding box, and use that for culling? Maybe not
        // worth it.

        let handleX0: number = 0;
        let handleX1: number = 0;
        let handleY0: number = 0;
        let handleY1: number = 0;

        context.beginPath();

        // Top left -> top right (for the handle shape!)
        BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Backward);
        while (!BentNoteIterator.isDone(it)) {
            BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
            const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
            if (adjustedDuration > 0) {
                handleX0 = clamp(it.segmentX1 - handleSize, it.segmentX0, it.segmentX1);
                handleX1 = it.segmentX1;
                handleY0 = remap(handleX0, it.segmentX0, it.segmentX1, it.segmentY0, it.segmentY1);
                handleY1 = it.segmentY1;

                context.moveTo(handleX0, handleY0);
                context.lineTo(handleX1, handleY1);

                // We only care about the last visible segment.
                break;
            }
            BentNoteIterator.advance(it);
        }
        BentNoteIterator.teardown(it);
        
        // Bottom right -> bottom left (for the handle shape!)
        context.lineTo(handleX1, handleY1 + pixelsPerPitch);
        context.lineTo(handleX0, handleY0 + pixelsPerPitch);

        context.closePath();
        context.fill();
    }
}

export function drawNoteTopHandle(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    handleSizeFactor: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): void {
    if (end <= start) {
        // Don't draw for zero-length notes.
        return;
    }

    const x0: number = tickToX(viewport, pixelsPerTick, start);
    const x1: number = tickToX(viewport, pixelsPerTick, end);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    if (!rangesOverlap(x, x + w, 0, canvasWidth)) {
        // Quit early if note is horizontally out of bounds.
        return;
    }
    const y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch);
    const h: number = pixelsPerPitch;
    const pitchEnvelopeLength: number = pitchEnvelope != null ? pitchEnvelope.length : 0;
    const hasPitchEnvelope: boolean = pitchEnvelopeLength > 0;

    const handleSize: number = pixelsPerPitch / handleSizeFactor;

    if (
        style === NoteDrawingStyle.Flat
        || (style === NoteDrawingStyle.Bent && !hasPitchEnvelope)
    ) {
        if (!rangesOverlap(y, y + h, 0, canvasHeight)) {
            // Quit early if note is vertically out of bounds.
            return;
        }

        context.beginPath();
        context.rect(x, y, w, Math.min(h, handleSize));
        context.fill();
    } else if (style === NoteDrawingStyle.Bent) {
        // @TODO: Use first value for culling if pitchEnvelopeLength === 1

        // @TODO: Figure out bounding box, and use that for culling? Maybe not
        // worth it.

        context.beginPath();
        {
            // Top left -> top right
            let firstLine: boolean = true;
            let prevSegmentX1: number = 0;
            let prevSegmentY1: number = 0;
            BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Forward);
            while (!BentNoteIterator.isDone(it)) {
                BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
                const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
                if (adjustedDuration > 0) {
                    if (firstLine) {
                        firstLine = false;
                        context.moveTo(it.segmentX0, it.segmentY0);
                    } else if (it.segmentX0 !== prevSegmentX1 || it.segmentY0 !== prevSegmentY1) {
                        context.lineTo(it.segmentX0, it.segmentY0);
                    }
                    context.lineTo(it.segmentX1, it.segmentY1);
                    prevSegmentX1 = it.segmentX1;
                    prevSegmentY1 = it.segmentY1;
                }
                BentNoteIterator.advance(it);
            }
        }
        {
            // Bottom right -> bottom left
            let prevSegmentX0: number = 0;
            let prevSegmentY0: number = 0;
            BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Backward);
            while (!BentNoteIterator.isDone(it)) {
                BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
                const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
                if (adjustedDuration > 0) {
                    if (it.segmentX1 !== prevSegmentX0 || it.segmentY1 !== prevSegmentY0) {
                        context.lineTo(it.segmentX1, it.segmentY1 + handleSize);
                    }
                    context.lineTo(it.segmentX0, it.segmentY0 + handleSize);
                    prevSegmentX0 = it.segmentX0;
                    prevSegmentY0 = it.segmentY0;
                }
                BentNoteIterator.advance(it);
            }
        }
        BentNoteIterator.teardown(it);
        context.closePath();
        context.fill();
    }
}

export function drawNoteVolumeEnvelopePoints(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    handleSizeFactor: number,
    envelopePointSizeFactor: number,
    note: Note.Type,
    hoveringPointIndex: number,
): void {
    const pointCount: number = note.volumeEnvelope != null ? note.volumeEnvelope.length : 0;
    const hasPitchEnvelope: boolean = note.pitchEnvelope != null && note.pitchEnvelope.length > 0;
    for (let pointIndex: number = 0; pointIndex < pointCount; pointIndex++) {
        const hovering: boolean = pointIndex === hoveringPointIndex;
        const point: Breakpoint.Type = note.volumeEnvelope![pointIndex];
        const pointTime: number = point.time;
        const absolutePointTime: number = note.start + pointTime;

        // @TODO: Hmm, should this be >=?
        if (absolutePointTime > note.end) {
            break;
        }

        if (absolutePointTime < note.start) {
            continue;
        }

        const pitchIndex1: number = Breakpoint.findIndex(note.pitchEnvelope, pointTime);
        const clampedPitchIndex1: number = hasPitchEnvelope ? Math.min(pitchIndex1, note.pitchEnvelope!.length - 1) : 0;
        const pitchIndex0: number = Math.max(0, pitchIndex1 - 1);
        const pitch1Value: number = hasPitchEnvelope ? note.pitchEnvelope![clampedPitchIndex1].value : 0;
        const pitch0Value: number = hasPitchEnvelope ? note.pitchEnvelope![pitchIndex0].value : 0;
        const pitch1Time: number = hasPitchEnvelope ? note.pitchEnvelope![clampedPitchIndex1].time : 0;
        const pitch0Time: number = hasPitchEnvelope ? note.pitchEnvelope![pitchIndex0].time : 0;
        const pitch1: number = note.pitch + pitch1Value;
        const pitch0: number = note.pitch + pitch0Value;
        const pitch0Y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch0);
        const pitch1Y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch1);
        const t: number = (
            pitchIndex1 <= -1
            ? 0 // In this case, there's no pitch envelope.
            : pitch0Time === pitch1Time
                ? 0 // In this case, the pitch bent segment has a duration of 0.
                : unlerp(pointTime, pitch0Time, pitch1Time)
        );
        const x: number = tickToX(viewport, pixelsPerTick, note.start + pointTime);
        const baseR: number = (pixelsPerPitch / handleSizeFactor) * 0.5;
        const r: number = baseR * envelopePointSizeFactor;
        const y: number = lerp(t, pitch0Y, pitch1Y) + baseR;

        context.beginPath();
        context.arc(x, y, r * (hovering ? 1 : 0.5), 0, Math.PI * 2.0, false);
        if (hovering) {
            context.fill();
        } else {
            context.stroke();
        }
    }
}

export function drawNoteBottomHandle(
    it: BentNoteIterator.Type,
    style: NoteDrawingStyle,
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    handleSizeFactor: number,
    start: number,
    end: number,
    pitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    volumeEnvelope: Breakpoint.Type[] | null,
): void {
    if (end <= start) {
        // Don't draw for zero-length notes.
        return;
    }

    const x0: number = tickToX(viewport, pixelsPerTick, start);
    const x1: number = tickToX(viewport, pixelsPerTick, end);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    if (!rangesOverlap(x, x + w, 0, canvasWidth)) {
        // Quit early if note is horizontally out of bounds.
        return;
    }
    const y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch);
    const h: number = pixelsPerPitch;
    const pitchEnvelopeLength: number = pitchEnvelope != null ? pitchEnvelope.length : 0;
    const hasPitchEnvelope: boolean = pitchEnvelopeLength > 0;

    const handleSize: number = pixelsPerPitch / handleSizeFactor;

    if (
        style === NoteDrawingStyle.Flat
        || (style === NoteDrawingStyle.Bent && !hasPitchEnvelope)
    ) {
        if (!rangesOverlap(y, y + h, 0, canvasHeight)) {
            // Quit early if note is vertically out of bounds.
            return;
        }

        context.beginPath();
        context.rect(x, Math.max(y, y + h - handleSize), w, Math.min(h, handleSize));
        context.fill();
    } else if (style === NoteDrawingStyle.Bent) {
        // @TODO: Use first value for culling if pitchEnvelopeLength === 1

        // @TODO: Figure out bounding box, and use that for culling? Maybe not
        // worth it.

        context.beginPath();
        {
            // Top left -> top right
            let firstLine: boolean = true;
            let prevSegmentX1: number = 0;
            let prevSegmentY1: number = 0;
            BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Forward);
            while (!BentNoteIterator.isDone(it)) {
                BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
                const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
                if (adjustedDuration > 0) {
                    if (firstLine) {
                        firstLine = false;
                        context.moveTo(it.segmentX0, it.segmentY0 + pixelsPerPitch - handleSize);
                    } else if (it.segmentX0 !== prevSegmentX1 || it.segmentY0 !== prevSegmentY1) {
                        context.lineTo(it.segmentX0, it.segmentY0 + pixelsPerPitch - handleSize);
                    }
                    context.lineTo(it.segmentX1, it.segmentY1 + pixelsPerPitch - handleSize);
                    prevSegmentX1 = it.segmentX1;
                    prevSegmentY1 = it.segmentY1;
                }
                BentNoteIterator.advance(it);
            }
        }
        {
            // Bottom right -> bottom left
            let prevSegmentX0: number = 0;
            let prevSegmentY0: number = 0;
            BentNoteIterator.setup(it, start, end, pitch, pitchEnvelope, BentNoteIterator.Mode.Backward);
            while (!BentNoteIterator.isDone(it)) {
                BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
                const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
                if (adjustedDuration > 0) {
                    if (it.segmentX1 !== prevSegmentX0 || it.segmentY1 !== prevSegmentY0) {
                        context.lineTo(it.segmentX1, it.segmentY1 + pixelsPerPitch);
                    }
                    context.lineTo(it.segmentX0, it.segmentY0 + pixelsPerPitch);
                    prevSegmentX0 = it.segmentX0;
                    prevSegmentY0 = it.segmentY0;
                }
                BentNoteIterator.advance(it);
            }
        }
        BentNoteIterator.teardown(it);
        context.closePath();
        context.fill();
    }
}

export function drawNotePitchEnvelopePoints(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
    handleSizeFactor: number,
    envelopePointSizeFactor: number,
    note: Note.Type,
    hoveringPointIndex: number,
): void {
    const pointCount: number = note.pitchEnvelope != null ? note.pitchEnvelope.length : 0;
    for (let pointIndex: number = 0; pointIndex < pointCount; pointIndex++) {
        const hovering: boolean = pointIndex === hoveringPointIndex;
        const point: Breakpoint.Type = note.pitchEnvelope![pointIndex];
        const pointTime: number = point.time;
        const absolutePointTime: number = note.start + pointTime;

        if (absolutePointTime > note.end) {
            break;
        }

        if (absolutePointTime < note.start) {
            continue;
        }

        const pointValue: number = point.value;
        const pitch: number = note.pitch + pointValue;
        const x: number = tickToX(viewport, pixelsPerTick, note.start + pointTime);
        const baseR: number = (pixelsPerPitch / handleSizeFactor) * 0.5;
        const r: number = baseR * envelopePointSizeFactor;
        const y: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, pitch) + pixelsPerPitch - baseR;

        context.beginPath();
        context.arc(x, y, r * (hovering ? 1 : 0.5), 0, Math.PI * 2.0, false);
        if (hovering) {
            context.fill();
        } else {
            context.stroke();
        }
    }
}
