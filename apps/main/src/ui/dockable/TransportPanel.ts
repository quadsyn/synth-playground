import { DockablePanel } from "./DockablePanel.js";
import { UIContext } from "../UIContext.js";
import { Transport } from "../transport/Transport.js";
import { SongDocument } from "../../SongDocument.js";

export class TransportPanel extends DockablePanel {
    private _transport: Transport;

    constructor(ui: UIContext, doc: SongDocument) {
        super();
        this._transport = new Transport(ui, doc);
        this._element.appendChild(this._transport.element);
    }

    protected override _init(): void {}

    protected override _dispose(): void {
        this._transport.dispose();
    }

    protected override _render(): void {
        this._transport.render();
    }
}
