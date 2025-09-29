import {
    highlightFuzzySubstring,
    type HighlightRange,
    type HighlightingResults,
} from "@synth-playground/common/string.js";
import { clamp, insideRange } from "@synth-playground/common/math.js";
import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import { StringId } from "../../localization/StringId.js";
import { TextInput } from "../basic/TextInput.js";
import { VirtualizedList, type IListItem } from "../basic/VirtualizedList.js";
import { UIContext } from "../UIContext.js";
import { type AppContext } from "../../AppContext.js";
import { AreaKind, getAreaLabelId } from "../input/areas.js";
import {
    ActionKind,
    getAreaFromAction,
    getActionLabelId,
    actionKindsForCommandPalette,
} from "../input/actions.js";
import { type EncodedGesture, gestureToHtml } from "../input/gestures.js";

// @TODO: Generalize this into something like vscode's QuickInput thing?

export class CommandPalette implements Component {
    public element: HTMLDivElement;

    private _app: AppContext;
    private _container: HTMLElement;
    private _hidden: boolean;
    private _searchBox: TextInput;
    private _rowHeight: number;
    private _commandList: List;
    private _filter: string;
    private _filteredActions: FilteredAction[];
    private _hasEventListeners: boolean;

    private _renderedHidden: boolean;
    private _renderedFilter: string;

    constructor(app: AppContext, container: HTMLElement) {
        this._app = app;

        this._container = container;

        this._filteredActions = [];

        this._hidden = true;
        this._renderedHidden = this._hidden;

        this._hasEventListeners = false;

        this._filter = "";
        this._renderedFilter = "";
        this._searchBox = new TextInput(
            this._app.ui,
            /* value */ this._filter,
            /* placeholder */ "",
            /* onInput */ value => {
                this._filter = value;
                // @TODO: Also set the selected index to 0?
                this._app.ui.scheduleMainRender();
            },
            /* onBlur */ () => {},
        );
        this._rowHeight = 25;
        this._commandList = new List(
            this._app.ui,
            /* height */ "100%",
            this._rowHeight,
        );
        // @TODO: Revisit the styling here.
        this.element = H("div", {
            style: `
                pointer-events: auto;
                display: none;
                width: 95%;
                max-width: 70ch;
                /* height: 100%;
                max-height: 50%; */
                margin: 30px auto 0 auto;
                background-color: #1e1e1e;
                outline: 1px solid rgb(68, 68, 68);
                box-sizing: border-box;
            `,
        },
            H("div", {
                style: `
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    padding: 10px;
                    box-sizing: border-box;
                `,
            },
                H("div", { style: "flex-grow: 1; display: flex; flex-direction: column; gap: 10px;" },
                    H("div", {
                        style: `
                            display: flex;
                            gap: 10px;
                        `,
                    }, this._searchBox.element),
                    H("div", { style: "flex-grow: 1; /* height: 0; */" },
                        this._commandList.element,
                    ),
                ),
            ),
        );

        this._container.appendChild(this.element);
    }

    public dispose(): void {
        if (this._hasEventListeners) {
            this.element.removeEventListener("wheel", this._onWheel);
            this.element.removeEventListener("keydown", this._onKeyDown);
            document.removeEventListener("mousedown", this._onDocumentClick);
            this._hasEventListeners = false;
        }
        this._searchBox.dispose();
        this._commandList.dispose();
    }

    public render(): void {
        let opening: boolean = false;
        let closing: boolean = false;

        if (this._hidden !== this._renderedHidden) {
            this.element.style.display = this._hidden ? "none" : "";
            this._renderedHidden = this._hidden;
            opening = !this._hidden ? true : opening;
            closing = this._hidden ? true : closing;
        }

        if (opening) {
            // this._container.style.pointerEvents = "auto";
            this.element.addEventListener("wheel", this._onWheel);
            this.element.addEventListener("keydown", this._onKeyDown);
            document.addEventListener("mousedown", this._onDocumentClick, { capture: true });
            this._hasEventListeners = true;
        } else if (closing) {
            // this._container.style.pointerEvents = "none";
            this.element.removeEventListener("wheel", this._onWheel);
            this.element.removeEventListener("keydown", this._onKeyDown);
            document.removeEventListener("mousedown", this._onDocumentClick);
            this._hasEventListeners = false;
        }

        if (!this._hidden) {
            let shouldRebuild: boolean = opening;

            if (this._filter !== this._renderedFilter) {
                this._renderedFilter = this._filter;
                shouldRebuild = true;
            }

            if (shouldRebuild) {
                this._rebuildCommandList();

                // @TODO: I have no idea how to do this just with CSS.
                const maxRows: number = 15;
                const rows: number = this._filteredActions.length;
                const maxHeight: number = clamp(rows, 1, maxRows) * this._rowHeight;
                this._commandList.element.style.maxHeight = maxHeight + "px";
            }

            this._searchBox.setValue(this._filter);
            this._searchBox.render();
            this._commandList.render();

            if (opening) {
                this._searchBox.element.focus();
            }
        }
    }

