import { H } from "@synth-playground/browser/dom.js";
import { UIContext } from "../UIContext.js";
import { type Component } from "../types.js";
import { StringId } from "../../localization/StringId.js";
import { Button } from "../basic/Button.js";
import { SongDocument } from "../../SongDocument.js";

export class Transport implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _doc: SongDocument;
    private _playButton: Button;
    private _playLabel: string;
    private _stopLabel: string;

    private _renderedLanguageVersion: number | null;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;
        this._doc = doc;

        this._renderedLanguageVersion = null;
        this._playLabel = "Play";
        this._stopLabel = "Stop";
        this._playButton = new Button(
            this._getPlayButtonLabel(this._doc.playing),
            this._onClickedPlay,
        );
        this.element = H("div", {
            style: `
                width: 100%;
                padding: 10px;
                display: flex;
                box-sizing: border-box;
                flex-direction: column;
                overflow: auto;
            `,
        }, this._playButton.element);
    }

    public dispose(): void {
        this._playButton.dispose();
    }

    public render(): void {
        if (this._renderedLanguageVersion !== this._ui.localizationManager.getVersion()) {
            this._playLabel = this._ui.T(StringId.TransportPlayButton);
            this._stopLabel = this._ui.T(StringId.TransportStopButton);
            this._renderedLanguageVersion = this._ui.localizationManager.getVersion();
        }

        this._playButton.setLabel(this._getPlayButtonLabel(this._doc.playing));
        this._playButton.render();
    }

    private _getPlayButtonLabel(playing: boolean): string {
        return playing ? this._stopLabel : this._playLabel;
    }

    private _onClickedPlay = async (): Promise<void> => {
        await this._doc.togglePlaying();
        this._ui.scheduleMainRender();
    };
}
