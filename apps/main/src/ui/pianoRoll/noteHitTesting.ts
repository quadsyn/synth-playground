import { remap, insideRange, rangesOverlap } from "@synth-playground/common/math.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Viewport from "../common/Viewport.js";
import { NoteDrawingStyle } from "./NoteDrawingStyle.js";
import * as BentNoteIterator from "./BentNoteIterator.js";
import { tickToX, pitchToY, noteIsFlat } from "./common.js";

// @TODO: Maybe I should just pass the operation state to these...

export const enum NoteHit {
    None   = 0b00000,
    Inside = 0b00001,
    Left   = 0b00010,
    Right  = 0b00100,
    Top    = 0b01000,
    Bottom = 0b10000,
}

export function pointOverlapsNote(
    it: BentNoteIterator.Type,
    pointX: number,
    pointY: number,
    note: Note.Type,
    noteDrawingStyle: NoteDrawingStyle,
    noteStretchHandleSize: number,
    noteVolumeHandleSizeFactor: number,
    notePitchHandleSizeFactor: number,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
): NoteHit {
    let result: NoteHit = NoteHit.None;

    const start: number = note.start;
    const end: number = note.end;

    const x0: number = tickToX(viewport, pixelsPerTick, start);
    const x1: number = tickToX(viewport, pixelsPerTick, end);

    // Exit early if the point is fully outside of the note, horizontally.
    if (!insideRange(pointX, x0, x1)) {
        return result;
    }

    const pitch: number = note.pitch;
    const pitches: Breakpoint.Type[] | null = note.pitchEnvelope;
    const pitchCount: number = pitches != null ? pitches.length : 0;

    const noteStartStretchHandleX0: number = x0;
    const noteStartStretchHandleX1: number = x0 + noteStretchHandleSize;

    const noteEndStretchHandleX0: number = x1 - noteStretchHandleSize;
    const noteEndStretchHandleX1: number = x1;

    // These are relative to the top of the note.
    const noteTopHandleY0: number = 0;
    const noteTopHandleY1: number = pixelsPerPitch / noteVolumeHandleSizeFactor;
    const noteBottomHandleY1: number = pixelsPerPitch;
    const noteBottomHandleY0: number = noteBottomHandleY1 - pixelsPerPitch / notePitchHandleSizeFactor;

    if (noteIsFlat(noteDrawingStyle, note)) {
        const actualPitch: number = pitch + (
            // We also consider this a flat note.
            pitchCount === 1 ? pitches![0].value : 0
        );

        const y0: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, actualPitch);
        const y1: number = y0 + pixelsPerPitch;

        if (insideRange(pointX, x0, x1) && insideRange(pointY, y0, y1)) {
            result |= NoteHit.Inside;
        }
        if (insideRange(pointY, y0 + noteTopHandleY0, y0 + noteTopHandleY1)) {
            result |= NoteHit.Top;
        }
        if (insideRange(pointY, y0 + noteBottomHandleY0, y0 + noteBottomHandleY1)) {
            result |= NoteHit.Bottom;
        }
    } else {
        // @TODO: Do a binary search for the one segment we care about.

        BentNoteIterator.setup(it, start, end, pitch, pitches, BentNoteIterator.Mode.Forward);
        while (!BentNoteIterator.isDone(it)) {
            BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
            const segmentDuration: number = it.pitchTime1 - it.pitchTime0;
            if (segmentDuration > 0) {
                // This collision detection approach makes use of the separating axis theorem.
                // You can see more information about that here:
                // https://en.wikipedia.org/wiki/Hyperplane_separation_theorem#Use_in_collision_detection
                // The summary is that we can keep doing the usual range overlap checks, but instead of just horizontally and vertically, we
                // should instead test all unique axes perpendicular to the edges of the participating convex polygons. As soon as there is
                // no overlap in one of these axes, we can stop. Otherwise, if all of them contain an overlap, then we have a collision.

                const overlapsHorizontally: boolean = insideRange(pointX, it.segmentX0, it.segmentX1);
                if (overlapsHorizontally) {
                    // We need to figure out the topmost and bottommost points.
                    // The topmost point will be the smallest coordinate.
                    // The bottommost point will be the highest coordinate, plus the thickness of the note.
                    const segmentYMin: number = Math.min(it.segmentY0, it.segmentY1);
                    const segmentYMax: number = Math.max(it.segmentY0, it.segmentY1) + pixelsPerPitch;

                    // Technically, in this case we don't need to check the vertical axis, it will be covered by the next check.
                    // But it doesn't really hurt, only makes it maybe a little bit slower. Can be axed if it matters.
                    const overlapsVertically: boolean = insideRange(pointY, segmentYMin, segmentYMax);
                    if (overlapsVertically) {
                        if (it.segmentY0 !== it.segmentY1) {
                            // There's a slope, so we now have to do the most involved check.

                            // This makes the end point of the top edge of this segment relative to the origin, instead of the start point.
                            const topEdgeX: number = it.segmentX1 - it.segmentX0;
                            const topEdgeY: number = it.segmentY1 - it.segmentY0;

                            // This gets us the lefthand normal of the top edge.
                            // Note that if we draw it relative to (it.segmentX0, it.segmentY0), it will show up on the right, because of the canvas
                            // coordinates being flipped vertically. This is also not an unit length vector, but we don't need it to be one, which is
                            // nice because it lets us skip some calculations.
                            const axisX: number = -topEdgeY;
                            const axisY: number = topEdgeX;

                            // This creates a vector that starts at the top left of this segment and goes towards the point we're checking.
                            const pointEdgeX: number = pointX - it.segmentX0;
                            const pointEdgeY: number = pointY - it.segmentY0;

                            // Project the point edge onto the axis perpendicular to the top edge.
                            // See the following for why we don't need to normalize the perpendicular vector:
                            // https://en.wikipedia.org/wiki/Vector_projection
                            // We don't really need the actual projected vector, so this dot product is enough.
                            const projPointEdgeDot: number = pointEdgeX * axisX + pointEdgeY * axisY;

                            // Project the vector (0, pixelsPerPitch) onto the axis perpendicular to the top edge.
                            const projThicknessDot: number = pixelsPerPitch * axisY;

                            // We now only need to do a range overlap check with these two dot products.
                            const overlapsAtAnAngle: boolean = insideRange(projPointEdgeDot, 0, projThicknessDot);

                            if (overlapsAtAnAngle) {
                                const y: number = remap(pointX, it.segmentX0, it.segmentX1, it.segmentY0, it.segmentY1);
                                if (insideRange(pointY, y + noteTopHandleY0, y + noteTopHandleY1)) {
                                    result |= NoteHit.Top;
                                }
                                if (insideRange(pointY, y + noteBottomHandleY0, y + noteBottomHandleY1)) {
                                    result |= NoteHit.Bottom;
                                }

                                result |= NoteHit.Inside;
                                break;
                            }
                        } else {
                            const y: number = remap(pointX, it.segmentX0, it.segmentX1, it.segmentY0, it.segmentY1);
                            if (insideRange(pointY, y + noteTopHandleY0, y + noteTopHandleY1)) {
                                result |= NoteHit.Top;
                            }
                            if (insideRange(pointY, y + noteBottomHandleY0, y + noteBottomHandleY1)) {
                                result |= NoteHit.Bottom;
                            }

                            // No slope, so the vertical check was enough.
                            result |= NoteHit.Inside;
                            break;
                        }
                    }
                }
            }

            BentNoteIterator.advance(it);
        }
        BentNoteIterator.teardown(it);
    }

    if ((result & NoteHit.Inside) !== 0) {
        if (insideRange(pointX, noteStartStretchHandleX0, noteStartStretchHandleX1)) {
            result |= NoteHit.Left;
        }
        if (insideRange(pointX, noteEndStretchHandleX0, noteEndStretchHandleX1)) {
            result |= NoteHit.Right;
        }
    }

    return result;
}

