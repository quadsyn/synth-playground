import * as Viewport from "../common/Viewport.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";

export interface OperationState {
    viewport: Viewport.Type;

    /**
     * In pixels.
     */
    clipStretchHandleSize: number;

    boxSelectionActive: boolean;
    boxSelectionX0: number;
    boxSelectionX1: number;
    boxSelectionY0: number;
    boxSelectionY1: number;

    selectionOverlayIsDirty: boolean;

    selectedClipsByTrackIndex: Map<number, Clip.Type[]>;
    selectedTrackIndex: number;

    mouseToPpqn: (clientX: number) => number;
    // ppqnToMouse: (ppqn: number) => number;

    getCanvasBounds: () => DOMRect;
}
