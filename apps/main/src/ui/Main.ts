import { H } from "@synth-playground/browser/dom.js";
import { SongDocument } from "../SongDocument.js";
import { type ManualComponent } from "./types.js";
import { DockablePanel } from "./dockable/DockablePanel.js";
import { UIContext } from "./UIContext.js";
import {
    LocalizationManager,
    computeLanguageIdForPreferredLanguage,
} from "../localization/LocalizationManager.js";
import { LanguageId } from "../localization/LanguageId.js";
import { StringId } from "../localization/StringId.js";
import { ActionKind, ActionResponse } from "./input/actions.js";
import { type OperationContext } from "./input/operations.js";
import { gestureToString } from "./input/gestures.js";
import { InputManager } from "./input/InputManager.js";
import { DialogManager } from "./dialog/DialogManager.js";
import { AboutDialog } from "./dialogs/AboutDialog.js";
import { VirtualizedListTestDialog } from "./dialogs/VirtualizedListTestDialog.js";
import { VirtualizedTreeTestDialog } from "./dialogs/VirtualizedTreeTestDialog.js";
import { type AppContext, type LoadedSample } from "../AppContext.js";
import { MenuBar } from "./basic/MenuBar.js";
import { CommandPalette } from "./commandPalette/CommandPalette.js";
import { DockablePanelTab } from "./dockable/DockablePanelTab.js";
import { EmptyPanel } from "./dockable/EmptyPanel.js";
import { OscilloscopePanel } from "./dockable/OscilloscopePanel.js";
import { SpectrumAnalyzerPanel } from "./dockable/SpectrumAnalyzerPanel.js";
import { SpectrogramPanel } from "./dockable/SpectrogramPanel.js";
import { DebugInfoPanel } from "./dockable/DebugInfoPanel.js";
import { TransportPanel } from "./dockable/TransportPanel.js";
import { TimelinePanel } from "./dockable/TimelinePanel.js";
import { PianoRollPanel } from "./dockable/PianoRollPanel.js";
import {
    createDockview,
    DockviewApi,
    themeVisualStudio,
    type IContentRenderer,
    type SerializedDockview,
    type GroupPanelViewState,
    type SerializedGridObject,
    // type IDockviewPanel,
} from "dockview-core";
import { DockPanel } from "./basic/DockPanel.js";
import { DockStack } from "./basic/DockStack.js";

// For now, bump this once changes are made, to effectively clear the saved
// dockable panel layout.
const SERIALIZED_DOCKVIEW_VERSION = 5;

// @TODO: Generalize this properly.
// Current idea is to have a "panel registry", which will be stored inside the
// Main component. Each entry will have the relevant info, plus a factory
// function (the reason it will be defined inside the Main component is because
// some components need access to the UI context, and the constructor arguments
// can vary, so we can't just always pass the same arguments for everything).
// A thing I'm unsure about right now is what to do with IDs: I don't have any
// case where a panel can have multiple instances, but I may need that in the
// future. That will need to be defined a bit differently.
const DOCKABLE_PANEL_IDS: Record<string, boolean> = {
    "pianoRollPanel": true,
    "timelinePanel": true,
    "transportPanel": true,
    "debugInfoPanel": true,
    "oscilloscopePanel": true,
    "spectrumAnalyzerPanel": true,
    "spectrogramPanel": true,
};

export class Main implements ManualComponent {
    public element: HTMLDivElement;

    private _doc: SongDocument;
    private _ui: UIContext;
    private _app: AppContext;
    private _mounted: boolean;
    private _menuContainer: HTMLDivElement;
    private _menuBar: MenuBar;
    private _dockviewContainer: HTMLDivElement;
    private _dockview: DockviewApi;
	private _ffDock: DockStack;
    // @TODO: Store something here so we can update the titles when the language
    // changes. Probably the ID is enough, then we can just use a switch.
    // Ideally, the panel tab thing would be hooked up with the localization
    // manager so we could move this logic there.
    private _renderablePanels: IContentRenderer[];
    private _commandPaletteContainer: HTMLDivElement;
    private _commandPalette: CommandPalette;

