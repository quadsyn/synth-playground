import { SongDocument } from "./SongDocument.js";
import { UIContext } from "./ui/UIContext.js";
import { Main } from "./ui/Main.js";
import "./index.css";
import "dockview-core/dist/styles/dockview.css";

function main(): void {
    const ui: UIContext = new UIContext();
    const doc: SongDocument = new SongDocument();
    const main: Main = new Main(ui, doc);
    ui.registerMainRender(() => { main.render(); });
    document.body.appendChild(main.element);
    main.render();
}

main();
