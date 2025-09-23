import { UIContext } from "./ui/UIContext.js";
import { SongDocument } from "./SongDocument.js";
import { LanguageId } from "./localization/LanguageId.js";

export interface AppContext {
    ui: UIContext;
    doc: SongDocument;
    showTimelinePanel: () => void;
    showPianoRollPanel: () => void;
    showTransportPanel: () => void;
    showOscilloscopePanel: () => void;
    showSpectrumAnalyzerPanel: () => void;
    showSpectrogramPanel: () => void;
    showAboutPanel: () => void;
    showDebugInfoPanel: () => void;
    showVirtualizedTreeTestPanel: () => void;
    showCommandPalette: () => void;
    changeLanguage: (language: LanguageId) => Promise<void>;
}
