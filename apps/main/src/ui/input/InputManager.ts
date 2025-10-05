import { isFirefox } from "@synth-playground/browser/platform.js";
import {
    GestureKind,
    MouseButton,
    Clicks,
    Mod,
    MouseGesture,
    Key,
    KeyboardGesture,
    type EncodedGesture,
} from "./gestures.js";
import {
    OperationResponse,
    type OperationContext,
    type OnUpdateOperation,
} from "./operations.js";
import {
    defaultBindings,
    ActionResponse,
    ActionKind,
    type OnAction,
    type InputBinding,
    getAreaFromAction,
} from "./actions.js";
import { AreaKind } from "./areas.js";

// @TODO:
// - I think that it should be possible to nest areas within each other. The
//   only implementation strategy that seems reasonable here is to tie areas to
//   DOM elements in general, instead of just "panels". Then, when executing
//   actions, if no bindings match for the starting area (which may not be
//   `event.target`, mind you), we keep trying to execute actions on the parent
//   areas, until we run out of parent DOM elements, at which point the global
//   actions should be tried. This should make "subareas" (e.g. per-note
//   automation side panel contained within the piano roll panel)
//   straightforward to implement. The only way to achieve something like that
//   with this system right now is to register all the actions on the parent
//   area, disambiguating in the action handler.
//   - What about this "active panel" logic? Maybe we can just keep it.
//   - What about dialogs/modals/etc? I may need to register those as a special
//     case, so I can stop iterating when reaching them if necessary.
// - Introduce a callback that runs before trying to execute actions? That way
//   I would have a predictable point where I can compute information that's
//   shared by the action execution attempts (e.g. hit testing).
// - Remember to consult shaktool's EasyPointers thing.
// - Detect things like Ctrl+R/reload and don't allow consuming those events?
//   - Also, what about Tab/Shift-Tab?
// - I think when doing recording (or at least just live playing) I will also
//   need special cases here for the "piano".
//   - Hmm, I could have a secondary binding for everything that needs one of
//     Shift or Ctrl at least so it doesn't conflict.
// - Enforce the following rules automatically?
//   <https://blog.duvallj.pw/posts/2025-01-10-all-javascript-keyboard-shortcut-libraries-are-broken.html#what-we-cross-browser-plebians-have-to-do>
//   - See also: <https://github.com/w3c/uievents/issues/377>
// - Touch support.
//   - I want to address this some day but it will probably be quite tricky.
//     This also makes me feel like I shouldn't use the name "gesture" to
//     describe the unification of key and mouse inputs, as that's an
//     established term for touch inputs.
// - Input sequences (i.e. `Ctrl+A Ctrl+B` mapped to something).
//   - Don't really need it right now. Plus it adds more ambiguity, in case you
//     have sequences that are prefixes of others. In text editors where I've
//     seen people allow this, (I believe) all of them resolve those using
//     timeouts, which I don't love, but I don't have better ideas.
// - Binding conflicts are a bit hard to define in this implementation.
//   - I wanted this to handle disambiguation of e.g. note dragging. That
//     depends on the mouse position relative to the note, so having multiple
//     entries that bind a left mouse button press to different operations is
//     okay, as long as the checks that guard their execution are mutually
//     exclusive.
//     This is a very error-prone thing to expose to users, but I can't think of
//     good options outside of hardcoding limitations for the mouse bindings
//     (I believe REAPER's mousemap stuff is handled this way).
//     Maybe that's why I don't see this so often.
// - I think that ideally, things like keyboard navigation should be handled via
//   actions as well, but that complicates the implementation so I decided to
//   not bother for now.

export class InputManager {
    private _rootElement: HTMLElement;

    private _onGlobalAction: OnAction;
    private _onShortcutRecorded: OnShortcutRecorded | null;

    private _mouseX: number;
    private _mouseY: number;
    private _previousMouseGesture: MouseGesture;
    private _currentMouseGesture: MouseGesture;
    private _dragging: boolean;
    private _draggingTarget: HTMLElement | null;
    private _dragStartGesture: MouseGesture;
    private _ignoreNextContextMenuEvent: boolean;

    private _currentKeyboardGesture: KeyboardGesture;
    private _recordingShortcut: boolean;

    private _activePanelId: string | undefined; // From dockview.
    private _registeredPanelsById: Map<string, RegisteredPanel>;
    private _panelsByElement: Map<HTMLElement, RegisteredPanel>;

    private _userBindingsByAction: Map<ActionKind, InputBinding>;
    private _bindingsByArea: Map<AreaKind, Map<EncodedGesture, InputBinding[]>>;

    // @TODO: I feel like this shouldn't exist, but I can't think of a better
    // way to quickly find these.
    private _gesturesByAction: Map<ActionKind, EncodedGesture[]>;

    private _bindingsAreDirty: boolean;

    private _operationContext: OperationContext;
    private _onUpdateOperation: OnUpdateOperation | null;

    private _shouldBlockActions: () => boolean;

    private _lastExecutedAction: ActionKind;

    constructor(
        rootElement: HTMLElement,
        onGlobalAction: OnAction,
        shouldBlockActions: () => boolean,
    ) {
        this._rootElement = rootElement;

        this._onGlobalAction = onGlobalAction;
        this._onShortcutRecorded = null;

        this._shouldBlockActions = shouldBlockActions;

        this._mouseX = 0;
        this._mouseY = 0;
        this._previousMouseGesture = new MouseGesture();
        this._currentMouseGesture = new MouseGesture();
        this._dragging = false;
        this._draggingTarget = null;
        this._dragStartGesture = new MouseGesture();
        this._ignoreNextContextMenuEvent = false;

        this._currentKeyboardGesture = new KeyboardGesture();
        this._recordingShortcut = false;

        this._activePanelId = undefined;
        this._registeredPanelsById = new Map();
        this._panelsByElement = new Map();

        this._userBindingsByAction = new Map();
        this._bindingsByArea = new Map();
        this._gesturesByAction = new Map();
        this._bindingsAreDirty = true;

        this._operationContext = {
            x0: 0,
            y0: 0,
            gesture0: GestureKind.None,
            element0: null,
            x1: 0,
            y1: 0,
            gesture1: GestureKind.None,
        };
        this._onUpdateOperation = null;

        this._lastExecutedAction = ActionKind.None;
    }

    public registerListeners(): void {
        window.addEventListener("mousedown", this._onEvent);
        window.addEventListener("mousemove", this._onEvent);
        window.addEventListener("mouseup", this._onEvent);
        window.addEventListener("keydown", this._onEvent);
        window.addEventListener("keyup", this._onEvent);
        window.addEventListener("wheel", this._onEvent, { passive: false });
        window.addEventListener("contextmenu", this._onEvent);
    }

    public unregisterListeners(): void {
        window.removeEventListener("mousedown", this._onEvent);
        window.removeEventListener("mousemove", this._onEvent);
        window.removeEventListener("mouseup", this._onEvent);
        window.removeEventListener("keydown", this._onEvent);
        window.removeEventListener("keyup", this._onEvent);
        window.removeEventListener("wheel", this._onEvent);
        window.removeEventListener("contextmenu", this._onEvent);
    }

