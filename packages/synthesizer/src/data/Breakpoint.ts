// @TODO:
// - Inline these into the arrays that contain them? See e.g. how the custom
//   hash table is implemented. Even with JS arrays, I think that would be an
//   improvement over an array of JS objects. Will make all the code that uses
//   them annoying, but we can introduce helper functions to make at least the
//   editor code nicer (and keep that flexible if we e.g. add new fields).
// - Enforce that `value` should be an integer in the range [0, 2 ** 32 - 1]?
//   I would expect that means less wobbliness when saving to a file, vs saving
//   and loading 32-bit floats but working with 64-bit floats in memory. I could
//   just save 64-bit floats but I want to save space a bit (and 32-bit is
//   probably enough precision!).
export interface Type {
    // Should be an integer in the range [0, 2 ** 32 - 1].
    // This can have some different meanings:
    // - For instrument envelopes, this depends on the envelope settings:
    //   seconds or beats, and the envelope speed. The time value is treated as
    //   if it were a "normalized" [0, 1] floating point number, rescaled on the
    //   fly.
    // - For per-note envelopes, and the per-song tempo envelope, this is in
    //   pulses per quarter note.
    time: number;

    value: number;
}

export function make(
    time: number,
    value: number,
): Type {
    return {
        time: time,
        value: value,
    };
}

export function findIndex(
    envelope: Type[] | null,
    time: number,
): number {
    // @TODO: Remove the null check?
    if (envelope == null || envelope.length === 0) {
        return -1;
    }

    const length: number = envelope.length;

    // @TODO: Accept a previous index, and do a linear search from there.
    // Should help for synthesis, I think.
    // That won't quite help for note drawing though, unless we also introduce a
    // variant of this function that does the linear search backwards, when
    // drawing the bottom of the note.
    // if (previousIndex > -1) {
    //     let result: number = previousIndex;
    //     for (let index: number = previousIndex; index < length; index++) {
    //         const point: Type = envelope[index];
    //         result = index;
    //         if (point.time > time) break;
    //     }
    //     return result;
    // }

    // https://en.wikipedia.org/wiki/Binary_search#Procedure_for_finding_the_rightmost_element
    let left: number = 0;
    let right: number = length;
    while (left < right) {
        const middle: number = Math.floor(left + (right - left) / 2);
        if (envelope[middle].time > time) {
            // Consider the lower half.
            right = middle;
        } else {
            // Consider the upper half.
            left = middle + 1;
        }
    }
    // This is a more useful return value here, instead of right - 1. It also
    // matches C++'s std::upper_bound.
    return left;
}

// Doesn't interpolate anything.
export function evaluateTempoEnvelope(
    envelope: Type[],
    time: number,
    index: number,
    defaultValue: number,
): number {
    // findBreakpointIndex already will check for null and .length === 0.
    if (index <= -1) {
        return defaultValue;
    }

    const length: number = envelope.length;

    // Don't need to worry about the lower bound, because index is assumed to be
    // somewhere in the range [0, envelope.length].
    const index1: number = index >= length ? (length - 1) : index;

    // Don't need to worry about the upper bound, because index1 should be in
    // the range [0, envelope.length - 1].
    const index0: number = index1 < 1 ? 0 : (index1 - 1);

    const p0: Type = envelope[index0];
    const p1: Type = envelope[index1];
    // const t0: number = p0.time;
    const t1: number = p1.time;
    const a: number = p0.value;
    const b: number = p1.value;

    let value: number = a;

    // This is still necessary for the last segment.
    if (time >= t1) {
        value = b;
    }

    return value;
}

// @NOTE: The idea here is that you can use findIndex to get the current end
// point (so _after_ the current tick), then evaluate the envelope with this
// function at the start and end of the tick. Since the tick grid is aligned
// with the time values of the points in these envelopes, this ends up enabling
// instantaneous changes (i.e. shapes like |\|\). This will not really work for
// envelopes attached to instruments, as those will have their time values
// remapped at evaluation time, for different envelope speeds, and that messes
// up the alignment with the tick grid.
export function evaluateNoteEnvelope(
    envelope: Type[],
    time: number,
    index: number,
    defaultValue: number,
): number {
    // findBreakpointIndex already will check for null and .length === 0.
    if (index <= -1) {
        return defaultValue;
    }

    const length: number = envelope.length;

    // Don't need to worry about the lower bound, because index is assumed to be
    // somewhere in the range [0, envelope.length].
    const index1: number = index >= length ? (length - 1) : index;

    // Don't need to worry about the upper bound, because index1 should be in
    // the range [0, envelope.length - 1].
    const index0: number = index1 < 1 ? 0 : (index1 - 1);

    const p0: Type = envelope[index0];
    const p1: Type = envelope[index1];
    const t0: number = p0.time;
    const t1: number = p1.time;
    const a: number = p0.value;
    const b: number = p1.value;

    let value: number = a;

    if (time >= t1) {
        value = b;
    } else if (time < t0) {
        // @TODO: This case is not necessary in correct usage, so I should look
        // at whether it's costing me anything and remove it if so.
        value = a;
    } else if (t0 < t1) {
        const t: number = (time - t0) / (t1 - t0); // unlerp
        value = a * (1.0 - t) + b * t; // lerp
    }

    return value;
}
