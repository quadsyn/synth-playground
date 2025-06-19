import { H } from "@synth-playground/dom/index.js";
import { type DockablePanel } from "./types.js";
import {
    type GroupPanelPartInitParameters,
    type DockviewIDisposable,
} from "dockview-core";

export class EmptyPanel implements DockablePanel {
    private _element: HTMLDivElement;
    private _onDidVisibilityChange: DockviewIDisposable | null;
    private _visible: boolean;
    private _setActive: (() => void) | null;

    constructor() {
        this._visible = false;
        this._onDidVisibilityChange = null;

        this._setActive = null;

        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                padding: 10px;
            `,
        });

        this._element.addEventListener("mousedown", this._handlePointerDown);
    }

    public get element(): HTMLElement {
        return this._element;
    }

    public init(parameters: GroupPanelPartInitParameters): void {
        this._setActive = () => { parameters.api.setActive(); };
        this._onDidVisibilityChange = parameters.api.onDidVisibilityChange(
            (event) => { this._visible = event.isVisible; }
        );
        this._visible = parameters.api.isVisible;
    }

    public dispose(): void {
        this._onDidVisibilityChange?.dispose();
        this._element.removeEventListener("mousedown", this._handlePointerDown);
        this._setActive = null;
    }

    public render(): void {
        if (!this._visible) return;
    }

    private _handlePointerDown = (event: MouseEvent): void => {
        this._setActive?.();
    };
}
