import { H } from "@synth-playground/dom/index.js";
import { type DockablePanel } from "./types.js";
import { VirtualizedList } from "../VirtualizedList.js";
import { UIContext } from "../UIContext.js";
import {
    type GroupPanelPartInitParameters,
} from "dockview-core";

export class VirtualizedListTestPanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _list: VirtualizedList;

    constructor(ui: UIContext) {
        this._ui = ui;

        this._list = new VirtualizedList(
            this._ui,
            /* height */ "100%",
            /* rowHeight */ 25,
        );
        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                overflow-y: auto;
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
                    padding: 10px;
                    box-sizing: border-box;
                `,
            },
                H("div", { style: "flex-grow: 1; display: flex; flex-direction: column; gap: 10px;" },
                    H("div", { style: "flex-grow: 1; height: 0;" },
                        this._list.element,
                    ),
                ),
            ),
        );
    }

    public get element(): HTMLElement {
        return this._element;
    }

    public init(parameters: GroupPanelPartInitParameters): void {}

    public dispose(): void {
        this._list.dispose();
    }

    public render(): void {
        this._list.render();
    }
}
