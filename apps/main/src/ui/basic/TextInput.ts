import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";

export class TextInput implements Component {
    public element: HTMLInputElement;

    private _ui: UIContext;
    private _onInput: (value: string) => void;
    private _onBlur: () => void;
    private _value: string;
    private _placeholder: string;

    private _renderedPlaceholder: string | null;

    constructor(
        ui: UIContext,
        value: string,
        placeholder: string,
        onInput: (value: string) => void,
        onBlur: () => void,
    ) {
        this._ui = ui;

        this._onInput = onInput;
        this._onBlur = onBlur;

        this._value = value;
        this._placeholder = placeholder;
        this._renderedPlaceholder = null;

        this.element = H("input", {
            type: "text",
            style: `
                width: 100%;
                box-sizing: border-box;
                background: #1e1e1e;
                color: #fff;
                border: 1px solid #444;
                padding: 2px 5px;
            `,
        });

        this.element.addEventListener("input", this._handleInput);
        this.element.addEventListener("focus", this._handleFocus);
        this.element.addEventListener("blur", this._handleBlur);
    }

    public dispose(): void {
        this.element.removeEventListener("input", this._handleInput);
        this.element.removeEventListener("focus", this._handleFocus);
        this.element.removeEventListener("blur", this._handleBlur);
    }

    private _handleInput = (event: Event): void => {
        if (document.activeElement !== this.element) {
            // @TODO: Not sure about this.
            this.element.focus();
        }
        const value: string = this.element.value;
        this._value = value;
        this._onInput(value);
        this._ui.scheduleMainRender();
    };

    private _handleFocus = (event: FocusEvent): void => {};

    private _handleBlur = (event: FocusEvent): void => {
        this._onBlur();
        this._ui.scheduleMainRender();
    };

    public render(): void {
        this._renderPlaceholder();
        this._renderValue();
    }

    private _renderPlaceholder(): void {
        if (this._placeholder !== this._renderedPlaceholder) {
            this.element.placeholder = this._placeholder;
            this._renderedPlaceholder = this._placeholder;
        }
    }

    private _renderValue(): void {
        if (this.isFocused()) {
            // Don't clobber what the user is typing.
            return;
        }

        // @TODO: I probably shouldn't be reading this from the DOM.
        if (this.element.value === this._value) {
            return;
        }
        this.element.value = this._value;
    }

    public isEmpty(): boolean {
        return this._value.length === 0;
    }

    public isFocused(): boolean {
        return document.activeElement === this.element;
    }

    public getValue(): string {
        return this._value;
    }

    public setValue(value: string): void {
        this._value = value;
    }
}
