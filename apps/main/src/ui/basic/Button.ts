import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import {
    button as buttonClassName,
} from "./Button.module.css";

export class Button implements Component {
    public element: HTMLButtonElement;

    private _label: string;
    private _disabled: boolean;
    private _onClick: () => void;

    private _renderedLabel: string;
    private _renderedDisabled: boolean | null;

    constructor(label: string, onClick: () => void) {
        this._onClick = onClick;

        this._label = label;
        this._renderedLabel = label;
        this._disabled = false;
        this._renderedDisabled = null;

        this.element = H("button", {
            type: "button",
            class: buttonClassName,
        }, label);

        this.element.addEventListener("click", this._handleClick);
        // @TODO: Intercept keydown for space?
    }

    public dispose(): void {
        this.element.removeEventListener("click", this._handleClick);
    }

    public setLabel(label: string): void {
        this._label = label;
    }

    public setDisabled(value: boolean): void {
        this._disabled = value;
    }

    public render(): void {
        if (this._label !== this._renderedLabel) {
            this.element.textContent = this._label;
            this._renderedLabel = this._label;
        }

        if (this._disabled !== this._renderedDisabled) {
            this.element.disabled = this._disabled;
            this._renderedDisabled = this._disabled;
        }
    }

    private _handleClick = (event: Event): void => {
        this._onClick();

        event.stopPropagation();
    };
}
