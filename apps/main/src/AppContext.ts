import { UIContext } from "./ui/UIContext.js";
import { SongDocument } from "./SongDocument.js";
import { LanguageId } from "./localization/LanguageId.js";

export interface AppContext {
    ui: UIContext;
    doc: SongDocument;
    showAboutDialog: () => void;
    showVirtualizedListTestDialog: () => void;
    showVirtualizedTreeTestDialog: () => void;
    showTimelinePanel: () => void;
    showPianoRollPanel: () => void;
    showTransportPanel: () => void;
    showOscilloscopePanel: () => void;
    showSpectrumAnalyzerPanel: () => void;
    showSpectrogramPanel: () => void;
    showDebugInfoPanel: () => void;
    showCommandPalette: () => void;
    changeLanguage: (language: LanguageId) => Promise<void>;
    importSample: () => Promise<LoadedSample>;
}

export interface LoadedSample {
    samplesPerSecond: number;
    dataL: Float32Array;
    dataR: Float32Array;
}