    public setActivePanel(id: string | undefined): void {
        if (id != null && !this._registeredPanelsById.has(id)) {
            this._activePanelId = undefined;
            return;
        }

        this._activePanelId = id;
    }

    public registerPanel(
        id: string,
        element: HTMLElement,
        kind: AreaKind,
        onAction: OnAction,
    ): void {
        if (kind === AreaKind.Global) {
            throw new Error("Can't register panel as global area");
        }

        const panel: RegisteredPanel = {
            id: id,
            element: element,
            kind: kind,
            onAction: onAction,
        };
        this._registeredPanelsById.set(id, panel);
        this._panelsByElement.set(element, panel);
    }

    public unregisterPanel(
        id: string,
        element: HTMLElement,
        kind: AreaKind,
        onAction: OnAction,
    ): void {
        const found: RegisteredPanel | undefined = this._registeredPanelsById.get(id);
        if (found == null) {
            console.log(`Trying to unregister unknown panel with id ${id}`);
            return;
        }

        if (
            found.id !== id
            || found.element !== element
            || found.kind !== kind
            || found.onAction !== onAction
        ) {
            throw new Error("Registered panel doesn't exactly match the arguments");
        }

        this._registeredPanelsById.delete(id);
        this._panelsByElement.delete(element);
    }

    public setUserShortcuts(bindings: InputBinding[]): void {
        const bindingCount: number = bindings.length;

        this._userBindingsByAction.clear();
        for (let i: number = 0; i < bindingCount; i++) {
            const binding: InputBinding = bindings[i];
            const gestures: EncodedGesture[] = binding.gestures;
            const action: ActionKind = binding.action;

            // @TODO: Probably not super fast...
            const deduplicated: EncodedGesture[] = [...new Set(gestures)];
            if (deduplicated.length === 0) {
                continue;
            }

            this._userBindingsByAction.set(action, {
                gestures: deduplicated,
                action: action,
            });
        }

        this._bindingsAreDirty = true;
    }

    public computeCurrentBindings(): void {
        if (!this._bindingsAreDirty) {
            return;
        }

        for (const table of this._bindingsByArea.values()) {
            table.clear();
        }

        this._gesturesByAction.clear();

        const defaultBindingCount: number = defaultBindings.length;
        for (let bindingIndex: number = 0; bindingIndex < defaultBindingCount; bindingIndex++) {
            const binding: InputBinding = defaultBindings[bindingIndex];
            const gestures: EncodedGesture[] = binding.gestures;
            const gestureCount: number = gestures.length;
            const action: ActionKind = binding.action;

            if (gestureCount === 0) {
                continue;
            }

            if (this._userBindingsByAction.has(action)) {
                // If the user has a binding for this, then we want that to
                // "overwrite" the default, which in this case exists. So we
                // move on without registering anything here.
                continue;
            }

            const area: AreaKind = getAreaFromAction(action);

            let table: Map<EncodedGesture, InputBinding[]> | undefined = this._bindingsByArea.get(area);
            if (table == null) {
                table = new Map();
                this._bindingsByArea.set(area, table);
            }

            for (let gestureIndex: number = 0; gestureIndex < gestureCount; gestureIndex++) {
                const gesture: EncodedGesture = gestures[gestureIndex];
                let list: InputBinding[] | undefined = table.get(gesture);
                if (list == null) {
                    list = [];
                    table.set(gesture, list);
                }

                list.push(binding);
            }

            this._gesturesByAction.set(action, gestures);
        }

        for (const binding of this._userBindingsByAction.values())  {
            const gestures: EncodedGesture[] = binding.gestures;
            const gestureCount: number = gestures.length;
            const action: ActionKind = binding.action;

            if (gestureCount === 0) {
                continue;
            }

            const area: AreaKind = getAreaFromAction(action);

            let table: Map<EncodedGesture, InputBinding[]> | undefined = this._bindingsByArea.get(area);
            if (table == null) {
                table = new Map();
                this._bindingsByArea.set(area, table);
            }

            for (let gestureIndex: number = 0; gestureIndex < gestureCount; gestureIndex++) {
                const gesture: EncodedGesture = gestures[gestureIndex];
                let list: InputBinding[] | undefined = table.get(gesture);
                if (list == null) {
                    list = [];
                    table.set(gesture, list);
                }

                list.push(binding);
            }

            this._gesturesByAction.set(action, gestures);
        }

        this._bindingsAreDirty = false;
    }

    public getLastExecutedAction(): ActionKind {
        return this._lastExecutedAction;
    }

    public getShortcutsByAction(action: ActionKind): EncodedGesture[] | undefined {
        // @NOTE: This may be slow, so after changing the bindings this probably
        // should be eagerly recomputed as soon as possible instead of here.
        this.computeCurrentBindings();

        const found: EncodedGesture[] | undefined = this._gesturesByAction.get(action);
        if (found == null || found.length === 0) {
            return undefined;
        }
        return found;
    }

    public getPrimaryShortcutByAction(action: ActionKind): EncodedGesture {
        const shortcuts: EncodedGesture[] | undefined = this.getShortcutsByAction(action);
        if (shortcuts == null || shortcuts.length === 0) {
            return GestureKind.None;
        }
        return shortcuts[0];
    }

    public startRecordingShortcut(onShortcutRecorded: OnShortcutRecorded): void {
        if (this._onUpdateOperation != null) {
            this.abortActiveOperationHandler();
        }
        this._recordingShortcut = true;
        this._onShortcutRecorded = onShortcutRecorded;
    }

    public stopRecordingShortcut(): void {
        this._recordingShortcut = false;
        this._onShortcutRecorded = null;
    }

    public isRecordingShortcut(): boolean {
        return this._recordingShortcut;
    }

    public setActiveOperationHandler(onUpdateOperation: OnUpdateOperation): void {
        if (this.hasActiveOperationHandler()) {
            throw new Error("Tried to register operation handler while another was in progress");
        }

        this._onUpdateOperation = onUpdateOperation;
    }

    public hasActiveOperationHandler(): boolean {
        return this._onUpdateOperation != null;
    }

    public abortActiveOperationHandler(): void {
        // @TODO: I may need to do something else here.
        this._onUpdateOperation = null;
    }

    public abortSpecificOperationHandler(onUpdateOperation: OnUpdateOperation): void {
        if (this._onUpdateOperation === onUpdateOperation) {
            this.abortActiveOperationHandler();
        }
    }

    private _updateOperationContext(event: Event, gesture: EncodedGesture): void {
        if (event.type === "mousedown") {
            const dragging: boolean = this._dragging;
            const x0: number = dragging ? this._dragStartGesture.x : 0;
            const y0: number = dragging ? this._dragStartGesture.y : 0;
            const gesture0: EncodedGesture = dragging ? this._dragStartGesture.toEncodedGesture() : GestureKind.None;
            this._operationContext.x0 = x0;
            this._operationContext.y0 = y0;
            this._operationContext.gesture0 = gesture0;
            this._operationContext.element0 = this._draggingTarget;
        }
        const x1: number = this._mouseX;
        const y1: number = this._mouseY;
        const gesture1: EncodedGesture = gesture;
        this._operationContext.x1 = x1;
        this._operationContext.y1 = y1;
        this._operationContext.gesture1 = gesture1;
    }

