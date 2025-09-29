import * as Viewport from "../common/Viewport.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";

export interface OperationState {
    viewport: Viewport.Type;

    /**
     * In pixels.
     */
    clipStretchHandleSize: number;

    /**
     * In pixels.
     */
    tempoEnvelopePointSize: number;

    boxSelectionActive: boolean;
    boxSelectionX0: number;
    boxSelectionX1: number;
    boxSelectionY0: number;
    boxSelectionY1: number;

    envelopesAreDirty: boolean;
    tempoEnvelopeIsDirty: boolean;

    selectionOverlayIsDirty: boolean;

    selectedClipsByTrackIndex: Map<number, Clip.Type[]>;
    selectedTrackIndex: number;

    mouseToPpqn: (clientX: number) => number;
    mouseToY: (clientY: number) => number;

    getLaneY0: (laneIndex: number) => number;
    getLaneY1: (laneIndex: number) => number;

    getCanvasBounds: () => DOMRect;
}
