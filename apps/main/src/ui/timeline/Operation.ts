import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import { OperationResponse, type OperationContext } from "../input/operations.js";
import { OperationKind } from "./OperationKind.js";
import { type ClipTransform } from "./ClipTransform.js";

export interface Operation {
    kind: OperationKind;
    clips: Map<Clip.Type, ClipTransform> | undefined;
    newTempoEnvelope: Breakpoint.Type[] | undefined;
    update(context: OperationContext): OperationResponse;
}
