import { H } from "@synth-playground/browser/dom.js";
import { type Dialog } from "./Dialog.js";
import {
    dialogRoot as dialogRootClassName,
} from "./DialogRoot.module.css";
import { type DialogOpenOptions } from "./DialogOpenOptions.js";

// @TODO:
// - Focus trapping!
//   I think I can just slot <https://github.com/focus-trap/focus-trap> in here?
//   There's also <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert>
//   for modern browsers, though I don't know if that only really works well if
//   I also use <dialog> elements.
// - Movable dialogs?
// - Modeless dialogs?

export class DialogManager {
    public container: HTMLDivElement;

    private _dialogs: Dialog[];
    private _dialogRoots: HTMLDivElement[];
    private _dirty: boolean;

    constructor() {
        this._dialogs = [];
        this._dialogRoots = [];

        this._dirty = false;
        this.container = H("div", {
            style: `
                width: 100%;
                height: 100%;
                position: absolute;
                z-index: 1;
                left: 0;
                top: 0;
                pointer-events: none;
            `,
        });
    }

    public hasDialogsOpen(): boolean {
        return this._dialogs.length > 0;
    }

    private _internalCloseDialog(dialog: Dialog, root: HTMLElement): void {
        dialog.willClose();
        // @TODO: I may need to remove the event listener attached to the root
        // if this was opened as a dismissable dialog. Though in theory garbage
        // collection should take care of it for me.
        root.remove();
        dialog.dispose();

        this._dirty = true;
    }

    public closeDialog(target: Dialog): void {
        // @TODO: This is rather slow but I don't expect stacking dialogs to be
        // very common, so it's probably okay for now.
        const dialogIndex: number = this._dialogs.indexOf(target);
        if (dialogIndex !== -1) {
            const dialogRoot: HTMLElement = this._dialogRoots[dialogIndex];

            this._dialogs.splice(dialogIndex, 1);
            this._dialogRoots.splice(dialogIndex, 1);

            this._internalCloseDialog(target, dialogRoot);
        }
    }

    public closeTopmostDialog(): void {
        if (this._dialogs.length > 0) {
            const dialog: Dialog = this._dialogs.pop()!;
            const dialogRoot: HTMLElement = this._dialogRoots.pop()!;

            this._internalCloseDialog(dialog, dialogRoot);
        }
    }

    public closeAllDialogs(): void {
        while (this._dialogs.length > 0) {
            this.closeTopmostDialog();
        }
    }

    public show(dialog: Dialog, options?: DialogOpenOptions): void {
        this._dialogs.push(dialog);

        const dialogRoot: HTMLDivElement = H("div", {
            class: dialogRootClassName,
        }, dialog.element);
        this._dialogRoots.push(dialogRoot);

        this.container.appendChild(dialogRoot);

        if (options?.dismissable) {
            // @TODO: Not really sure about this but it seems okay for now...
            dialogRoot.addEventListener("click", (event) => {
                if (event.target === dialogRoot) {
                    this.closeDialog(dialog);
                }
            });
        }

        this._dirty = true;
    }

    public render(): void {
        if (this._dirty) {
            this.container.style.pointerEvents = this.hasDialogsOpen() ? "" : "none";
        }

        const dialogCount: number = this._dialogs.length;
        for (let dialogIndex: number = 0; dialogIndex < dialogCount; dialogIndex++) {
            const dialog: Dialog = this._dialogs[dialogIndex];
            dialog.render();

            // @TODO: If we just opened this dialog, focus on its first tabbable
            // element. I think to detect that I will need to set a reference
            // to the dialog given to show, use it here, then clear it outside
            // of this loop.
        }

        this._dirty = false;
    }
}
