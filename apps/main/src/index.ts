import { Main } from "./ui/Main.js";
import "./index.css";
import "dockview-core/dist/styles/dockview.css";

function main(): void {
    document.body.appendChild(new Main().element);
}

main();
