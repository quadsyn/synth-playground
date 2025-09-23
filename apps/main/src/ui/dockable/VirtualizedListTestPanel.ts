import { H } from "@synth-playground/browser/dom.js";
import { DockablePanel } from "./DockablePanel.js";
import { VirtualizedList, ListItem } from "../basic/VirtualizedList.js";
import { UIContext } from "../UIContext.js";

export class VirtualizedListTestPanel extends DockablePanel {
    private _ui: UIContext;
    private _list: VirtualizedList<string>;
    private _listContainer: HTMLDivElement;

    constructor(ui: UIContext) {
        super();
        this._ui = ui;
        this._list = new VirtualizedList(
            this._ui,
            /* height */ "100%",
            /* rowHeight */ 25,
            /* itemMaker */ height => new ListItem(height),
        );
        const data: string[] = [];
        for (let i: number = 0; i < 1_000_000; i++) {
            data.push(`index ${i}`);
        }
        this._list.setData(data);
        this._listContainer = H("div", {
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
        this._element.appendChild(this._listContainer);
    }

    protected override _init(): void {}

    protected override _dispose(): void {
        this._list.dispose();
    }

    protected override _render(): void {
        this._list.render();
    }
}
