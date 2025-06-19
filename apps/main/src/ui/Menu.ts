import { H } from "@synth-playground/dom/index.js";
import { type Component } from "./types.js";
import { UIContext } from "./UIContext.js";

export class Menu implements Component {
    public element: HTMLDivElement;
    private _ui: UIContext;
    private _menuItems: MenuItem[] | undefined;
    private _menuButtons: Map<HTMLButtonElement, MenuItem>;
    private _menuButtonsDirty: boolean;
    private _activeSubMenu: Menu | null;
    private _menuContainer: HTMLElement;

    constructor(
        ui: UIContext,
        menuContainer: HTMLElement,
        x: number,
        y: number,
        menuItems: MenuItem[] | undefined,
    ) {
        this._ui = ui;

        this._menuItems = menuItems;
        this._menuButtons = new Map();
        this._menuButtonsDirty = true;
        this._activeSubMenu = null;
        this._menuContainer = menuContainer;

        this.element = H("div", {
            style: `
                display: flex;
                flex-direction: column;
                pointer-events: auto;
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                background: #1e1e1e;
                border: 1px solid #3e3e3e;
                max-height: calc(100% - ${y}px);
                overflow-y: auto;
                box-sizing: border-box;
            `,
        });

        this.element.addEventListener("click", this._handleClick);
    }

    public dispose(): void {
        this.element.removeEventListener("click", this._handleClick);
    }

    public render(): void {
        this._renderMenuButtons();
        this._renderActiveSubMenu();
    }

    private _renderMenuButtons(): void {
        if (!this._menuButtonsDirty) return;
        if (this._menuItems == null) return;
        this._menuButtons.clear();
        for (const item of this._menuItems) {
            if (item.separator) {
                const separator: HTMLHRElement = H("hr", {
                    style: `
                        width: calc(100% - 10px);
                        box-sizing: border-box;
                        margin: 4px auto;
                        border: none;
                        background: #3e3e3e;
                        height: 1px;
                    `,
                });
                this.element.appendChild(separator);
            } else {
                const itemButton: HTMLButtonElement = H("button", {
                    type: "button",
                    class: "menu-button",
                    style: `
                    `,
                },
                    H("div", {
                        style: `
                            pointer-events: none;
                            visibility: ${
                                item.getCheckedStatus?.() === true
                                ? "initial"
                                : "hidden"
                            };
                            margin-right: 4px;
                        `,
                    }, "✔"),
                    H("div", {
                        style: `
                            pointer-events: none;
                        `,
                    }, item.label ?? ""),
                );
                if (item.getDisabledStatus != null) {
                    itemButton.disabled = item.getDisabledStatus();
                }
                if (item.shortcut != null) {
                    itemButton.appendChild(H("div", {
                        style: `
                            color: #777777;
                            margin-left: auto;
                            padding-left: 6px;
                            padding-right: 6px;
                        `,
                    }, item.shortcut));
                } else if (item.children != null) {
                    itemButton.appendChild(H("div", {
                        style: `
                            pointer-events: none;
                            visibility: ${
                                item.children != null
                                ? "initial"
                                : "hidden"
                            };
                            margin-left: auto;
                            padding-left: 6px;
                        `,
                    }, "►"));
                } else {
                    itemButton.style.paddingRight = "16px";
                }
                this._menuButtons.set(itemButton, item);
                this.element.appendChild(itemButton);
            }
        }
        this._menuButtonsDirty = false;
    }

    private _renderActiveSubMenu(): void {
        if (this._activeSubMenu != null) {
            this._activeSubMenu.render();
        }
    }

    public close(): void {
        if (this._activeSubMenu != null) {
            this._activeSubMenu.close();
            this._activeSubMenu.dispose();
            this._activeSubMenu = null;
        }
        this.element.remove();
    }

    private _handleClick = (event: MouseEvent): void => {
        const button: HTMLButtonElement = event.target as HTMLButtonElement;
        const menuNode: MenuItem | undefined = this._menuButtons.get(button);
        if (menuNode != null) {
            if (menuNode.children != null) {
                event.stopPropagation();
                const menuItems: MenuItem[] | undefined = menuNode.children;
                const buttonBounds: DOMRect = button.getBoundingClientRect();
                const parentBounds: DOMRect | undefined = button.parentElement?.getBoundingClientRect();
                const buttonX: number = buttonBounds.left;
                const buttonY: number = buttonBounds.top;
                const parentW: number = parentBounds != null ? parentBounds.width - 1 : buttonBounds.width;
                // const buttonH: number = buttonBounds.height;
                if (this._activeSubMenu != null) {
                    this._activeSubMenu.close();
                    this._activeSubMenu.dispose();
                    this._activeSubMenu = null;
                }
                this._activeSubMenu = new Menu(
                    this._ui,
                    this._menuContainer,
                    buttonX + parentW,
                    buttonY,
                    menuItems,
                );
                this._menuContainer.appendChild(this._activeSubMenu.element);
                this._menuContainer.style.pointerEvents = "auto";
                this._ui.scheduleMainRender();
            } else {
                menuNode.onClick?.();
                this.close();
                this.dispose();
            }
        }
    };
}

export interface MenuItem {
    label?: string;
    children?: MenuItem[];
    onClick?: () => void;
    separator?: boolean;
    getDisabledStatus?: () => boolean;
    getCheckedStatus?: () => boolean;
    shortcut?: string;
}
