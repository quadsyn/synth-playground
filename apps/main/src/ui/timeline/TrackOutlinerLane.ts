import { H } from "@synth-playground/browser/dom.js";
import { type ManualComponent } from "../types.js";
import { UIContext } from "../UIContext.js";
import { BrowserSlider } from "../basic/BrowserSlider.js";
import * as Lane from "./Lane.js";

// @TODO:
// - For event handling I'll need to record the track index here.

export class TrackOutlinerLane implements ManualComponent {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _trackNameDisplay: HTMLDivElement;
    private _trackGainSlider: BrowserSlider;
    private _trackPanSlider: BrowserSlider;
    private _trackMuteButton: HTMLButtonElement;
    private _trackSoloButton: HTMLButtonElement;
    private _trackControls: HTMLDivElement;
    private _trackLeftHandle: HTMLDivElement;
    private _automationLabelDisplay: HTMLDivElement;
    private _automationControls: HTMLDivElement;
    private _kind: Lane.Kind;
    private _trackName: string;
    private _trackGain: number;
    private _trackPan: number;
    private _automationLabel: string;
    private _visible: boolean;
    private _width: number;
    private _height: number;
    private _top: number;
    private _left: number;
    private _hasTopBorder: boolean;
    private _selected: boolean;

    private _renderedKind: Lane.Kind | null;
    private _renderedTrackName: string | null;
    private _renderedAutomationLabel: string | null;
    private _renderedVisible: boolean | null;
    private _renderedWidth: number | null;
    private _renderedHeight: number | null;
    private _renderedTop: number | null;
    private _renderedLeft: number | null;
    private _renderedHasTopBorder: boolean | null;
    private _renderedSelected: boolean | null;

