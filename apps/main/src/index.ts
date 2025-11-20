import { Main } from "./ui/Main.js";
import "./index.css";
import "dockview-core/dist/styles/dockview.css";

function main(): void {
    document.body.appendChild(new Main().element);
}

// @TODO: Maybe wrap this in a timeout, to work around this weirdness:
// https://stackoverflow.com/questions/76034491/duplicate-browser-tab-ignores-form-elements-current-values
// I'm seeing it with e.g. the command palette.
main();
