import { DockablePanel } from "./DockablePanel.js";
import { UIContext } from "../UIContext.js";
import { SongDocument } from "../../SongDocument.js";
import { Oscilloscope } from "../visualization/Oscilloscope.js";

export class OscilloscopePanel extends DockablePanel {
    private _ui: UIContext;
    private _oscilloscope: Oscilloscope;

    constructor(ui: UIContext, doc: SongDocument) {
        super();
        this._ui = ui;
        this._oscilloscope = new Oscilloscope(this._ui, doc);
        this._element.appendChild(this._oscilloscope.element);
        this._ui.resizeObserver.register(this._element, this._onResizeObserved);
    }

    protected override _init(): void {
        this._ui.resizeObserver.observe(this._element);
    }

    protected override _dispose(): void {
        this._ui.resizeObserver.unobserve(this._element);
        this._ui.resizeObserver.unregister(this._element, this._onResizeObserved);
        this._oscilloscope.dispose();
    }

    protected override _render(): void {
        this._oscilloscope.render();
    }

    private _onResizeObserved = (entry: ResizeObserverEntry): void => {
        this._resize();
    };

    private _resize(): void {
        if (!this._api?.isVisible) {
            return;
        }

        this._oscilloscope.resize(this._element.clientWidth, this._element.clientHeight);
        this._ui.scheduleMainRender();
    }
}
