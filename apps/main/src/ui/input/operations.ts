import {
    GestureKind,
    isMouseGesture,
    gestureHasKind,
    type EncodedGesture,
    Masks,
} from "./gestures.js";

// Operations are temporary modes, always invoked from an Action.
//
// They can be seen as the interactive version of Changes. Changes might be
// fast enough for many cases, but I have a suspicion that they won't cut it
// once there's a lot of data to edit, especially once things like autosaving
// exist. So these are purely for interactivity purposes, showing only a preview
// (that should still be accurate obviously) of what's going to happen. There's
// always an associated Change subclass for everything that actually modifies
// the song.
//
// They're a bit inspired by Blender's "[operators](https://developer.blender.org/docs/features/interface/operators/)"
// though the way serialization works in Blender is rather different, I believe.
//
// This might go away if Changes happen to be enough, or I get annoyed at having
// to write too many things twice.

export const enum OperationResponse {
    Aborted,
    Running,
    Done,
}

export interface OperationContext {
    /**
     * event.clientX at the time a drag started.
     * 
     */
    x0: number;

    /**
     * event.clientY at the time a drag started.
     */
    y0: number;

    /**
     * Gesture at the time a drag started.
     */
    gesture0: EncodedGesture;

    /**
     * event.target at the time a drag started.
     */
    element0: Node | null;

    // @TODO: x0, y0, gesture0, and element0 for keydown?

    /**
     * Current value of event.clientX.
     *
     * If the respective gesture is not a mouse gesture, then this is taken from
     * the last mouse input event seen by the input manager.
     */
    x1: number;

    /**
     * Current value of event.clientY.
     *
     * If the respective gesture is not a mouse gesture, then this is taken from
     * the last mouse input event seen by the input manager.
     */
    y1: number;

    /**
     * Current gesture.
     */
    gesture1: EncodedGesture;
}

export type OnUpdateOperation = (context: OperationContext) => OperationResponse;

export function mouseStartedInside(context: OperationContext, root: HTMLElement): boolean {
    if (!isMouseGesture(context.gesture0)) {
        return false;
    }

    const bounds: DOMRect = root.getBoundingClientRect();
    const width: number = bounds.width;
    const height: number = bounds.height;
    const mouseX: number = context.x0 - bounds.left;
    const mouseY: number = context.y0 - bounds.top;
    return !(
        mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height
        || !root.contains(context.element0)
    );
}

export function mouseIsInside(context: OperationContext, root: HTMLElement): boolean {
    if (!isMouseGesture(context.gesture1)) {
        return false;
    }

    const bounds: DOMRect = root.getBoundingClientRect();
    const width: number = bounds.width;
    const height: number = bounds.height;
    const mouseX: number = context.x1 - bounds.left;
    const mouseY: number = context.y1 - bounds.top;
    return !(mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height);
}

export function isReleasing(context: OperationContext): boolean {
    // @TODO: What about when gesture0 is a key gesture? Maybe I need a separate
    // isAborting function, and check for say, esc vs enter, or something else
    // entirely.
    const gesture0: EncodedGesture = context.gesture0;
    const gesture1: EncodedGesture = context.gesture1;
    if (!isMouseGesture(gesture0)) {
        return false;
    }
    if (!gestureHasKind(gesture1, GestureKind.Release)) {
        return false;
    }
    const mask: number = Masks.Button;
    return (gesture0 & mask) === (gesture1 & mask);
}
