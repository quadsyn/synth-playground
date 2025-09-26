import { H } from "@synth-playground/browser/dom.js";
import { type Dialog } from "../dialog/Dialog.js";
import { VirtualizedList, ListItem } from "../basic/VirtualizedList.js";
import { UIContext } from "../UIContext.js";
import { CloseButton } from "../dialog/CloseButton.js";
import { DialogHeader } from "../dialog/DialogHeader.js";
import { DialogBody } from "../dialog/DialogBody.js";
import {
    dialog as dialogClassName,
} from "../dialog/Dialog.module.css";

export class VirtualizedListTestDialog implements Dialog {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _closeButton: CloseButton;
    private _list: VirtualizedList<string>;

    constructor(ui: UIContext) {
        this._ui = ui;
        this._list = new VirtualizedList(
            this._ui,
            /* height */ "100%",
            /* rowHeight */ 25,
            /* itemMaker */ height => new ListItem(height),
        );
        const data: string[] = [];
        for (let i: number = 0; i < 1_000_000; i++) {
            data.push(`index ${i}`);
        }
        this._list.setData(data);
        this._closeButton = new CloseButton(() => { this.close() });
        this.element = H("div", { class: dialogClassName },
            DialogHeader("Virtualized list test", this._closeButton.element),
            DialogBody(H("div", {
                // @TODO: I really need to look at how other people are making
                // virtualized lists that can automatically resize. This might
                // involve making changes to the base dialog styling as I
                // suspect these are not working particularly well together.
                style: `
                    width: 500px;
                    height: 500px;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                `,
            },
                H("div", {
                    style: `
                        width: 100%;
                        height: 100%;
                        display: flex;
                        flex-direction: column;
                        box-sizing: border-box;
                    `,
                },
                    H("div", { style: "flex-grow: 1; display: flex; flex-direction: column; gap: 10px;" },
                        H("div", { style: "flex-grow: 1; height: 0;" },
                            this._list.element,
                        ),
                    ),
                ),
            )),
        );
    }

    public dispose(): void {
        this._list.dispose();
    }

    public render(): void {
        this._list.render();
    }

    public willClose(): void {}

    public close(): void {
        this._ui.dialogManager.closeDialog(this);
        this._ui.scheduleMainRender();
    }
}
