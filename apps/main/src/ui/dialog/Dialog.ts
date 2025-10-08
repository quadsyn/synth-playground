import { type ManualComponent } from "../types.js";

export interface Dialog extends ManualComponent {
    /** Called by the dialog manager before it calls `dispose` on this. */
    willClose(): void;
}
