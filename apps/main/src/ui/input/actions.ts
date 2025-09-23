import { StringId } from "../../localization/StringId.js";
import { AreaKind } from "./areas.js";
import {
    Key,
    Mod,
    MouseButton,
    GestureKind,
    type EncodedGesture,
} from "./gestures.js";
import { type OperationContext } from "./operations.js";

// These can be moved around (just keep `None` where it is so it can be 0).
// Because of that, don't serialize them. Use getActionId instead.
// @TODO: Maybe rename this to InternalActionId?
export const enum ActionKind {
    None,

    // Global
    TogglePlay,
    Play,
    Pause,
    Stop,
    SeekToStart,
    SeekToEnd,
    OpenCommandPalette,
    About,
    ShowTransportPanel,
    ShowDebugInfoPanel,
    ShowPianoRollPanel,
    ShowTimelinePanel,
    ShowOscilloscopePanel,
    ShowSpectrogramPanel,
    ShowSpectrumAnalyzerPanel,

    // PianoRoll
    CreateNote,
    PaintFlatNote,
    RemoveNote,
    LeftStretchNote,
    RightStretchNote,
    MoveNotes,
    PianoRollSelectBox,
    PianoRollSelectAll,
    PianoRollZoomInAroundMouse,
    PianoRollZoomOutAroundMouse,
    PianoRollQuantize,

    // Timeline
    TimelineQuantize,
}

export const enum ActionTags {
    None = 0,

    // Don't allow redefining this, don't show it anywhere, etc.
    Internal = 1 << 0,

    ShowInCommandPalette = 1 << 1,
}

type ActionId = string;

// I have a soft rule to avoid code running at the top level like this (except
// for the entry point), but in this case it's fine.
const actionIdsByKind: Map<ActionKind, ActionId> = new Map();
const actionKindsById: Map<string, ActionKind> = new Map();
const actionLabelIdsByKind: Map<ActionKind, StringId> = new Map();
const areasByAction: Map<ActionKind, AreaKind> = new Map(); // Only includes non-global actions.
export const defaultBindings: InputBinding[] = [];
export const actionKindsForCommandPalette: ActionKind[] = [];

function registerAction(
    tags: ActionTags,
    action: ActionKind,
    area: AreaKind,
    defaultShortcuts: EncodedGesture[],
    id: ActionId,
    labelId: StringId
): void {
    if ((tags & ActionTags.ShowInCommandPalette) !== 0) {
        actionKindsForCommandPalette.push(action);
    }
    if (actionKindsById.has(id)) {
        throw new Error(`Duplicate action id: ${id}`);
    }
    actionIdsByKind.set(action, id);
    actionKindsById.set(id, action);
    actionLabelIdsByKind.set(action, labelId);
    if (defaultShortcuts.length !== 0) {
        defaultBindings.push({ gestures: defaultShortcuts, action: action });
    }
    if (area !== AreaKind.Global) {
        areasByAction.set(action, area);
    }
}

