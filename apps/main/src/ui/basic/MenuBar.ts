import { insideRange } from "@synth-playground/common/math.js";
import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import { Menu, type MenuItem } from "./Menu.js";
import { StringId } from "../../localization/StringId.js";

// @TODO:
// - Use roving tabindex.
// - Should moveToLeftMenuItem/moveToRightMenuItem also set focus?
// - How to deal with overflow?
//   - One idea is to replace overflowing menu items with a "More..." menu item.

export class MenuBar implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _menuItems: MenuItem[];
    private _menuButtons: HTMLButtonElement[];
    private _activeMenu: Menu | null;
    private _activeMenuIndex: number;
    private _menuContainer: HTMLElement;

    private _menuButtonsDirty: boolean;
    private _renderedLanguageVersion: number | null;

    constructor(ui: UIContext, menuContainer: HTMLElement, menuItems: MenuItem[]) {
        this._ui = ui;

        this._renderedLanguageVersion = null;

        this._menuItems = menuItems;
        this._menuButtonsDirty = true;
        this._menuButtons = [];
        this._activeMenu = null;
        this._activeMenuIndex = -1;
        this._menuContainer = menuContainer;

        this.element = H("div", {
            style: `
                display: flex;
            `,
        });

        this.element.addEventListener("click", this._handleClick);
        window.addEventListener("mousemove", this._handleMouseMove);
        this._menuContainer.addEventListener("click", this._handleMenuContainerClick);
    }

    public dispose(): void {
        this.element.removeEventListener("click", this._handleClick);
        window.removeEventListener("mousemove", this._handleMouseMove);
        this._menuContainer.removeEventListener("click", this._handleMenuContainerClick);
    }

    public render(): void {
        const languageVersion: number = this._ui.localizationManager.getVersion();

        this._renderMenuButtons(languageVersion);
        this._renderActiveMenu();

        this._renderedLanguageVersion = languageVersion;
    }

    private _renderMenuButtons(languageVersion: number): void {
        if (this._renderedLanguageVersion !== languageVersion) {
            this._menuButtonsDirty = true;
        }

        if (!this._menuButtonsDirty) {
            return;
        }

        while (this.element.firstChild != null) {
            this.element.firstChild.remove();
        }
        this._menuButtons.length = 0;

        for (const item of this._menuItems) {
            if (item.separator) {
                throw new Error("Separators are not allowed here");
            }

            const itemButton: HTMLButtonElement = H("button", {
                type: "button",
                class: "menubar-button",
            }, this._ui.T(item.label ?? ("" as StringId)));
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

    private _cleanUpActiveMenu(): void {
        this._activeMenu = null;
        this._activeMenuIndex = -1;
        this._menuContainer.style.pointerEvents = "none";
    }

    public openActiveMenu(index: number): void {
        this._activeMenuIndex = index;
        const button: HTMLButtonElement = this._menuButtons[index];
        const menuItems: MenuItem[] | undefined = this._menuItems[index].children;
        const buttonBounds: DOMRect = button.getBoundingClientRect();
        const buttonX: number = buttonBounds.left;
        const buttonY: number = buttonBounds.top;
        const buttonH: number = buttonBounds.height;
        this.closeActiveMenu();
        this._activeMenu = new Menu(
            this._ui,
            this._menuContainer,
            buttonX,
            buttonY + buttonH,
            menuItems,
            0,
            () => { this._cleanUpActiveMenu(); },
            () => { this.closeActiveMenu(); },
            () => { this.moveToLeftMenuItem(); },
            () => { this.moveToRightMenuItem(); },
        );
        this._menuContainer.appendChild(this._activeMenu.element);
        this._menuContainer.style.pointerEvents = "auto";
        this._ui.scheduleMainRender();
    }

    public closeActiveMenu(): void {
        if (this._activeMenu != null) {
            this._activeMenu.close();
            this._cleanUpActiveMenu();
        }
    }

    public moveToLeftMenuItem(): void {
        const oldIndex: number = this._activeMenuIndex;
        const newIndex: number = oldIndex === 0 ? this._menuButtons.length - 1 : oldIndex - 1;
        this.closeActiveMenu();
        this.openActiveMenu(newIndex);
        this._activeMenu!.setSelectedMenuButtonIndex(0);
    }

    public moveToRightMenuItem(): void {
        const oldIndex: number = this._activeMenuIndex;
        const newIndex: number = oldIndex === this._menuButtons.length - 1 ? 0 : oldIndex + 1;
        this.closeActiveMenu();
        this.openActiveMenu(newIndex);
        this._activeMenu!.setSelectedMenuButtonIndex(0);
    }

    private _handleClick = (event: MouseEvent): void => {
        const index: number = this._menuButtons.findIndex(button => button === event.target);
        if (index !== -1) {
            this.openActiveMenu(index);
        }
    };

    private _handleMenuContainerClick = (event: MouseEvent): void => {
        this.closeActiveMenu();
    };

    private _handleMouseMove = (event: MouseEvent): void => {
        if (this._activeMenu == null) {
            return;
        }

        const oldIndex: number = this._activeMenuIndex;
        let newIndex: number = -1;
        for (let buttonIndex: number = 0; buttonIndex < this._menuButtons.length; buttonIndex++) {
            const button: HTMLButtonElement = this._menuButtons[buttonIndex];
            const bounds: DOMRect = button.getBoundingClientRect();
            if (
                insideRange(event.clientX, bounds.x, bounds.x + bounds.width)
                && insideRange(event.clientY, bounds.y, bounds.y + bounds.height)
            ) {
                newIndex = buttonIndex;
                break;
            }
        }
        if (newIndex !== -1 && newIndex !== oldIndex) {
            this.closeActiveMenu();
            this.openActiveMenu(newIndex);
        }
    };
}
