import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import { OperationResponse, type OperationContext } from "../input/operations.js";
import { type NoteTransform } from "./NoteTransform.js";

// @TODO: I think this is a better API for this code. Previously I had one
// interface for all of the operations with fields that could be null. The
// silliest part is I'd need to go into every existing operation and add code
// that was unrelated, which felt wrong and led me to this current approach.
// That said, `data` doesn't seem like a good name for these per-kind public
// fields, it's too generic. But I will leave picking a better name for later.

export type Operation = (
    | NoteOperation
    | SelectionOperation
);

interface SharedFields {
    update(context: OperationContext, pattern: Pattern.Type): OperationResponse;
}

export interface NoteOperation extends SharedFields {
    kind: OperationKind.Note;
    data: { notes: Map<Note.Type, NoteTransform> };
}

export interface SelectionOperation extends SharedFields {
    kind: OperationKind.Selection;
    // @TODO: Since I don't persist the selection bounds anywhere, maybe I
    // could move them to here?
}

export const enum OperationKind {
    Note,
    Selection,
}
