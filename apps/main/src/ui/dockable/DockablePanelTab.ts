import { H } from "@synth-playground/browser/dom.js";
import {
    type GroupPanelPartInitParameters,
    type ITabRenderer,
    DockviewCompositeDisposable as CompositeDisposable,
} from "dockview-core";
import { addDisposableListener } from "dockview-core/dist/esm/events.js";

export class DockablePanelTab extends CompositeDisposable implements ITabRenderer {
    private _element: HTMLDivElement;
    private _content: HTMLDivElement;
    private _action: HTMLDivElement;
    private _title: string;

    constructor() {
        super();

        this._title = "";
        this._content = H("div", { class: "dv-default-content" });
        this._action = H("div", {
            class: "dv-default-tab-action",
            style: `
                margin-left: 4px;
            `,
        }, "✕");
        this._element = H("div", {
            class: "dv-default-tab",
            style: `
                user-select: none;
            `,
        }, this._content, this._action);

        this.render();
    }

    public get element(): HTMLElement {
        return this._element;
    }

    public init(parameters: GroupPanelPartInitParameters): void {
        this._title = parameters.title;

        this.addDisposables(
            parameters.api.onDidTitleChange((event) => {
                this._title = event.title;
                this.render();
            }),
            addDisposableListener(this._action, "pointerdown", (event: PointerEvent) => {
                event.preventDefault();
            }),
            addDisposableListener(this._action, "click", (event: MouseEvent) => {
                if (event.defaultPrevented) {
                    return;
                }
                event.preventDefault();
                parameters.api.close();
            }),
        );

        this.render();
    }

    public render(): void {
        if (this._content.textContent !== this._title) {
            this._content.textContent = this._title ?? "";
        }
    }
}
