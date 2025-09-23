import { DockablePanel } from "./DockablePanel.js";
import { SongDocument } from "../../SongDocument.js";
import { type AppContext } from "../../AppContext.js";
import { PianoRoll } from "../pianoRoll/PianoRoll.js";
import { AreaKind } from "../input/areas.js";

export class PianoRollPanel extends DockablePanel {
    private _app: AppContext;
    private _pianoRoll: PianoRoll;

    constructor(app: AppContext, doc: SongDocument) {
        super();
        this._app = app;
        this._pianoRoll = new PianoRoll(this._app.ui, doc);
        this._element.appendChild(this._pianoRoll.element);
        this._app.ui.resizeObserver.register(this._element, this._onResizeObserved);
        doc.onChangedPianoRollPattern.addListener(this._onChangedPianoRollPattern);
    }

    private _onChangedPianoRollPattern = (): void => {
        this._api?.setActive();
    };

    protected override _init(): void {
        this._app.ui.resizeObserver.observe(this._element);
        if (this._api != null) {
            this._app.ui.inputManager.registerPanel(
                this._api.id,
                this._pianoRoll.element,
                AreaKind.PianoRoll,
                this._pianoRoll.onAction,
            );
        }
    }

    protected override _dispose(): void {
        if (this._api != null) {
            this._app.ui.inputManager.unregisterPanel(
                this._api.id,
                this._pianoRoll.element,
                AreaKind.PianoRoll,
                this._pianoRoll.onAction,
            );
        }
        this._app.ui.resizeObserver.unobserve(this._element);
        this._app.ui.resizeObserver.unregister(this._element, this._onResizeObserved);
        this._pianoRoll.dispose();
    }

    protected override _render(): void {
        this._pianoRoll.render();
    }

    private _onResizeObserved = (entry: ResizeObserverEntry): void => {
        this._resize();
    };

    private _resize(): void {
        if (!this._api?.isVisible) {
            return;
        }

        this._pianoRoll.resize();
        this._app.ui.scheduleMainRender();
    }
}
