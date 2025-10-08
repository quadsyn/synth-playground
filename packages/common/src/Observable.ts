import { Event } from "./Event.js"

/** Provides events for when data shallowly changes or is going to change. Used to bind logic/GUI under MVC pattern. */
export class Observable<T>
{
    private _data: T;

    /** Fires with the proposed value before it would change. */
    public readonly onChanging: Event<(data: T, fromGUI: boolean) => void>;

    /** Fires with the old value after it changed. */
    public readonly onChanged: Event<(data: T, fromGUI: boolean) => void>;

    constructor(data: T) {
        this._data = data;
        this.onChanging = new Event<(data: T, fromGUI: boolean) => void>();
        this.onChanged = new Event<(data: T, fromGUI: boolean) => void>();
    }

	public get data() {
		return this._data;
	}

    /** If the value is different, fires beforeChanged, sets the new value, then fires afterChanged. */
    public set(data: T, isFromGUI: boolean) {
        if (this._data !== data) {
            this.onChanging.Invoke(this.data, isFromGUI);
            this._data = data;
			this.onChanged.Invoke(this._data, isFromGUI);
        }
    }
}