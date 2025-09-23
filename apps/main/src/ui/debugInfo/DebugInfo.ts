import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import { SongDocument } from "../../SongDocument.js";
import * as LongId from "@synth-playground/common/LongId.js";
import * as Project from "@synth-playground/synthesizer/data/Project.js";
import * as Song from "@synth-playground/synthesizer/data/Song.js";

class DebugInfoRow<T> implements Component {
    public element: HTMLDivElement;

    private _valueDisplay: HTMLSpanElement;
    private _value: T;
    private _formatValue: (value: T) => string;
    private _prefixDisplay: HTMLSpanElement;
    private _prefix: Node | string;

    private _renderedValue: T | undefined;
    private _renderedPrefix: (Node | string) | null;

    constructor(
        initialValue: T,
        prefix: Node | string,
        formatValue: (value: T) => string
    ) {
        this._value = initialValue;
        this._renderedValue = undefined;
        this._formatValue = formatValue;
        this._prefix = prefix;
        this._renderedPrefix = prefix;
        this._prefixDisplay = H("span", {}, this._prefix);
        this._valueDisplay = H("span", {}, this._formatValue(initialValue));
        this.element = H("div", {}, this._prefixDisplay, this._valueDisplay);
    }

    public dispose(): void {}

    public render(): void {
        if (this._prefix !== this._renderedPrefix) {
            if (this._prefix instanceof Node) {
                while (this._prefixDisplay.firstChild != null) {
                    this._prefixDisplay.firstChild.remove();
                }
                this._prefixDisplay.appendChild(this._prefix);
            } else {
                this._prefixDisplay.textContent = this._prefix;
            }
            this._renderedPrefix = this._prefix;
        }

        if (this._value !== this._renderedValue) {
            this._valueDisplay.textContent = this._formatValue(this._value);
            this._renderedValue = this._value;
        }
    }

    public setPrefix(value: Node | string): void {
        this._prefix = value;
    }

    public setValue(value: T): void {
        this._value = value;
    }
}

export class DebugInfo implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _doc: SongDocument;
    private _timeTakenDisplay: DebugInfoRow<number>;
    private _sampleRateDisplay: DebugInfoRow<number | undefined>;
    private _baseLatencyDisplay: DebugInfoRow<number | undefined>;
    private _outputLatencyDisplay: DebugInfoRow<number | undefined>;
    private _crossOriginIsolatedDisplay: DebugInfoRow<boolean>;
    private _estimatedStorageUsageDisplay: DebugInfoRow<number | undefined>;
    private _estimatedStorageQuotaDisplay: DebugInfoRow<number | undefined>;
    private _estimatedStorageDetails: StorageEstimate | null;
    private _devicePixelRatioDisplay: DebugInfoRow<number>;
    private _clipIdGeneratorDisplay: DebugInfoRow<BigInt>;
    private _patternIdGeneratorDisplay: DebugInfoRow<BigInt>;
    private _noteIdGeneratorDisplays: DebugInfoRow<BigInt>[];
    private _noteIdGeneratorContainer: HTMLDivElement;

    constructor(ui: UIContext, doc: SongDocument) {
        this._ui = ui;
        this._doc = doc;

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
        this._clipIdGeneratorDisplay = new DebugInfoRow<BigInt>(
            /* initialValue */ LongId.toBigInt(this._doc.project.clipIdGenerator),
            /* prefix */ `Clip ID generator: `,
            /* formatValue */ value => (value.toString()),
        );
        this._patternIdGeneratorDisplay = new DebugInfoRow<BigInt>(
            /* initialValue */ LongId.toBigInt(this._doc.project.patternIdGenerator),
            /* prefix */ `Pattern ID generator: `,
            /* formatValue */ value => (value.toString()),
        );
        this._noteIdGeneratorDisplays = [];
        this._noteIdGeneratorContainer = H("div", {});
        this._estimatedStorageDetails = null;
        window.navigator.storage.estimate().then((estimate) => {
            this._estimatedStorageDetails = estimate;
            this._ui.scheduleMainRender();
        });

        this.element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                overflow: auto;
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
            this._clipIdGeneratorDisplay.element,
            this._patternIdGeneratorDisplay.element,
            this._noteIdGeneratorContainer,
        );
    }

    public dispose(): void {}

    public render(): void {
        this._timeTakenDisplay.setValue(this._doc.getTimeTaken(this._ui.frame));
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

        const project: Project.Type = this._doc.project;
        const song: Song.Type = project.song;
        const patternCount: number = song.patterns.length;
        const noteIdGenerators: LongId.Type[] = project.noteIdGeneratorsByPatternIndex;

        this._clipIdGeneratorDisplay.setValue(LongId.toBigInt(project.clipIdGenerator));
        this._clipIdGeneratorDisplay.render();

        this._patternIdGeneratorDisplay.setValue(LongId.toBigInt(project.patternIdGenerator));
        this._patternIdGeneratorDisplay.render();

        if (patternCount !== this._noteIdGeneratorDisplays.length) {
            // @TODO: Actual list reconciliation here.
            while (this._noteIdGeneratorContainer.firstChild != null) {
                this._noteIdGeneratorContainer.firstChild.remove();
            }
            while (patternCount > this._noteIdGeneratorDisplays.length) {
                const index: number = this._noteIdGeneratorDisplays.length;
                const noteIdGeneratorDisplay: DebugInfoRow<BigInt> = new DebugInfoRow<BigInt>(
                    /* initialValue */ LongId.toBigInt(noteIdGenerators[index]),
                    /* prefix */ `Note ID generator for pattern ${index}: `,
                    /* formatValue */ value => (value.toString()),
                );
                this._noteIdGeneratorDisplays.push(noteIdGeneratorDisplay);
            }
            this._noteIdGeneratorDisplays.length = patternCount;
            for (let index: number = 0; index < this._noteIdGeneratorDisplays.length; index++) {
                const row: DebugInfoRow<BigInt> = this._noteIdGeneratorDisplays[index];
                this._noteIdGeneratorContainer.appendChild(row.element);
            }
        }
        for (let index: number = 0; index < patternCount; index++) {
            const row: DebugInfoRow<BigInt> = this._noteIdGeneratorDisplays[index];
            row.setPrefix(`Note ID generator for pattern ${index}: `);
            row.setValue(LongId.toBigInt(noteIdGenerators[index]));
            row.render();
        }
    }
}
