import { CoordinatedResizeObserver } from "@synth-playground/dom/CoordinatedResizeObserver.js";

export type RenderFunction = () => void;

export class UIContext {
    public resizeObserver: CoordinatedResizeObserver;
    private _mainRenderFn: RenderFunction;
    private _independentRenderFns: Set<RenderFunction>;
    private _renderRequest: number | null;

    constructor() {
        this._mainRenderFn = () => {};
        this._independentRenderFns = new Set();
        this._renderRequest = null;
        this.resizeObserver = new CoordinatedResizeObserver();
    }

    public dispose(): void {
        this.resizeObserver.disconnect();
        if (this._renderRequest != null) {
            cancelAnimationFrame(this._renderRequest);
        }
        this._independentRenderFns.clear();
    }

    private _callback = (timestamp: number): void => {
        // Clear things first before running them, so that if you schedule
        // another render while one is running, those requests will be retained
        // for the next animation frame.
        this._renderRequest = null;
        let independentRenderFns: RenderFunction[] | null = null;
        if (this._independentRenderFns.size > 0) {
            independentRenderFns = Array.from(this._independentRenderFns.values());
            this._independentRenderFns.clear();
        }

        this._mainRenderFn();
        if (independentRenderFns != null) {
            const count: number = independentRenderFns.length;
            for (let index: number = 0; index < count; index++) {
                independentRenderFns[index]();
            }
        }
    };

    private _scheduleCallbackIfNeeded(): void {
        if (this._renderRequest == null) {
            this._renderRequest = requestAnimationFrame(this._callback);
        }
    }

    public registerMainRender(f: RenderFunction): void {
        this._mainRenderFn = f;
    }

    public scheduleMainRender(): void {
        this._scheduleCallbackIfNeeded();
    }

    public scheduleIndependentRender(f: RenderFunction): void {
        this._independentRenderFns.add(f);
        this._scheduleCallbackIfNeeded();
    }
}