export function rectOverlapsNote(
    it: BentNoteIterator.Type,
    rectX0: number,
    rectY0: number,
    rectX1: number,
    rectY1: number,
    note: Note.Type,
    noteDrawingStyle: NoteDrawingStyle,
    noteStretchHandleSize: number,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
): NoteHit {
    let result: NoteHit = NoteHit.None;

    const start: number = note.start;
    const end: number = note.end;

    const x0: number = tickToX(viewport, pixelsPerTick, start);
    const x1: number = tickToX(viewport, pixelsPerTick, end);

    // Exit early if the rect is fully outside of the note, horizontally.
    if (!rangesOverlap(rectX0, rectX1, x0, x1)) {
        return result;
    }

    const pitch: number = note.pitch;
    const pitches: Breakpoint.Type[] | null = note.pitchEnvelope;
    const pitchCount: number = pitches != null ? pitches.length : 0;

    if (noteIsFlat(noteDrawingStyle, note)) {
        const actualPitch: number = pitch + (
            // We also consider this a flat note.
            pitchCount === 1 ? pitches![0].value : 0
        );

        const y0: number = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, actualPitch);
        const y1: number = y0 + pixelsPerPitch;

        if (rangesOverlap(rectX0, rectX1, x0, x1) && rangesOverlap(rectY0, rectY1, y0, y1)) {
            result |= NoteHit.Inside;
        }
    } else {
        BentNoteIterator.setup(it, start, end, pitch, pitches, BentNoteIterator.Mode.Forward);
        while (!BentNoteIterator.isDone(it)) {
            BentNoteIterator.computeSegment(it, canvasWidth, canvasHeight, viewport, pixelsPerTick, pixelsPerPitch, maxPitch);
            const segmentDuration: number = it.pitchTime1 - it.pitchTime0;
            if (segmentDuration <= 0) {
                BentNoteIterator.advance(it);
                continue;
            }

            // See `pointOverlapsNote`.
            const overlapsHorizontally: boolean = rangesOverlap(rectX0, rectX1, it.segmentX0, it.segmentX1);
            if (overlapsHorizontally) {
                const segmentYMin: number = Math.min(it.segmentY0, it.segmentY1);
                const segmentYMax: number = Math.max(it.segmentY0, it.segmentY1) + pixelsPerPitch;
                const overlapsVertically: boolean = rangesOverlap(rectY0, rectY1, segmentYMin, segmentYMax);
                if (overlapsVertically) {
                    if (it.segmentY0 !== it.segmentY1) {
                        const topEdgeX: number = it.segmentX1 - it.segmentX0;
                        const topEdgeY: number = it.segmentY1 - it.segmentY0;

                        const axisX: number = -topEdgeY;
                        const axisY: number = topEdgeX;

                        // We now need to project the rectangle onto the axis perpendicular to the top edge.
                        // This is an unrolled version of the following: https://dyn4j.org/2010/01/sat/#projecting-a-shape-onto-an-axis
                        let minRectDot: number = (rectX0 - it.segmentX0) * axisX + (rectY0 - it.segmentY0) * axisY;
                        let maxRectDot: number = minRectDot;
                        {
                            const dot: number = (rectX1 - it.segmentX0) * axisX + (rectY0 - it.segmentY0) * axisY;
                            if (dot < minRectDot) minRectDot = dot;
                            if (dot > maxRectDot) maxRectDot = dot;
                        }
                        {
                            const dot: number = (rectX1 - it.segmentX0) * axisX + (rectY1 - it.segmentY0) * axisY;
                            if (dot < minRectDot) minRectDot = dot;
                            if (dot > maxRectDot) maxRectDot = dot;
                        }
                        {
                            const dot: number = (rectX0 - it.segmentX0) * axisX + (rectY1 - it.segmentY0) * axisY;
                            if (dot < minRectDot) minRectDot = dot;
                            if (dot > maxRectDot) maxRectDot = dot;
                        }

                        const maxThicknessDot: number = pixelsPerPitch * axisY;

                        const overlapsAtAnAngle: boolean = rangesOverlap(minRectDot, maxRectDot, 0, maxThicknessDot);

                        if (overlapsAtAnAngle) {
                            result |= NoteHit.Inside;
                            break;
                        }
                    } else {
                        result |= NoteHit.Inside;
                        break;
                    }
                }
            }

            BentNoteIterator.advance(it);
        }
        BentNoteIterator.teardown(it);
    }

    return result;
}
