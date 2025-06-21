import { H } from "@synth-playground/dom/index.js";
import { SongDocument } from "../SongDocument.js";
import { type Component } from "./types.js";
import { type DockablePanel } from "./dockable/types.js";
import { UIContext } from "./UIContext.js";
import { MenuBar } from "./MenuBar.js";
import { DockablePanelTab } from "./dockable/DockablePanelTab.js";
import { PopupTab } from "./dockable/PopupTab.js";
import { EmptyPanel } from "./dockable/EmptyPanel.js";
import { AboutPanel } from "./dockable/AboutPanel.js";
import { OscilloscopePanel } from "./dockable/OscilloscopePanel.js";
import { SpectrumAnalyzerPanel } from "./dockable/SpectrumAnalyzerPanel.js";
import { SpectrogramPanel } from "./dockable/SpectrogramPanel.js";
import { DebugInfoPanel } from "./dockable/DebugInfoPanel.js";
import { VirtualizedListTestPanel } from "./dockable/VirtualizedListTestPanel.js";
import { VirtualizedTreeTestPanel } from "./dockable/VirtualizedTreeTestPanel.js";
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
} from "dockview-core";

// For now, bump this once changes are made, to effectively clear the saved
// dockable panel layout.
const SERIALIZED_DOCKVIEW_VERSION = 2;

// @TODO: Generalize this properly. Probably by storing something in the panel
// objects.
const DOCKABLE_PANEL_IDS: Record<string, boolean> = {
    "pianoRollPanel": true,
    "timelinePanel": true,
    "transportPanel": true,
    "debugInfoPanel": true,
    "oscilloscopePanel": true,
    "spectrumAnalyzerPanel": true,
    "spectrogramPanel": true,
};

export class Main implements Component {
    private _doc: SongDocument;

    public element: HTMLDivElement;
    private _ui: UIContext;
    private _mounted: boolean;
    private _menuContainer: HTMLDivElement;
    private _menuBar: MenuBar;
    private _dockviewContainer: HTMLDivElement;
    private _dockview: DockviewApi;
    private _renderablePanels: IContentRenderer[];
    private _renderRequest: number;
    private _animating: number;