    private _rebuildCommandList(): void {
        const actions: ActionKind[] = actionKindsForCommandPalette;
        this._filteredActions = [];
        const filter: string = this._filter;
        for (let actionIndex: number = 0; actionIndex < actions.length; actionIndex++) {
            const action: ActionKind = actions[actionIndex];
            const area: AreaKind = getAreaFromAction(action);
            const categoryLabelId: StringId = getAreaLabelId(area);
            const nameLabelId: StringId = getActionLabelId(action);
            const category: string = this._app.ui.T(categoryLabelId);
            const name: string = this._app.ui.T(nameLabelId);
            const label: string = category === "" ? name : `${category}: ${name}`;
            let score: number = 1;
            let highlightRanges: HighlightRange[] | undefined = undefined;
            if (filter !== "") {
                const results: HighlightingResults = highlightFuzzySubstring(label, filter);
                score = results.score;
                highlightRanges = results.ranges;
            }
            if (score === 0) {
                continue;
            }
            if (action === this._app.ui.inputManager.getLastExecutedAction()) {
                score = Infinity;
            }
            this._filteredActions.push({
                kind: action,
                label: label,
                score: score,
                highlightRanges: highlightRanges,
                shortcut: this._app.ui.inputManager.getPrimaryShortcutByAction(action),
            });
        }
        this._filteredActions.sort((a, b) => {
            return a.score > b.score ? -1 : a.score < b.score ? 1 : 0;
        });

        this._commandList.setData(this._filteredActions);
        this._commandList.setSelectionIndex(
            Math.min(this._commandList.getSelectionIndex(), this._filteredActions.length - 1),
            /* ensureVisible */ true,
        );
    }

    public show(): void {
        this._hidden = false;
        this._commandList.setSelectionIndex(0, /* ensureVisible */ true);
        this._app.ui.scheduleMainRender();
    }

    public hide(): void {
        this._hidden = true;
        this._filter = "";
        this._commandList.clearSelection();
        this._app.ui.scheduleMainRender();
    }

    private _onWheel = (event: WheelEvent): void => {
        // To avoid this going to the piano roll or whoever else.
        event.stopPropagation();
    };

    private _onKeyDown = (event: KeyboardEvent): void => {
        let consume: boolean = false;

        switch (event.key) {
            case "Escape": {
                this.hide();
                consume = true;
            } break;
            case "ArrowUp": {
                this._commandList.selectPrevious();
                this._app.ui.scheduleMainRender();
                consume = true;
                event.preventDefault(); // To avoid moving the caret.
            } break;
            case "ArrowDown": {
                this._commandList.selectNext();
                this._app.ui.scheduleMainRender();
                consume = true;
                event.preventDefault(); // To avoid moving the caret.
            } break;
            case "PageUp": {
                this._commandList.selectPagePrevious();
                this._app.ui.scheduleMainRender();
                consume = true;
                event.preventDefault(); // To avoid moving the caret.
            } break;
            case "PageDown": {
                this._commandList.selectPageNext();
                this._app.ui.scheduleMainRender();
                consume = true;
                event.preventDefault(); // To avoid moving the caret.
            } break;
            case "Enter": {
                const index: number = this._commandList.getSelectionIndex();
                if (insideRange(index, 0, this._filteredActions.length - 1)) {
                    this.hide();
                    const kind: ActionKind = this._filteredActions[index].kind;
                    this._app.ui.inputManager.executeAction(kind);
                }
                this._app.ui.scheduleMainRender();
                consume = true;
            } break;
        }

        if (event.target === this._searchBox.element) {
            consume = true;
        }

        if (consume) {
            event.stopPropagation();
        }
    };

    private _onDocumentClick = (event: MouseEvent): void => {
        if (this.element.contains(event.target as HTMLElement)) {
            event.preventDefault();
            if (event.target !== this._searchBox.element) {
                if (
                    event.target !== this._commandList.element
                    && this._commandList.element.contains(event.target as HTMLElement)
                ) {
                    const index: number = this._commandList.getDataIndexFromMouse(event.clientX, event.clientY);
                    if (insideRange(index, 0, this._filteredActions.length - 1)) {
                        this.hide();
                        const kind: ActionKind = this._filteredActions[index].kind;
                        this._app.ui.inputManager.executeAction(kind);
                    }
                } else {
                    this._searchBox.element.focus();
                }
            }
        } else {
            this.hide();
        }
    };
}

