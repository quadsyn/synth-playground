import { type Component } from "../types.js";

export interface Dialog extends Component {
    /** Called by the dialog manager before it calls `dispose` on this. */
    willClose(): void;
}
