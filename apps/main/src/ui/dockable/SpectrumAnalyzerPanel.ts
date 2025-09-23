import { DockablePanel } from "./DockablePanel.js";
import { UIContext } from "../UIContext.js";
import { SongDocument } from "../../SongDocument.js";
import { SpectrumAnalyzer } from "../visualization/SpectrumAnalyzer.js";

export class SpectrumAnalyzerPanel extends DockablePanel {
    private _ui: UIContext;
    private _spectrumAnalyzer: SpectrumAnalyzer;

    constructor(ui: UIContext, doc: SongDocument) {
        super();
        this._ui = ui;
        this._spectrumAnalyzer = new SpectrumAnalyzer(this._ui, doc);
        this._element.appendChild(this._spectrumAnalyzer.element);
        this._ui.resizeObserver.register(this._element, this._onResizeObserved);
    }

    protected override _init(): void {
        this._ui.resizeObserver.observe(this._element);
    }

    protected override _dispose(): void {
        this._ui.resizeObserver.unobserve(this._element);
        this._ui.resizeObserver.unregister(this._element, this._onResizeObserved);
        this._spectrumAnalyzer.dispose();
    }

    protected override _render(): void {
        this._spectrumAnalyzer.render();
    }

    private _onResizeObserved = (entry: ResizeObserverEntry): void => {
        this._resize();
    };

    private _resize(): void {
        if (!this._api?.isVisible) {
            return;
        }

        this._spectrumAnalyzer.resize(this._element.clientWidth, this._element.clientHeight);
        this._ui.scheduleMainRender();
    }
}
