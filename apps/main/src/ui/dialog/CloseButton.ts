import { Button } from "../basic/Button.js";
import {
    closeButton as closeButtonClassName,
} from "./CloseButton.module.css";

export class CloseButton extends Button {
    constructor(onClick: () => void) {
        super("✕", onClick);

        // @TODO: This is awkward.
        this.element.className = closeButtonClassName;
    }
}
