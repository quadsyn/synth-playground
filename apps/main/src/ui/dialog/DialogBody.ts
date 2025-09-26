import { H } from "@synth-playground/browser/dom.js";
import {
    contentWrapper as contentWrapperClassName,
    content as contentClassName,
} from "./Dialog.module.css";

// @TODO:
// - I don't know if this should really be in its own module, but I can't think
//   of a better place where this can go at the moment.
// - Maybe rename it to DialogBodyTemplate? Using camel case here is a bit
//   funky either way.
export function DialogBody(...children: (Node | string)[]): HTMLElement {
    return H("div", { class: contentWrapperClassName },
        H("div", { class: contentClassName },
            ...children,
        ),
    );
}
