import { DockablePanel } from "./DockablePanel.js";

export class EmptyPanel extends DockablePanel {
    constructor() {
        super();
    }

    protected override _init(): void {}

    protected override _dispose(): void {}

    protected override _render(): void {}
}
