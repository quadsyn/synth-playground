import { lerp, clamp } from "@synth-playground/common/math.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as Viewport from "../common/Viewport.js";
import { tickToX, pitchToY } from "./common.js";

// @TODO:
// - At some point I should compare this against callbacks/closures and
//   generators.
// - Somehow include a "sub-iterator" for volume envelope points? When drawing
//   the notes, I'm currently doing two binary searches, for the volume points
//   relevant at the start and end of each segment, plus a loop going through
//   the volume points between those two. I will always need that loop, but I
//   could remove the need for the binary searches by keeping track of the last
//   volume point index and searching forward from there. And maybe simply
//   interleaving that iteration with the pitch point iteration. But it's
//   confusing to work that out so I didn't bother for now.

/**
 * Allows walking through the line segments formed by a note's pitch envelope.
 *
 * Two extra segments are materialized, anchored to the note's start and end.
 *
 * It should work correctly for pitch envelope points that come after the note's
 * end (i.e. `point.time > (note.end - note.start)`), and also for points that
 * come before the start of the note (i.e. `point.time < 0`) - you will get
 * interpolated pitches as necessary.
 */
export interface Type {
    /**
     * Pitch number (relative to the note's base pitch) at the start of the
     * current segment.
     */
    pitch0: number;

    /**
     * Start of the current segment (relative to the start of note), in ticks.
     */
    pitchTime0: number;

    /**
     * Pitch number (relative to the note's base pitch) at the end of the
     * current segment.
     */
    pitch1: number;

    /**
     * End of the current segment (relative to the start of note), in ticks.
     */
    pitchTime1: number;

    /**
     * Pitch number (relative to the note's base pitch) at the start of the
     * current segment.
     *
     * If the segment starts before the note, this is a value between `pitch0`
     * and `pitch1`, linearly interpolated.
     */
    adjustedPitch0: number;

    /**
     * Start of the current segment (relative to the start of note), in ticks,
     * clamped to the range `[0, noteEnd - noteStart]`.
     */
    adjustedPitchTime0: number;

    /**
     * Pitch number (relative to the note's base pitch) at the end of the
     * current segment.
     * 
     * If the segment ends after the note, this is a value between `pitch0` and
     * `pitch1`, linearly interpolated.
     */
    adjustedPitch1: number;

    /**
     * End of the current segment (relative to the start of note), in ticks,
     * clamped to the range `[0, noteEnd - noteStart]`.
     */
    adjustedPitchTime1: number;

    /** Horizontal coordinate of the start segment. */
    segmentX0: number;

    /**
     * Vertical coordinate of the start segment.
     *
     * This forms the top left. Add `pixelsPerPitch` for the bottom left.
     */
    segmentY0: number;

    /** Horizontal coordinate of the end segment. */
    segmentX1: number;

    /**
     * Vertical coordinate of the end segment.
     *
     * This forms the top right. Add `pixelsPerPitch` for the bottom right.
     */
    segmentY1: number;

    mode: Mode;

    // Internal fields.
    segmentCount: number;
    segmentIndex: number;
    noteStart: number;
    noteEnd: number;
    notePitch: number;
    pitchEnvelope: Breakpoint.Type[] | null;
    pitchEnvelopeLength: number;
    pitchIndex: number;
}

export const enum Mode {
    Forward,
    Backward,
}

export function make(): Type {
    return {
        pitch0: 0,
        pitchTime0: 0,
        pitch1: 0,
        pitchTime1: 0,
        adjustedPitch0: 0,
        adjustedPitchTime0: 0,
        adjustedPitch1: 0,
        adjustedPitchTime1: 0,
        segmentX0: 0,
        segmentY0: 0,
        segmentX1: 0,
        segmentY1: 0,
        mode: Mode.Forward,
        segmentCount: 0,
        segmentIndex: 0,
        noteStart: 0,
        noteEnd: 0,
        notePitch: 0,
        pitchEnvelope: null,
        pitchEnvelopeLength: 0,
        pitchIndex: 0,
    };
}

export function isDone(it: Type): boolean {
    if (it.mode === Mode.Forward) {
        return it.segmentIndex >= it.segmentCount;
    } else if (it.mode === Mode.Backward) {
        return it.segmentIndex < 0;
    } else {
        return true;
    }
}

