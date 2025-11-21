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
    CreateNoteVolumePoint,
    CreateNotePitchPoint,
    RemoveNoteVolumePoint,
    RemoveNotePitchPoint,
    MoveNoteVolumePointBounded,
    MoveNotePitchPointBounded,
    PianoRollSelectBox,
    PianoRollSelectAll,
    PianoRollZoomInAroundMouseHorizontally,
    PianoRollZoomOutAroundMouseHorizontally,
    PianoRollZoomInAroundMouseVertically,
    PianoRollZoomOutAroundMouseVertically,
    PianoRollQuantize,

    // Timeline
    CreateClipAndPattern,
    RemoveClip,
    SplitClip,
    DuplicateClip,
    LeftStretchClip,
    RightStretchClip,
    MoveClips,
    SelectClip,
    StretchSoundClipRate,
    SlipSoundClip,
    SetSoundClipTimeStretchModeToNone,
    SetSoundClipTimeStretchModeToLowQuality,
    ResetSoundClipPlaybackRate,
    ResetSoundClipPitchShift,
    PitchShiftSoundClipUpByOneSemitone,
    PitchShiftSoundClipDownByOneSemitone,
    PitchShiftSoundClipUpByOneOctave,
    PitchShiftSoundClipDownByOneOctave,
    TimelineSelectBox,
    TimelineSelectAll,
    TimelineZoomInAroundMouseHorizontally,
    TimelineZoomOutAroundMouseHorizontally,
    OpenPatternFromClip,
    TimelineQuantize,
    TimelineSeek,
    ToggleTempoEnvelope,
    CreateTempoEnvelopePoint,
    RemoveTempoEnvelopePoint,
    MoveTempoEnvelopePointBounded,
    TimelineImportSample,
    ToggleMuteSelectedTrack,
    ToggleSoloSelectedTrack,
}

