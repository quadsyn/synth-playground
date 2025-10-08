import { H } from "@synth-playground/browser/dom.js";
import iconMouseLeft from "../icons/mouse-left.svg";
import iconMouseRight from "../icons/mouse-right.svg";
import iconMouseMiddle from "../icons/mouse-middle.svg";
import iconWheelUp from "../icons/wheel-up.svg";
import iconWheelDown from "../icons/wheel-down.svg";

// @TODO:
// - Maybe rename these to something else? "Gesture" is a term I associate more
//   with touch inputs. That said, I can't think of a better name that applies
//   to both mouse and keyboard. "Input" already is used too much.
//   - For keys, I think vscode uses "chord" here. I've also seen "keystroke".
// - Define a user-facing format for this, for use when saving or loading
//   shortcut tables.

// Gestures represented with one integer, like so:
// 0b0000000000000_11_111_1_0_1_1_1_1_11111111
//   |             |  |   | | | | | | |
//   |             |  |   | | | | | | Key or MouseButton
//   |             |  |   | | | | | Mod.Ctrl
//   |             |  |   | | | | Mod.Shift
//   |             |  |   | | | Mod.Alt
//   |             |  |   | | Mod.Meta
//   |             |  |   | reserved
//   |             |  |   Device
//   |             |  GestureKind
//   unused        Clicks
// The enums below follow this structure.
export type EncodedGesture = number;

export const enum GestureKind {
    None    = 0,
    Press   = 1 << 14,
    Release = 2 << 14,
    Drag    = 3 << 14,
    Move    = 4 << 14,
}

export const enum Device {
    Keyboard = 0,
    Mouse    = 1 << 13,
}

export const enum Clicks {
    None   = 0,
    Single = 1 << 17,
    Double = 2 << 17,
    Triple = 3 << 17,
}

export const enum MouseButton {
    None       = 0,
    Left       = 1 | Device.Mouse | Clicks.Single,
    LeftDouble = 1 | Device.Mouse | Clicks.Double,
    LeftTriple = 1 | Device.Mouse | Clicks.Triple,
    Right      = 2 | Device.Mouse | Clicks.Single,
    Middle     = 3 | Device.Mouse | Clicks.Single,
    WheelUp    = 4 | Device.Mouse | Clicks.Single,
    WheelDown  = 5 | Device.Mouse | Clicks.Single,
}

export const enum Mod {
    None  = 0,
    Ctrl  = 1 << 8,
    Shift = 1 << 9,
    Alt   = 1 << 10,
    Meta  = 1 << 11,
    // @TODO: CtrlCmd, to match Ctrl on Windows/Linux, and Meta on macOS?
}

export const enum Masks {
    Clicks      = 0b11_000_0_00000_00000000,
    GestureKind = 0b00_111_0_00000_00000000,
    Device      = 0b00_000_1_00000_00000000,
    Mod         = 0b00_000_0_11111_00000000,
    Button      = 0b00_000_0_00000_11111111,
}

export class MouseGesture {
    public kind: GestureKind;
    public button: MouseButton;
    public clicks: Clicks;
    public modifiers: Mod;
    public x: number;
    public y: number;

    constructor() {
        this.kind = GestureKind.None;
        this.button = MouseButton.None;
        this.clicks = Clicks.None;
        this.modifiers = Mod.None;
        this.x = 0;
        this.y = 0;
    }

    public reset(): void {
        this.kind = GestureKind.None;
        this.button = MouseButton.None;
        this.clicks = Clicks.None;
        this.modifiers = Mod.None;
        this.x = 0;
        this.y = 0;
    }

    public copy(that: MouseGesture): void {
        this.kind = that.kind;
        this.button = that.button;
        this.clicks = that.clicks;
        this.modifiers = that.modifiers;
        this.x = that.x;
        this.y = that.y;
    }

    public toEncodedGesture(): EncodedGesture {
        return (
            (this.clicks & Masks.Clicks)
            | (this.kind & Masks.GestureKind)
            | Device.Mouse
            | (this.modifiers & Masks.Mod)
            | (this.button & Masks.Button)
        );
    }

