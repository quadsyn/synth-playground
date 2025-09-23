/**
 * It's apparently faster to use one ResizeObserver instead of several, so this
 * stores an additional mapping between `Element`s and their resize callbacks.
 *
 * The callbacks should ideally avoid doing expensive work. If that's really
 * necessary, the best thing to do is to schedule redrawing to happen later.
 *
 * Only one callback is supported per element.
 *
 * See also:
 * - https://github.com/WICG/resize-observer/issues/59
 * - https://groups.google.com/a/chromium.org/g/blink-dev/c/z6ienONUb5A/m/F5-VcUZtBAAJ
 */
export class CoordinatedResizeObserver {
    private _resizeObserver: ResizeObserver;
    private _mapping: Map<Element, ResizeCallback>;

    constructor() {
        this._resizeObserver = new ResizeObserver(this._onResize);
        this._mapping = new Map();
    }

    public register(target: Element, fn: ResizeCallback): void {
        this._mapping.set(target, fn);
    }

    public unregister(target: Element, fn: ResizeCallback): void {
        this._mapping.delete(target);
    }

    public observe(target: Element, options?: ResizeObserverOptions): void {
        this._resizeObserver.observe(target, options);
    }

    public unobserve(target: Element): void {
        this._resizeObserver.unobserve(target);
    }

    public disconnect(): void {
        this._resizeObserver.disconnect();
    }

    private _onResize = (entries: ResizeObserverEntry[]): void => {
        const count: number = entries.length;
        for (let i: number = 0; i < count; i++) {
            const entry: ResizeObserverEntry = entries[i];
            // @TODO: Instead of passing a raw entry, pass normalized values if
            // necessary for cross-browser compatibility reasons.
            this._mapping.get(entry.target)?.(entry);
        }
    };
}

export type ResizeCallback = (entry: ResizeObserverEntry) => void;
