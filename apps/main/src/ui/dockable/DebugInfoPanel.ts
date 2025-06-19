import { H } from "@synth-playground/dom/index.js";
import { type DockablePanel } from "./types.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import {
    type GroupPanelPartInitParameters,
    type DockviewIDisposable,
} from "dockview-core";
import { SongDocument } from "../../SongDocument.js";

class DebugInfoRow<T> implements Component {
    public element: HTMLDivElement;
    private _valueDisplay: HTMLSpanElement;
    private _value: T;
    private _renderedValue: T | undefined;
    private _formatValue: (value: T) => string;

    constructor(
        initialValue: T,
        prefix: Node | string,
        formatValue: (value: T) => string
    ) {
        this._value = initialValue;
        this._renderedValue = undefined;
        this._formatValue = formatValue;
        this._valueDisplay = H("span", {}, this._formatValue(initialValue));
        this.element = H("div", {},
            H("span", {}, prefix),
            this._valueDisplay,
        );
    }

    public dispose(): void {}

    public render(): void {
        if (this._value !== this._renderedValue) {
            this._valueDisplay.textContent = this._formatValue(this._value);
            this._renderedValue = this._value;
        }
    }

    public setValue(value: T): void {
        this._value = value;
    }
}

// @TODO: Move the inner code here to a `DebugInfo` component.
export class DebugInfoPanel implements DockablePanel {
    private _ui: UIContext;
    private _element: HTMLDivElement;
    private _onDidVisibilityChange: DockviewIDisposable | null;
    private _visible: boolean;
    private _timeTakenDisplay: DebugInfoRow<number>;
    private _sampleRateDisplay: DebugInfoRow<number | undefined>;
    private _baseLatencyDisplay: DebugInfoRow<number | undefined>;
    private _outputLatencyDisplay: DebugInfoRow<number | undefined>;
    private _crossOriginIsolatedDisplay: DebugInfoRow<boolean>;
    private _estimatedStorageUsageDisplay: DebugInfoRow<number | undefined>;
    private _estimatedStorageQuotaDisplay: DebugInfoRow<number | undefined>;
    private _estimatedStorageDetails: StorageEstimate | null;
    private _devicePixelRatioDisplay: DebugInfoRow<number>;
    private _idGeneratorDisplay: DebugInfoRow<BigInt>;
    private _doc: SongDocument;
    private _setActive: (() => void) | null;

