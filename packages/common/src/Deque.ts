// From https://github.com/johnnesky/beepbox/blob/4b10adb789e6917cc3db747bd6cf472331ec3c22/synth/Deque.ts
// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

// @TODO:
// - Make this an interface + "free functions"?
//   Of course that completely breaks encapsulation.
// - Replace `new Array(...)` with `a = [...]; for (...) a.push(...)`?
//   Does that (still?) matter for V8? I don't know if SpiderMonkey ever had
//   (has?) trouble with "holey" arrays. No clue about JavaScriptCore either.
// - Turn exceptions into development-only asserts?

export class Deque<T> {
    private _capacity: number;
    private _buffer: Array<T | undefined>;
    private _mask: number;
    private _offset: number;
    private _count: number;

    constructor(initialCapacity: number) {
        this._capacity = initialCapacity;
        this._buffer = [];
        for (let i = 0; i < this._capacity; i++) this._buffer.push(undefined);
        this._mask = 0;
        this._offset = 0;
        this._count = 0;
    }

    /** Equivalent to `Array.prototype.unshift`. */
    public pushFront(element: T): void {
        if (this._count >= this._capacity) this._expandCapacity();
        this._offset = (this._offset - 1) & this._mask;
        this._buffer[this._offset] = element;
        this._count++;
    }

    /** Equivalent to `Array.prototype.push`. */
    public pushBack(element: T): void {
        if (this._count >= this._capacity) this._expandCapacity();
        this._buffer[(this._offset + this._count) & this._mask] = element;
        this._count++;
    }

    /** Equivalent to `Array.prototype.shift`. */
    public popFront(): T {
        if (this._count <= 0) throw new Error("No elements left to pop.");
        const element: T = <T>this._buffer[this._offset];
        this._buffer[this._offset] = undefined;
        this._offset = (this._offset + 1) & this._mask;
        this._count--;
        return element;
    }

    /** Equivalent to `Array.prototype.pop`. */
    public popBack(): T {
        if (this._count <= 0) throw new Error("No elements left to pop.");
        this._count--;
        const index: number = (this._offset + this._count) & this._mask;
        const element: T = <T>this._buffer[index];
        this._buffer[index] = undefined;
        return element;
    }

    public peekFront(): T {
        if (this._count <= 0) throw new Error("No elements left to pop.");
        return <T>this._buffer[this._offset];
    }

    public peekBack(): T {
        if (this._count <= 0) throw new Error("No elements left to pop.");
        return <T>this._buffer[(this._offset + this._count - 1) & this._mask];
    }

    public count(): number {
        return this._count;
    }

    public set(index: number, element: T): void {
        if (index < 0 || index >= this._count) throw new Error("Invalid index");
        this._buffer[(this._offset + index) & this._mask] = element;
    }

    public get(index: number): T {
        if (index < 0 || index >= this._count) throw new Error("Invalid index");
        return <T>this._buffer[(this._offset + index) & this._mask];
    }

    public remove(index: number): void {
        if (index < 0 || index >= this._count) throw new Error("Invalid index");
        if (index <= (this._count >> 1)) {
            while (index > 0) {
                this.set(index, this.get(index - 1));
                index--;
            }
            this.popFront();
        } else {
            index++;
            while (index < this._count) {
                this.set(index - 1, this.get(index));
                index++;
            }
            this.popBack();
        }
    }

    private _expandCapacity(): void {
        if (this._capacity >= 0x40000000) throw new Error("Capacity too big.");
        this._capacity = this._capacity << 1;
        const oldBuffer: Array<T | undefined> = this._buffer;
        const newBuffer: Array<T | undefined> = new Array(this._capacity);
        const size: number = this._count | 0;
        const offset: number = this._offset | 0;
        for (let i = 0; i < size; i++) {
            newBuffer[i] = oldBuffer[(offset + i) & this._mask];
        }
        for (let i = size; i < this._capacity; i++) {
            newBuffer[i] = undefined;
        }
        this._offset = 0;
        this._buffer = newBuffer;
        this._mask = this._capacity - 1;
    }
}
