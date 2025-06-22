import { H } from "@synth-playground/dom/index.js";
import { type DockablePanel } from "./types.js";
import { SongDocument } from "../../SongDocument.js";
import { UIContext } from "../UIContext.js";
import { PianoRoll } from "../PianoRoll.js";
import {
    type GroupPanelPartInitParameters,
    type DockviewIDisposable,
} from "dockview-core";

export class PianoRollPanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _onDidVisibilityChange: DockviewIDisposable | null;
    private _visible: boolean;
    private _pianoRoll: PianoRoll;
    private _onDidDimensionsChange: DockviewIDisposable | null;
    private _onDidMovePanel: DockviewIDisposable | null;
    private _setActive: (() => void) | null;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;

        this._setActive = null;

        this._visible = false;
        this._onDidVisibilityChange = null;

        this._pianoRoll = new PianoRoll(this._ui, doc);

        this._onDidDimensionsChange = null;
        this._onDidMovePanel = null;

        this._element = H("div", {
            style: `
                display: flex;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
            `,
        }, this._pianoRoll.element);

        this._ui.resizeObserver.register(this._element, () => {
            this._resize();
        });

        this._element.addEventListener("mousedown", this._handlePointerDown);
    }

    public get element(): HTMLElement {
        return this._element;
    }

    public init(parameters: GroupPanelPartInitParameters): void {
        // @TODO: Only use these to detect moves instead of resizing.
        // this._onDidDimensionsChange = parameters.api.onDidDimensionsChange(() => {
        //     this._resize();
        // });
        // this._onDidMovePanel = parameters.containerApi.onDidMovePanel(() => {
        //     this._resize();
        // });
        this._setActive = () => { parameters.api.setActive(); };
        this._onDidVisibilityChange = parameters.api.onDidVisibilityChange(
            (event) => { this._visible = event.isVisible; }
        );
        this._visible = parameters.api.isVisible;
        this._ui.resizeObserver.observe(this._element);
        // this._resize();
    }

    public dispose(): void {
        this._onDidVisibilityChange?.dispose();
        this._element.removeEventListener("mousedown", this._handlePointerDown);
        this._setActive = null;
        this._ui.resizeObserver.unobserve(this._element);
        this._onDidDimensionsChange?.dispose();
        this._onDidMovePanel?.dispose();
        this._pianoRoll.dispose();
    }

    public render(): void {
        if (!this._visible) return;
        this._pianoRoll.render();
    }

    private _resize(): void {
        if (!this._visible) return;
        this._pianoRoll.resize();
        this._ui.scheduleMainRender();
    }

    private _handlePointerDown = (event: MouseEvent): void => {
        this._setActive?.();
    };
}