    private _updateActiveOperation(): OperationResponse | null {
        if (this._onUpdateOperation == null) {
            return null;
        }

        const response: OperationResponse = this._onUpdateOperation(this._operationContext);
        if (response === OperationResponse.Aborted || response === OperationResponse.Done) {
            this._onUpdateOperation = null;
        }
        return response;
    }

    private _executePanelAction(
        area: AreaKind,
        panel: RegisteredPanel | undefined,
        gesture: EncodedGesture,
        operationContext: OperationContext,
    ): ActionResponse {
        let response: ActionResponse = ActionResponse.NotApplicable;

        // Bail out if there's no panel.
        if (area === AreaKind.Global || panel == null) return response;

        const bindings: InputBinding[] | undefined = (
            this._bindingsByArea.get(area)?.get(gesture)
        );
        // Bail out if there's nothing mapped to this gesture.
        if (bindings == null) return response;

        const bindingCount: number = bindings.length;
        for (let i: number = 0; i < bindingCount; i++) {
            const binding: InputBinding = bindings[i];
            response = panel.onAction(binding.action, operationContext);
            // Action did something or started an operation, so we're done.
            if (response !== ActionResponse.NotApplicable) break;
        }

        return response;
    }

    private _executeGlobalAction(gesture: EncodedGesture, operationContext: OperationContext): ActionResponse {
        let response: ActionResponse = ActionResponse.NotApplicable;

        const bindings: InputBinding[] | undefined = (
            this._bindingsByArea.get(AreaKind.Global)?.get(gesture)
        );
        // Bail out if there's nothing mapped to this gesture.
        if (bindings == null) return response;

        const bindingCount: number = bindings.length;
        for (let i: number = 0; i < bindingCount; i++) {
            const binding: InputBinding = bindings[i];
            response = this._onGlobalAction(binding.action, operationContext);
            // Action did something or started an operation, so we're done.
            if (response !== ActionResponse.NotApplicable) break;
        }

        return response;
    }

    private _performActionExecution(
        area: AreaKind,
        panel: RegisteredPanel | undefined,
        gesture: EncodedGesture,
        operationContext: OperationContext,
    ): ActionResponse {
        if (this._shouldBlockActions()) {
            return ActionResponse.NotApplicable;
        }

        let response: ActionResponse = this._executePanelAction(
            area,
            panel,
            gesture,
            operationContext,
        );
        if (response === ActionResponse.NotApplicable) {
            response = this._executeGlobalAction(gesture, operationContext);
        }
        return response;
    }

    public executeAction(kind: ActionKind): ActionResponse {
        // @TODO: Hmm. I added this without thinking too much about it. The
        // thing is that it's unlikely that someone could have e.g. a box
        // selection in progress, and somehow still execute an action like play.
        // Operations eat all inputs here, so you can't open the command palette.
        if (this.hasActiveOperationHandler()) return ActionResponse.NotApplicable;

        // @TODO: Since the command palette is the only caller of executeAction,
        // I'm just storing this here right now, but it may have to be a more
        // nuanced thing later on.
        this._lastExecutedAction = kind;

        // Note that tool-specific actions won't be reachable this way. I think
        // that's okay though, that probably shouldn't be happening anyway.
        const area: AreaKind = getAreaFromAction(kind);

        if (area === AreaKind.Global) {
            // @TODO: Decide what to do about the operation context here.
            return this._onGlobalAction(kind, this._operationContext);
        }

        let panel: RegisteredPanel | undefined = undefined;

        // Prefer the active panel if its "area" matches the action.
        if (this._activePanelId != null) {
            const activePanel: RegisteredPanel | undefined = (
                this._registeredPanelsById.get(this._activePanelId)
            );
            if (activePanel != null && activePanel.kind === area) {
                panel = activePanel;
            }
        }

        // Couldn't find a suitable active panel, so search until we find
        // another, disregarding its active status.
        let shouldActivatePanel: boolean = false;
        if (panel == null) {
            for (const otherPanel of this._registeredPanelsById.values()) {
                if (otherPanel.kind === area) {
                    shouldActivatePanel = true;
                    panel = otherPanel;
                    break;
                }
            }
        }

        let response: ActionResponse = ActionResponse.NotApplicable;
        if (panel != null) {
            if (shouldActivatePanel) {
                // @TODO: ...
            }

            // @TODO: Decide what to do about the operation context here.
            response = panel.onAction(kind, this._operationContext);
        }

        return response;
    }

