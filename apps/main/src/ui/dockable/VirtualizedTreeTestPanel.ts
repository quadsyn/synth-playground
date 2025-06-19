import { H } from "@synth-playground/dom/index.js";
import { type DockablePanel } from "./types.js";
import { VirtualizedTree } from "../VirtualizedTree.js";
import { Button } from "../Button.js";
import { TextInput } from "../TextInput.js";
import { UIContext } from "../UIContext.js";
import { type GroupPanelPartInitParameters } from "dockview-core";

export class VirtualizedTreeTestPanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _tree: VirtualizedTree;
    private _filterInput: TextInput;
    private _expandAllButton: Button;

    constructor(ui: UIContext) {
        this._ui = ui;

        this._tree = new VirtualizedTree(
            this._ui,
            /* height */ "100%",
            /* rowHeight */ 25,
        );
        this._filterInput = new TextInput(
            this._ui,
            /* value */ "",
            /* placeholder */ "Search...",
            /* onInput */ (value: string) => {
                this._tree.setFilter(value.toLowerCase());
                this._ui.scheduleMainRender();
            },
            /* onBlur */ () => {},
        );
        this._expandAllButton = new Button("Expand all", () => {
            this._tree.expandAll();
            this._ui.scheduleMainRender();
        });
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
                    H("div", {
                        style: `
                            display: flex;
                            gap: 10px;
                        `,
                    }, this._filterInput.element, this._expandAllButton.element),
                    H("div", { style: "flex-grow: 1; height: 0;" },
                        this._tree.element,
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
        this._filterInput.dispose();
        this._tree.dispose();
        this._expandAllButton.dispose();
    }

    public render(): void {
        this._filterInput.render();
        this._tree.render();
        this._expandAllButton.setDisabled(!this._filterInput.isEmpty());
        this._expandAllButton.setLabel(
            this._tree.getExpandedNodeCount() > 0
            ? "Collapse all"
            : "Expand all"
        );
        this._expandAllButton.render();
    }
}
