import { H } from "@synth-playground/dom/index.js";
import { type DockablePanel } from "./types.js";
import { UIContext } from "../UIContext.js";
import { Button } from "../Button.js";
import { type GroupPanelPartInitParameters } from "dockview-core";
import { SongDocument } from "../../SongDocument.js";

// @TODO: Move the inner code here to a `Transport` component.
export class TransportPanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _playButton: Button;
    private _doc: SongDocument;
    private _setActive: (() => void) | null;

    constructor(
        ui: UIContext,
        doc: SongDocument
    ) {
        this._ui = ui;
        this._doc = doc;

        this._setActive = null;

        this._playButton = new Button(
            this._getPlayButtonLabel(this._doc.playing),
            this._onClickedPlay,
        );
        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `,
        },
            H("div", {
                style: `
                    width: 100%;
                    display: flex;
                `,
            }, this._playButton.element),
        );

        this._element.addEventListener("mousedown", this._handlePointerDown);
    }

    public get element(): HTMLElement {
        return this._element;
    }

    public init(parameters: GroupPanelPartInitParameters): void {
        this._setActive = () => { parameters.api.setActive(); };
    }

    public dispose(): void {
        this._element.removeEventListener("mousedown", this._handlePointerDown);
        this._setActive = null;
        this._playButton.dispose();
    }

    public render(): void {
        this._playButton.setLabel(this._getPlayButtonLabel(this._doc.playing));
        this._playButton.render();
    }

    private _getPlayButtonLabel(playing: boolean): string {
        return playing ? "Stop" : "Play";
    }

    private _onClickedPlay = async (): Promise<void> => {
        await this._doc.togglePlaying();
        this._ui.scheduleMainRender();
    };

    private _handlePointerDown = (event: MouseEvent): void => {
        this._setActive?.();
    };
}