    constructor(ui: UIContext, doc: SongDocument) {
        this._doc = doc;

        this._doc.onSongChanged.addListener(this._onSongChanged);
        this._doc.onStartedPlaying.addListener(this._onStartedPlaying);
        this._doc.onStoppedPlaying.addListener(this._onStoppedPlaying);
        this._doc.onStartedPlayingPianoNote.addListener(this._onStartedPlayingPianoNote);
        this._doc.onStoppedPlayingPianoNote.addListener(this._onStoppedPlayingPianoNote);

        this._ui = ui;
        this._mounted = false;
        this._renderablePanels = [];
        this._renderRequest = -1;
        this._animating = 0;

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
        this._menuBar = new MenuBar(
            this._ui,
            this._menuContainer,
            [
                {
                    label: "View",
                    children: [
                        {
                            label: "Timeline",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("timelinePanel") != null;
                            },
                            onClick: () => {
                                this._dockview.getPanel("timelinePanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "timelinePanel",
                                    component: "TimelinePanel",
                                    renderer: "always",
                                    title: "Timeline",
                                    floating: true,
                                });
                            },
                        },
                        {
                            label: "Piano Roll",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("pianoRollPanel") != null;
                            },
                            onClick: () => {
                                const existing = this._dockview.getPanel("pianoRollPanel");
                                if (existing != null) {
                                    existing.api.close();
                                } else {
                                    this._dockview.addPanel({
                                        id: "pianoRollPanel",
                                        component: "PianoRollPanel",
                                        renderer: "always",
                                        title: "Piano Roll",
                                        floating: true,
                                    });
                                }
                            },
                        },
                        {
                            label: "Transport",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("transportPanel") != null;
                            },
                            onClick: () => {
                                this._dockview.getPanel("transportPanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "transportPanel",
                                    component: "TransportPanel",
                                    renderer: "always",
                                    title: "Transport",
                                    floating: true,
                                });
                            },
                        },
                        { separator: true },
                        {
                            label: "Oscilloscope",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("oscilloscopePanel") != null;
                            },
                            onClick: () => {
                                this._dockview.getPanel("oscilloscopePanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "oscilloscopePanel",
                                    component: "OscilloscopePanel",
                                    renderer: "always",
                                    title: "Oscilloscope",
                                    floating: true,
                                });
                            },
                        },
                        {
                            label: "Spectrum Analyzer",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("spectrumAnalyzerPanel") != null;
                            },
                            onClick: () => {
                                this._dockview.getPanel("spectrumAnalyzerPanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "spectrumAnalyzerPanel",
                                    component: "SpectrumAnalyzerPanel",
                                    renderer: "always",
                                    title: "Spectrum Analyzer",
                                    floating: true,
                                });
                            },
                        },
                        {
                            label: "Spectrogram",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("spectrogramPanel") != null;
                            },
                            onClick: () => {
                                this._dockview.getPanel("spectrogramPanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "spectrogramPanel",
                                    component: "SpectrogramPanel",
                                    renderer: "always",
                                    title: "Spectrogram",
                                    floating: true,
                                });
                            },
                        },
                        { separator: true },
                        {
                            label: "Debug Info",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("debugInfoPanel") != null;
                            },
                            onClick: () => {
                                this._dockview.getPanel("debugInfoPanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "debugInfoPanel",
                                    component: "DebugInfoPanel",
                                    renderer: "always",
                                    title: "Debug Info",
                                    floating: true,
                                });
                            },
                        },
                    ],
                },
                {
                    label: "Tests",
                    children: [
                        {
                            label: "Virtualized List",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("virtualizedListTestPanel") != null;
                            },
                            onClick: () => {
                                const windowWidth: number = window.innerWidth;
                                const windowHeight: number = window.innerHeight;
                                const panelWidth: number = 500;
                                const panelHeight: number = 600;
                                const panelX: number = windowWidth / 2 - panelWidth / 2;
                                const panelY: number = windowHeight / 2 - panelHeight / 2;
                                this._dockview.getPanel("virtualizedListTestPanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "virtualizedListTestPanel",
                                    component: "VirtualizedListTestPanel",
                                    renderer: "always",
                                    title: "Virtualized List Test",
                                    floating: {
                                        position: { left: panelX, top: panelY },
                                        width: panelWidth,
                                        height: panelHeight,
                                    },
                                });
                            },
                        },
                        {
                            label: "Virtualized Tree",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("virtualizedTreeTestPanel") != null;
                            },
                            onClick: () => {
                                const windowWidth: number = window.innerWidth;
                                const windowHeight: number = window.innerHeight;
                                const panelWidth: number = 500;
                                const panelHeight: number = 600;
                                const panelX: number = windowWidth / 2 - panelWidth / 2;
                                const panelY: number = windowHeight / 2 - panelHeight / 2;
                                this._dockview.getPanel("virtualizedTreeTestPanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "virtualizedTreeTestPanel",
                                    component: "VirtualizedTreeTestPanel",
                                    renderer: "always",
                                    title: "Virtualized Tree Test",
                                    floating: {
                                        position: { left: panelX, top: panelY },
                                        width: panelWidth,
                                        height: panelHeight,
                                    },
                                });
                            },
                        },
                    ],
                },
                {
                    label: "Help",
                    children: [
                        {
                            label: "About",
                            getCheckedStatus: () => {
                                return this._dockview.getPanel("aboutPanel") != null;
                            },
                            onClick: () => {
                                const windowWidth: number = window.innerWidth;
                                const windowHeight: number = window.innerHeight;
                                const panelWidth: number = 500;
                                const panelHeight: number = 200;
                                const panelX: number = windowWidth / 2 - panelWidth / 2;
                                const panelY: number = windowHeight / 2 - panelHeight / 2;
                                this._dockview.getPanel("aboutPanel")?.api.setActive() ?? this._dockview.addPanel({
                                    id: "aboutPanel",
                                    component: "AboutPanel",
                                    renderer: "always",
                                    title: "About",
                                    floating: {
                                        position: { left: panelX, top: panelY },
                                        width: panelWidth,
                                        height: panelHeight,
                                    },
                                });
                            },
                        },
                    ],
                },
            ],
        );
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
        this.element = H("div", {
            style: `
                width: 100%;
                height: 100%;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `,
        },
            this._menuBar.element,
            this._dockviewContainer,
            this._menuContainer,
        );
        this._dockview = createDockview(this._dockviewContainer, {
            disableTabsOverflowList: true,

            theme: themeVisualStudio,
            defaultTabComponent: "DockablePanelTab",
            createTabComponent: (options) => {
                switch (options.name) {
                    case "PopupTab": return new PopupTab();
                }
                return new DockablePanelTab();
            },

            createComponent: (options) => {
                let panel: IContentRenderer | null = null;

                switch (options.name) {
                    case "AboutPanel": {
                        panel = new AboutPanel();
                    } break;
                    case "VirtualizedListTestPanel": {
                        panel = new VirtualizedListTestPanel(this._ui);
                    } break;
                    case "VirtualizedTreeTestPanel": {
                        panel = new VirtualizedTreeTestPanel(this._ui);
                    } break;
                    case "TimelinePanel": {
                        panel = new TimelinePanel(
                            this._ui,
                        );
                    } break;
                    case "PianoRollPanel": {
                        panel = new PianoRollPanel(
                            this._ui,
                            this._doc,
                        );
                    } break;
                    case "TransportPanel": {
                        panel = new TransportPanel(
                            this._ui,
                            this._doc,
                        );
                    } break;
                    case "OscilloscopePanel": {
                        panel = new OscilloscopePanel(
                            this._ui,
                            this._doc,
                        );
                    } break;
                    case "SpectrumAnalyzerPanel": {
                        panel = new SpectrumAnalyzerPanel(
                            this._ui,
                            this._doc,
                        );
                    } break;
                    case "SpectrogramPanel": {
                        panel = new SpectrogramPanel(
                            this._ui,
                            this._doc,
                        );
                    } break;
                    case "DebugInfoPanel": {
                        panel = new DebugInfoPanel(
                            this._ui,
                            this._doc,
                        );
                    } break;
                    default: {
                        panel = new EmptyPanel();
                    } break;
                }

                return panel;
            },
        });

        function filterSerializedDockview(input: SerializedDockview): SerializedDockview {
            function recursiveFilter(
                data: SerializedGridObject<GroupPanelViewState>,
            ): SerializedGridObject<GroupPanelViewState> | null {
                if (data.type === "branch") {
                    const outputData: SerializedGridObject<GroupPanelViewState>[] = [];
                    for (const item of (data.data as SerializedGridObject<GroupPanelViewState>[])) {
                        const filtered = recursiveFilter(item);
                        if (filtered != null) {
                            outputData.push(filtered);
                        }
                    }
                    if (outputData.length <= 0) return null;
                    const output: SerializedGridObject<GroupPanelViewState> = {
                        type: "branch",
                        data: outputData,
                    };
                    if (data.size != null) output.size = data.size;
                    if (data.visible != null) output.visible = data.visible;
                    return output;
                } else if (data.type === "leaf") {
                    const item: GroupPanelViewState = data.data as GroupPanelViewState;
                    const outputData: GroupPanelViewState = {
                        id: item.id,
                        views: item.views.filter(x => DOCKABLE_PANEL_IDS[x] != null),
                    };
                    if (outputData.views.length <= 0) return null;
                    const output: SerializedGridObject<GroupPanelViewState> = {
                        type: "leaf",
                        data: outputData,
                    };
                    if (data.size != null) output.size = data.size;
                    if (data.visible != null) output.visible = data.visible;
                    return output;
                } else {
                    throw new Error(`Unknown type ${data.type}`);
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
                        views: group.data.views.filter(
                            x => DOCKABLE_PANEL_IDS[x] != null
                        ),
                        id: group.data.id,
                    };
                    if (
                        group.data.activeView != null
                        && DOCKABLE_PANEL_IDS[group.data.activeView] != null
                    ) {
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
            const payload = {
                "version": SERIALIZED_DOCKVIEW_VERSION,
                "data": filterSerializedDockview(this._dockview.toJSON()),
            };
            localStorage.setItem("serializedDockview", JSON.stringify(payload));
        });

        this._dockview.onDidAddPanel((panel) => {
            this._renderablePanels.push(panel.view.content);
            this._ui.scheduleMainRender();
        })
        this._dockview.onDidRemovePanel((panel) => {
            const index: number = this._renderablePanels.indexOf(panel.view.content);
            if (index !== -1) {
                this._renderablePanels.splice(index, 1);
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
    }

    private _startAnimating(): void {
        this._animating++;
        if (this._animating <= 1) {
            cancelAnimationFrame(this._renderRequest);
            this._renderRequest = requestAnimationFrame(this._animate);
        }
    }

    private _stopAnimating(): void {
        this._animating--;
        if (this._animating <= 0) {
            cancelAnimationFrame(this._renderRequest);
            this._ui.scheduleMainRender();
        }
    }

    private _animate = (timestamp: number): void => {
        if (this._animating <= 0) return;
        // If everything is "memoized", this should not increase the CPU usage
        // by much. Otherwise, we'll need a more specialized setup here, though
        // in the long run we should eventually add that anyway.
        this._doc.advanceVisualizationsByOneFrame();
        this.render();
        this._renderRequest = requestAnimationFrame(this._animate);
    };

    public dispose(): void {
        this._doc.destroyAudioContext();
        this._menuBar.dispose();
    }

    public onDidMount(): void {
        this._dockview.layout(this._dockviewContainer.clientWidth, this._dockviewContainer.clientHeight, true);

        // This has to be done after calling .layout to work properly.
        const serializedDockview: string | null = localStorage.getItem("serializedDockview");
        if (serializedDockview != null && serializedDockview !== "") {
            const payload = JSON.parse(serializedDockview);
            if (payload["version"] === SERIALIZED_DOCKVIEW_VERSION) {
                this._dockview.fromJSON(payload["data"]);
            }
        }

        this._mounted = true;
    }

    public render(): void {
        if (!this._mounted) this.onDidMount();

        this._menuBar.render();

        {
            // Render all the panels we know about.
            const count: number = this._renderablePanels.length;
            for (let index: number = 0; index < count; index++) {
                const contentRenderer: IContentRenderer = this._renderablePanels[index];
                if ((contentRenderer as DockablePanel).render != null) {
                    const panel: DockablePanel = contentRenderer as DockablePanel;
                    panel.render();
                }
            }
        }
    }

    private _onSongChanged = (): void => {
        this._ui.scheduleMainRender();
    };

    private _onStartedPlaying = (): void => {
        this._startAnimating();
    };

    private _onStoppedPlaying = (): void => {
        this._stopAnimating();
    };

    private _onStartedPlayingPianoNote = (): void => {
        this._startAnimating();
    };

    private _onStoppedPlayingPianoNote = (): void => {
        this._stopAnimating();
    };
}
