import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import { OperationResponse, type OperationContext } from "../input/operations.js";
import { type ClipTransform } from "./ClipTransform.js";

// @TODO: I think this is a better API for this code. Previously I had one
// interface for all of the operations with fields that could be null. The
// silliest part is I'd need to go into every existing operation and add code
// that was unrelated, which felt wrong and led me to this current approach.
// That said, `data` doesn't seem like a good name for these per-kind public
// fields, it's too generic. But I will leave picking a better name for later.

export type Operation = (
    | ClipOperation
    | TempoEnvelopeOperation
);

interface SharedFields {
    update(context: OperationContext): OperationResponse;
}

export interface ClipOperation extends SharedFields {
    kind: OperationKind.Clip;
    data: { clips: Map<Clip.Type, ClipTransform> };
}

export interface TempoEnvelopeOperation extends SharedFields {
    kind: OperationKind.TempoEnvelope;
    data: { newTempoEnvelope: Breakpoint.Type[] };
}

export const enum OperationKind {
    Clip,
    TempoEnvelope,
}
