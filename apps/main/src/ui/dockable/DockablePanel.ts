import { H } from "@synth-playground/browser/dom.js";
import { type ManualComponent } from "../types.js";
import {
    type DockviewPanelApi,
    type GroupPanelPartInitParameters,
    type IContentRenderer,
} from "dockview-core";

export class DockablePanel implements ManualComponent, IContentRenderer {
    protected _element: HTMLElement;
    protected _api: DockviewPanelApi | null;

    constructor() {
        this._api = null;

        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
            `,
        });

        this._element.addEventListener("mousedown", this._handlePointerDown, { capture: true });
    }

    public get element(): HTMLElement { return this._element; }

    public init(parameters: GroupPanelPartInitParameters): void {
        this._api = parameters.api;
        this._init();
    }

    protected _init(): void {} // Override this in subclasses.

    public dispose(): void {
        this._element.removeEventListener("mousedown", this._handlePointerDown);
        this._dispose();
    }

    protected _dispose(): void {} // Override this in subclasses.

    public render(): void {
        if (!this._api?.isVisible) {
            return;
        }

        this._render();
    }

    protected _render(): void {} // Override this in subclasses.

    private _handlePointerDown = (event: MouseEvent): void => {
        this._api?.setActive();
    };
}