type DefaultShortcuts = EncodedGesture[];
type ActionTableEntry = [
    // Options used when registering actions.
    ActionTags,

    // Internal action identifier.
    ActionKind,

    // Area that this action applies to.
    AreaKind,

    // Array of gestures that should be bound to this action by default.
    DefaultShortcuts,

    // Action ID, used when serializing references to actions (e.g. for saving
    // or loading shortcut tables)
    ActionId,

    // Action label, used in the command palette, in menus, etc. It's a
    // localized string ID to allow for translations.
    StringId,
];
(<ActionTableEntry[]>[
    // @TODO: Define at least the contextual actions together with their panels?
    // This makes it easier to see what all the default shortcuts are, though.
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.TogglePlay,
        AreaKind.Global,
        [GestureKind.Press | Key.Space],
        <ActionId>"global.togglePlay",
        StringId.GlobalActionTogglePlay,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.Play,
        AreaKind.Global,
        [],
        <ActionId>"global.play",
        StringId.GlobalActionPlay,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.Pause,
        AreaKind.Global,
        [],
        <ActionId>"global.pause",
        StringId.GlobalActionPause,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.Stop,
        AreaKind.Global,
        [],
        <ActionId>"global.stop",
        StringId.GlobalActionStop,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.SeekToStart,
        AreaKind.Global,
        [],
        <ActionId>"global.seekToStart",
        StringId.GlobalActionSeekToStart,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.SeekToEnd,
        AreaKind.Global,
        [],
        <ActionId>"global.seekToEnd",
        StringId.GlobalActionSeekToEnd,
    ],
    [
        ActionTags.None,
        ActionKind.OpenCommandPalette,
        AreaKind.Global,
        [GestureKind.Press | Mod.Ctrl | Key.P],
        <ActionId>"global.openCommandPalette",
        StringId.GlobalActionOpenCommandPalette,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.About,
        AreaKind.Global,
        [],
        <ActionId>"global.about",
        StringId.GlobalActionAbout,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ShowTransportPanel,
        AreaKind.Global,
        [],
        <ActionId>"global.showTransportPanel",
        StringId.GlobalActionShowTransportPanel,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ShowDebugInfoPanel,
        AreaKind.Global,
        [],
        <ActionId>"global.showDebugInfoPanel",
        StringId.GlobalActionShowDebugInfoPanel,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ShowPianoRollPanel,
        AreaKind.Global,
        [],
        <ActionId>"global.showPianoRollPanel",
        StringId.GlobalActionShowPianoRollPanel,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ShowTimelinePanel,
        AreaKind.Global,
        [],
        <ActionId>"global.showTimelinePanel",
        StringId.GlobalActionShowTimelinePanel,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ShowOscilloscopePanel,
        AreaKind.Global,
        [],
        <ActionId>"global.showOscilloscopePanel",
        StringId.GlobalActionShowOscilloscopePanel,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ShowSpectrogramPanel,
        AreaKind.Global,
        [],
        <ActionId>"global.showSpectrogramPanel",
        StringId.GlobalActionShowSpectrogramPanel,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ShowSpectrumAnalyzerPanel,
        AreaKind.Global,
        [],
        <ActionId>"global.showSpectrumAnalyzerPanel",
        StringId.GlobalActionShowSpectrumAnalyzerPanel,
    ],
    [
        ActionTags.None,
        ActionKind.CreateNote,
        AreaKind.PianoRoll,
        // [GestureKind.Press | MouseButton.LeftDouble],
        [GestureKind.Release | MouseButton.Left], // beepbox-like
        <ActionId>"pianoRoll.createNote",
        StringId.PianoRollActionCreateNote,
    ],
    [
        ActionTags.None,
        ActionKind.PaintFlatNote,
        AreaKind.PianoRoll,
        [GestureKind.Drag | MouseButton.Left], // beepbox-like
        <ActionId>"pianoRoll.paintFlatNote",
        StringId.PianoRollActionPaintFlatNote,
    ],
    [
        ActionTags.None,
        ActionKind.RemoveNote,
        AreaKind.PianoRoll,
        // [GestureKind.Press | MouseButton.LeftDouble],
        [
            GestureKind.Release | MouseButton.Left,
            GestureKind.Press | Key.Delete,
        ], // beepbox-like
        <ActionId>"pianoRoll.removeNote",
        StringId.PianoRollActionRemoveNote,
    ],
    [
        ActionTags.None,
        ActionKind.LeftStretchNote,
        AreaKind.PianoRoll,
        // [GestureKind.Press | MouseButton.Left],
        [GestureKind.Drag | MouseButton.Left], // beepbox-like
        <ActionId>"pianoRoll.leftStretchNote",
        StringId.PianoRollActionLeftStretchNote,
    ],
    [
        ActionTags.None,
        ActionKind.RightStretchNote,
        AreaKind.PianoRoll,
        // [GestureKind.Press | MouseButton.Left],
        [GestureKind.Drag | MouseButton.Left], // beepbox-like
        <ActionId>"pianoRoll.rightStretchNote",
        StringId.PianoRollActionRightStretchNote,
    ],
    [
        ActionTags.None,
        ActionKind.MoveNotes,
        AreaKind.PianoRoll,
        // [GestureKind.Press | MouseButton.Left],
        [
            GestureKind.Drag | MouseButton.Left,
            GestureKind.Drag | Mod.Ctrl | MouseButton.Left,
        ], // beepbox-like
        <ActionId>"pianoRoll.moveNotes",
        StringId.PianoRollActionMoveNotes,
    ],
    [
        ActionTags.None,
        ActionKind.PianoRollSelectBox,
        AreaKind.PianoRoll,
        // [GestureKind.Press | MouseButton.Left],
        [
            // GestureKind.Drag | MouseButton.Left,
            GestureKind.Drag | Mod.Shift | MouseButton.Left,
        ], // beepbox-like
        <ActionId>"pianoRoll.selectBox",
        StringId.PianoRollActionSelectBox,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PianoRollSelectAll,
        AreaKind.PianoRoll,
        [GestureKind.Press | Mod.Ctrl | Key.A],
        <ActionId>"pianoRoll.selectAll",
        StringId.PianoRollActionSelectAll,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PianoRollZoomInAroundMouse,
        AreaKind.PianoRoll,
        [
            GestureKind.Press | MouseButton.WheelUp,
            GestureKind.Press | Key.N,
        ],
        <ActionId>"pianoRoll.zoomInAroundMouse",
        StringId.PianoRollActionZoomInAroundMouse,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PianoRollZoomOutAroundMouse,
        AreaKind.PianoRoll,
        [
            GestureKind.Press | MouseButton.WheelDown,
            GestureKind.Press | Key.M,
        ],
        <ActionId>"pianoRoll.zoomOutAroundMouse",
        StringId.PianoRollActionZoomOutAroundMouse,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PianoRollQuantize,
        AreaKind.PianoRoll,
        [GestureKind.Press | Key.Q],
        <ActionId>"pianoRoll.quantize",
        StringId.PianoRollActionQuantize,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.TimelineQuantize,
        AreaKind.Timeline,
        [GestureKind.Press | Key.Q],
        <ActionId>"timeline.quantize",
        StringId.TimelineActionQuantize,
    ],
]).forEach(([tags, action, area, defaultShortcuts, id, labelId]) => {
    registerAction(tags, action, area, defaultShortcuts, id, labelId);
});

export function getActionId(kind: ActionKind): ActionId | undefined {
    return actionIdsByKind.get(kind);
}

export function getActionKindFromId(id: string): ActionKind {
    let result: ActionKind = ActionKind.None;

    const found: ActionKind | undefined = actionKindsById.get(id);
    if (found != null) {
        result = found;
    }

    return result;
}

export function getAreaFromAction(kind: ActionKind): AreaKind {
    const found: AreaKind | undefined = areasByAction.get(kind);
    if (found == null) {
        return AreaKind.Global;
    }
    return found;
}

export function getActionLabelId(kind: ActionKind): StringId {
    const labelId: StringId | undefined = actionLabelIdsByKind.get(kind);
    if (labelId == null) {
        return "" as StringId; // @TODO: Not sure about this.
    }
    return labelId;
}

export const enum ActionResponse {
    NotApplicable,
    Done,
    StartedOperation,
}

export type OnAction = (
    kind: ActionKind,
    operationContext: OperationContext,
) => ActionResponse;

export interface InputBinding {
    gestures: EncodedGesture[];
    action: ActionKind;
}