    // @TODO: Since I'm using one method for everything anyway, use handleEvent?
    // That way I don't need this arrow function. That said, the only reason I'd
    // care about that is it could help saving memory, but only one instance of
    // this class should exist anyway...
    private _onEvent = (event: Event): void => {
        let handled: boolean = false;
        let shouldPreventDefault: boolean = false;
        let shouldStopPropagation: boolean = false;

        const target: HTMLElement | null = event.target as HTMLElement;

        // @TODO: Not too sure about this. May only be warranted for the mouse.
        if (
            (
                event.type !== "mousemove"
                && event.type !== "mouseup"
                && event.type !== "wheel"
            )
            && target !== document.body
            && !this._rootElement.contains(target)
        ) return;

        // @TODO: Consider removing this, and relying on wrapping all text
        // inputs inside our components, then always calling `stopPropagation`
        // when needed in those.
        const isEditingText: boolean = (
            (
                target instanceof HTMLInputElement
                && (
                    target.type === "text"
                    || target.type === "number"
                )
            )
            || target instanceof HTMLTextAreaElement
        );
        if (isEditingText) return;

        // @TODO: If any menus (and modals?) are open, don't bother.
        // ...or maybe define their keyboard navigation as temporary bindings?
        // Note that in vscode at least, menus aren't completely modal.

        // @NOTE: This may be slow, so after changing the bindings this probably
        // should be eagerly recomputed as soon as possible instead of here.
        this.computeCurrentBindings();

        const activePanel: RegisteredPanel | undefined = (
            this._activePanelId != null
            ? this._registeredPanelsById.get(this._activePanelId)
            : undefined
        );
        const areaKind: AreaKind = (
            activePanel != null ? activePanel.kind : AreaKind.Global
        );

        let areaUnderTheMouse: AreaKind = areaKind;
        let panelUnderTheMouse: RegisteredPanel | undefined = activePanel;
        if (event.type === "mousedown" || event.type === "wheel") {
            let el: HTMLElement | null = target;
            while (el != null) {
                const found: RegisteredPanel | undefined = this._panelsByElement.get(el);
                if (found != null) {
                    areaUnderTheMouse = found.kind;
                    panelUnderTheMouse = found;
                    break;
                }
                el = el.parentElement;
            }
        }

        switch (event.type) {
            case "mousedown": {
                const mouseEvent: MouseEvent = event as MouseEvent;

                this._mouseX = mouseEvent.clientX;
                this._mouseY = mouseEvent.clientY;

                parseMouseEvent(
                    this._currentMouseGesture,
                    mouseEvent,
                    this._previousMouseGesture,
                    this._dragging,
                    this._dragStartGesture,
                );

                if (!this._dragging) {
                    this._dragging = true;
                    this._draggingTarget = target;
                    this._dragStartGesture.copy(this._currentMouseGesture);
                }

                const gesture: EncodedGesture = this._currentMouseGesture.toEncodedGesture();
                this._updateOperationContext(event, gesture);

                if (this._currentMouseGesture.kind === GestureKind.Press) {
                    if (this.hasActiveOperationHandler()) {
                        const response: OperationResponse | null = this._updateActiveOperation();
                        if (response != null) {
                            handled = true;
                        }
                    } else {
                        // @TODO: I can't just run the operation right here. I
                        // may need to instead update the operation context
                        // again, so that we run it at least here to start with
                        // (since otherwise we have to wait until the next
                        // event, which should happen anyway, though it's a bit
                        // weird if there's a visible "wait"), but without
                        // reporting the same current gesture.
                        const response: ActionResponse = this._performActionExecution(
                            areaKind,
                            activePanel,
                            gesture,
                            this._operationContext,
                        );

                        if (response !== ActionResponse.NotApplicable) {
                            handled = true;
                        }
                    }
                }

                shouldPreventDefault = handled;
                shouldStopPropagation = handled;
                this._ignoreNextContextMenuEvent = (
                    this.hasActiveOperationHandler()
                    || handled
                    || activePanel != null
                );

                this._previousMouseGesture.copy(this._currentMouseGesture);
            } break;
            case "mousemove": {
                const mouseEvent: MouseEvent = event as MouseEvent;

                this._mouseX = mouseEvent.clientX;
                this._mouseY = mouseEvent.clientY;

                parseMouseEvent(
                    this._currentMouseGesture,
                    mouseEvent,
                    this._previousMouseGesture,
                    this._dragging,
                    this._dragStartGesture,
                );

                const gesture: EncodedGesture = this._currentMouseGesture.toEncodedGesture();
                this._updateOperationContext(event, gesture);

                if (this.hasActiveOperationHandler()) {
                    const response: OperationResponse | null = this._updateActiveOperation();
                    if (response != null) {
                        handled = true;
                    }
                } else {
                    if (this._dragging) {
                        // @TODO: I can't just run the operation right here. I
                        // may need to instead update the operation context
                        // again, so that we run it at least here to start with
                        // (since otherwise we have to wait until the next
                        // event, which should happen anyway, though it's a bit
                        // weird if there's a visible "wait"), but without
                        // reporting the same current gesture.
                        const response: ActionResponse = this._performActionExecution(
                            areaKind,
                            activePanel,
                            gesture,
                            this._operationContext,
                        );

                        if (response !== ActionResponse.NotApplicable) {
                            handled = true;
                        }
                    }
                }

                // @TODO: Do I even need to do this?
                shouldPreventDefault = handled;
                shouldStopPropagation = handled;
                this._ignoreNextContextMenuEvent = handled;

                this._previousMouseGesture.copy(this._currentMouseGesture);
            } break;
            case "mouseup": {
                const mouseEvent: MouseEvent = event as MouseEvent;

                this._mouseX = mouseEvent.clientX;
                this._mouseY = mouseEvent.clientY;

                parseMouseEvent(
                    this._currentMouseGesture,
                    mouseEvent,
                    this._previousMouseGesture,
                    this._dragging,
                    this._dragStartGesture,
                );

                const gesture: EncodedGesture = this._currentMouseGesture.toEncodedGesture();
                this._updateOperationContext(event, gesture);

                if (this.hasActiveOperationHandler()) {
                    const response: OperationResponse | null = this._updateActiveOperation();
                    if (response != null) {
                        handled = true;
                    }
                } else {
                    if (this._currentMouseGesture.kind === GestureKind.Release) {
                        // @TODO: I can't just run the operation right here. I
                        // may need to instead update the operation context
                        // again, so that we run it at least here to start with
                        // (since otherwise we have to wait until the next
                        // event, which should happen anyway, though it's a bit
                        // weird if there's a visible "wait"), but without
                        // reporting the same current gesture.
                        const response: ActionResponse = this._performActionExecution(
                            areaKind,
                            activePanel,
                            gesture,
                            this._operationContext,
                        );

                        if (response !== ActionResponse.NotApplicable) {
                            handled = true;
                        }
                    }
                }

                if (this._currentMouseGesture.kind === GestureKind.Release) {
                    this._dragging = false;
                    this._draggingTarget = null;
                    this._operationContext.x0 = 0;
                    this._operationContext.y0 = 0;
                    this._operationContext.gesture0 = GestureKind.None;
                    this._operationContext.element0 = null;
                }

                shouldPreventDefault = handled;
                shouldStopPropagation = handled;
                this._ignoreNextContextMenuEvent = handled;

                this._previousMouseGesture.copy(this._currentMouseGesture);
            } break;
            case "keydown": {
                const keyboardEvent: KeyboardEvent = event as KeyboardEvent;

                parseKeyboardEvent(this._currentKeyboardGesture, keyboardEvent);

                const gesture: EncodedGesture = this._currentKeyboardGesture.toEncodedGesture();
                this._updateOperationContext(event, gesture);

                if (!this._recordingShortcut) {
                    if (this.hasActiveOperationHandler()) {
                        const response: OperationResponse | null = this._updateActiveOperation();
                        if (response != null) {
                            handled = true;
                        }
                    } else {
                        // @TODO: I can't just run the operation right here. I
                        // may need to instead update the operation context
                        // again, so that we run it at least here to start with
                        // (since otherwise we have to wait until the next
                        // event, which should happen anyway, though it's a bit
                        // weird if there's a visible "wait"), but without
                        // reporting the same current gesture.
                        const response: ActionResponse = this._performActionExecution(
                            areaKind,
                            activePanel,
                            gesture,
                            this._operationContext,
                        );

                        if (response !== ActionResponse.NotApplicable) {
                            handled = true;
                        }
                    }
                } else {
                    handled = true;
                }

                shouldPreventDefault = handled;
                shouldStopPropagation = handled;
                this._ignoreNextContextMenuEvent = handled;
            } break;
            case "keyup": {
                const keyboardEvent: KeyboardEvent = event as KeyboardEvent;

                parseKeyboardEvent(this._currentKeyboardGesture, keyboardEvent);

                const gesture: EncodedGesture = this._currentKeyboardGesture.toEncodedGesture();
                this._updateOperationContext(event, gesture);

                if (!this._recordingShortcut) {
                    if (this.hasActiveOperationHandler()) {
                        const response: OperationResponse | null = this._updateActiveOperation();
                        if (response != null) {
                            handled = true;
                        }
                    } else {
                        // @TODO: I can't just run the operation right here. I
                        // may need to instead update the operation context
                        // again, so that we run it at least here to start with
                        // (since otherwise we have to wait until the next
                        // event, which should happen anyway, though it's a bit
                        // weird if there's a visible "wait"), but without
                        // reporting the same current gesture.
                        const response: ActionResponse = this._performActionExecution(
                            areaKind,
                            activePanel,
                            gesture,
                            this._operationContext,
                        );

                        if (response !== ActionResponse.NotApplicable) {
                            handled = true;
                        }
                    }
                } else {
                    if (this._onShortcutRecorded != null) {
                        this._onShortcutRecorded(this._currentKeyboardGesture.toEncodedGesture(), keyboardEvent);
                    }
                    this._recordingShortcut = false;

                    handled = true;
                }

                shouldPreventDefault = handled;
                shouldStopPropagation = handled;
                this._ignoreNextContextMenuEvent = handled;
            } break;
            case "wheel": {
                const wheelEvent: WheelEvent = event as WheelEvent;

                if (!this._dragging) {
                    parseWheelEvent(this._currentMouseGesture, wheelEvent);

                    const gesture: EncodedGesture = this._currentMouseGesture.toEncodedGesture();
                    this._updateOperationContext(event, gesture);

                    if (this.hasActiveOperationHandler()) {
                        const response: OperationResponse | null = this._updateActiveOperation();
                        if (response != null) {
                            handled = true;
                        }
                    } else {
                        // @TODO: I can't just run the operation right here. I
                        // may need to instead update the operation context
                        // again, so that we run it at least here to start with
                        // (since otherwise we have to wait until the next
                        // event, which should happen anyway, though it's a bit
                        // weird if there's a visible "wait"), but without
                        // reporting the same current gesture.
                        const response: ActionResponse = this._performActionExecution(
                            areaUnderTheMouse,
                            panelUnderTheMouse,
                            gesture,
                            this._operationContext,
                        );

                        if (response !== ActionResponse.NotApplicable) {
                            handled = true;
                        }
                    }

                    shouldPreventDefault = handled;
                    shouldStopPropagation = handled;
                }
            } break;
            case "contextmenu": {
                if (this._ignoreNextContextMenuEvent) {
                    this._ignoreNextContextMenuEvent = false;
                    shouldPreventDefault = true;
                    shouldStopPropagation = true;
                } else {
                    this._dragging = false;
                    this._draggingTarget = null;
                    this._operationContext.x0 = 0;
                    this._operationContext.y0 = 0;
                    this._operationContext.gesture0 = GestureKind.None;
                    this._operationContext.element0 = null;
                }
            } break;
            // @TODO: dragging=false on blur?
        }

        if (shouldPreventDefault) {
            event.preventDefault();
        }

        if (shouldStopPropagation) {
            event.stopImmediatePropagation();
            event.stopPropagation();
        }
    };
}

