import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import { OperationResponse, type OperationContext } from "../input/operations.js";
import { OperationKind } from "./OperationKind.js";
import { type NoteTransform } from "./NoteTransform.js";

export interface Operation {
    kind: OperationKind;
    notes: Map<Note.Type, NoteTransform> | undefined;
    update(context: OperationContext, pattern: Pattern.Type): OperationResponse;
}
