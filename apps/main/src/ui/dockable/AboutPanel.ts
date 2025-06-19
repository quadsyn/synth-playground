import { H } from "@synth-playground/dom/index.js";
import { type DockablePanel } from "./types.js";
import { type GroupPanelPartInitParameters } from "dockview-core";

export class AboutPanel implements DockablePanel {
    private _element: HTMLDivElement;

    constructor() {
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
                    align-items: center;
                    justify-content: center;
                `,
            },
                H("p", {},
                    "An attempt at writing a synthesizer"
                    + " and an associated editor."
                ),
                H("hr", {}),
                H("p", {},
                    H("a", {
                        href: "https://github.com/quadsyn/synth-playground",
                    },
                        "Source code"
                    ),
                ),
            ),
        );
    }

    public get element(): HTMLElement {
        return this._element;
    }

    public init(parameters: GroupPanelPartInitParameters): void {}

    public dispose(): void {}

    public render(): void {}
}
