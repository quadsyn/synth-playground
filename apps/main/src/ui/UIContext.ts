import { CoordinatedResizeObserver } from "@synth-playground/browser/CoordinatedResizeObserver.js";
import { InputManager } from "./input/InputManager.js";
import { LocalizationManager } from "../localization/LocalizationManager.js";
import { StringId } from "../localization/StringId.js";
import { DialogManager } from "./dialog/DialogManager.js";

export type RenderFunction = (timestamp: number) => void;

export class UIContext {
    public resizeObserver: CoordinatedResizeObserver;
    public frame: number;
    public inputManager: InputManager;
    public dialogManager: DialogManager;
    public localizationManager: LocalizationManager;

    private _mainRenderFn: RenderFunction;
    private _mainRenderRequest: number | null;
    private _animating: boolean;
    private _animationRenderRequest: number | null;

    constructor(
        mainRenderFn: RenderFunction,
        inputManager: InputManager,
        localizationManager: LocalizationManager,
        dialogManager: DialogManager,
    ) {
        this.frame = 0;
        this._mainRenderFn = mainRenderFn;
        this._mainRenderRequest = null;
        this._animating = false;
        this._animationRenderRequest = null;
        this.resizeObserver = new CoordinatedResizeObserver();
        this.inputManager = inputManager;
        this.localizationManager = localizationManager;
        this.dialogManager = dialogManager;
    }

    public dispose(): void {
        this.resizeObserver.disconnect();
        if (this._mainRenderRequest != null) {
            cancelAnimationFrame(this._mainRenderRequest);
            this._mainRenderRequest = null;
        }
        if (this._animationRenderRequest != null) {
            cancelAnimationFrame(this._animationRenderRequest);
            this._animationRenderRequest = null;
        }
    }

    private _mainCallback = (timestamp: number): void => {
        // Clear before running the registered function, so that if you schedule
        // another render while one is running, those requests will be retained
        // for the next animation frame.
        this._mainRenderRequest = null;

        this._mainRenderFn(timestamp);
    };

    private _scheduleMainCallbackIfNeeded(): void {
        if (this._animationRenderRequest != null) {
            return;
        }

        if (this._mainRenderRequest == null) {
            this._mainRenderRequest = requestAnimationFrame(this._mainCallback);
        }
    }

    public scheduleMainRender(): void {
        this._scheduleMainCallbackIfNeeded();
    }

    private _animationCallback = (timestamp: number): void => {
        if (!this._animating) {
            return;
        }

        this.frame++;

        // @TODO: Use a specialized animation render function instead?
        this._mainRenderFn(timestamp);

        this._animationRenderRequest = requestAnimationFrame(this._animationCallback);
    };

    public setAnimationStatus(value: boolean): void {
        this._animating = value;

        if (this._animationRenderRequest != null) {
            cancelAnimationFrame(this._animationRenderRequest);
        }

        if (this._animating) {
            this._animationRenderRequest = requestAnimationFrame(this._animationCallback);
        } else {
            this._animationRenderRequest = null;
            this.scheduleMainRender();
        }
    }

    /** Shortcut for LocalizationManager#translate. */
    public T(id: StringId): string {
        return this.localizationManager.translate(id);
    }
}