class Item implements IListItem {
    public element: HTMLDivElement;
    private _textContainer: HTMLDivElement;
    private _text: string;
    private _renderedText: string | null;
    private _top: string;
    private _renderedTop: string;
    private _visible: boolean;
    private _renderedVisible: boolean;
    private _height: number;
    private _renderedHeight: number | null;
    private _selected: boolean;
    private _renderedSelected: boolean;
    private _shortcut: EncodedGesture | undefined;
    private _renderedShortcut: EncodedGesture | undefined;
    private _shortcutContainer: HTMLDivElement;
    private _highlightRanges: HighlightRange[] | undefined;
    private _highlightingIsDirty: boolean;
    private _recentlyUsedIndicator: HTMLDivElement;
    private _recentlyUsed: boolean;
    private _renderedRecentlyUsed: boolean | null;

    constructor(height: number) {
        this._text = "";
        this._renderedText = null;
        this._top = "";
        this._renderedTop = "";
        this._visible = true;
        this._renderedVisible = true;
        this._height = height;
        this._renderedHeight = height;
        this._highlightRanges = undefined;
        this._highlightingIsDirty = false;
        this._recentlyUsed = false;
        this._renderedRecentlyUsed = null;

        // @TODO: Maybe find another way to vertically center the text? Maybe
        // not, maybe the extra wrapper would come from the user, which could
        // put whatever other elements inside this.
        this._textContainer = H("div", {
            style: `
                overflow: hidden;
                text-overflow: ellipsis;
                min-width: 0;
            `,
        });
        this.element = H("div", {
            class: "list-item",
            style: `
                position: absolute;
                box-sizing: border-box;
                width: 100%;
                white-space: nowrap;
                overflow: hidden;
                display: flex;
                align-items: center;
                height: ${height}px;
                padding-left: 5px;
                padding-right: 5px;
            `,
        }, this._textContainer);

        this._shortcutContainer = H("div", {
            style: `
                margin: 0 0 0 auto;
            `,
        });
        this.element.appendChild(this._shortcutContainer);

        // @TODO: It's a bit inefficient to always have this here, mostly for
        // memory reasons. Ideally I should create it the first time it will be
        // shown instead.
        this._recentlyUsedIndicator = H("div", {
            style: `
                display: none;
                margin: 0 0 0 0.5em;
                opacity: 0.5;
            `,
        }, "recently used");
        this.element.appendChild(this._recentlyUsedIndicator);

        this._selected = false;
        this._renderedSelected = this._selected;
    }

    public dispose(): void {}

    public render(): void {
        if (this._top !== this._renderedTop) {
            // this.element.style.top = this._top;
            // @TODO: This works better for some reason. Probably some kind of
            // layout shift is messing with the scrolling?
            this.element.style.transform = `translate(0px, ${this._top})`;
            this._renderedTop = this._top;
        }

        if (this._text !== this._renderedText || this._highlightingIsDirty) {
            if (this._highlightRanges != null && this._highlightRanges.length > 0) {
                // @TODO: This is probably very slow. I probably will have to
                // change the virtualization so it works with larger batches
                // of changes, to amortize the cost.
                while (this._textContainer.firstChild != null) {
                    this._textContainer.firstChild.remove();
                }
                const text: string = this._text;
                const ranges: HighlightRange[] = this._highlightRanges;
                const rangeCount: number = ranges.length;
                let position: number = 0;
                for (let rangeIndex: number = 0; rangeIndex < rangeCount; rangeIndex++) {
                    const range: HighlightRange = ranges[rangeIndex];
                    if (range.start > position) {
                        // We have a prefix to append, that is not highlighted.
                        const s: string = text.substring(position, range.start);
                        this._textContainer.appendChild(document.createTextNode(s));
                    }
                    const s: string = text.substring(range.start, range.end);
                    const e: HTMLSpanElement = document.createElement("span");
                    e.style.color = "rgb(89, 200, 252)";
                    e.style.fontWeight = "bold";
                    e.textContent = s;
                    this._textContainer.appendChild(e);
                    position = range.end;
                }
                if (position < text.length) {
                    // We still have a suffix to append.
                    this._textContainer.appendChild(document.createTextNode(text.substring(position)));
                }
            } else {
                this._textContainer.textContent = this._text;
            }
            this._renderedText = this._text;
            this._highlightingIsDirty = false;
        }

        if (this._visible !== this._renderedVisible) {
            this.element.style.visibility = this._visible ? "visible" : "hidden";
            this._renderedVisible = this._visible;
        }

        if (this._height !== this._renderedHeight) {
            this.element.style.height = this._height + "px";
            this._renderedHeight = this._height;
        }

        if (this._selected !== this._renderedSelected) {
            this.element.style.backgroundColor = this._selected ? "#005599" : "";
            this._renderedSelected = this._selected;
        }

        if (this._shortcut !== this._renderedShortcut) {
            while (this._shortcutContainer.firstChild != null) {
                this._shortcutContainer.firstChild.remove();
            }
            if (this._shortcut != null) {
                this._shortcutContainer.appendChild(gestureToHtml(this._shortcut, H("div", {
                    style: `display: flex; font-size: 11px;`,
                })));
            }
            this._renderedShortcut = this._shortcut;
        }

        if (this._recentlyUsed !== this._renderedRecentlyUsed) {
            this._recentlyUsedIndicator.style.display = (
                this._recentlyUsed ? "" : "none"
            );
            this._renderedRecentlyUsed = this._recentlyUsed;
        }
    }

