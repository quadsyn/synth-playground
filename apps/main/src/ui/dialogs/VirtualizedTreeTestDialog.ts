import { H } from "@synth-playground/browser/dom.js";
import { type Dialog } from "../dialog/Dialog.js";
import { VirtualizedTree } from "../basic/VirtualizedTree.js";
import { Button } from "../basic/Button.js";
import { TextInput } from "../basic/TextInput.js";
import { UIContext } from "../UIContext.js";
import { CloseButton } from "../dialog/CloseButton.js";
import { DialogHeader } from "../dialog/DialogHeader.js";
import { DialogBody } from "../dialog/DialogBody.js";
import {
    dialog as dialogClassName,
} from "../dialog/Dialog.module.css";

export class VirtualizedTreeTestDialog implements Dialog {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _closeButton: CloseButton;
    private _tree: VirtualizedTree;
    private _filterInput: TextInput;
    private _expandAllButton: Button;

    constructor(ui: UIContext) {
        this._ui = ui;
        this._tree = new VirtualizedTree(
            this._ui,
            /* height */ "100%",
            /* rowHeight */ 25,
        );
        this._filterInput = new TextInput(
            this._ui,
            /* value */ "",
            /* placeholder */ "Search...",
            /* onInput */ (value: string) => {
                this._tree.setFilter(value.toLowerCase());
                this._ui.scheduleMainRender();
            },
            /* onBlur */ () => {},
        );
        this._expandAllButton = new Button("Expand all", () => {
            this._tree.expandAll();
            this._ui.scheduleMainRender();
        });
        this._closeButton = new CloseButton(() => { this.close() });
        this.element = H("div", { class: dialogClassName },
            DialogHeader("Virtualized tree test", this._closeButton.element),
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
                        H("div", {
                            style: `
                                display: flex;
                                gap: 10px;
                            `,
                        }, this._filterInput.element, this._expandAllButton.element),
                        H("div", { style: "flex-grow: 1; height: 0;" },
                            this._tree.element,
                        ),
                    ),
                ),
            )),
        );
    }

    public dispose(): void {
        this._filterInput.dispose();
        this._tree.dispose();
        this._expandAllButton.dispose();
    }

    public render(): void {
        this._filterInput.render();
        this._tree.render();
        this._expandAllButton.setDisabled(!this._filterInput.isEmpty());
        this._expandAllButton.setLabel(
            this._tree.getExpandedNodeCount() > 0
            ? "Collapse all"
            : "Expand all"
        );
        this._expandAllButton.render();
    }

    public willClose(): void {}

    public close(): void {
        this._ui.dialogManager.closeDialog(this);
        this._ui.scheduleMainRender();
    }
}
