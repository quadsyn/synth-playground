export const enum NoteDrawingStyle {
    // Pitch bends don't affect the note's shape. The pitch envelope may still
    // be shown on top of it, but as an overlay.
    Flat,

    // Pitch bends affect the note's shape, like in BeepBox.
    Bent,

    // @TODO: How should volume envelopes factor into this? Usually, the
    // "velocity" of notes is drawn but e.g. "expression" isn't. Maybe it should
    // be a separate option (so there's three possible choices - I don't think
    // I'll have an option for bent notes without showing the volume envelopes
    // as well).
}
