import { H } from "@synth-playground/dom/index.js";
import { type DockablePanel } from "./types.js";
import { UIContext } from "../UIContext.js";
import { Timeline } from "../Timeline.js";
import {
    type GroupPanelPartInitParameters,
    type DockviewIDisposable,
} from "dockview-core";

export class TimelinePanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _onDidVisibilityChange: DockviewIDisposable | null;
    private _visible: boolean;
    private _timeline: Timeline;
    private _onDidDimensionsChange: DockviewIDisposable | null;
    private _onDidMovePanel: DockviewIDisposable | null;

    constructor(ui: UIContext) {
        this._ui = ui;

        this._visible = false;
        this._onDidVisibilityChange = null;

        this._timeline = new Timeline(this._ui);

        this._onDidDimensionsChange = null;
        this._onDidMovePanel = null;

        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow: hidden;
            `,
        }, this._timeline.element);

        this._ui.resizeObserver.register(this._element, () => {
            this._resize();
        });
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
        this._onDidVisibilityChange = parameters.api.onDidVisibilityChange(
            (event) => { this._visible = event.isVisible; }
        );
        this._visible = parameters.api.isVisible;
        this._ui.resizeObserver.observe(this._element);
    }

    public dispose(): void {
        this._onDidVisibilityChange?.dispose();
        this._ui.resizeObserver.unobserve(this._element);
        this._onDidDimensionsChange?.dispose();
        this._onDidMovePanel?.dispose();
        this._timeline.dispose();
    }

    public render(): void {
        if (!this._visible) return;
        this._timeline.render();
    }

    private _resize(): void {
        if (!this._visible) return;
        this._timeline.resize();
        this._ui.scheduleMainRender();
    }
}
