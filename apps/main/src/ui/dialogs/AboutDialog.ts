import { H } from "@synth-playground/browser/dom.js";
import { UIContext } from "../UIContext.js";
import { Button } from "../basic/Button.js";
import { type Dialog } from "../dialog/Dialog.js";
import { CloseButton } from "../dialog/CloseButton.js";
import { DialogHeader } from "../dialog/DialogHeader.js";
import { DialogBody } from "../dialog/DialogBody.js";
import {
    dialog as dialogClassName,
} from "../dialog/Dialog.module.css";

export class AboutDialog implements Dialog {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _closeButton: CloseButton;

    constructor(ui: UIContext) {
        this._ui = ui;

        this._closeButton = new CloseButton(() => { this.close() });
        this.element = H("div", { class: dialogClassName },
            DialogHeader("About", this._closeButton.element),
            DialogBody(H("div", {
                style: `
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    box-sizing: border-box;
                    align-items: center;
                    justify-content: center;
                `,
            },
                H("p", {},
                    "An attempt at writing a synthesizer and an associated editor."
                ),
                H("div", { style: "display: flex;" },
                    new Button("Open about dialog again", () => {
                        this._ui.dialogManager.show(new AboutDialog(this._ui), {
                            dismissable: true,
                        });
                    }).element,
                ),
                H("hr", {}),
                H("p", {},
                    H("a", {
                        href: "https://github.com/quadsyn/synth-playground",
                        target: "_blank",
                    }, "Source code"),
                ),
            )),
        );
    }

    public dispose(): void {
        this._closeButton.dispose();
    }

    public render(): void {
    }

    public willClose(): void {
    }

    public close(): void {
        this._ui.dialogManager.closeDialog(this);
        this._ui.scheduleMainRender();
    }
}