    /** Returns true if the gesture is recognized as a mouse gesture. */
    public parseEncodedGesture(gesture: EncodedGesture): boolean {
        const clicks: Clicks      = (gesture & Masks.Clicks);
        const kind: GestureKind   = (gesture & Masks.GestureKind);
        const isMouse: boolean    = (gesture & Masks.Device) === Device.Mouse;
        const modifiers: Mod      = (gesture & Masks.Mod);
        const button: MouseButton = (gesture & Masks.Button);
        if (!isMouse) {
            return false;
        }
        this.clicks = clicks;
        this.kind = kind;
        this.modifiers = modifiers;
        this.button = button;
        return true;
    }
}

// Internal (and meaningless) key values. Values that come from the browser must
// be converted to these.
export const enum Key {
    // @NOTE: These values are set up assuming that Device.Keyboard is 0. If
    // that's ever changed, then these will need to be assigned explicitly.
    None,
    Backspace,
    Tab,
    Clear,
    Enter,
    NumpadEnter,
    Pause,
    CapsLock,
    Escape,
    Space,
    PageUp,
    PageDown,
    End,
    Home,
    ArrowLeft,
    ArrowUp,
    ArrowRight,
    ArrowDown,
    Insert,
    Delete,
    Number0,
    Number1,
    Number2,
    Number3,
    Number4,
    Number5,
    Number6,
    Number7,
    Number8,
    Number9,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    M,
    N,
    O,
    P,
    Q,
    R,
    S,
    T,
    U,
    V,
    W,
    X,
    Y,
    Z,
    ContextMenu,
    Numpad0,
    Numpad1,
    Numpad2,
    Numpad3,
    Numpad4,
    Numpad5,
    Numpad6,
    Numpad7,
    Numpad8,
    Numpad9,
    NumpadMul,
    NumpadAdd,
    NumpadComma,
    NumpadSub,
    NumpadDecimal,
    NumpadDiv,
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
    F13,
    F14,
    F15,
    F16,
    F17,
    F18,
    F19,
    F20,
    F21,
    F22,
    F23,
    F24,
    NumLock,
    ScrollLock,
    Semicolon,
    Equal,
    Comma,
    Minus,
    Period,
    Slash,
    Backquote,
    BracketLeft,
    Backslash,
    BracketRight,
    Quote,
    IsComposing,
}

export class KeyboardGesture {
    public kind: GestureKind;
    public key: Key;
    public modifiers: Mod;

    constructor() {
        this.kind = GestureKind.None;
        this.key = Key.None;
        this.modifiers = Mod.None;
    }

    public copy(that: KeyboardGesture): void {
        this.kind = that.kind;
        this.key = that.key;
        this.modifiers = that.modifiers;
    }

    public toEncodedGesture(): EncodedGesture {
        return (
            (this.kind & Masks.GestureKind)
            | (this.modifiers & Masks.Mod)
            | (this.key & Masks.Button)
        );
    }

    /** Returns true if the gesture is recognized as a keyboard gesture. */
    public parseEncodedGesture(gesture: EncodedGesture): boolean {
        const kind: GestureKind   = (gesture & Masks.GestureKind);
        const isKeyboard: boolean = (gesture & Masks.Device) === Device.Keyboard;
        const modifiers: Mod      = (gesture & Masks.Mod);
        const key: Key            = (gesture & Masks.Button);
        if (!isKeyboard) {
            return false;
        }
        this.kind = kind;
        this.modifiers = modifiers;
        this.key = key;
        return true;
    }
}

export function gestureHasKind(gesture: EncodedGesture, expected: GestureKind): boolean {
    return (gesture & Masks.GestureKind) === (expected & Masks.GestureKind);
}

/** This only looks at the button, click count, and device. */
export function gestureHasButton(gesture: EncodedGesture, expected: EncodedGesture): boolean {
    return (
        (gesture & (Masks.Button | Masks.Clicks | Masks.Device))
        === (expected & (Masks.Button | Masks.Clicks | Masks.Device))
    );
}

export function isMouseGesture(gesture: EncodedGesture): boolean {
    return (gesture & Masks.Device) === Device.Mouse;
}

export function isKeyboardGesture(gesture: EncodedGesture): boolean {
    return (gesture & Masks.Device) === Device.Keyboard;
}

