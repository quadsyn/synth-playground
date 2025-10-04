/** A lazy-loading piece of data. */
export class Lazy<T>
{
    private _load: () => T;
    private _cached: T | undefined;

    public constructor(func: () => T) {
        this._load = func;
    }

    /** Gets the value and evaluates it if needed. */
    public get val(): T {
        if (this._cached === undefined) {
            this._cached = this._load();
        }
        return this._cached;
    }

    /** Unloads any current value and resets the function. */
    public set val(func: () => T) {
        this._load = func;
        this._cached = undefined;
    }

    /** Returns whether the element is loaded without evaluating it. */
    public get loaded(): boolean {
        return this._cached === undefined;
    }

    /** Forcibly loads or unloads. */
    public set loaded(load: boolean) {
        if (load && this._cached === undefined) {
            this._cached = this._load();
        }
        if (!load) {
            this._cached = undefined;
        }
    }
}