export interface RegisteredPanel {
    id: string; // From dockview
    element: HTMLElement;
    kind: AreaKind;
    onAction: OnAction;
}

export type OnShortcutRecorded = (gesture: EncodedGesture, event: KeyboardEvent) => void;

export function parseMouseEvent(
    gesture: MouseGesture,
    event: MouseEvent,
    previousGesture: MouseGesture,
    isDragging: boolean,
    dragStartGesture: MouseGesture,
): void {
    let button: MouseButton = MouseButton.None;
    switch (event.button) {
        case 0: { button = MouseButton.Left; } break;
        case 1: { button = MouseButton.Middle; } break;
        case 2: { button = MouseButton.Right; } break;
        // @TODO: 3, 4?
    }
    let modifiers: Mod = Mod.None;
    if (event.ctrlKey) {
        modifiers |= Mod.Ctrl;
    }
    if (event.shiftKey) {
        modifiers |= Mod.Shift;
    }
    if (event.altKey) {
        modifiers |= Mod.Alt;
    }
    if (event.metaKey) {
        modifiers |= Mod.Meta;
    }
    const x: number = event.clientX;
    const y: number = event.clientY;

    gesture.kind = GestureKind.None;
    switch (event.type) {
        case "mousedown": {
            if (button !== MouseButton.None) {
                gesture.kind = isDragging ? GestureKind.Drag : GestureKind.Press;
            }
        } break;
        case "mouseup": {
            if (button !== MouseButton.None) {
                gesture.kind = (
                    isDragging && button !== dragStartGesture.button
                    ? GestureKind.Drag
                    : GestureKind.Release
                );
            }
        } break;
        case "mousemove": {
            // @TODO: Maybe figure this out just based on the buttons held at
            // this time (and possibly the previous mousedown)?
            gesture.kind = (
                isDragging && button !== MouseButton.None
                ? GestureKind.Drag
                : GestureKind.Move
            );
        } break;
    }
    gesture.button = MouseButton.None;
    gesture.clicks = Clicks.None;
    gesture.modifiers = Mod.None;
    if (gesture.kind === GestureKind.Press || gesture.kind === GestureKind.Release) {
        gesture.button = button;
        switch (event.detail) {
            case 1: { gesture.clicks = Clicks.Single; } break;
            case 2: { gesture.clicks = Clicks.Double; } break;
            case 3: { gesture.clicks = Clicks.Triple; } break;
            default: { gesture.clicks = Clicks.None; } break;
        }
        gesture.modifiers = modifiers;
    } else if (gesture.kind === GestureKind.Drag) {
        gesture.button = previousGesture.button;
        gesture.clicks = previousGesture.clicks;
        gesture.modifiers = modifiers;
    }
    gesture.x = x;
    gesture.y = y;
}

export function parseWheelEvent(gesture: MouseGesture, event: WheelEvent): void {
    gesture.kind = GestureKind.None;
    const deltaY = event.deltaY;
    if (deltaY < 0) {
        gesture.kind = GestureKind.Press;
        gesture.button = MouseButton.WheelUp;
    } else if (deltaY > 0) {
        gesture.kind = GestureKind.Press;
        gesture.button = MouseButton.WheelDown;
    }

    gesture.clicks = Clicks.Single;

    gesture.modifiers = Mod.None;
    if (event.ctrlKey) {
        gesture.modifiers |= Mod.Ctrl;
    }
    if (event.shiftKey) {
        gesture.modifiers |= Mod.Shift;
    }
    if (event.altKey) {
        gesture.modifiers |= Mod.Alt;
    }
    if (event.metaKey) {
        gesture.modifiers |= Mod.Meta;
    }

    gesture.x = 0;
    gesture.y = deltaY;
}

// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/location
export const enum DOM_KEY_LOCATION {
    STANDARD = 0,
    LEFT = 1,
    RIGHT = 2,
    NUMPAD = 3,
}