    public setHeight(height: number): void {
        this._height = height;
    }

    public setTop(top: string): void {
        this._top = top;
    }

    public setText(text: string): void {
        this._text = text;
    }

    public setVisible(visible: boolean): void {
        this._visible = visible;
    }

    public setSelected(selected: boolean): void {
        this._selected = selected;
    }

    public setShortcut(shortcut: EncodedGesture | undefined): void {
        this._shortcut = shortcut;
    }

    public setHighlightRanges(highlightRanges: HighlightRange[] | undefined): void {
        this._highlightingIsDirty = true;
        if (highlightRanges != null && this._highlightRanges != null) {
            if (highlightRanges.length === this._highlightRanges.length) {
                let isDifferent: boolean = false;
                for (let i: number = 0; i < highlightRanges.length; i++) {
                    const a: HighlightRange = this._highlightRanges[i];
                    const b: HighlightRange = highlightRanges[i];
                    if (a.start !== b.start || a.end !== b.end) {
                        isDifferent = true;
                        break;
                    }
                }
                this._highlightingIsDirty = isDifferent;
            }
        }
        this._highlightRanges = highlightRanges;
    }

    public setRecentlyUsed(value: boolean): void {
        this._recentlyUsed = value;
    }
}

class List extends VirtualizedList<FilteredAction> {
    private _selectionIndex: number;

    constructor(ui: UIContext, height: string, rowHeight: number) {
        super(ui, height, rowHeight, (height) => new Item(height));
        this._selectionIndex = -1;
    }

    protected override _renderItem(item: Item, y: number, dataIndex: number): void {
        item.setTop(y + "px");
        if (insideRange(dataIndex, 0, this._rows.length - 1)) {
            const data: FilteredAction = this._rows[dataIndex];
            item.setText(data.label);
            item.setHighlightRanges(data.highlightRanges);
            item.setShortcut(data.shortcut);
            item.setVisible(true);
            item.setSelected(dataIndex === this._selectionIndex);
            item.setRecentlyUsed(data.score === Infinity);
        } else {
            item.setVisible(false);
        }
    }

    public getSelectionIndex(): number {
        return this._selectionIndex;
    }

    public setSelectionIndex(value: number, ensureVisible: boolean): void {
        this._selectionIndex = value;
        if (ensureVisible) {
            this._scrollToSelection();
        }
    }

    public clearSelection(): void {
        this._selectionIndex = -1;
    }

    public selectPrevious(): void {
        if (this._selectionIndex > 0) {
            this._selectionIndex--;
        } else {
            this._selectionIndex = this._rows.length - 1;
        }

        this._scrollToSelection();
    }

    public selectNext(): void {
        if (this._selectionIndex < this._rows.length - 1) {
            this._selectionIndex++;
        } else {
            this._selectionIndex = 0;
        }

        this._scrollToSelection();
    }

    public selectPagePrevious(): void {
        const rowHeight: number = this._rowHeight;
        const clientHeight: number = this._clientHeight;
        const height: number = clientHeight;
        const visibleRowCount: number = Math.floor(height / rowHeight);
        this._selectionIndex = clamp(this._selectionIndex - (visibleRowCount - 1), 0, this._rows.length - 1);

        this._scrollToSelection();
    }

    public selectPageNext(): void {
        const rowHeight: number = this._rowHeight;
        const clientHeight: number = this._clientHeight;
        const height: number = clientHeight;
        const visibleRowCount: number = Math.floor(height / rowHeight);
        this._selectionIndex = clamp(this._selectionIndex + (visibleRowCount - 1), 0, this._rows.length - 1);

        this._scrollToSelection();
    }

    private _scrollToSelection(): void {
        const selectionIndex: number = this._selectionIndex;
        if (selectionIndex === -1) {
            return;
        }
        this.scrollToIndex(selectionIndex);
    }
}

interface FilteredAction {
    kind: ActionKind;
    label: string;
    shortcut: EncodedGesture | undefined;
    score: number;
    highlightRanges: HighlightRange[] | undefined;
}
