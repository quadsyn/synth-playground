import * as Note from "@synth-playground/synthesizer/data/Note.js";

// @TODO: Experiment with an AABB tree/R-tree? Something else entirely? To be
// worth spending time on, I think that should come with an effort to pack the
// data as tightly as possible. For this, since it's a cache, I think saving
// memory is more important than update speed (though that still shouldn't be
// completely ignored).

/**
 * This should be a bit more efficient than walking over every note to determine
 * the bounds after every edit.
 *
 * The method used here is to split the pitch axis into a grid of counters. Each
 * counter indicates how many notes exist with a certain pitch. Computing the
 * bounds then only requires walking over the amount of pitches available, which
 * is a fixed amount of work, no matter how many notes exist.
 *
 * The bounds are computed lazily, only when calling `getMin` or `getMax`.
 */
export class NotePitchBoundsTracker {
    // @TODO: Turn this into a program-wide constant and remove it.
    private _maxPitch: number;

    // @TODO: Store these in an Uint32Array? In theory, we'd save on 4 bytes per
    // counter, but typed arrays have large headers, so this may not help a ton.
    private _counters: number[];

    private _min: number;
    private _max: number;
    private _dirty: boolean;

    constructor(maxPitch: number) {
        this._maxPitch = maxPitch;
        this._counters = [];
        this._min = this._maxPitch;
        this._max = 0;
        this._dirty = true;

        const count: number = this._maxPitch + 1;
        for (let index: number = 0; index < count; index++) {
            this._counters.push(0);
        }
    }

    public getMin(): number {
        if (this._dirty) {
            this._updateBounds();
        }

        return this._min;
    }

    public getMax(): number {
        if (this._dirty) {
            this._updateBounds();
        }

        return this._max;
    }

    public reset(): void {
        this._min = this._maxPitch;
        this._max = 0;
        const count: number = this._maxPitch + 1;
        for (let index: number = 0; index < count; index++) {
            this._counters[index] = 0;
        }

        this._markAsDirty();
    }

    public populate(notes: Note.Type[]): void {
        const count: number = notes.length;
        for (let index: number = 0; index < count; index++) {
            this.add(notes[index].pitch);
        }
    }

    public add(pitch: number): void {
        this._counters[pitch]++;

        // @TODO: I think I can skip marking as dirty if the new pitch is inside
        // the [min, max] range. I think I also need to track if this is empty.
        this._markAsDirty();
    }

    public remove(pitch: number): void {
        this._counters[pitch]--;

        // @TODO: I think I can skip marking as dirty if the pitch is inside the
        // [min, max] range but is not the same as the min or max (i.e. not on
        // the edges).
        this._markAsDirty();
    }

    public change(oldPitch: number, newPitch: number): void {
        if (oldPitch !== newPitch) {
            this.remove(oldPitch);
            this.add(newPitch);
        }
    }

    private _markAsDirty(): void {
        this._dirty = true;
    }

    private _updateBounds(): void {
        let min: number = this._maxPitch;
        let max: number = 0;
        const count: number = this._maxPitch + 1;
        for (let pitch: number = 0; pitch < count; pitch++) {
            const counter: number = this._counters[pitch];
            if (counter > 0) {
                min = Math.min(min, pitch);
                max = Math.max(max, pitch);
            }
        }
        this._min = min;
        this._max = max;

        this._dirty = false;
    }
}
