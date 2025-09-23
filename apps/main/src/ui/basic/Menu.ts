import { insideRange } from "@synth-playground/common/math.js";
import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";
import { StringId } from "../../localization/StringId.js";

// @TODO:
// - Stop using menuContainer. Apparently the APG says to instead use a nested
//   structure for this. Which I guess makes sense.
// - Investigate why overlapping menus are closing more often than they should.
// - Do list reconciliation instead of simply removing everything.
// - Implement more of the safe triangle tweaks from Dear ImGui? Maybe also
//   the ones from react-aria?

export class Menu implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _mounted: boolean;
    private _depth: number;
    private _onClose: () => void;
    private _closeParent: () => void;
    private _moveToLeftInParent: () => void;
    private _moveToRightInParent: () => void;
    private _menuItems: MenuItem[] | undefined;
    private _selectedMenuButtonIndex: number;
    private _menuButtons: HTMLButtonElement[];
    private _menuItemsByButton: Map<HTMLButtonElement, MenuItem>;
    private _activeSubMenu: Menu | null;
    private _activeSubMenuX: number | null;
    private _activeSubMenuY: number | null;
    private _previousMouseX: number | null;
    private _previousMouseY: number | null;
    private _menuContainer: HTMLElement;

    private _renderedSelectedMenuButtonIndex: number;
    private _menuButtonsDirty: boolean;
    private _renderedLanguageVersion: number | null;

    constructor(
        ui: UIContext,
        menuContainer: HTMLElement,
        x: number,
        y: number,
        menuItems: MenuItem[] | undefined,
        depth: number,
        onClose: () => void,
        closeParent: () => void,
        moveToLeftInParent: () => void,
        moveToRightInParent: () => void,
    ) {
        this._ui = ui;
        this._mounted = false;
        this._depth = depth;
        this._onClose = onClose;
        this._closeParent = closeParent;
        this._moveToLeftInParent = moveToLeftInParent;
        this._moveToRightInParent = moveToRightInParent;

        this._renderedLanguageVersion = null;

        this._menuItems = menuItems;
        this._selectedMenuButtonIndex = -1;
        this._renderedSelectedMenuButtonIndex = -1;
        this._menuButtons = [];
        this._menuItemsByButton = new Map();
        this._menuButtonsDirty = true;
        this._activeSubMenu = null;
        this._activeSubMenuX = null;
        this._activeSubMenuY = null;
        this._previousMouseX = null;
        this._previousMouseY = null;
        this._menuContainer = menuContainer;

        this.element = H("div", {
            tabindex: "-1",
            style: `
                display: flex;
                flex-direction: column;
                pointer-events: auto;
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                background: #1e1e1e;
                border: 1px solid #3e3e3e;
                width: max-content;
                overflow-y: auto;
                box-sizing: border-box;
            `,
        });

        this._renderMenuButtons(this._ui.localizationManager.getVersion());

        this.element.addEventListener("click", this._handleClick);
        window.addEventListener("mousemove", this._handleMouseMove);
    }

    public dispose(): void {
        this.element.removeEventListener("click", this._handleClick);
        window.removeEventListener("mousemove", this._handleMouseMove);
        if (this._mounted) {
            this.element.removeEventListener("keydown", this._handleKeyDown);
            this._mounted = false;
        }
    }

    public render(): void {
        if (!this._mounted) {
            this._onDidMount();
        }

        const languageVersion: number = this._ui.localizationManager.getVersion();

        this._renderMenuButtons(languageVersion);
        this._renderSelectedMenuButton();
        this._renderActiveSubMenu();

        this._renderedLanguageVersion = languageVersion;
    }

    private _onDidMount(): void {
        this._mounted = true;

        this.element.focus();
        this.element.addEventListener("keydown", this._handleKeyDown);
    }

    private _renderMenuButtons(languageVersion: number): void {
        if (this._renderedLanguageVersion !== languageVersion) {
            this._menuButtonsDirty = true;
        }

        // @TODO: If the selected status of any of the buttons change under us,
        // this will incorrectly skip rendering that.
        if (!this._menuButtonsDirty) {
            return;
        }

        if (this._menuItems == null) {
            return;
        }

        while (this.element.firstChild != null) {
            this.element.firstChild.remove();
        }
        this._menuButtons.length = 0;
        this._menuItemsByButton.clear();

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
                    style: ``,
                },
                    H("div", {
                        style: `
                            pointer-events: none;
                            visibility: ${item.getCheckedStatus?.() === true ? "initial" : "hidden"};
                            margin-right: 4px;
                        `,
                    }, "✔"),
                    H("div", {
                        style: `
                            pointer-events: none;
                        `,
                    }, this._ui.T(item.label ?? ("" as StringId))),
                );
                if (item.getDisabledStatus != null) {
                    itemButton.disabled = item.getDisabledStatus();
                }
                if (item.shortcut != null) {
                    if (item.shortcut !== "") {
                        itemButton.appendChild(H("div", {
                            style: `
                                color: #777777;
                                margin-left: auto;
                                padding-left: 16px;
                                padding-right: 6px;
                                pointer-events: none;
                            `,
                        }, item.shortcut));
                    }
                } else if (item.children != null) {
                    itemButton.appendChild(H("div", {
                        style: `
                            pointer-events: none;
                            visibility: ${item.children != null ? "initial" : "hidden"};
                            margin-left: auto;
                            padding-left: 6px;
                        `,
                    }, "►"));
                } else {
                    itemButton.style.paddingRight = "16px";
                }
                this._menuButtons.push(itemButton);
                this._menuItemsByButton.set(itemButton, item);
                this.element.appendChild(itemButton);
            }
        }

        // Adjust selected index if out of bounds.
        if (this._selectedMenuButtonIndex >= this._menuButtons.length) {
            // @TODO: Not sure what should be done here.
            this._selectedMenuButtonIndex = -1;
        }

        this._menuButtonsDirty = false;
    }

    private _renderActiveSubMenu(): void {
        if (this._activeSubMenu != null) {
            this._activeSubMenu.render();
        }
    }

    private _renderSelectedMenuButton(): void {
        const oldIndex: number = this._renderedSelectedMenuButtonIndex;
        const newIndex: number = this._selectedMenuButtonIndex;
        if (newIndex !== oldIndex) {
            if (oldIndex !== -1 && oldIndex < this._menuButtons.length) {
                const oldButton: HTMLButtonElement = this._menuButtons[oldIndex];
                oldButton.classList.remove("selected");
            }
            if (newIndex !== -1 && newIndex < this._menuButtons.length) {
                const newButton: HTMLButtonElement = this._menuButtons[newIndex];
                newButton.classList.add("selected");
            }
            this._renderedSelectedMenuButtonIndex = newIndex;
        }
    }

    public close(): void {
        this.closeSelectedSubMenu();
        this.element.remove();
        this.dispose();
        this._onClose();
    }

    public activateSelectedMenuItem(): void {
        const index: number = this._selectedMenuButtonIndex;
        if (!insideRange(index, 0, this._menuButtons.length - 1)) {
            return;
        }

        const button: HTMLButtonElement = this._menuButtons[index];
        const item: MenuItem | undefined = this._menuItemsByButton.get(button);
        if (item == null) {
            return;
        }

        this._closeParent();
        item.onClick?.();

        this._ui.scheduleMainRender();
    }

    public openSelectedSubMenu(): void {
        const index: number = this._selectedMenuButtonIndex;
        if (!insideRange(index, 0, this._menuButtons.length - 1)) {
            return;
        }

        const button: HTMLButtonElement = this._menuButtons[index];
        const item: MenuItem | undefined = this._menuItemsByButton.get(button);
        if (item == null) {
            return;
        }

        const menuItems: MenuItem[] | undefined = item.children;
        if (menuItems == null) {
            return;
        }

        const buttonBounds: DOMRect = button.getBoundingClientRect();
        const parentBounds: DOMRect | undefined = button.parentElement?.getBoundingClientRect();
        const windowWidth: number = window.innerWidth;
        const windowHeight: number = window.innerHeight;
        const buttonX: number = buttonBounds.left;
        const buttonY: number = buttonBounds.top;
        const parentW: number = parentBounds != null ? parentBounds.width - 1 : buttonBounds.width;
        // const buttonH: number = buttonBounds.height;

        this.closeSelectedSubMenu();
        this._activeSubMenuX = buttonX + parentW;
        this._activeSubMenuY = buttonY;
        this._activeSubMenu = new Menu(
            this._ui,
            this._menuContainer,
            this._activeSubMenuX,
            this._activeSubMenuY,
            menuItems,
            this._depth + 1,
            () => {
                this._cleanUpActiveSubMenu();
                this.element.focus();
            },
            this._closeParent,
            this._moveToLeftInParent,
            this._moveToRightInParent,
        );
        this._menuContainer.appendChild(this._activeSubMenu.element);

        // In order to keep the submenu fully within the window, I need a
        // synchronous reflow here, by populating it and querying for its size.
        // :/
        // Though maybe it's whatever, I also have a synchronous reflow above I
        // think, due to the synchronous removal of the current submenu.
        const subMenuBounds: DOMRect = this._activeSubMenu.element.getBoundingClientRect();
        const oldSubMenuX0: number = subMenuBounds.x;
        const oldSubMenuX1: number = subMenuBounds.x + subMenuBounds.width;
        const oldSubMenuY0: number = subMenuBounds.y;
        const oldSubMenuY1: number = subMenuBounds.y + subMenuBounds.height;
        let newSubMenuX0: number = oldSubMenuX0;
        let newSubMenuY0: number = oldSubMenuY0;
        if (oldSubMenuX1 > windowWidth) {
            newSubMenuX0 = buttonX - subMenuBounds.width;
        } else if (oldSubMenuX0 < 0) {
            newSubMenuX0 -= 0 - oldSubMenuX1;
        }
        if (oldSubMenuY1 > windowHeight) {
            newSubMenuY0 += windowHeight - oldSubMenuY1;
        } else if (oldSubMenuY0 < 0) {
            newSubMenuY0 -= 0 - oldSubMenuY1;
        }
        this._activeSubMenu.element.style.left = newSubMenuX0 + "px";
        this._activeSubMenu.element.style.top = newSubMenuY0 + "px";

        this._menuContainer.style.pointerEvents = "auto";
        this._ui.scheduleMainRender();
    }

    public closeSelectedSubMenu(): void {
        if (this._activeSubMenu != null) {
            this._activeSubMenu.close();
            this._cleanUpActiveSubMenu();
        }
    }

    private _cleanUpActiveSubMenu(): void {
        this._activeSubMenu = null;
        this._activeSubMenuX = null;
        this._activeSubMenuY = null;
    }

    private _handleClick = (event: MouseEvent): void => {
        // @TODO: Use event.target here instead.
        const index: number = this._selectedMenuButtonIndex;
        if (!insideRange(index, 0, this._menuButtons.length - 1)) {
            return;
        }
        const button: HTMLButtonElement = event.target as HTMLButtonElement;
        const item: MenuItem | undefined = this._menuItemsByButton.get(button);
        if (item != null && item.children != null) {
            event.stopPropagation();
        }
        if (item != null) {
            if (item.children != null) {
                this.openSelectedSubMenu();
            } else {
                this.activateSelectedMenuItem();
            }
        }
    };

    private _handleMouseMove = (event: MouseEvent): void => {
        if (!this._isOverSafeTriangle(event)) {
            const mouseX: number = event.clientX;
            const mouseY: number = event.clientY;
            const bounds: DOMRect = this.element.getBoundingClientRect();
            if (
                this.element.contains(event.target as HTMLElement)
                && insideRange(mouseX, bounds.x, bounds.x + bounds.width)
                // @TODO: Something better than these offsets to prevent some
                // spurious closing that happens here.
                && insideRange(mouseY, bounds.y + 1, (bounds.y + 1) + (bounds.height - 2))
            ) {
                const button: HTMLButtonElement = event.target as HTMLButtonElement;
                const item: MenuItem | undefined = this._menuItemsByButton.get(button);
                if (item == null) {
                    // Mouse is over a separator.
                    this._selectedMenuButtonIndex = -1;
                    this.closeSelectedSubMenu();
                } else {
                    const buttonIndex: number = this._menuButtons.indexOf(button);
                    if (buttonIndex !== this._selectedMenuButtonIndex) {
                        this.closeSelectedSubMenu();
                        this._selectedMenuButtonIndex = buttonIndex;
                        if (item.children != null) {
                            this.openSelectedSubMenu();
                        }
                    }
                }
                this._ui.scheduleMainRender();
            }
        } else {
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    };

    private _handleKeyDown = (event: KeyboardEvent): void => {
        let consume: boolean = false;

        switch (event.key) {
            case "ArrowDown": {
                // This also does the right thing when nothing is selected,
                // i.e. the index is -1.
                if (this._selectedMenuButtonIndex < this._menuButtons.length - 1) {
                    this._selectedMenuButtonIndex++;
                } else {
                    this._selectedMenuButtonIndex = 0;
                }
                this._ui.scheduleMainRender();
                consume = true;
            } break;
            case "ArrowUp": {
                // This also does the right thing when nothing is selected,
                // i.e. the index is -1.
                if (this._selectedMenuButtonIndex > 0) {
                    this._selectedMenuButtonIndex--;
                } else {
                    this._selectedMenuButtonIndex = this._menuButtons.length - 1;
                }
                this._ui.scheduleMainRender();
                consume = true;
            } break;
            case "Home": {
                this._selectedMenuButtonIndex = 0;
                this._ui.scheduleMainRender();
                consume = true;
            } break;
            case "End": {
                this._selectedMenuButtonIndex = this._menuButtons.length - 1;
                this._ui.scheduleMainRender();
                consume = true;
            } break;
            // @TODO: vscode at least also has page up and page down here.
            case "ArrowLeft": {
                const index: number = this._selectedMenuButtonIndex;
                if (insideRange(index, 0, this._menuButtons.length - 1)) {
                    const button: HTMLButtonElement = this._menuButtons[index];
                    const item: MenuItem = this._menuItemsByButton.get(button)!;
                    if (item.children != null && this._activeSubMenu != null) {
                        this.closeSelectedSubMenu();
                    } else {
                        if (this._depth === 0) {
                            this._moveToLeftInParent();
                        } else {
                            this.close();
                        }
                    }
                } else {
                    if (this._depth === 0) {
                        this._moveToLeftInParent();
                    } else {
                        this.close();
                    }
                }
                this._ui.scheduleMainRender();
                consume = true;
            } break;
            case "ArrowRight": {
                const index: number = this._selectedMenuButtonIndex;
                if (insideRange(index, 0, this._menuButtons.length - 1)) {
                    const button: HTMLButtonElement = this._menuButtons[index];
                    const item: MenuItem = this._menuItemsByButton.get(button)!
                    if (item.children != null) {
                        this.openSelectedSubMenu();
                        if (this._activeSubMenu != null) {
                            this._activeSubMenu.setSelectedMenuButtonIndex(0);
                        }
                    } else {
                        // @TODO: It seems people do this at any depth.
                        if (this._depth === 0) {
                            this._moveToRightInParent();
                        }
                    }
                } else {
                    // @TODO: It seems people do this at any depth.
                    if (this._depth === 0) {
                        this._moveToRightInParent();
                    }
                }
                this._ui.scheduleMainRender();
                consume = true;
            } break;
            case "Space":
            case "Enter": {
                this.activateSelectedMenuItem();
                this._ui.scheduleMainRender();
                consume = true;
            } break;
            case "Escape": {
                // @TODO: Should this call closeParent instead?
                this.close();
                this._ui.scheduleMainRender();
                consume = true;
            } break;
        }

        if (consume) {
            event.stopPropagation();
        }
    };

    private _isOverSafeTriangle(event: MouseEvent): boolean {
        const mouseX1: number = event.clientX;
        const mouseY1: number = event.clientY;
        const mouseX0: number = this._previousMouseX == null ? mouseX1 : this._previousMouseX;
        const mouseY0: number = this._previousMouseY == null ? mouseY1 : this._previousMouseY;
        this._previousMouseX = mouseX1;
        this._previousMouseY = mouseY1;

        if (this._activeSubMenu == null) {
            return false;
        }

        const menuBounds: DOMRect = this.element.getBoundingClientRect();
        const subMenuBounds: DOMRect = this._activeSubMenu.element.getBoundingClientRect();

        const subMenuIsOnTheRight: boolean = subMenuBounds.x > menuBounds.x;

        const top: number = subMenuBounds.y;
        const bottom: number = subMenuBounds.y + subMenuBounds.height;
        const left: number = subMenuBounds.x;
        const right: number = subMenuBounds.x + subMenuBounds.width;
        const tX0: number = mouseX0;
        const tY0: number = mouseY0;
        const tX1: number = subMenuIsOnTheRight ? left : right;
        const tY1: number = top;
        const tX2: number = subMenuIsOnTheRight ? left : right;
        const tY2: number = bottom;

        // Borrowed from https://github.com/ocornut/imgui/blob/45acd5e0e82f4c954432533ae9985ff0e1aad6d5/imgui.cpp#L2008
        const b1: boolean = ((mouseX1 - tX1) * (tY0 - tY1) - (mouseY1 - tY1) * (tX0 - tX1)) < 0;
        const b2: boolean = ((mouseX1 - tX2) * (tY1 - tY2) - (mouseY1 - tY2) * (tX1 - tX2)) < 0;
        const b3: boolean = ((mouseX1 - tX0) * (tY2 - tY0) - (mouseY1 - tY0) * (tX2 - tX0)) < 0;
        const insideSafeTriangle: boolean = (b1 == b2) && (b2 == b3);

        // let debugCanvas: HTMLCanvasElement | undefined = (window as any).debugCanvas;
        // let debugContext: CanvasRenderingContext2D;
        // if (debugCanvas == null) {
        //     debugCanvas = H("canvas", {
        //         width: window.innerWidth + "",
        //         height: window.innerHeight + "",
        //         style: `
        //             position: fixed;
        //             left: 0;
        //             top: 0;
        //             z-index: 10000;
        //             pointer-events: none;
        //         `,
        //     });
        //     debugContext = debugCanvas.getContext("2d")!;
        //     document.body.appendChild(debugCanvas);
        //     (window as any).debugCanvas = debugCanvas;
        //     (window as any).debugContext = debugContext;
        // } else {
        //     debugContext = (window as any).debugContext;
        // }
        // debugContext.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
        // debugContext.fillStyle = "rgba(255, 0, 0, 0.5)";
        // debugContext.beginPath();
        // debugContext.moveTo(tX0, tY0);
        // debugContext.lineTo(tX1, tY1);
        // debugContext.lineTo(tX2, tY2);
        // debugContext.fill();
        // debugContext.fillStyle = "rgba(255, 0, 0, 1)";
        // debugContext.beginPath();
        // debugContext.arc(mouseX1, mouseY1, 2, 0, Math.PI * 2, false);
        // debugContext.fill();

        return insideSafeTriangle;
    }

    public setSelectedMenuButtonIndex(index: number): void {
        this._selectedMenuButtonIndex = index;
    }
}

export interface MenuItem {
    label?: StringId;
    children?: MenuItem[];
    onClick?: () => void;
    separator?: boolean;
    getDisabledStatus?: () => boolean;
    getCheckedStatus?: () => boolean;
    shortcut?: string;
}