// @TODO: Localization
export function gestureKindToString(kind: GestureKind): string {
    switch (kind) {
        case GestureKind.None: return "None";
        case GestureKind.Press: return "Press";
        case GestureKind.Release: return "Release";
        case GestureKind.Drag: return "Drag";
        case GestureKind.Move: return "Move";
        default: {
            kind satisfies never // catch missing cases in TS
            return "";
        }
    }
}

// @TODO: Localization
export function mouseButtonToString(button: MouseButton): string {
    switch (button) {
        case MouseButton.None: return "None";
        case MouseButton.Left:
        case MouseButton.LeftDouble:
        case MouseButton.LeftTriple: return "Mouse Left";
        case MouseButton.Right: return "Mouse Right";
        case MouseButton.Middle: return "Mouse Middle";
        case MouseButton.WheelUp: return "Wheel Up";
        case MouseButton.WheelDown: return "Wheel Down";
        default: {
            button satisfies never; // catch missing cases in TS
            return "";
        }
    }
}

// @TODO: Localization
export function keyToString(key: Key): string {
    switch (key) {
        case Key.None: return "None";
        case Key.Backspace: return "Backspace";
        case Key.Tab: return "Tab";
        case Key.Clear: return "Clear";
        case Key.Enter: return "Enter";
        case Key.NumpadEnter: return "NumEnter";
        case Key.Pause: return "Pause";
        case Key.CapsLock: return "CapsLock";
        case Key.Escape: return "Escape";
        case Key.Space: return "Space";
        case Key.PageUp: return "PageUp";
        case Key.PageDown: return "PageDown";
        case Key.End: return "End";
        case Key.Home: return "Home";
        case Key.ArrowLeft: return "Left";
        case Key.ArrowUp: return "Up";
        case Key.ArrowRight: return "Right";
        case Key.ArrowDown: return "Down";
        case Key.Insert: return "Insert";
        case Key.Delete: return "Delete";
        case Key.Number0: return "0";
        case Key.Number1: return "1";
        case Key.Number2: return "2";
        case Key.Number3: return "3";
        case Key.Number4: return "4";
        case Key.Number5: return "5";
        case Key.Number6: return "6";
        case Key.Number7: return "7";
        case Key.Number8: return "8";
        case Key.Number9: return "9";
        case Key.A: return "A";
        case Key.B: return "B";
        case Key.C: return "C";
        case Key.D: return "D";
        case Key.E: return "E";
        case Key.F: return "F";
        case Key.G: return "G";
        case Key.H: return "H";
        case Key.I: return "I";
        case Key.J: return "J";
        case Key.K: return "K";
        case Key.L: return "L";
        case Key.M: return "M";
        case Key.N: return "N";
        case Key.O: return "O";
        case Key.P: return "P";
        case Key.Q: return "Q";
        case Key.R: return "R";
        case Key.S: return "S";
        case Key.T: return "T";
        case Key.U: return "U";
        case Key.V: return "V";
        case Key.W: return "W";
        case Key.X: return "X";
        case Key.Y: return "Y";
        case Key.Z: return "Z";
        case Key.ContextMenu: return "Menu";
        case Key.Numpad0: return "Num0";
        case Key.Numpad1: return "Num1";
        case Key.Numpad2: return "Num2";
        case Key.Numpad3: return "Num3";
        case Key.Numpad4: return "Num4";
        case Key.Numpad5: return "Num5";
        case Key.Numpad6: return "Num6";
        case Key.Numpad7: return "Num7";
        case Key.Numpad8: return "Num8";
        case Key.Numpad9: return "Num9";
        case Key.NumpadMul: return "Num*";
        case Key.NumpadAdd: return "Num+";
        case Key.NumpadComma: return "Num,";
        case Key.NumpadSub: return "Num-";
        case Key.NumpadDecimal: return "Num.";
        case Key.NumpadDiv: return "Num/";
        case Key.F1: return "F1";
        case Key.F2: return "F2";
        case Key.F3: return "F3";
        case Key.F4: return "F4";
        case Key.F5: return "F5";
        case Key.F6: return "F6";
        case Key.F7: return "F7";
        case Key.F8: return "F8";
        case Key.F9: return "F9";
        case Key.F10: return "F10";
        case Key.F11: return "F11";
        case Key.F12: return "F12";
        case Key.F13: return "F13";
        case Key.F14: return "F14";
        case Key.F15: return "F15";
        case Key.F16: return "F16";
        case Key.F17: return "F17";
        case Key.F18: return "F18";
        case Key.F19: return "F19";
        case Key.F20: return "F20";
        case Key.F21: return "F21";
        case Key.F22: return "F22";
        case Key.F23: return "F23";
        case Key.F24: return "F24";
        case Key.NumLock: return "NumLock";
        case Key.ScrollLock: return "ScrollLock";
        case Key.Semicolon: return ";";
        case Key.Equal: return "=";
        case Key.Comma: return ",";
        case Key.Minus: return "-";
        case Key.Period: return ".";
        case Key.Slash: return "/";
        case Key.Backquote: return "`";
        case Key.BracketLeft: return "[";
        case Key.Backslash: return "\\";
        case Key.BracketRight: return "]";
        case Key.Quote: return "'";
        case Key.IsComposing: return ""; // to be exhaustive
        default: {
            key satisfies never // catch missing cases in TS
            return "";
        }
    }
}

