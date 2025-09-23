// Lanes are "derived data", computed by looking at what tracks are visible.
// Automation subtracks also have dedicated lanes.

export interface Type {
    kind: Kind;

    // -1 if not pointing to a track. Note that for automation lanes, this will
    // be pointing to the track that the automation belongs to.
    trackIndex: number;

    // -1 if not pointing to an automation subtrack.
    automationSubtrackIndex: number;

    // In pixels.
    height: number;

    // 0: at root, >0: child
    depth: number;
}

export function make(
    kind: Kind,
    trackIndex: number,
    automationSubtrackIndex: number,
    height: number,
    depth: number,
): Type {
    return {
        kind: kind,
        trackIndex: trackIndex,
        automationSubtrackIndex: automationSubtrackIndex,
        height: height,
        depth: depth,
    };
}

export const enum Kind {
    Track,
    Automation,
    TempoAutomation, // @TODO: Unify with other single-curve automation lanes
}

export const CollapsedHeight = 21 + 12;
export const MinHeight = 20;
export const IndentSize = 10;
export const AutomationLaneHeight = 100;
