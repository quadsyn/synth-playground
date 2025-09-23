import { NotePitchBoundsTracker } from "./NotePitchBoundsTracker.js";

export interface PatternInfo {
    pitchBounds: NotePitchBoundsTracker;

    // @TODO: Store an entire viewport object instead?
    viewportX0: number | null;
    viewportY0: number | null;
    viewportX1: number | null;
    viewportY1: number | null;
}
