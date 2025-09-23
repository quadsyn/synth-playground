import { StringId } from "../../localization/StringId.js";

export const enum AreaKind {
    Global,
    PianoRoll,
    Timeline,
}

export function getAreaLabelId(kind: AreaKind): StringId {
    switch (kind) {
        case AreaKind.Global: return StringId.GlobalActionCategory;
        case AreaKind.PianoRoll: return StringId.PianoRollActionCategory;
        case AreaKind.Timeline: return StringId.TimelineActionCategory;
    }
}

// @TODO: Actually implement tools. The below is just an idea.

// A tool is specific to an area.
// Areas are identified by a 16-bit integer. Tools are another 16-bit integer.
// They can be encoded like so:
// 0b1111111111111111_1111111111111111
//   |                |
//   Tool             Area
// The tool identifier cannot be 0. That's reserved for actions not tied to
// specific tools within an area.
export type EncodedTool = number;
// @TODO: I need a better name for this.

export const enum Tool {
    None               = 0,

    // @TODO: I need a better name than "pointer" here.
    PianoRollPointer   = 1 << 16, // Default
    PianoRollBrush     = 2 << 16,
    PianoRollTransform = 3 << 16,

    TimelinePointer    = 1 << 16, // Default
}

export const enum Masks {
    Area = 0b0000000000000000_1111111111111111,
    Tool = 0b1111111111111111_0000000000000000,
}