// @TODO: Localization
export function gestureToString(gesture: EncodedGesture): string {
    let result: string = "";

    if (gesture !== GestureKind.None) {
        let buttonString: string = "";
        if (isMouseGesture(gesture)) {
            buttonString = mouseButtonToString(gesture & (Masks.Button | Masks.Clicks | Masks.Device));
        } else {
            buttonString = keyToString(gesture & Masks.Button);
        }
        // @TODO: Show macOS specific labels.
        if ((gesture & Mod.Ctrl) !== 0) {
            result += "Ctrl+";
        }
        if ((gesture & Mod.Alt) !== 0) {
            result += "Alt+";
        }
        if ((gesture & Mod.Shift) !== 0) {
            result += "Shift+";
        }
        if ((gesture & Mod.Meta) !== 0) {
            result += "Meta+";
        }
        result += buttonString;
    }

    return result;
}

// @TODO:
// - Highlighting.
// - Localization.
// - Option to use the mouse icons or words.
export function gestureToHtml(gesture: EncodedGesture, container: HTMLElement): HTMLElement {
    if (gesture !== GestureKind.None) {
        // @TODO: Show macOS specific labels.
        if ((gesture & Mod.Ctrl) !== 0) {
            container.appendChild(H("kbd", {}, "Ctrl"));
            container.appendChild(document.createTextNode("+"));
        }
        if ((gesture & Mod.Alt) !== 0) {
            container.appendChild(H("kbd", {}, "Alt"));
            container.appendChild(document.createTextNode("+"));
        }
        if ((gesture & Mod.Shift) !== 0) {
            container.appendChild(H("kbd", {}, "Shift"));
            container.appendChild(document.createTextNode("+"));
        }
        if ((gesture & Mod.Meta) !== 0) {
            container.appendChild(H("kbd", {}, "Meta"));
            container.appendChild(document.createTextNode("+"));
        }
        const useMouseIcons: boolean = true;
        if (isMouseGesture(gesture) && useMouseIcons) {
            let url: string = "";
            switch (gesture & (Masks.Button | Masks.Clicks | Masks.Device)) {
                case MouseButton.None: break;
                // @TODO: Disambiguate from double/triple-click?
                case MouseButton.Left:
                case MouseButton.LeftDouble:
                case MouseButton.LeftTriple: url = iconMouseLeft; break;
                case MouseButton.Right: url = iconMouseRight; break;
                case MouseButton.Middle: url = iconMouseMiddle; break;
                case MouseButton.WheelUp: url = iconWheelUp; break;
                case MouseButton.WheelDown: url = iconWheelDown; break;
            }
            container.appendChild(H("img", { src: url }));
        } else {
            container.appendChild(H("kbd", {},
                isMouseGesture(gesture)
                ? mouseButtonToString(gesture & (Masks.Button | Masks.Clicks | Masks.Device))
                : keyToString(gesture & Masks.Button)
            ));
        }
    }

    return container;
}
