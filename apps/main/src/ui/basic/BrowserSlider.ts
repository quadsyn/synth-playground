import { H } from "@synth-playground/browser/dom.js";
import { clamp } from "@synth-playground/common/math.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";

// @TODO:
// - Ensure the value is quantized using the step in the same way as the input
//   element would do it.

export class BrowserSlider implements Component {
    public element: HTMLInputElement;

    private _ui: UIContext;
    private _onInput: (value: number) => void;
    private _onChange: (value: number) => void;
    private _min: number;
    private _max: number;
    private _step: number;
    private _value: number;
    private _renderedValue: number;
    private _title: string;
    private _renderedTitle: string;

    constructor(
        ui: UIContext,
        min: number,
        max: number,
        step: number,
        value: number,
        onInput: (value: number) => void,
        onChange: (value: number) => void
    ) {
        this._ui = ui;

        this._onInput = onInput;
        this._onChange = onChange;

        this._min = min;
        this._max = max;
        this._step = step;
        this._value = value;
        this._renderedValue = this._value;
        this._title = "";
        this._renderedTitle = this._title;

        this.element = H("input", {
            type: "range",
            min: this._min + "",
            max: this._max + "",
            step: this._step + "",
            value: this._value + "",
            style: `
                /* width: 100%; */
                /* flex-shrink: 0; */
                flex-grow: 1;
                box-sizing: border-box;
            `,
        });

        this.element.addEventListener("input", this._handleInput);
        this.element.addEventListener("change", this._handleChange);
        this.element.addEventListener("blur", this._handleBlur);
    }

    public dispose(): void {
        this.element.removeEventListener("input", this._handleInput);
        this.element.removeEventListener("change", this._handleChange);
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

    private _handleInput = (event: Event): void => {
        const value: number = clamp(+this.element.value, this._min, this._max);
        this._value = value;
        this._renderedValue = value;
        this._onInput(value);
        this._ui.scheduleMainRender();
    };

    private _handleChange = (event: Event): void => {
        const value: number = clamp(+this.element.value, this._min, this._max);
        this._value = value;
        this._renderedValue = value;
        this._onChange(value);
        this._ui.scheduleMainRender();
    };

    private _handleBlur = (event: Event): void => {
        this._ui.scheduleMainRender();
    };

    public render(): void {
        if (this._title !== this._renderedTitle) {
            this.element.title = this._title;
            this._renderedTitle = this._title;
        }

        if (this._value !== this._renderedValue) {
            this.element.value = this._value + "";
            this._renderedValue = this._value;
        }
    }

    public setValue(value: number): void {
        this._value = value;
    }

    public setTitle(title: string): void {
        this._title = title;
    }
}
