import { H } from "@synth-playground/dom/index.js";
import { type Component } from "./types.js";
import { UIContext } from "./UIContext.js";
import {
    Menu,
    type MenuItem,
} from "./Menu.js";

export class MenuBar implements Component {
    public element: HTMLDivElement;
    private _ui: UIContext;
    private _menuItems: MenuItem[];
    private _menuButtonsDirty: boolean;
    private _menuButtons: HTMLButtonElement[];
    private _activeMenu: Menu | null;
    private _menuContainer: HTMLElement;

    constructor(ui: UIContext, menuContainer: HTMLElement, menuItems: MenuItem[]) {
        this._ui = ui;

        this._menuItems = menuItems;
        this._menuButtonsDirty = true;
        this._menuButtons = [];
        this._activeMenu = null;
        this._menuContainer = menuContainer;

        this.element = H("div", {
            style: `
                display: flex;
            `,
        });

        this.element.addEventListener("click", this._handleClick);
        this._menuContainer.addEventListener("click", this._handleMenuContainerClick);
    }

    public dispose(): void {
        this.element.removeEventListener("click", this._handleClick);
        this._menuContainer.removeEventListener("click", this._handleMenuContainerClick);
    }

    public render(): void {
        this._renderMenuButtons();
        this._renderActiveMenu();
    }

    private _renderMenuButtons(): void {
        if (!this._menuButtonsDirty) return;
        this._menuButtons.length = 0;
        for (const item of this._menuItems) {
            const itemButton: HTMLButtonElement = H("button", {
                type: "button",
                class: "menubar-button",
            }, item.label ?? "");
            this._menuButtons.push(itemButton);
            this.element.appendChild(itemButton);
        }
        this._menuButtonsDirty = false;
    }

    private _renderActiveMenu(): void {
        if (this._activeMenu != null) {
            this._activeMenu.render();
        }
    }

    private _handleClick = (event: MouseEvent): void => {
        const index: number = this._menuButtons.findIndex(x => x === event.target);
        if (index !== -1) {
            const button: HTMLButtonElement = this._menuButtons[index];
            const menuItems: MenuItem[] | undefined = this._menuItems[index].children;
            const buttonBounds: DOMRect = button.getBoundingClientRect();
            const buttonX: number = buttonBounds.left;
            const buttonY: number = buttonBounds.top;
            const buttonH: number = buttonBounds.height;
            if (this._activeMenu != null) {
                this._activeMenu.close();
                this._activeMenu.dispose();
                this._activeMenu = null;
            }
            this._activeMenu = new Menu(
                this._ui,
                this._menuContainer,
                buttonX,
                buttonY + buttonH,
                menuItems,
            );
            this._menuContainer.appendChild(this._activeMenu.element);
            this._menuContainer.style.pointerEvents = "auto";
            this._ui.scheduleMainRender();
        }
    };

    private _handleMenuContainerClick = (event: MouseEvent): void => {
        if (this._activeMenu != null) {
            this._activeMenu.close();
            this._activeMenu.dispose();
            this._activeMenu = null;
            this._menuContainer.style.pointerEvents = "none";
        }
    };
}