    constructor() {
        this.element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `,
        });

        this._dockviewContainer = H("div", {
            style: `
                width: 100%;
                height: 100%;
                overflow: hidden;
                /* Isolate dockview into its own stacking context. */
                position: relative;
                z-index: 1;
            `,
        });

		// TODO: tests! Remove
		const dpTest = new DockPanel("TestA", true, true);
		const dpTest2 = new DockPanel("TestB", true, true);
		dpTest.element.appendChild(document.createTextNode("Contents of panel A."));
		dpTest2.element.appendChild(document.createTextNode("Contents of panel B."));
		this._ffDock = new DockStack();
		this._ffDock.insertPanel(dpTest);
		this._ffDock.insertPanel(dpTest2);

        this._ui = new UIContext(
            (timestamp: number): void => { this.render(); },
            new InputManager(
                this._dockviewContainer,
                this._onGlobalAction,
                this._shouldBlockActions,
            ),
            new LocalizationManager(),
            new DialogManager(),
        );

        this._ui.localizationManager.setLanguage(computeLanguageIdForPreferredLanguage());
        this._ui.localizationManager.populateStringTable();

        this._doc = new SongDocument();

        this._doc.onProjectChanged.addListener(this._onProjectChanged);
        this._doc.onStartedPlaying.addListener(this._onStartedPlaying);
        this._doc.onStoppedPlaying.addListener(this._onStoppedPlaying);
        this._doc.onStartedPlayingPianoNote.addListener(this._onStartedPlayingPianoNote);
        this._doc.onStoppedPlayingPianoNote.addListener(this._onStoppedPlayingPianoNote);

        this._mounted = false;
        this._renderablePanels = [];

        this._app = {
            doc: this._doc,
            ui: this._ui,
            showAboutDialog: () => {
                this._ui.dialogManager.show(new AboutDialog(this._ui), {
                    dismissable: true,
                });

                this._ui.scheduleMainRender();
            },
            showVirtualizedListTestDialog: () => {
                this._ui.dialogManager.show(new VirtualizedListTestDialog(this._ui), {
                    dismissable: true,
                });

                this._ui.scheduleMainRender();
            },
            showVirtualizedTreeTestDialog: () => {
                this._ui.dialogManager.show(new VirtualizedTreeTestDialog(this._ui), {
                    dismissable: true,
                });

                this._ui.scheduleMainRender();
            },
            showTimelinePanel: () => {
                const existing = this._dockview.getPanel("timelinePanel");
                if (existing != null) {
                    existing.api.setActive();
                } else {
                    this._dockview.addPanel({
                        id: "timelinePanel",
                        component: "TimelinePanel",
                        renderer: "always",
                        title: this._ui.T(StringId.TimelinePanelTitle),
                    });
                }
            },
            showPianoRollPanel: () => {
                const existing = this._dockview.getPanel("pianoRollPanel");
                if (existing != null) {
                    existing.api.setActive();
                } else {
                    this._dockview.addPanel({
                        id: "pianoRollPanel",
                        component: "PianoRollPanel",
                        renderer: "always",
                        title: this._ui.T(StringId.PianoRollPanelTitle),
                    });
                }
            },
            showTransportPanel: () => {
                const existing = this._dockview.getPanel("transportPanel");
                if (existing != null) {
                    existing.api.setActive();
                } else {
                    this._dockview.addPanel({
                        id: "transportPanel",
                        component: "TransportPanel",
                        renderer: "always",
                        title: this._ui.T(StringId.TransportPanelTitle),
                    });
                }
            },
            showOscilloscopePanel: () => {
                const existing = this._dockview.getPanel("oscilloscopePanel");
                if (existing != null) {
                    existing.api.setActive();
                } else {
                    this._dockview.addPanel({
                        id: "oscilloscopePanel",
                        component: "OscilloscopePanel",
                        renderer: "always",
                        title: this._ui.T(StringId.OscilloscopePanelTitle),
                    });
                }
            },
            showSpectrumAnalyzerPanel: () => {
                const existing = this._dockview.getPanel("spectrumAnalyzerPanel");
                if (existing != null) {
                    existing.api.setActive();
                } else {
                    this._dockview.addPanel({
                        id: "spectrumAnalyzerPanel",
                        component: "SpectrumAnalyzerPanel",
                        renderer: "always",
                        title: this._ui.T(StringId.SpectrumAnalyzerPanelTitle),
                    });
                }
            },
            showSpectrogramPanel: () => {
                const existing = this._dockview.getPanel("spectrogramPanel");
                if (existing != null) {
                    existing.api.setActive();
                } else {
                    this._dockview.addPanel({
                        id: "spectrogramPanel",
                        component: "SpectrogramPanel",
                        renderer: "always",
                        title: this._ui.T(StringId.SpectrogramPanelTitle),
                    });
                }
            },
            showDebugInfoPanel: () => {
                const existing = this._dockview.getPanel("debugInfoPanel");
                if (existing != null) {
                    existing.api.setActive();
                } else {
                    this._dockview.addPanel({
                        id: "debugInfoPanel",
                        component: "DebugInfoPanel",
                        renderer: "always",
                        title: this._ui.T(StringId.DebugInfoPanelTitle),
                    });
                }
            },
            showCommandPalette: () => {
                this._commandPalette.show();
            },
            changeLanguage: async (language: LanguageId): Promise<void> => {
                this._ui.localizationManager.setLanguage(language);
                const changed: boolean = await this._ui.localizationManager.populateStringTable();
                if (changed) {
                    this._ui.scheduleMainRender();
                }
            },
            loadSampleFromFile: async (file: File): Promise<LoadedSample> => {
                if (this._doc.audioContext == null) {
                    await this._doc.createAudioContext();
                }

                if (this._doc.audioContext == null) {
                    throw new Error("Audio context is not available");
                }

                const buffer: ArrayBuffer = await file.arrayBuffer();
                const audioBuffer: AudioBuffer = await this._doc.audioContext!.decodeAudioData(buffer);
                const dataL: Float32Array = audioBuffer.getChannelData(0);
                const dataR: Float32Array = (
                    audioBuffer.numberOfChannels > 1
                    ? audioBuffer.getChannelData(1)
                    : dataL
                );
                const samplesPerSecond: number = (
                    this._doc.audioContext != null
                    ? this._doc.audioContext.sampleRate
                    : this._doc.samplesPerSecond
                );
                return { samplesPerSecond, dataL, dataR };
            },
            showImportSampleDialog: async (): Promise<LoadedSample> => {
                return new Promise(async (resolve, reject) => {
                    const fileInput: HTMLInputElement = H("input", { type: "file", style: "display: none;" });
                    document.body.appendChild(fileInput);
                    fileInput.addEventListener("input", async () => {
                        if (fileInput.files == null || fileInput.files.length < 1) {
                            return;
                        }

                        const file: File = fileInput.files[0];
                        const loadedSample: LoadedSample = await this._app.loadSampleFromFile(file);

                        fileInput.remove();

                        resolve(loadedSample);
                    }, { once: true });
                    fileInput.click();
                });
            },
        };

        this._menuContainer = H("div", {
            style: `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 1;
            `,
        });
        this._commandPaletteContainer = H("div", {
            style: `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 1;
            `,
        });
        this._commandPalette = new CommandPalette(this._app, this._commandPaletteContainer);
        this._menuBar = new MenuBar(this._ui, this._menuContainer, [
            {
                label: StringId.FileMenu,
                children: [
                    {
                        label: StringId.FileMenuImportSample,
                        onClick: () => { this._ui.inputManager.executeAction(ActionKind.TimelineImportSample); },
                    },
                ],
            },
            {
                label: StringId.ViewMenu,
                children: [
                    {
                        label: StringId.ViewMenuCommandPalette,
                        // @TODO: Run gestureToString as late as possible.
                        shortcut: gestureToString(this._ui.inputManager.getPrimaryShortcutByAction(
                            ActionKind.OpenCommandPalette
                        )),
                        onClick: () => { this._app.showCommandPalette(); },
                    },
                    { separator: true },
                    {
                        label: StringId.ViewMenuTimeline,
                        getCheckedStatus: () => this._dockview.getPanel("timelinePanel") != null,
                        onClick: () => { this._app.showTimelinePanel(); },
                    },
                    {
                        label: StringId.ViewMenuPianoRoll,
                        getCheckedStatus: () => this._dockview.getPanel("pianoRollPanel") != null,
                        onClick: () => { this._app.showPianoRollPanel(); },
                    },
                    {
                        label: StringId.ViewMenuTransport,
                        getCheckedStatus: () => this._dockview.getPanel("transportPanel") != null,
                        onClick: () => { this._app.showTransportPanel(); },
                    },
                    { separator: true },
                    {
                        label: StringId.ViewMenuOscilloscope,
                        getCheckedStatus: () => this._dockview.getPanel("oscilloscopePanel") != null,
                        onClick: () => { this._app.showOscilloscopePanel(); },
                    },
                    {
                        label: StringId.ViewMenuSpectrumAnalyzer,
                        getCheckedStatus: () => this._dockview.getPanel("spectrumAnalyzerPanel") != null,
                        onClick: () => { this._app.showSpectrumAnalyzerPanel(); },
                    },
                    {
                        label: StringId.ViewMenuSpectrogram,
                        getCheckedStatus: () => this._dockview.getPanel("spectrogramPanel") != null,
                        onClick: () => { this._app.showSpectrogramPanel(); },
                    },
                    { separator: true },
                    {
                        label: StringId.ViewMenuDebugInfo,
                        getCheckedStatus: () => this._dockview.getPanel("debugInfoPanel") != null,
                        onClick: () => { this._app.showDebugInfoPanel(); },
                    },
                ],
            },
            {
                label: "Tests" as StringId,
                children: [
                    {
                        label: "Virtualized list test" as StringId,
                        onClick: () => { this._app.showVirtualizedListTestDialog(); },
                    },
                    {
                        label: "Virtualized tree test" as StringId,
                        onClick: () => { this._app.showVirtualizedTreeTestDialog(); },
                    },
                ],
            },
            {
                label: StringId.HelpMenu,
                children: [
                    {
                        label: StringId.HelpMenuAbout,
                        onClick: () => { this._app.showAboutDialog(); },
                    },
                ],
            },
        ]);
        this.element.appendChild(this._menuBar.element);
        this.element.appendChild(this._dockviewContainer);
		this.element.appendChild(this._ffDock.element);
        this.element.appendChild(this._commandPaletteContainer);
        this.element.appendChild(this._menuContainer);
        this.element.appendChild(this._ui.dialogManager.container);

        this._dockview = createDockview(this._dockviewContainer, {
            disableTabsOverflowList: true,
            // @TODO: Re-enable after the corner resizing bug is fixed.
            // floatingGroupBounds: "boundedWithinViewport",

            disableFloatingGroups: true,

            theme: themeVisualStudio,
            defaultTabComponent: "DockablePanelTab",
            createTabComponent: (options) => {
                return new DockablePanelTab();
            },

            createComponent: (options) => {
                let panel: IContentRenderer | null = null;

                switch (options.name) {
                    case "TimelinePanel": { panel = new TimelinePanel(this._app, this._doc); } break;
                    case "PianoRollPanel": { panel = new PianoRollPanel(this._app, this._doc); } break;
                    case "TransportPanel": { panel = new TransportPanel(this._ui, this._doc); } break;
                    case "OscilloscopePanel": { panel = new OscilloscopePanel(this._ui, this._doc); } break;
                    case "SpectrumAnalyzerPanel": { panel = new SpectrumAnalyzerPanel(this._ui, this._doc); } break;
                    case "SpectrogramPanel": { panel = new SpectrogramPanel(this._ui, this._doc); } break;
                    case "DebugInfoPanel": { panel = new DebugInfoPanel(this._ui, this._doc); } break;
                    default: { panel = new EmptyPanel(); } break;
                }

                return panel;
            },
        });

        function filterSerializedDockview(input: SerializedDockview): SerializedDockview {
            function recursiveFilter(
                data: SerializedGridObject<GroupPanelViewState>,
            ): SerializedGridObject<GroupPanelViewState> | null {
                let output: SerializedGridObject<GroupPanelViewState>
                switch (data.type) {
                        case "branch":
                            const outputData: SerializedGridObject<GroupPanelViewState>[] = [];
                        for (const item of (data.data as SerializedGridObject<GroupPanelViewState>[])) {
                            const filtered = recursiveFilter(item);
                            if (filtered != null) {
                                outputData.push(filtered);
                            }
                        }
                        if (outputData.length <= 0) {
                            return null;
                        }
                        output = {
                            type: "branch",
                            data: outputData,
                        };
                        if (data.size != null) {
                            output.size = data.size;
                        }
                        if (data.visible != null) {
                            output.visible = data.visible;
                        }
                        return output;
                    case "leaf":
                        const item: GroupPanelViewState = data.data as GroupPanelViewState;
                        const outputData2: GroupPanelViewState = {
                            id: item.id,
                            views: item.views.filter(x => DOCKABLE_PANEL_IDS[x] != null),
                        };
                        if (outputData2.views.length <= 0) {
                            return null;
                        }
                        output = {
                            type: "leaf",
                            data: outputData2,
                        };
                        if (data.size != null) {
                            output.size = data.size;
                        }
                        if (data.visible != null) {
                            output.visible = data.visible;
                        }
                        return output;
                    default:
                        data.type satisfies never // catch missing cases in TS
                        return null;
                }
            }

            const output: SerializedDockview = {
                grid: {
                    root: recursiveFilter(input.grid.root) ?? {
                        type: "branch",
                        data: [],
                    },
                    width: input.grid.width,
                    height: input.grid.height,
                    orientation: input.grid.orientation,
                },
                panels: Object.fromEntries(
                    Object
                    .entries(input.panels)
                    .filter(([k, v]) => DOCKABLE_PANEL_IDS[k] != null)
                ),
            };
            if (input.activeGroup != null) {
                output.activeGroup = input.activeGroup;
            }
            if (input.floatingGroups != null) {
                const floatingGroups = [];
                for (const group of input.floatingGroups) {
                    const data: GroupPanelViewState = {
                        views: group.data.views.filter(x => DOCKABLE_PANEL_IDS[x] != null),
                        id: group.data.id,
                    };
                    if (group.data.activeView != null && DOCKABLE_PANEL_IDS[group.data.activeView] != null) {
                        data.activeView = group.data.activeView;
                    }
                    if (data.views.length > 0) {
                        floatingGroups.push({
                            data: data,
                            position: group.position,
                        });
                    }
                }
                if (floatingGroups.length > 0) output.floatingGroups = floatingGroups;
            }

            return output;
        }

        this._dockview.onDidLayoutChange(() => {
            this._ui.scheduleMainRender();

            // @TODO: Throttle this more?
            const payload = {
                "version": SERIALIZED_DOCKVIEW_VERSION,
                "data": filterSerializedDockview(this._dockview.toJSON()),
            };
            localStorage.setItem("serializedDockview", JSON.stringify(payload));
        });

        this._dockview.onDidAddPanel((panel) => {
            this._renderablePanels.push(panel.view.content);

            if (this._mounted) {
                this._ui.scheduleMainRender();
            }
        })
        this._dockview.onDidRemovePanel((panel) => {
            const index: number = this._renderablePanels.indexOf(panel.view.content);
            if (index !== -1) {
                this._renderablePanels.splice(index, 1);
            }

            if (this._mounted) {
                this._ui.scheduleMainRender();
            }
        });
        this._dockview.onWillDragGroup((event) => {
            const panels = event.group.panels;
            if (panels.length === 1 && DOCKABLE_PANEL_IDS[panels[0].id] == null) {
                event.nativeEvent.preventDefault();
                return;
            }

            // @TODO: Do I need to handle more cases here?
        });
        this._dockview.onWillDragPanel((event) => {
            if (DOCKABLE_PANEL_IDS[event.panel.id] == null) {
                event.nativeEvent.preventDefault();
                return;
            }
        });
        this._dockview.onWillShowOverlay((event) => {
            if (event.panel != null && DOCKABLE_PANEL_IDS[event.panel.id] == null) {
                event.preventDefault();
                return;
            }
        });
        this._dockview.onDidActivePanelChange((newPanel) => {
            if (newPanel != null) {
                this._ui.inputManager.setActivePanel(newPanel.id);
            } else {
                this._ui.inputManager.setActivePanel(undefined);
            }
        });

        window.addEventListener("resize", this._onWindowResize);
        window.addEventListener("keydown", this._handleKeyDown);
        window.addEventListener("drop", this._onWindowDrop);
        window.addEventListener("dragover", this._onWindowDragOver);
    }

    public dispose(): void {
        if (this._mounted) {
            this._mounted = false;
            this._ui.inputManager.unregisterListeners();
        }
        window.removeEventListener("resize", this._onWindowResize);
        window.removeEventListener("keydown", this._handleKeyDown);
        window.removeEventListener("drop", this._onWindowDrop);
        window.removeEventListener("dragover", this._onWindowDragOver);
        this._doc.destroyAudioContext();
        this._commandPalette.dispose();
        this._menuBar.dispose();
    }

    public onDidMount(): void {
        this._mounted = true;

        this._dockview.layout(this._dockviewContainer.clientWidth, this._dockviewContainer.clientHeight, true);

        // This has to be done after calling .layout to work properly.
        const serializedDockview: string | null = localStorage.getItem("serializedDockview");
        if (serializedDockview != null && serializedDockview !== "") {
            const payload = JSON.parse(serializedDockview);
            if (payload["version"] === SERIALIZED_DOCKVIEW_VERSION) {
                this._dockview.fromJSON(payload["data"]);
            }
        }

        this._ui.inputManager.registerListeners();
    }

    public render(): void {
        if (!this._mounted) {
            this.onDidMount();
        }

        this._menuBar.render();

        const panelCount: number = this._renderablePanels.length;
        for (let panelIndex: number = 0; panelIndex < panelCount; panelIndex++) {
            const panel: IContentRenderer = this._renderablePanels[panelIndex];
            if (panel instanceof DockablePanel) {
                panel.render();
            }
        }

        this._commandPalette.render();

        this._ui.dialogManager.render();
    }

    private _shouldBlockActions = (): boolean => {
        return this._ui.dialogManager.hasDialogsOpen();
    };

    private _onGlobalAction = (kind: ActionKind, operationContext: OperationContext): ActionResponse => {
        switch (kind) {
            case ActionKind.TogglePlay: {
                this._doc.togglePlaying();
                return ActionResponse.Done;
            };
            case ActionKind.Play: {
                this._doc.startPlaying();
                return ActionResponse.Done;
            };
            case ActionKind.Stop: {
                this._doc.stopPlaying();
                return ActionResponse.Done;
            };
            case ActionKind.SeekToStart: {
                this._doc.seekAndMoveTimeCursor(0);
                this._ui.scheduleMainRender();
                return ActionResponse.Done;
            };
            case ActionKind.SeekToEnd: {
                this._doc.seekAndMoveTimeCursor(this._doc.project.song.duration - 1);
                this._ui.scheduleMainRender();
                return ActionResponse.Done;
            };
            case ActionKind.OpenCommandPalette: {
                this._app.showCommandPalette();
                return ActionResponse.Done;
            };
            case ActionKind.About: {
                this._app.showAboutDialog();
                return ActionResponse.Done;
            };
            case ActionKind.ShowDebugInfoPanel: {
                this._app.showDebugInfoPanel();
                return ActionResponse.Done;
            };
            case ActionKind.ShowOscilloscopePanel: {
                this._app.showOscilloscopePanel();
                return ActionResponse.Done;
            };
            case ActionKind.ShowPianoRollPanel: {
                this._app.showPianoRollPanel();
                return ActionResponse.Done;
            };
            case ActionKind.ShowSpectrogramPanel: {
                this._app.showSpectrogramPanel();
                return ActionResponse.Done;
            };
            case ActionKind.ShowSpectrumAnalyzerPanel: {
                this._app.showSpectrumAnalyzerPanel();
                return ActionResponse.Done;
            };
            case ActionKind.ShowTimelinePanel: {
                this._app.showTimelinePanel();
                return ActionResponse.Done;
            };
            case ActionKind.ShowTransportPanel: {
                this._app.showTransportPanel();
                return ActionResponse.Done;
            };
        }

        return ActionResponse.NotApplicable;
    };

    private _isAnimating(): boolean {
        return this._doc.playing || this._doc.playingPianoNote;
    }

    private _onWindowResize = (): void => {};

    private _onWindowDragOver = (event: DragEvent): void => {
        event.preventDefault();
    };

    private _onWindowDrop = (event: DragEvent): void => {
        event.preventDefault();
    };

    // @TODO: I'm not really sure what to do with this. This maybe should be
    // somewhere inside the input manager but it's awkward to pass this there.
    private _handleKeyDown = (event: KeyboardEvent): void => {
        if (this._ui.dialogManager.hasDialogsOpen()) {
            switch (event.key) {
                case "Escape": {
                    this._ui.dialogManager.closeTopmostDialog();
                    this._ui.scheduleMainRender();
                } break;
            }
        }
    };

    private _onProjectChanged = (): void => {
        this._ui.scheduleMainRender();
    };

    private _onStartedPlaying = (): void => {
        this._ui.setAnimationStatus(this._isAnimating());
    };

    private _onStoppedPlaying = (): void => {
        this._ui.setAnimationStatus(this._isAnimating());
    };

    private _onStartedPlayingPianoNote = (): void => {
        this._ui.setAnimationStatus(this._isAnimating());
    };

    private _onStoppedPlayingPianoNote = (): void => {
        this._ui.setAnimationStatus(this._isAnimating());
    };
}