// I have a soft rule to avoid code running at the top level like this (except
// for the entry point), but in this case it's fine.
const eventKeyToInternalKey: Map<string, Key> = new Map();
const eventCodeToInternalKey: Map<string, Key> = new Map();
const eventKeyCodeToInternalKey: Map<number, Key> = new Map();
const empty = "" as const; // For slightly better minification.
type KeyTableEntry = [
    /* use bitfeld */ number,
    /* internal key */ number,
    /* event.key */ string,
    /* event.code */ string,
    /* event.keyCode */ number,
];
(<KeyTableEntry[]>[
    // @TODO: This will probably need to be changed further.
    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyCode
    // https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values
    // https://github.com/microsoft/vscode/blob/2509d0f66d2b5866e9d8322e3f8f709b33e11352/src/vs/base/common/keyCodes.ts
    // use:                     & 0b0100       & 0b0010          & 0b0001
    // use | internal key     | event.key    | event.code      | event.keyCode
    // [0,      Key.None,          empty,         empty,              0],
    // [0,      0,                 empty,         empty,              1],
    // [0,      0,                 empty,         empty,              2],
    // [0,      0,                 empty,         empty,              3],
    // [0,      0,                 empty,         empty,              4],
    // [0,      0,                 empty,         empty,              5],
    // [0,      0,                 empty,         empty,              6],
    // [0,      0,                 empty,         empty,              7],
    [0b1111, Key.Backspace,     "Backspace",   "Backspace",        8],
    [0b1111, Key.Tab,           "Tab",         "Tab",              9],
    // [0,      0,                 empty,         empty,             10],
    // [0,      0,                 empty,         empty,             11],
    [0b1101, Key.Clear,         "Clear",       empty /* ??? */,   12],
    [0b1111, Key.Enter,         "Enter",       "Enter",           13],
    [0b1010, Key.NumpadEnter,   empty,         "NumpadEnter",     13],
    // [0,      0,                 empty,         empty,             14],
    // [0,      0,                 empty,         empty,             15],
    // [0,      0,                 "Shift",       "ShiftLeft",       16],
    // [0,      0,                 "Control",     "ControlLeft",     17],
    // [0,      0,                 "Alt",         "AltLeft",         18],
    [0b1111, Key.Pause,         "Pause",       "Pause",           19],
    [0b1111, Key.CapsLock,      "CapsLock",    "CapsLock",        20],
    // [0,      0,                 empty,         empty,             21],
    // [0,      0,                 empty,         empty,             22],
    // [0,      0,                 empty,         empty,             23],
    // [0,      0,                 empty,         empty,             24],
    // [0,      0,                 empty,         empty,             25],
    // [0,      0,                 empty,         empty,             26],
    [0b1111, Key.Escape,        "Escape",      "Escape",          27],
    // [0,      0,                 empty,         empty,             28],
    // [0,      0,                 empty,         empty,             29],
    // [0,      0,                 empty,         empty,             30],
    // [0,      0,                 empty,         empty,             31],
    [0b1111, Key.Space,         " ",           "Space",           32],
    [0b1111, Key.PageUp,        "PageUp",      "PageUp",          33],
    [0b1111, Key.PageDown,      "PageDown",    "PageDown",        34],
    [0b1111, Key.End,           "End",         "End",             35],
    [0b1111, Key.Home,          "Home",        "Home",            36],
    [0b1111, Key.ArrowLeft,     "ArrowLeft",   "ArrowLeft",       37],
    [0b1111, Key.ArrowUp,       "ArrowUp",     "ArrowUp",         38],
    [0b1111, Key.ArrowRight,    "ArrowRight",  "ArrowRight",      39],
    [0b1111, Key.ArrowDown,     "ArrowDown",   "ArrowDown",       40],
    // [0,      0,                 empty,         empty,             41],
    // [0,      0,                 empty,         empty,             42],
    // [0,      0,                 empty,         empty,             43],
    // [0,      0,                 empty,         empty,             44],
    [0b1111, Key.Insert,        "Insert",      "Insert",          45],
    [0b1111, Key.Delete,        "Delete",      "Delete",          46],
    // [0,      0,                 empty,         empty,             47],
    [0b1111, Key.Number0,       "0",           "Digit0",          48],
    [0b1111, Key.Number1,       "1",           "Digit1",          49],
    [0b1111, Key.Number2,       "2",           "Digit2",          50],
    [0b1111, Key.Number3,       "3",           "Digit3",          51],
    [0b1111, Key.Number4,       "4",           "Digit4",          52],
    [0b1111, Key.Number5,       "5",           "Digit5",          53],
    [0b1111, Key.Number6,       "6",           "Digit6",          54],
    [0b1111, Key.Number7,       "7",           "Digit7",          55],
    [0b1111, Key.Number8,       "8",           "Digit8",          56],
    [0b1111, Key.Number9,       "9",           "Digit9",          57],
    // [0,      0,                 empty,         empty,             58],
    // [0,      0,                 empty,         empty,             59],
    // [0,      0,                 empty,         empty,             60],
    // [0,      0,                 empty,         empty,             61],
    // [0,      0,                 empty,         empty,             62],
    // [0,      0,                 empty,         empty,             63],
    // [0,      0,                 empty,         empty,             64],
    [0b1111, Key.A,             "a",           "KeyA",            65],
    [0b1111, Key.B,             "b",           "KeyB",            66],
    [0b1111, Key.C,             "c",           "KeyC",            67],
    [0b1111, Key.D,             "d",           "KeyD",            68],
    [0b1111, Key.E,             "e",           "KeyE",            69],
    [0b1111, Key.F,             "f",           "KeyF",            70],
    [0b1111, Key.G,             "g",           "KeyG",            71],
    [0b1111, Key.H,             "h",           "KeyH",            72],
    [0b1111, Key.I,             "i",           "KeyI",            73],
    [0b1111, Key.J,             "j",           "KeyJ",            74],
    [0b1111, Key.K,             "k",           "KeyK",            75],
    [0b1111, Key.L,             "l",           "KeyL",            76],
    [0b1111, Key.M,             "m",           "KeyM",            77],
    [0b1111, Key.N,             "n",           "KeyN",            78],
    [0b1111, Key.O,             "o",           "KeyO",            79],
    [0b1111, Key.P,             "p",           "KeyP",            80],
    [0b1111, Key.Q,             "q",           "KeyQ",            81],
    [0b1111, Key.R,             "r",           "KeyR",            82],
    [0b1111, Key.S,             "s",           "KeyS",            83],
    [0b1111, Key.T,             "t",           "KeyT",            84],
    [0b1111, Key.U,             "u",           "KeyU",            85],
    [0b1111, Key.V,             "v",           "KeyV",            86],
    [0b1111, Key.W,             "w",           "KeyW",            87],
    [0b1111, Key.X,             "x",           "KeyX",            88],
    [0b1111, Key.Y,             "y",           "KeyY",            89],
    [0b1111, Key.Z,             "z",           "KeyZ",            90],
    // [0,      0,                 "Meta",        "MetaLeft",        91],
    // [0,      0,                 empty,         empty,             92],
    [0b1111, Key.ContextMenu,   "ContextMenu", "ContextMenu",     93],
    // [0,      0,                 empty,         empty,             94],
    // [0,      0,                 empty,         empty,             95],
    [0b1011, Key.Numpad0,       "0",           "Numpad0",         96], // With numlock on
    [0b1011, Key.Numpad1,       "1",           "Numpad1",         97], // With numlock on
    [0b1011, Key.Numpad2,       "2",           "Numpad2",         98], // With numlock on
    [0b1011, Key.Numpad3,       "3",           "Numpad3",         99], // With numlock on
    [0b1011, Key.Numpad4,       "4",           "Numpad4",        100], // With numlock on
    [0b1011, Key.Numpad5,       "5",           "Numpad5",        101], // With numlock on
    [0b1011, Key.Numpad6,       "6",           "Numpad6",        102], // With numlock on
    [0b1011, Key.Numpad7,       "7",           "Numpad7",        103], // With numlock on
    [0b1011, Key.Numpad8,       "8",           "Numpad8",        104], // With numlock on
    [0b1011, Key.Numpad9,       "9",           "Numpad9",        105], // With numlock on
    [0b1011, Key.NumpadMul,     "*",           "NumpadMultiply", 106],
    [0b1011, Key.NumpadAdd,     "+",           "NumpadAdd",      107],
    [0b1011, Key.NumpadComma,   ",",           "NumpadComma",    108], // With numlock on
    [0b1011, Key.NumpadSub,     "-",           "NumpadSubtract", 109],
    [0b1011, Key.NumpadDecimal, ".",           "NumpadDecimal",  110],
    [0b1011, Key.NumpadDiv,     "/",           "NumpadDivide",   111],
    [0b1111, Key.F1,            "F1",          "F1",             112],
    [0b1111, Key.F2,            "F2",          "F2",             113],
    [0b1111, Key.F3,            "F3",          "F3",             114],
    [0b1111, Key.F4,            "F4",          "F4",             115],
    [0b1111, Key.F5,            "F5",          "F5",             116],
    [0b1111, Key.F6,            "F6",          "F6",             117],
    [0b1111, Key.F7,            "F7",          "F7",             118],
    [0b1111, Key.F8,            "F8",          "F8",             119],
    [0b1111, Key.F9,            "F9",          "F9",             120],
    [0b1111, Key.F10,           "F10",         "F10",            121],
    [0b1111, Key.F11,           "F11",         "F11",            122],
    [0b1111, Key.F12,           "F12",         "F12",            123],
    [0b1111, Key.F13,           "F13",         "F13",            124],
    [0b1111, Key.F14,           "F14",         "F14",            125],
    [0b1111, Key.F15,           "F15",         "F15",            126],
    [0b1111, Key.F16,           "F16",         "F16",            127],
    [0b1111, Key.F17,           "F17",         "F17",            128],
    [0b1111, Key.F18,           "F18",         "F18",            129],
    [0b1111, Key.F19,           "F19",         "F19",            130],
    [0b1111, Key.F20,           "F20",         "F20",            131],
    [0b1111, Key.F21,           "F21",         "F21",            132],
    [0b1111, Key.F22,           "F22",         "F22",            133],
    [0b1111, Key.F23,           "F23",         "F23",            134],
    [0b1111, Key.F24,           "F24",         "F24",            135],
    // [0,      0,                 empty,         empty,            136],
    // [0,      0,                 empty,         empty,            137],
    // [0,      0,                 empty,         empty,            138],
    // [0,      0,                 empty,         empty,            139],
    // [0,      0,                 empty,         empty,            140],
    // [0,      0,                 empty,         empty,            141],
    // [0,      0,                 empty,         empty,            142],
    // [0,      0,                 empty,         empty,            143],
    [0b1111, Key.NumLock,       "NumLock",     "NumLock",        144],
    [0b1111, Key.ScrollLock,    "ScrollLock",  "ScrollLock",     145],
    // [0,      0,                 empty,         empty,            146],
    // [0,      0,                 empty,         empty,            147],
    // [0,      0,                 empty,         empty,            148],
    // [0,      0,                 empty,         empty,            149],
    // [0,      0,                 empty,         empty,            150],
    // [0,      0,                 empty,         empty,            151],
    // [0,      0,                 empty,         empty,            152],
    // [0,      0,                 empty,         empty,            153],
    // [0,      0,                 empty,         empty,            154],
    // [0,      0,                 empty,         empty,            155],
    // [0,      0,                 empty,         empty,            156],
    // [0,      0,                 empty,         empty,            157],
    // [0,      0,                 empty,         empty,            158],
    // [0,      0,                 empty,         empty,            159],
    // [0,      0,                 empty,         empty,            160],
    // [0,      0,                 empty,         empty,            161],
    // [0,      0,                 empty,         empty,            162],
    // [0,      0,                 empty,         empty,            163],
    // [0,      0,                 empty,         empty,            164],
    // [0,      0,                 empty,         empty,            165],
    // [0,      0,                 empty,         empty,            166],
    // [0,      0,                 empty,         empty,            167],
    // [0,      0,                 empty,         empty,            168],
    // [0,      0,                 empty,         empty,            169],
    // [0,      0,                 empty,         empty,            170],
    // [0,      0,                 empty,         empty,            171],
    // [0,      0,                 empty,         empty,            172],
    // [0,      0,                 empty,         empty,            173],
    // [0,      0,                 empty,         empty,            174],
    // [0,      0,                 empty,         empty,            175],
    // [0,      0,                 empty,         empty,            176],
    // [0,      0,                 empty,         empty,            177],
    // [0,      0,                 empty,         empty,            178],
    // [0,      0,                 empty,         empty,            179],
    // [0,      0,                 empty,         empty,            180],
    // [0,      0,                 empty,         empty,            181],
    // [0,      0,                 empty,         empty,            182],
    // [0,      0,                 empty,         empty,            183],
    // [0,      0,                 empty,         empty,            184],
    // [0,      0,                 empty,         empty,            185],
    [0b1111, Key.Semicolon,     ";",           "Semicolon",      186],
    [0b1111, Key.Equal,         "=",           "Equal",          187],
    [0b1111, Key.Comma,         ",",           "Comma",          188],
    [0b1111, Key.Minus,         "-",           "Minus",          189],
    [0b1111, Key.Period,        ".",           "Period",         190],
    [0b1111, Key.Slash,         "/",           "Slash",          191],
    [0b1111, Key.Backquote,     "`",           "Backquote",      192],
    // [0,      0,                 empty,         empty,            193],
    // [0,      0,                 empty,         empty,            194],
    // [0,      0,                 empty,         empty,            195],
    // [0,      0,                 empty,         empty,            196],
    // [0,      0,                 empty,         empty,            197],
    // [0,      0,                 empty,         empty,            198],
    // [0,      0,                 empty,         empty,            199],
    // [0,      0,                 empty,         empty,            200],
    // [0,      0,                 empty,         empty,            201],
    // [0,      0,                 empty,         empty,            202],
    // [0,      0,                 empty,         empty,            203],
    // [0,      0,                 empty,         empty,            204],
    // [0,      0,                 empty,         empty,            205],
    // [0,      0,                 empty,         empty,            206],
    // [0,      0,                 empty,         empty,            207],
    // [0,      0,                 empty,         empty,            208],
    // [0,      0,                 empty,         empty,            209],
    // [0,      0,                 empty,         empty,            210],
    // [0,      0,                 empty,         empty,            211],
    // [0,      0,                 empty,         empty,            212],
    // [0,      0,                 empty,         empty,            213],
    // [0,      0,                 empty,         empty,            214],
    // [0,      0,                 empty,         empty,            215],
    // [0,      0,                 empty,         empty,            216],
    // [0,      0,                 empty,         empty,            217],
    // [0,      0,                 empty,         empty,            218],
    [0b1111, Key.BracketLeft,   "[",           "BracketLeft",    219],
    [0b1111, Key.Backslash,     "\\",          "Backslash",      220],
    [0b1111, Key.BracketRight,  "]",           "BracketRight",   221],
    [0b1111, Key.Quote,         "'",           "Quote",          222],
    // [0,      0,                 empty,         empty,            223],
    // [0,      0,                 empty,         empty,            224],
    // [0,      0,                 empty,         empty,            225],
    // [0,      0,                 empty,         empty,            226],
    // [0,      0,                 empty,         empty,            227],
    // [0,      0,                 empty,         empty,            228],
    [0b0001, Key.IsComposing,   empty,         empty,            229],
    // [0,      0,                 empty,         empty,            230],
    // [0,      0,                 empty,         empty,            231],
    // [0,      0,                 empty,         empty,            232],
    // [0,      0,                 empty,         empty,            233],
    // [0,      0,                 empty,         empty,            234],
    // [0,      0,                 empty,         empty,            235],
    // [0,      0,                 empty,         empty,            236],
    // [0,      0,                 empty,         empty,            237],
    // [0,      0,                 empty,         empty,            238],
    // [0,      0,                 empty,         empty,            239],
    // [0,      0,                 empty,         empty,            240],
    // [0,      0,                 empty,         empty,            241],
    // [0,      0,                 empty,         empty,            242],
    // [0,      0,                 empty,         empty,            243],
    // [0,      0,                 empty,         empty,            244],
    // [0,      0,                 empty,         empty,            245],
    // [0,      0,                 empty,         empty,            246],
    // [0,      0,                 empty,         empty,            247],
    // [0,      0,                 empty,         empty,            248],
    // [0,      0,                 empty,         empty,            249],
    // [0,      0,                 empty,         empty,            250],
    // [0,      0,                 empty,         empty,            251],
    // [0,      0,                 empty,         empty,            252],
    // [0,      0,                 empty,         empty,            253],
    // [0,      0,                 empty,         empty,            254],
    // [0,      0,                 empty,         empty,            255],
]).forEach(([use, internalKey, key, code, keyCode]) => {
    if ((use & 0b0100) !== 0) {
        eventKeyToInternalKey.set(key.toLowerCase(), internalKey);
    }
    if ((use & 0b0010) !== 0) {
        eventCodeToInternalKey.set(code.toLowerCase(), internalKey);
    }
    let k: number = keyCode;
    let v: Key = internalKey;
    let forceKeyCode: boolean = false;
    // Hacky.
    switch (k) {
        case 59: {
            if (isFirefox) {
                forceKeyCode = true;
                v = Key.Semicolon;
            }
        } break;
        case 61: {
            if (isFirefox) {
                forceKeyCode = true;
                v = Key.Equal;
            }
        } break;
        case 108: {
            if (isFirefox) {
                forceKeyCode = true;
            }
        } break;
        case 171: {
            if (isFirefox) {
                forceKeyCode = true;
                v = Key.Equal;
            }
        } break;
        case 173: {
            if (isFirefox) {
                forceKeyCode = true;
                v = Key.Minus;
            }
        } break;
    }
    if (forceKeyCode || (use & 0b0001) !== 0) {
        eventKeyCodeToInternalKey.set(k, v);
    }
});

