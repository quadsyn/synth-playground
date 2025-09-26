import { H } from "@synth-playground/browser/dom.js";
import {
    header as headerClassName,
} from "./Dialog.module.css";

// @TODO:
// - I don't know if this should really be in its own module, but I can't think
//   of a better place where this can go at the moment.
// - Maybe rename it to DialogHeaderTemplate? Using camel case here is a bit
//   funky either way.
// - We can pass whatever instead of the actual close button. I don't know if
//   anything can really be done about it though.
export function DialogHeader(title: string, closeButton: Node): HTMLElement {
    return H("div", { class: headerClassName },
        H("div", { style: `flex-grow: 1; text-align: center;` }, title),
        closeButton,
    );
}