export const enum ActionTags {
    None = 0,

    // Don't allow redefining this, don't show it anywhere, etc.
    // Currently unused.
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

    // External action identifier, used when serializing references to actions
    // (e.g. for saving or loading shortcut tables)
    ActionId,

    // Action label, used in the command palette, in menus, etc. It's a
    // localized string ID to allow for translations.
    StringId,
];
(<ActionTableEntry[]>[
    // @TODO: Define at least the contextual actions together with their panels?
    // This makes it easier to see what all the default shortcuts are, though.
    // If I end up doing that, I think I have to get rid of the ActionKind enum
    // (though I could still use a newtype for readability), and instead have
    // some function that generates an unique integer ID that gets executed
    // before the entry point. Then I can register the action next to the code
    // for the components.
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
        [GestureKind.Press | Key.Home],
        <ActionId>"global.seekToStart",
        StringId.GlobalActionSeekToStart,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.SeekToEnd,
        AreaKind.Global,
        [GestureKind.Press | Key.End],
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
        ActionKind.CreateNoteVolumePoint,
        AreaKind.PianoRoll,
        // Since this is a bit subtle: this only works together with removal if
        // we start a move operation after creating the point. The move operation
        // will eat the release event which otherwise would go to the removal
        // action. If we didn't do that, then this would have to be mapped to
        // release, so we could properly do either creation _or_ removal, but
        // not one after the other.
        [GestureKind.Press | MouseButton.Left],
        <ActionId>"pianoRoll.createNoteVolumePoint",
        StringId.PianoRollActionCreateNoteVolumePoint,
    ],
    [
        ActionTags.None,
        ActionKind.CreateNotePitchPoint,
        AreaKind.PianoRoll,
        // Since this is a bit subtle: this only works together with removal if
        // we start a move operation after creating the point. The move operation
        // will eat the release event which otherwise would go to the removal
        // action. If we didn't do that, then this would have to be mapped to
        // release, so we could properly do either creation _or_ removal, but
        // not one after the other.
        [GestureKind.Press | MouseButton.Left],
        <ActionId>"pianoRoll.createNotePitchPoint",
        StringId.PianoRollActionCreateNotePitchPoint,
    ],
    [
        ActionTags.None,
        ActionKind.RemoveNoteVolumePoint,
        AreaKind.PianoRoll,
        [GestureKind.Release | MouseButton.Left],
        <ActionId>"pianoRoll.removeNoteVolumePoint",
        StringId.PianoRollActionRemoveNoteVolumePoint,
    ],
    [
        ActionTags.None,
        ActionKind.RemoveNotePitchPoint,
        AreaKind.PianoRoll,
        [GestureKind.Release | MouseButton.Left],
        <ActionId>"pianoRoll.removeNotePitchPoint",
        StringId.PianoRollActionRemoveNotePitchPoint,
    ],
    [
        ActionTags.None,
        ActionKind.MoveNoteVolumePointBounded,
        AreaKind.PianoRoll,
        [GestureKind.Drag | MouseButton.Left],
        <ActionId>"pianoRoll.moveNoteVolumePointBounded",
        StringId.PianoRollActionMoveNoteVolumePointBounded,
    ],
    [
        ActionTags.None,
        ActionKind.MoveNotePitchPointBounded,
        AreaKind.PianoRoll,
        [GestureKind.Drag | MouseButton.Left],
        <ActionId>"pianoRoll.moveNotePitchPointBounded",
        StringId.PianoRollActionMoveNotePitchPointBounded,
    ],
    [
        ActionTags.ShowInCommandPalette,
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
        ActionKind.PianoRollZoomInAroundMouseHorizontally,
        AreaKind.PianoRoll,
        [GestureKind.Press | MouseButton.WheelUp],
        <ActionId>"pianoRoll.zoomInAroundMouseHorizontally",
        StringId.PianoRollActionZoomInAroundMouseHorizontally,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PianoRollZoomOutAroundMouseHorizontally,
        AreaKind.PianoRoll,
        [GestureKind.Press | MouseButton.WheelDown],
        <ActionId>"pianoRoll.zoomOutAroundMouseHorizontally",
        StringId.PianoRollActionZoomOutAroundMouseHorizontally,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PianoRollZoomInAroundMouseVertically,
        AreaKind.PianoRoll,
        [GestureKind.Press | Mod.Shift | MouseButton.WheelUp],
        <ActionId>"pianoRoll.zoomInAroundMouseVertically",
        StringId.PianoRollActionZoomInAroundMouseVertically,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PianoRollZoomOutAroundMouseVertically,
        AreaKind.PianoRoll,
        [GestureKind.Press | Mod.Shift | MouseButton.WheelDown],
        <ActionId>"pianoRoll.zoomOutAroundMouseVertically",
        StringId.PianoRollActionZoomOutAroundMouseVertically,
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
        ActionKind.CreateClipAndPattern,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.createClipAndPattern",
        StringId.TimelineActionCreateClipAndPattern,
    ],
    [
        ActionTags.None,
        ActionKind.RemoveClip,
        AreaKind.Timeline,
        [GestureKind.Press | Key.Delete],
        <ActionId>"timeline.removeClip",
        StringId.TimelineActionRemoveClip,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.SplitClip,
        AreaKind.Timeline,
        [GestureKind.Press | Key.S],
        <ActionId>"timeline.splitClip",
        StringId.TimelineActionSplitClip,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.DuplicateClip,
        AreaKind.Timeline,
        [GestureKind.Press | Key.D],
        <ActionId>"timeline.duplicateClip",
        StringId.TimelineActionDuplicateClip,
    ],
    [
        ActionTags.None,
        ActionKind.LeftStretchClip,
        AreaKind.Timeline,
        [GestureKind.Drag | MouseButton.Left],
        <ActionId>"timeline.leftStretchClip",
        StringId.TimelineActionLeftStretchClip,
    ],
    [
        ActionTags.None,
        ActionKind.RightStretchClip,
        AreaKind.Timeline,
        [GestureKind.Drag | MouseButton.Left],
        <ActionId>"timeline.rightStretchClip",
        StringId.TimelineActionRightStretchClip,
    ],
    [
        ActionTags.None,
        ActionKind.MoveClips,
        AreaKind.Timeline,
        [GestureKind.Drag | MouseButton.Left],
        <ActionId>"timeline.moveClips",
        StringId.TimelineActionMoveClips,
    ],
    [
        ActionTags.None,
        ActionKind.SelectClip,
        AreaKind.Timeline,
        [GestureKind.Release | MouseButton.Left],
        <ActionId>"timeline.selectClip",
        StringId.TimelineActionSelectClip,
    ],
    [
        ActionTags.None,
        ActionKind.StretchSoundClipRate,
        AreaKind.Timeline,
        [GestureKind.Drag | MouseButton.Left],
        <ActionId>"timeline.stretchSoundClipRate",
        StringId.TimelineActionStretchSoundClipRate,
    ],
    [
        ActionTags.None,
        ActionKind.SlipSoundClip,
        AreaKind.Timeline,
        [GestureKind.Drag | Mod.Shift | MouseButton.Left],
        <ActionId>"timeline.slipSoundClip",
        StringId.TimelineActionSlipSoundClip,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.SetSoundClipTimeStretchModeToNone,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.setSoundClipTimeStretchModeToNone",
        StringId.TimelineActionSetSoundClipTimeStretchModeToNone,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.SetSoundClipTimeStretchModeToLowQuality,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.setSoundClipTimeStretchModeToLowQuality",
        StringId.TimelineActionSetSoundClipTimeStretchModeToLowQuality,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ResetSoundClipPlaybackRate,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.resetSoundClipPlaybackRate",
        StringId.TimelineActionResetSoundClipPlaybackRate,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ResetSoundClipPitchShift,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.resetSoundClipPitchShift",
        StringId.TimelineActionResetSoundClipPitchShift,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PitchShiftSoundClipUpByOneSemitone,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.pitchShiftSoundClipUpByOneSemitone",
        StringId.TimelineActionPitchShiftSoundClipUpByOneSemitone,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PitchShiftSoundClipDownByOneSemitone,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.pitchShiftSoundClipDownByOneSemitone",
        StringId.TimelineActionPitchShiftSoundClipDownByOneSemitone,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PitchShiftSoundClipUpByOneOctave,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.pitchShiftSoundClipUpByOneOctave",
        StringId.TimelineActionPitchShiftSoundClipUpByOneOctave,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.PitchShiftSoundClipDownByOneOctave,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.pitchShiftSoundClipDownByOneOctave",
        StringId.TimelineActionPitchShiftSoundClipDownByOneOctave,
    ],
    [
        ActionTags.None,
        ActionKind.TimelineSelectBox,
        AreaKind.Timeline,
        [GestureKind.Drag | MouseButton.Left],
        <ActionId>"timeline.selectBox",
        StringId.TimelineActionSelectBox,
    ],
    [
        ActionTags.None,
        ActionKind.TimelineSelectAll,
        AreaKind.Timeline,
        [GestureKind.Press | Mod.Ctrl | Key.A],
        <ActionId>"timeline.selectAll",
        StringId.TimelineActionSelectAll,
    ],
    [
        ActionTags.None,
        ActionKind.TimelineZoomInAroundMouseHorizontally,
        AreaKind.Timeline,
        [GestureKind.Press | MouseButton.WheelUp],
        <ActionId>"timeline.zoomInAroundMouseHorizontally",
        StringId.TimelineActionZoomInAroundMouseHorizontally,
    ],
    [
        ActionTags.None,
        ActionKind.TimelineZoomOutAroundMouseHorizontally,
        AreaKind.Timeline,
        [GestureKind.Press | MouseButton.WheelDown],
        <ActionId>"timeline.zoomOutAroundMouseHorizontally",
        StringId.TimelineActionZoomOutAroundMouseHorizontally,
    ],
    [
        ActionTags.None,
        ActionKind.OpenPatternFromClip,
        AreaKind.Timeline,
        [GestureKind.Press | MouseButton.LeftDouble],
        <ActionId>"timeline.openPatternFromClip",
        StringId.TimelineActionOpenPatternFromClip,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.TimelineQuantize,
        AreaKind.Timeline,
        [GestureKind.Press | Key.Q],
        <ActionId>"timeline.quantize",
        StringId.TimelineActionQuantize,
    ],
    [
        ActionTags.None,
        ActionKind.TimelineSeek,
        AreaKind.Timeline,
        [GestureKind.Press | MouseButton.Left, GestureKind.Drag | MouseButton.Left],
        <ActionId>"timeline.seek",
        StringId.TimelineActionSeek,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ToggleTempoEnvelope,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.toggleTempoEnvelope",
        StringId.TimelineActionToggleTempoEnvelope,
    ],
    [
        ActionTags.None,
        ActionKind.CreateTempoEnvelopePoint,
        AreaKind.Timeline,
        // Since this is a bit subtle: this only works together with removal if
        // we start a move operation after creating the point. The move operation
        // will eat the release event which otherwise would go to the removal
        // action. If we didn't do that, then this would have to be mapped to
        // release, so we could properly do either creation _or_ removal, but
        // not one after the other.
        [GestureKind.Press | MouseButton.Left],
        <ActionId>"timeline.createTempoEnvelopePoint",
        StringId.TimelineActionCreateTempoEnvelopePoint,
    ],
    [
        ActionTags.None,
        ActionKind.RemoveTempoEnvelopePoint,
        AreaKind.Timeline,
        [GestureKind.Release | MouseButton.Left],
        <ActionId>"timeline.removeTempoEnvelopePoint",
        StringId.TimelineActionRemoveTempoEnvelopePoint,
    ],
    [
        ActionTags.None,
        ActionKind.MoveTempoEnvelopePointBounded,
        AreaKind.Timeline,
        [GestureKind.Drag | MouseButton.Left],
        <ActionId>"timeline.moveTempoEnvelopePointBounded",
        StringId.TimelineActionMoveTempoEnvelopePointBounded,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.TimelineImportSample,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.importSample",
        StringId.TimelineActionImportSample,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ToggleMuteSelectedTrack,
        AreaKind.Timeline,
        [GestureKind.Press | Key.M],
        <ActionId>"timeline.toggleMuteSelectedTrack",
        StringId.TimelineActionToggleMuteSelectedTrack,
    ],
    [
        ActionTags.ShowInCommandPalette,
        ActionKind.ToggleSoloSelectedTrack,
        AreaKind.Timeline,
        [],
        <ActionId>"timeline.toggleSoloSelectedTrack",
        StringId.TimelineActionToggleSoloSelectedTrack,
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