export function setup(
    it: Type,
    noteStart: number,
    noteEnd: number,
    notePitch: number,
    pitchEnvelope: Breakpoint.Type[] | null,
    mode: Mode,
): void {
    it.mode = mode;

    const duration: number = noteEnd - noteStart;
    const pitchEnvelopeLength: number = pitchEnvelope != null ? pitchEnvelope.length : 0;

    it.noteStart = noteStart;
    it.noteEnd = noteEnd;
    it.notePitch = notePitch;
    it.pitchEnvelope = pitchEnvelope;
    it.pitchEnvelopeLength = pitchEnvelopeLength;
    // 0 points -> 1 line going from start to end
    // 1 point  -> 2 lines, going from start, to first point, to end
    // 2 points -> 3 lines, ...
    it.segmentCount = 1 + it.pitchEnvelopeLength;

    if (mode === Mode.Forward) {
        it.segmentIndex = 0;

        // If no pitch envelope points are present, we still have 1 segment
        // that we materialize here, that covers the note start to finish.
        it.pitch0 = 0;
        it.pitchTime0 = 0;
        it.pitch1 = 0;
        it.pitchTime1 = duration;

        it.pitchIndex = 0;
        if (pitchEnvelopeLength > 0) {
            // If there's at least 1 pitch envelope point, we materialize a
            // segment that goes from the start of the note to wherever that
            // pitch envelope point is.
            const next: Breakpoint.Type = it.pitchEnvelope![it.pitchIndex++];
            it.pitch0 = next.value;
            it.pitch1 = it.pitch0;
            it.pitchTime1 = next.time;
        }
    } else if (mode === Mode.Backward) {
        it.segmentIndex = it.segmentCount - 1;

        // If no pitch envelope points are present, we still have 1 segment
        // that we materialize here, that covers the note start to finish.
        it.pitch0 = 0;
        it.pitchTime0 = 0;
        it.pitch1 = 0;
        it.pitchTime1 = duration;

        it.pitchIndex = pitchEnvelopeLength - 1;
        if (pitchEnvelopeLength > 0) {
            // If there's at least 1 pitch envelope point, we materialize a
            // segment that goes from wherever that envelope point is to the
            // end of the note.
            const next: Breakpoint.Type = it.pitchEnvelope![it.pitchIndex--];
            it.pitch0 = next.value;
            it.pitch1 = it.pitch0;
            it.pitchTime0 = next.time;
        }
    }
}

export function teardown(it: Type): void {
    // It's not good to hold onto this long after we need it.
    it.pitchEnvelope = null;
}

export function computeSegment(
    it: Type,
    canvasWidth: number,
    canvasHeight: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    pixelsPerPitch: number,
    maxPitch: number,
): void {
    const duration: number = it.noteEnd - it.noteStart;
    const segmentDuration: number = it.pitchTime1 - it.pitchTime0;

    it.adjustedPitchTime0 = clamp(it.pitchTime0, 0, duration);
    it.adjustedPitchTime1 = clamp(it.pitchTime1, 0, duration);
    const adjustedDuration: number = it.adjustedPitchTime1 - it.adjustedPitchTime0;
    it.adjustedPitch0 = it.pitch0;
    it.adjustedPitch1 = it.pitch1;
    if (segmentDuration > 0 && adjustedDuration < segmentDuration) {
        // Segment has a different duration when clamped, so find new pitch
        // values for the start and end.
        // In order to deal with points that fall before the note's start, we
        // need to figure out how far away the adjusted start time is from the
        // original, after doing the clamping above.
        const startOffset: number = it.adjustedPitchTime0 - it.pitchTime0;
        it.adjustedPitch0 = lerp(startOffset / segmentDuration, it.pitch0, it.pitch1);
        it.adjustedPitch1 = lerp((startOffset + adjustedDuration) / segmentDuration, it.pitch0, it.pitch1);
    }

    // @TODO: Maybe remove these from the iterator? If that's done, then
    // `notePitch` can also be removed, as the segment pitches are relative.
    it.segmentX0 = tickToX(viewport, pixelsPerTick, it.noteStart + it.adjustedPitchTime0);
    it.segmentY0 = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, it.notePitch + it.adjustedPitch0);
    it.segmentX1 = tickToX(viewport, pixelsPerTick, it.noteStart + it.adjustedPitchTime1);
    it.segmentY1 = pitchToY(canvasHeight, viewport, pixelsPerPitch, maxPitch, it.notePitch + it.adjustedPitch1);
}

export function advance(it: Type): void {
    if (!isDone(it)) {
        if (it.mode === Mode.Forward) {
            it.pitch0 = it.pitch1;
            it.pitchTime0 = it.pitchTime1;
            if (it.pitchIndex < it.pitchEnvelopeLength) {
                // Get the next point.
                const next: Breakpoint.Type = it.pitchEnvelope![it.pitchIndex++];
                it.pitch1 = next.value;
                it.pitchTime1 = next.time;
            } else {
                // Materialize a segment that goes from the last point to the
                // end of the note. We keep the last pitch value as well.
                it.pitchTime1 = it.noteEnd - it.noteStart;
            }

            it.segmentIndex++;
        } else if (it.mode === Mode.Backward) {
            it.pitch1 = it.pitch0;
            it.pitchTime1 = it.pitchTime0;
            if (it.pitchIndex >= 0) {
                // Get the previous point.
                const next: Breakpoint.Type = it.pitchEnvelope![it.pitchIndex--];
                it.pitch0 = next.value;
                it.pitchTime0 = next.time;
            } else {
                // Materialize a segment that goes from the first point to the
                // start of the note. We keep the previous pitch value as well.
                it.pitchTime0 = 0;
            }

            it.segmentIndex--;
        }
    }
}
