import { DockablePanel } from "./DockablePanel.js";
import { UIContext } from "../UIContext.js";
import { DebugInfo } from "../debugInfo/DebugInfo.js";
import { SongDocument } from "../../SongDocument.js";

export class DebugInfoPanel extends DockablePanel {
    private _debugInfo: DebugInfo;

    constructor(ui: UIContext, doc: SongDocument) {
        super();
        this._debugInfo = new DebugInfo(ui, doc);
        this._element.appendChild(this._debugInfo.element);
    }

    protected override _init(): void {}

    protected override _dispose(): void {
        this._debugInfo.dispose();
    }

    protected override _render(): void {
        this._debugInfo.render();
    }
}