export function parseKeyboardEvent(gesture: KeyboardGesture, event: KeyboardEvent): void {
    gesture.kind = GestureKind.None;
    switch (event.type) {
        case "keydown": { gesture.kind = GestureKind.Press; } break;
        case "keyup": { gesture.kind = GestureKind.Release; } break;
    }

    gesture.key = Key.None;

    // {
    //     // via event.key
    //     const eventKey: string = event.key.toLowerCase();
    //     const found: Key | undefined = eventKeyToInternalKey.get(eventKey);
    //     if (found != null) {
    //         gesture.key = found;
    //     }
    //     if (event.location === DOM_KEY_LOCATION.NUMPAD) {
    //         // @TODO: Not sure about this.
    //         switch (eventKey) {
    //             case "*": { gesture.key = Key.NumpadMul; } break;
    //             case "+": { gesture.key = Key.NumpadAdd; } break;
    //             case ",": { gesture.key = Key.NumpadComma; } break;
    //             case "-": { gesture.key = Key.NumpadSub; } break;
    //             case ".": { gesture.key = Key.NumpadDecimal; } break;
    //             case "/": { gesture.key = Key.NumpadDiv; } break;
    //             case "enter": { gesture.key = Key.NumpadEnter; } break;
    //             case "0": { gesture.key = Key.Numpad0; } break;
    //             case "1": { gesture.key = Key.Numpad1; } break;
    //             case "2": { gesture.key = Key.Numpad2; } break;
    //             case "3": { gesture.key = Key.Numpad3; } break;
    //             case "4": { gesture.key = Key.Numpad4; } break;
    //             case "5": { gesture.key = Key.Numpad5; } break;
    //             case "6": { gesture.key = Key.Numpad6; } break;
    //             case "7": { gesture.key = Key.Numpad7; } break;
    //             case "8": { gesture.key = Key.Numpad8; } break;
    //             case "9": { gesture.key = Key.Numpad9; } break;
    //         }
    //     }
    // }

    // {
    //     // via event.code
    //     const eventCode: string = event.code.toLowerCase();
    //     const found: Key | undefined = eventCodeToInternalKey.get(eventCode);
    //     if (found != null) {
    //         gesture.key = found;
    //     }
    // }

    {
        // via event.keyCode
        const eventKeyCode: number = event.keyCode;
        const found: Key | undefined = eventKeyCodeToInternalKey.get(eventKeyCode);
        if (found != null) {
            gesture.key = found;
        }
        if (event.location === DOM_KEY_LOCATION.NUMPAD) {
            // @TODO: Not sure about this.
            switch (eventKeyCode) {
                case 13: { gesture.key = Key.NumpadEnter; } break;
            }
        }
    }

    gesture.modifiers = Mod.None;
    if (event.ctrlKey) {
        gesture.modifiers |= Mod.Ctrl;
    }
    if (event.shiftKey) {
        gesture.modifiers |= Mod.Shift;
    }
    if (event.altKey) {
        gesture.modifiers |= Mod.Alt;
    }
    if (event.metaKey) {
        gesture.modifiers |= Mod.Meta;
    }
}
