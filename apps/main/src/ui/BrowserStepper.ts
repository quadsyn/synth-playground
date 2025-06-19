import { H } from "@synth-playground/dom/index.js";
import { type Component } from "./types.js";
import { UIContext } from "./UIContext.js";

export class BrowserStepper implements Component {
    public element: HTMLInputElement;
    private _ui: UIContext;
    private _onInput: (value: number) => void;
    private _onBlur: () => void;
    private _min: number;
    private _max: number;
    private _step: number;
    private _value: number;

    constructor(
        ui: UIContext,
        min: number,
        max: number,
        step: number,
        value: number,
        onInput: (value: number) => void,
        onBlur: () => void
    ) {
        this._ui = ui;

        this._onInput = onInput;
        this._onBlur = onBlur;

        this._min = min;
        this._max = max;
        this._step = step;
        this._value = value;

        this.element = H("input", {
            type: "number",
            min: this._min + "",
            max: this._max + "",
            step: this._step + "",
            value: this._value + "",
            style: `
                /* width: 100%; */
                flex-shrink: 0;
                flex-grow: 1;
                box-sizing: border-box;
            `,
        });

        this.element.addEventListener("input", this._handleInput);
        this.element.addEventListener("blur", this._handleBlur);
    }

    public dispose(): void {
        this.element.removeEventListener("input", this._handleInput);
        this.element.removeEventListener("blur", this._handleBlur);
    }

    public getMin(): number {
        return this._min;
    }

    public getMax(): number {
        return this._max;
    }

    public getStep(): number {
        return this._step;
    }

    public getValue(): number {
        return this._value;
    }

    public setValue(value: number): void {
        this._value = value;
    }

    public isFocused(): boolean {
        return document.activeElement === this.element;
    }

    private _handleInput = (event: Event): void => {
        if (document.activeElement !== this.element) this.element.focus();
        const value: number = parseFloat(this.element.value);
        if (value !== value) return; // Don't bother if the value is NaN.
        this._onInput(value);
        this._ui.scheduleMainRender();
    };

    private _handleBlur = (event: Event): void => {
        this._onBlur();
        this._ui.scheduleMainRender();
    };

    public render(): void {
        if (this.isFocused()) return; // Don't clobber what the user is typing.
        const valueStr: string = this._value + "";
        if (this.element.value === valueStr) return;
        this.element.value = valueStr;
    }
}