    constructor(ui: UIContext) {
        this._ui = ui;

        this._visible = true;
        this._width = 100;
        this._height = 50;
        this._top = 0;
        this._left = 0;
        this._hasTopBorder = true;
        this._kind = Lane.Kind.Track;
        this._trackName = "";
        this._trackGain = 1;
        this._trackPan = 0;
        this._automationLabel = "";
        this._selected = false;

        this._renderedKind = null;
        this._renderedTrackName = null;
        this._renderedAutomationLabel = null;
        this._renderedVisible = null;
        this._renderedWidth = null;
        this._renderedHeight = null;
        this._renderedTop = null;
        this._renderedLeft = null;
        this._renderedHasTopBorder = null;
        this._renderedSelected = null;

        this._trackNameDisplay = H("div", {
            style: `
                background-color: #1e1e1e;
                border: 1px solid #000000;
                flex-grow: 1;
                padding: 0 5px;
                box-sizing: border-box;
                font-size: 12px;
                display: flex;
                align-items: center;
                height: 21px;
                overflow: hidden;
                text-overflow: ellipsis;
            `,
        }, "");
        this._trackMuteButton = H("button", {
            type: "button",
            class: "track-mute-button",
            style: `
                font-family: monospace !important;
                font-size: 12px;
                box-sizing: border-box;
                border: 1px solid #000000;
                width: 21px;
                height: 21px;
            `,
        }, "M");
        this._trackSoloButton = H("button", {
            type: "button",
            class: "track-solo-button",
            style: `
                font-family: monospace !important;
                font-size: 12px;
                box-sizing: border-box;
                border: 1px solid #000000;
                width: 21px;
                height: 21px;
            `,
        }, "S");
        this._trackGainSlider = new BrowserSlider(
            this._ui,
            /* min */ 0,
            /* max */ 1,
            /* step */ 0.1,
            /* value */ 1,
            /* onInput */ () => {},
            /* onChange */ () => {},
        );
        this._trackGainSlider.element.style.width = "100%";
        this._trackPanSlider = new BrowserSlider(
            this._ui,
            /* min */ -1,
            /* max */ 1,
            /* step */ 0.1,
            /* value */ 0,
            /* onInput */ () => {},
            /* onChange */ () => {},
        );
        this._trackPanSlider.element.style.width = "50%";
        this._trackControls = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
            `,
        },
            H("div", {
                style: `
                    display: flex;
                    gap: 5px;
                    margin-bottom: 5px;
                `,
            },
                this._trackNameDisplay,
                this._trackMuteButton,
                this._trackSoloButton,
            ),
            H("div", {
                style: `
                    display: flex;
                `,
            },
                this._trackGainSlider.element,
                this._trackPanSlider.element,
            ),
        );
        this._automationLabelDisplay = H("div", {
            style: `
                background-color: #1e1e1e;
                border: 1px solid #000000;
                flex-grow: 1;
                padding: 0 5px;
                box-sizing: border-box;
                font-size: 12px;
                display: flex;
                align-items: center;
                height: 21px;
                overflow: hidden;
                text-overflow: ellipsis;
            `,
        }, "");
        this._automationControls = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
            `,
        },
            H("div", {
                style: `
                    display: flex;
                    gap: 5px;
                    margin-bottom: 5px;
                `,
            },
                this._automationLabelDisplay,
            ),
        );
        this._trackLeftHandle = H("div", {
            style: `
                box-sizing: border-box;
                border-right: 1px solid #000000;
                width: 10px;
                height: 100%;
            `,
        });
        this.element = H("div", {
            style: `
                box-sizing: border-box;
                background-color: #3e3e3e;
                border-top: 1px solid #000000;
                border-left: 1px solid #000000;
                border-right: 1px solid #000000;
                border-bottom: 1px solid #000000;
                position: absolute;
                width: 100px;
                height: 50px;
                left: 0;
                top: 0;
                overflow: hidden;
                display: flex;
            `,
        },
            this._trackLeftHandle,
            H("div", {
                style: `
                    width: 100%;
                    height: 100%;
                    padding: 5px;
                    box-sizing: border-box;
                    flex-grow: 1;
                `,
            },
                this._trackControls,
                this._automationControls,
            ),
        );
    }

    public dispose(): void {
        this._trackGainSlider.dispose();
        this._trackPanSlider.dispose();
    }

    public render(): void {
        if (this._renderedKind !== this._kind) {
            if (this._kind === Lane.Kind.Track) {
                this._trackControls.style.display = "";
                this._trackLeftHandle.style.display = "";
                this._automationControls.style.display = "none";
            } else if (this._kind === Lane.Kind.Automation) {
                this._trackControls.style.display = "none";
                this._trackLeftHandle.style.display = "none";
                this._automationControls.style.display = "";
            } else if (this._kind === Lane.Kind.TempoAutomation) {
                this._trackControls.style.display = "none";
                this._trackLeftHandle.style.display = "none";
                this._automationControls.style.display = "";
            }
            this._renderedKind = this._kind;
        }

        if (this._renderedVisible !== this._visible) {
            this.element.style.display = this._visible ? "flex" : "none";
            this._renderedVisible = this._visible;
        }

        if (this._visible) {
            if (this._renderedWidth !== this._width) {
                this.element.style.width = this._width + "px";
                this._renderedWidth = this._width;
            }

            if (this._renderedHeight !== this._height) {
                this.element.style.height = this._height + "px";
                this._renderedHeight = this._height;
            }

            if (this._renderedTop !== this._top || this._renderedLeft !== this._left) {
                this.element.style.transform = `translate(${this._left}px, ${this._top}px)`;
                this._renderedTop = this._top;
                this._renderedLeft = this._left;
            }

            if (this._renderedHasTopBorder !== this._hasTopBorder) {
                this.element.style.borderTop = this._hasTopBorder ? "1px solid #000000;" : "none";
                this._renderedHasTopBorder = this._hasTopBorder;
            }

            if (this._renderedSelected !== this._selected) {
                this.element.style.backgroundColor = this._selected ? "#4e4e4e" : "#3e3e3e";
                this._renderedSelected = this._selected;
            }

            if (this._kind === Lane.Kind.Track) {
                if (this._renderedTrackName !== this._trackName) {
                    this._trackNameDisplay.textContent = this._trackName;
                    this._renderedTrackName = this._trackName;
                }

                this._trackGainSlider.setValue(this._trackGain);
                this._trackGainSlider.render();

                this._trackPanSlider.setValue(this._trackPan);
                this._trackPanSlider.render();
            } else if (this._kind === Lane.Kind.Automation) {
                if (this._renderedAutomationLabel !== this._automationLabel) {
                    this._automationLabelDisplay.textContent = this._automationLabel;
                    this._renderedAutomationLabel = this._automationLabel;
                }
            } else if (this._kind === Lane.Kind.TempoAutomation) {
                if (this._renderedAutomationLabel !== this._automationLabel) {
                    this._automationLabelDisplay.textContent = this._automationLabel;
                    this._renderedAutomationLabel = this._automationLabel;
                }
            }
        }
    }

    public setVisible(value: boolean): void {
        this._visible = value;
    }

    public setWidth(value: number): void {
        this._width = value;
    }

    public setHeight(value: number): void {
        this._height = value;
    }

    public setTop(value: number): void {
        this._top = value;
    }

    public setLeft(value: number): void {
        this._left = value;
    }

    public setHasTopBorder(value: boolean): void {
        this._hasTopBorder = value;
    }

    public setKind(kind: Lane.Kind): void {
        this._kind = kind;
    }

    public setTrackName(name: string): void {
        this._trackName = name;
    }

    public setTrackGain(gain: number): void {
        this._trackGain = gain;
    }

    public setTrackPan(pan: number): void {
        this._trackPan = pan;
    }

    public setAutomationLabel(label: string): void {
        this._automationLabel = label;
    }

    public setSelected(selected: boolean): void {
        this._selected = selected;
    }
}
