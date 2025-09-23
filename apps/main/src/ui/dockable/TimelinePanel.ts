import { DockablePanel } from "./DockablePanel.js";
import { SongDocument } from "../../SongDocument.js";
import { UIContext } from "../UIContext.js";
import { Timeline } from "../timeline/Timeline.js";
import { AreaKind } from "../input/areas.js";

export class TimelinePanel extends DockablePanel {
    private _ui: UIContext;
    private _timeline: Timeline;

    constructor(ui: UIContext, doc: SongDocument) {
        super();
        this._ui = ui;
        this._timeline = new Timeline(this._ui, doc);
        this._element.appendChild(this._timeline.element);
        this._ui.resizeObserver.register(this._element, this._onResizeObserved);
    }

    protected override _init(): void {
        this._ui.resizeObserver.observe(this._element);
        if (this._api != null) {
            this._ui.inputManager.registerPanel(
                this._api.id,
                this._element,
                AreaKind.Timeline,
                this._timeline.onAction,
            );
        }
    }

    protected override _dispose(): void {
        if (this._api != null) {
            this._ui.inputManager.unregisterPanel(
                this._api.id,
                this._element,
                AreaKind.Timeline,
                this._timeline.onAction,
            );
        }
        this._ui.resizeObserver.unobserve(this._element);
        this._ui.resizeObserver.unregister(this._element, this._onResizeObserved);
        this._timeline.dispose();
    }

    protected override _render(): void {
        this._timeline.render();
    }

    private _onResizeObserved = (entry: ResizeObserverEntry): void => {
        this._resize();
    };

    private _resize(): void {
        if (!this._api?.isVisible) {
            return;
        }

        this._timeline.resize();
        this._ui.scheduleMainRender();
    }
}
