import { Event } from "./Event.js"

/** 
 * A piece of data with get/set transforms and callback handling with C#-like events. Used to sync state like logic and
 * GUI in MVC pattern where this is the controller.
 */
export class Observable<T>
{
    private data: T;

    /** Fires with the value before it would change. */
    public readonly onBeforeChanged: Event<(data: T, fromGUI: boolean) => void>;

    /** Fires with the new value after it changes. */
    public readonly onAfterChanged: Event<(data: T, fromGUI: boolean) => void>;

    /** Anywhere the value is read, it runs through this optional transform function which returns a representative value without mutating. */
    public computeGet: ((val: T) => T) | undefined;

    /** Anywhere the value is set, it runs through this optional transform function to mutate the value. Called before AfterChanged. If the final value is == to the previous value, it won't fire change events. */
    public computeSet: ((val: T) => T) | undefined;

    constructor(data: T) {
        this.data = data;
        this.onBeforeChanged = new Event<(data: T, fromGUI: boolean) => void>();
        this.onAfterChanged = new Event<(data: T, fromGUI: boolean) => void>();
    }

    /** Returns the value (via ComputeGet if present). */
    public get(): T {
        return this.computeGet?.(this.data) ?? this.data;
    }

    /** If the value is different, fires beforeChanged, sets the new value (via ComputeSet if present), then fires afterChanged. */
    public set(data: T, isFromGUI: boolean) {
        if (this.data != data) {
            this.onBeforeChanged.Invoke(this.data, isFromGUI);
            this.data = this.computeSet?.(data) ?? data;
            if (this.data === data) {
                this.onAfterChanged.Invoke(this.data, isFromGUI);
            }
        }
    }
}