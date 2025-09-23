import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import { DockablePanel } from "./DockablePanel.js";

// @TODO: Replace this with a non-dockview dialog.

class About implements Component {
    public element: HTMLDivElement;

    constructor() {
        this.element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                padding: 10px;
                box-sizing: border-box;
                align-items: center;
                justify-content: center;
                overflow: auto;
            `,
        },
            H("p", {},
                "An attempt at writing a synthesizer and an associated editor."
            ),
            H("hr", {}),
            H("p", {},
                H("a", {
                    href: "https://github.com/quadsyn/synth-playground",
                    target: "_blank",
                }, "Source code"),
            ),
        );
    }

    public dispose(): void {}

    public render(): void {}
}

export class AboutPanel extends DockablePanel {
    private _about: About;

    constructor() {
        super();
        this._about = new About();
        this._element.appendChild(this._about.element);
    }

    protected override _init(): void {}

    protected override _dispose(): void {
        this._about.dispose();
    }

    protected override _render(): void {
        this._about.render();
    }
}
