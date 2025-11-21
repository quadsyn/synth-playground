import { clamp } from "@synth-playground/common/math.js";
import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import { SongDocument } from "../../SongDocument.js";
import { BrowserSlider } from "../basic/BrowserSlider.js";
import * as Lane from "./Lane.js";
import * as TrackMeterState from "../../data/TrackMeterState.js";

// @TODO:
// - For event handling I'll need to record the track index here.

export class TrackOutlinerLane implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _doc: SongDocument;
    private _trackNameDisplay: HTMLDivElement;
    private _trackGainSlider: BrowserSlider;
    private _trackPanSlider: BrowserSlider;
    private _trackMuteButton: HTMLButtonElement;
    private _trackSoloButton: HTMLButtonElement;
    private _trackControls: HTMLDivElement;
    private _trackLeftHandle: HTMLDivElement;
    private _trackMeterContainer: HTMLDivElement;
    private _trackMeter: TrackMeter;
    private _automationLabelDisplay: HTMLDivElement;
    private _automationControls: HTMLDivElement;
    private _kind: Lane.Kind;
    private _trackIndex: number;
    private _trackName: string;
    private _trackGain: number;
    private _trackPan: number;
    private _trackMeterState: TrackMeterState.Type | null;
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

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;
        this._doc = doc;

        this._visible = true;
        this._width = 100;
        this._height = 50;
        this._top = 0;
        this._left = 0;
        this._hasTopBorder = true;
        this._kind = Lane.Kind.Track;
        this._trackIndex = -1;
        this._trackName = "";
        this._trackGain = 1;
        this._trackPan = 0;
        this._trackMeterState = null;
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
        // @TODO: It'd be better to create this lazily, but the virtualization
        // done in the outliner will make it pointless.
        this._trackMeter = new TrackMeter(this._height);
        this._trackMeterContainer = H("div", {},
            this._trackMeter.element,
        );
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
            this._trackMeterContainer,
        );

        this._trackMuteButton.addEventListener("click", this._handleMuteButtonClick);
        this._trackSoloButton.addEventListener("click", this._handleSoloButtonClick);
    }

    public dispose(): void {
        this._trackMuteButton.removeEventListener("click", this._handleMuteButtonClick);
        this._trackSoloButton.removeEventListener("click", this._handleSoloButtonClick);
        this._trackGainSlider.dispose();
        this._trackPanSlider.dispose();
        this._trackMeter.dispose();
    }

    public render(): void {
        if (this._renderedKind !== this._kind) {
            if (this._kind === Lane.Kind.Track) {
                this._trackControls.style.display = "";
                this._trackLeftHandle.style.display = "";
                this._trackMeterContainer.style.display = "";
                this._automationControls.style.display = "none";
            } else if (this._kind === Lane.Kind.Automation) {
                this._trackControls.style.display = "none";
                this._trackLeftHandle.style.display = "none";
                this._trackMeterContainer.style.display = "none";
                this._automationControls.style.display = "";
            } else if (this._kind === Lane.Kind.TempoAutomation) {
                this._trackControls.style.display = "none";
                this._trackLeftHandle.style.display = "none";
                this._trackMeterContainer.style.display = "none";
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

                if (this._trackMeterState != null) {
                    const peakLeft: number = this._trackMeterState.peakLeft;
                    const peakRight: number = this._trackMeterState.peakRight;
                    const trailLeft: number = this._trackMeterState.trailLeft;
                    const trailRight: number = this._trackMeterState.trailRight;
                    this._trackMeter.setState(peakLeft, peakRight, trailLeft, trailRight);
                } else {
                    this._trackMeter.setState(0, 0, 0, 0);
                }
                this._trackMeter.setHeight(this._height);
                this._trackMeter.render();
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

    private _handleMuteButtonClick = (event: MouseEvent): void => {
        this._doc.toggleMuteTrack(this._trackIndex);
    };

    private _handleSoloButtonClick = (event: MouseEvent): void => {
        this._doc.toggleSoloTrack(this._trackIndex);
    };

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

    public setTrackIndex(trackIndex: number): void {
        this._trackIndex = trackIndex;
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

    public setTrackMeterState(state: TrackMeterState.Type | null): void {
        this._trackMeterState = state;
    }

    public setAutomationLabel(label: string): void {
        this._automationLabel = label;
    }

    public setSelected(selected: boolean): void {
        this._selected = selected;
    }
}

class TrackMeter implements Component {
    public element: HTMLCanvasElement;
    private _width: number;
    private _height: number;
    private _resized: boolean;
    private _trailSize: number;
    private _context: CanvasRenderingContext2D;
    private _peakLeft: number;
    private _peakRight: number;
    private _renderedPeakLeft: number;
    private _renderedPeakRight: number;
    private _trailLeft: number;
    private _trailRight: number;
    private _renderedTrailLeft: number;
    private _renderedTrailRight: number;

    constructor(height: number) {
        this._width = 10;
        this._height = height;
        this._resized = true;

        this._trailSize = 1;

        this._peakLeft = 0;
        this._peakRight = 0;
        this._renderedPeakLeft = this._peakLeft;
        this._renderedPeakRight = this._peakRight;
        this._trailLeft = 0;
        this._trailRight = 0;
        this._renderedTrailLeft = this._trailLeft;
        this._renderedTrailRight = this._trailRight;

        this.element = H("canvas", {
            width: this._width + "",
            height: this._height + "",
            style: `
                width: ${this._width}px;
                height: ${this._height}px;
                outline: 1px solid #000000;
                background: #222222;
            `,
        });

        this._context = this.element.getContext("2d")!;
    }

    public dispose(): void {
    }

    public render(): void {
        let cleared: boolean = false;

        let dirty: boolean = (
            this._peakLeft !== this._renderedPeakLeft
            || this._peakRight !== this._renderedPeakRight
            || this._trailLeft !== this._renderedTrailLeft
            || this._trailRight !== this._renderedTrailRight
        );

        if (this._resized) {
            this.element.width = this._width;
            this.element.height = this._height;
            this.element.style.width = this._width + "px";
            this.element.style.height = this._height + "px";
            this._resized = false;
            cleared = true;
            dirty = true;
        }

        const width: number = this._width;
        const halfWidth: number = width * 0.5;
        const height: number = this._height;
        const context: CanvasRenderingContext2D = this._context;

        if (!dirty) {
            return;
        }

        if (!cleared) {
            context.clearRect(0, 0, width, height);
            cleared = true;
        }

        const trailSize: number = this._trailSize;
        const verticalRange: number = (height + 1) + trailSize;

        const peakLeft: number = clamp(this._peakLeft, 0, 1);
        const peakRight: number = clamp(this._peakRight, 0, 1);
        const trailLeft: number = clamp(this._trailLeft, 0, 1);
        const trailRight: number = clamp(this._trailRight, 0, 1);

        const leftX: number = 0;
        const leftW: number = halfWidth - 1;
        const leftY0: number = ((1.0 - peakLeft) * verticalRange + trailSize) | 0;
        const leftY1: number = (height + trailSize) | 0;
        const leftY: number = leftY0;
        const leftH: number = leftY1 - leftY0;

        const trailLeftX: number = leftX;
        const trailLeftW: number = leftW;
        const trailLeftY1: number = ((1.0 - trailLeft) * verticalRange + trailSize) | 0;
        const trailLeftY0: number = (trailLeftY1 - trailSize) | 0;
        const trailLeftY: number = trailLeftY0;
        const trailLeftH: number = trailLeftY1 - trailLeftY0;

        const rightX: number = leftX + leftW + 1;
        const rightW: number = halfWidth - 1;
        const rightY0: number = ((1.0 - peakRight) * verticalRange + trailSize) | 0;
        const rightY1: number = (height + trailSize) | 0;
        const rightY: number = rightY0;
        const rightH: number = rightY1 - rightY0;

        const trailRightX: number = rightX;
        const trailRightW: number = rightW;
        const trailRightY1: number = ((1.0 - trailRight) * verticalRange + trailSize) | 0;
        const trailRightY0: number = (trailRightY1 - trailSize) | 0;
        const trailRightY: number = trailRightY0;
        const trailRightH: number = trailRightY1 - trailRightY0;

        // @TODO: Only set this when needed.
        context.fillStyle = "#28f16b";

        if (leftY < height) {
            context.fillRect(leftX, leftY, leftW, leftH);
        }
        if (trailLeftY < height) {
            context.fillRect(trailLeftX, trailLeftY, trailLeftW, trailLeftH);
        }
        if (rightY < height) {
            context.fillRect(rightX, rightY, rightW, rightH);
        }
        if (trailRightY < height) {
            context.fillRect(trailRightX, trailRightY, trailRightW, trailRightH);
        }

        this._renderedPeakLeft = this._peakLeft;
        this._renderedPeakRight = this._peakRight;
        this._renderedTrailLeft = this._trailLeft;
        this._renderedTrailRight = this._trailRight;
    }

    /** The values are expected to be normalized (i.e. in the range [0, 1]). */
    public setState(
        peakLeft: number,
        peakRight: number,
        trailLeft: number,
        trailRight: number,
    ): void {
        // @TODO: Take bytes instead?
        this._peakLeft = peakLeft;
        this._peakRight = peakRight;
        this._trailLeft = trailLeft;
        this._trailRight = trailRight;
    }

    public setHeight(height: number): void {
        const changed: boolean = height !== this._height;
        if (changed) {
            this._height = height;
            this._resized = true;
        }
    }
}
