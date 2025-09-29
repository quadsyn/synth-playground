import { H } from "@synth-playground/browser/dom.js";
import { UIContext } from "../UIContext.js";
import { type Component } from "../types.js";
import { StringId } from "../../localization/StringId.js";
import { Button } from "../basic/Button.js";
import { SongDocument } from "../../SongDocument.js";
import * as TempoMap from "@synth-playground/synthesizer/data/TempoMap.js";

export class Transport implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _doc: SongDocument;
    private _playButton: Button;
    private _playLabel: string;
    private _stopLabel: string;
    private _elapsedTimeDisplay: HTMLSpanElement;
    private _totalTimeDisplay: HTMLSpanElement;

    private _renderedLanguageVersion: number | null;
    private _renderedElapsedSeconds: number | null;
    private _renderedSongDuration: number | null;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;
        this._doc = doc;

        this._renderedLanguageVersion = null;
        this._renderedElapsedSeconds = null;
        this._renderedSongDuration = null;

        this._playLabel = "Play";
        this._stopLabel = "Stop";
        this._playButton = new Button(
            this._getPlayButtonLabel(this._doc.playing),
            this._onClickedPlay,
        );

        this._elapsedTimeDisplay = H("span", {}, "0");
        this._totalTimeDisplay = H("span", {}, "0");

        this.element = H("div", {
            style: `
                width: 100%;
                padding: 10px;
                display: flex;
                box-sizing: border-box;
                flex-direction: column;
                overflow: auto;
            `,
        },
            H("div", { style: `display: flex;` }, this._playButton.element),
            H("div", {
                style: `
                    display: flex;
                    justify-content: center;
                    font-size: 20px;
                    background-color: rgba(0, 0, 0, 0.25);
                `,
            },
                this._elapsedTimeDisplay,
                " / ",
                this._totalTimeDisplay,
            ),
        );
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

        let elapsedSeconds: number = 0;
        const timeCursor: number = this._doc.timeCursor;
        let elapsedTicks: number = timeCursor;

        if (this._doc.playing) {
            const playhead: number | null = this._doc.getPlayheadInTicks(this._ui.frame);
            elapsedTicks = playhead != null ? playhead : timeCursor;
        }

        const tempoMap: TempoMap.Type = this._doc.project.song.tempoMap;
        const sections: TempoMap.Section[] = tempoMap.sections;
        const sectionIndex: number = TempoMap.findSectionIndexByTick(sections, elapsedTicks);
        elapsedSeconds = TempoMap.computeSecondsFromTick(sections, sectionIndex, elapsedTicks) | 0;

        if (elapsedSeconds !== this._renderedElapsedSeconds) {
            this._elapsedTimeDisplay.textContent = secondsToHHMMSS(elapsedSeconds);
        }

        const songDurationInSeconds: number = this._doc.project.song.tempoMap.songDurationInSeconds;
        if (songDurationInSeconds !== this._renderedSongDuration) {
            this._totalTimeDisplay.textContent = secondsToHHMMSS(songDurationInSeconds);
        }

        this._renderedElapsedSeconds = elapsedSeconds;
        this._renderedSongDuration = songDurationInSeconds;
    }

    private _getPlayButtonLabel(playing: boolean): string {
        return playing ? this._stopLabel : this._playLabel;
    }

    private _onClickedPlay = async (): Promise<void> => {
        await this._doc.togglePlaying();
        this._ui.scheduleMainRender();
    };
}

function secondsToHHMMSS(value: number): string {
    const seconds: string = (Math.round(value % 60) + "").padStart(2, "0");
    const minutes: string = (Math.round((value / 60) % 60) + "").padStart(2, "0");
    const hours: string = (Math.round(value / 3600) + "").padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}