    constructor(
        ui: UIContext,
        doc: SongDocument
    ) {
        this._ui = ui;
        this._doc = doc;

        this._visible = false;
        this._onDidVisibilityChange = null;

        this._setActive = null;

        this._timeTakenDisplay = new DebugInfoRow<number>(
            /* initialValue */ 0,
            /* prefix */ "Time taken to synthesize 128 samples: ",
            /* formatValue */ value => (value + "ms"),
        );
        this._sampleRateDisplay = new DebugInfoRow<number | undefined>(
            /* initialValue */ undefined,
            /* prefix */ H("span", {}, H("a", {
                href: "https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate",
                target: "_blank",
            }, "Sample rate:"), " "),
            /* formatValue */ value => (value != null ? value + "hz" : "N/A"),
        );
        this._baseLatencyDisplay = new DebugInfoRow<number | undefined>(
            /* initialValue */ undefined,
            /* prefix */ H("span", {}, H("a", {
                href: "https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency",
                target: "_blank",
            }, "Base latency:"), " "),
            /* formatValue */ value => (value != null ? value + "s" : "N/A"),
        );
        this._outputLatencyDisplay = new DebugInfoRow<number | undefined>(
            /* initialValue */ undefined,
            /* prefix */ H("span", {}, H("a", {
                href: "https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency",
                target: "_blank",
            }, "Output latency:"), " "),
            /* formatValue */ value => (value != null ? value + "s" : "N/A"),
        );
        this._crossOriginIsolatedDisplay = new DebugInfoRow<boolean>(
            /* initialValue */ window.crossOriginIsolated,
            /* prefix */ H("span", {}, H("a", {
                href: "https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated",
                target: "_blank",
            }, "Cross-origin isolated:"), " "),
            /* formatValue */ value => (value + ""),
        );
        this._estimatedStorageUsageDisplay = new DebugInfoRow<number | undefined>(
            /* initialValue */ undefined,
            /* prefix */ H("span", {}, H("a", {
                href: "https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate#usage",
                target: "_blank",
            }, "Estimated storage usage:"), " "),
            /* formatValue */ value => (value != null ? value + " bytes" : "N/A"),
        );
        this._estimatedStorageQuotaDisplay = new DebugInfoRow<number | undefined>(
            /* initialValue */ undefined,
            /* prefix */ H("span", {}, H("a", {
                href: "https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate#quota",
                target: "_blank",
            }, "Estimated storage quota:"), " "),
            /* formatValue */ value => (value != null ? value + " bytes" : "N/A"),
        );
        this._devicePixelRatioDisplay = new DebugInfoRow<number>(
            /* initialValue */ window.devicePixelRatio,
            /* prefix */ H("span", {}, H("a", {
                href: "https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio",
                target: "_blank",
            }, "Device pixel ratio:"), " "),
            /* formatValue */ value => (value + ""),
        );
        this._idGeneratorDisplay = new DebugInfoRow<BigInt>(
            /* initialValue */ this._doc.idGenerator.toBigInt(),
            /* prefix */ "ID generator: ",
            /* formatValue */ value => (value.toString()),
        );
        this._estimatedStorageDetails = null;
        window.navigator.storage.estimate().then((estimate) => {
            this._estimatedStorageDetails = estimate;
            this._ui.scheduleMainRender();
        });
        this._element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                overflow-y: auto;
            `,
        },
            this._timeTakenDisplay.element,
            this._sampleRateDisplay.element,
            this._baseLatencyDisplay.element,
            this._outputLatencyDisplay.element,
            this._crossOriginIsolatedDisplay.element,
            this._estimatedStorageUsageDisplay.element,
            this._estimatedStorageQuotaDisplay.element,
            this._devicePixelRatioDisplay.element,
            this._idGeneratorDisplay.element,
        );

        this._element.addEventListener("mousedown", this._handlePointerDown);
    }

    public get element(): HTMLElement {
        return this._element;
    }

    public init(parameters: GroupPanelPartInitParameters): void {
        this._setActive = () => { parameters.api.setActive(); };
        this._onDidVisibilityChange = parameters.api.onDidVisibilityChange(
            (event) => { this._visible = event.isVisible; }
        );
        this._visible = parameters.api.isVisible;
    }

    public dispose(): void {
        this._onDidVisibilityChange?.dispose();
        this._element.removeEventListener("mousedown", this._handlePointerDown);
        this._setActive = null;
    }

    public render(): void {
        if (!this._visible) return;

        this._timeTakenDisplay.setValue(this._doc.getTimeTaken());
        this._timeTakenDisplay.render();

        this._sampleRateDisplay.setValue(this._doc.audioContext?.sampleRate);
        this._sampleRateDisplay.render();

        this._baseLatencyDisplay.setValue(this._doc.audioContext?.baseLatency);
        this._baseLatencyDisplay.render();

        this._outputLatencyDisplay.setValue(this._doc.audioContext?.outputLatency);
        this._outputLatencyDisplay.render();

        this._estimatedStorageUsageDisplay.setValue(this._estimatedStorageDetails?.usage);
        this._estimatedStorageUsageDisplay.render();

        this._estimatedStorageQuotaDisplay.setValue(this._estimatedStorageDetails?.quota);
        this._estimatedStorageQuotaDisplay.render();

        this._devicePixelRatioDisplay.setValue(window.devicePixelRatio);
        this._devicePixelRatioDisplay.render();

        this._idGeneratorDisplay.setValue(this._doc.idGenerator.toBigInt());
        this._idGeneratorDisplay.render();
    }

    private _handlePointerDown = (event: MouseEvent): void => {
        this._setActive?.();
    };
}
