import { H } from "@synth-playground/browser/dom.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";

// @TODO: Generalize this in a better way.

// @TODO: Find a better name that doesn't require the I prefix?
export interface IListItem extends Component {
    setHeight(height: number): void;
    setTop(top: string): void;
    setText(text: string): void;
    setVisible(visible: boolean): void;
}

export class ListItem implements IListItem {
    public element: HTMLDivElement;

    private _textContainer: HTMLDivElement;
    private _text: string;
    private _top: string;
    private _visible: boolean;
    private _height: number;

    private _renderedText: string | null;
    private _renderedTop: string;
    private _renderedVisible: boolean;
    private _renderedHeight: number | null;

    constructor(height: number) {
        this._text = "";
        this._renderedText = null;
        this._top = "";
        this._renderedTop = "";
        this._visible = true;
        this._renderedVisible = true;
        this._height = height;
        this._renderedHeight = height;

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

        if (this._text !== this._renderedText) {
            this._textContainer.textContent = this._text;
            this._renderedText = this._text;
        }

        if (this._visible !== this._renderedVisible) {
            this.element.style.visibility = this._visible ? "visible" : "hidden";
            this._renderedVisible = this._visible;
        }

        if (this._height !== this._renderedHeight) {
            this.element.style.height = this._height + "px";
            this._renderedHeight = this._height;
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
}

const MAX_CONTAINER_HEIGHT: number = 7_000_000;

export type ItemMaker = (height: number) => IListItem;

// @TODO: onClick
export class VirtualizedList<T> implements Component {
    public element: HTMLDivElement;

    protected _ui: UIContext;
    protected _itemMaker: ItemMaker;
    protected _container: HTMLDivElement;
    protected _scrollTop: number;
    protected _height: string;
    protected _rowHeight: number;
    protected _clientHeight: number;
    protected _scrollHeight: number;
    protected _rows: T[];

    protected _renderedScrollTop: number | null;
    protected _renderedHeight: string | null;
    protected _renderedRowHeight: number | null;
    protected _renderedTotalHeight: number | null;
    protected _renderedRows: IListItem[];

    constructor(
        ui: UIContext,
        height: string,
        rowHeight: number,
        itemMaker: ItemMaker,
    ) {
        this._ui = ui;

        this._itemMaker = itemMaker;

        this._scrollTop = 0;
        this._renderedScrollTop = null;
        this._height = height;
        this._renderedHeight = null;
        this._rowHeight = rowHeight;
        this._renderedRowHeight = null;
        this._renderedTotalHeight = null;
        this._clientHeight = 1;
        this._scrollHeight = 1;

        // With rowHeight=25, we can only have around 280,000 items before
        // reaching MAX_CONTAINER_HEIGHT, at which point scrolling is broken.
        this._rows = [];
        this._renderedRows = [];
        this._container = H("div", {
            style: `
                overflow: hidden;
                position: relative;
                box-sizing: border-box;
            `,
        });
        this.element = H("div", {
            style: `
                height: ${height};
                overflow-y: auto;
                overflow-x: hidden;
                box-sizing: border-box;
            `,
        }, this._container);

        this.element.addEventListener("scroll", this._handleScroll);
        this._ui.resizeObserver.register(this.element, this._handleResize);
        this._ui.resizeObserver.observe(this.element);
    }

    public dispose(): void {
        this.element.removeEventListener("scroll", this._handleScroll);
        this._ui.resizeObserver.unobserve(this.element);
        this._ui.resizeObserver.unregister(this.element, this._handleResize);
    }

    public render(): void {
        if (this._height !== this._renderedHeight) {
            this.element.style.height = this._height;
            this._renderedHeight = this._height;
        }

        const rowCount: number = this._rows.length;

        const rowHeight: number = this._rowHeight;
        const totalHeight: number = rowCount * rowHeight;
        const actualTotalHeight: number = Math.min(totalHeight, MAX_CONTAINER_HEIGHT);

        if (actualTotalHeight !== this._renderedTotalHeight) {
            this._container.style.height = actualTotalHeight + "px";
            this._renderedTotalHeight = actualTotalHeight;

            // Have to force a reflow here.
            this._scrollTop = this.element.scrollTop;
            this._scrollHeight = this.element.scrollHeight;
            this._clientHeight = this.element.clientHeight;
            this._renderedScrollTop = null;
        }

        const clientHeight: number = this._clientHeight;
        const scrollHeight: number = this._scrollHeight;
        const height: number = clientHeight;
        const overscanCount: number = 5;
        const visibleRowCount: number = Math.ceil(height / rowHeight);
        const presentRowCount: number = visibleRowCount + overscanCount * 2;

        const scrollTop: number = this._scrollTop;
        const percent: number = scrollTop / Math.max(1, scrollHeight - visibleRowCount * rowHeight);
        const rawTopRowIndex: number = Math.max(0, percent * (rowCount - (visibleRowCount - 0)));
        const topRowIndex: number = Math.floor(rawTopRowIndex);
        const topRowIndexResidue: number = rawTopRowIndex - topRowIndex;

        if (scrollTop !== this._renderedScrollTop) {
            this._renderedScrollTop = scrollTop;
        }

        if (presentRowCount !== this._renderedRows.length) {
            while (this._renderedRows.length > presentRowCount) {
                const row = this._renderedRows.pop()!;
                row.dispose();
                row.element.remove();
            }
            while (this._renderedRows.length < presentRowCount) {
                const row: IListItem = this._itemMaker(rowHeight);
                this._container.appendChild(row.element);
                this._renderedRows.push(row);
            }
        }

        for (let rowIndex = 0; rowIndex < this._renderedRows.length; rowIndex++) {
            const renderedRow: IListItem = this._renderedRows[rowIndex];
            const y: number = scrollTop + (rowIndex - topRowIndexResidue - overscanCount) * rowHeight;
            const dataIndex: number = topRowIndex + rowIndex - overscanCount;
            this._renderItem(renderedRow, y, dataIndex);
            renderedRow.render();
        }

        if (this._rowHeight !== this._renderedRowHeight) {
            this._renderedRowHeight = this._rowHeight;
        }
    }

    protected _renderItem(item: IListItem, y: number, dataIndex: number): void {
        if (dataIndex >= 0 && dataIndex < this._rows.length) {
            const data: T = this._rows[dataIndex];
            item.setTop(y + "px");
            item.setText(data + "");
            item.setVisible(true);
        } else {
            item.setTop(y + "px");
            item.setVisible(false);
        }
    }

    public setData(data: T[]): void {
        this._rows = data;
    }

    public getDataIndexFromMouse(x: number, y: number): number {
        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseY: number = y - bounds.top;
        const rowCount: number = this._rows.length;
        const rowHeight: number = this._rowHeight;
        const clientHeight: number = this._clientHeight;
        const scrollHeight: number = this._scrollHeight;
        const height: number = clientHeight;
        const visibleRowCount: number = Math.ceil(height / rowHeight);
        const scrollTop: number = this._scrollTop;
        const percent: number = scrollTop / Math.max(1, scrollHeight - visibleRowCount * rowHeight);
        const rawTopRowIndex: number = Math.max(0, percent * (rowCount - (visibleRowCount - 0)));
        const topRowIndex: number = Math.floor(rawTopRowIndex);
        const topRowIndexResidue: number = rawTopRowIndex - topRowIndex;
        for (let rowIndex: number = 0; rowIndex < this._renderedRows.length; rowIndex++) {
            const rowY: number = (rowIndex - topRowIndexResidue) * rowHeight;
            const dataIndex: number = topRowIndex + rowIndex;
            const hit: boolean = mouseY >= rowY && mouseY <= rowY + rowHeight;
            if (hit && dataIndex >= 0 && dataIndex < rowCount) {
                return dataIndex;
            }
        }
        return -1;
    }

    public scrollToIndex(index: number): void {
        if (index < 0 || index >= this._rows.length) {
            return;
        }
        // const rowCount: number = this._rows.length;
        const rowHeight: number = this._rowHeight;
        const clientHeight: number = this._clientHeight;
        const scrollHeight: number = this._scrollHeight;
        const height: number = clientHeight;
        const visibleRowCount: number = Math.ceil(height / rowHeight);
        const scrollTop: number = this._scrollTop;
        const scrollBottom: number = scrollTop + clientHeight;
        // const percent: number = scrollTop / Math.max(1, scrollHeight - visibleRowCount * rowHeight);
        // const rawTopRowIndex: number = Math.max(0, percent * (rowCount - (visibleRowCount - 0)));
        // const topRowIndex: number = Math.floor(rawTopRowIndex);
        // const topRowIndexResidue: number = rawTopRowIndex - topRowIndex;
        const currentSelectionTop: number = index * rowHeight;
        const currentSelectionBottom: number = currentSelectionTop + rowHeight;
        if (currentSelectionTop < scrollTop) {
            // Have to force a reflow here.
            const newScrollTop: number = Math.max(0, currentSelectionTop);
            this.element.scrollTop = newScrollTop;
            this._scrollTop = this.element.scrollTop;
            this._renderedScrollTop = null;
        } else if (currentSelectionBottom > scrollBottom) {
            // Have to force a reflow here.
            const newScrollTop: number = Math.max(0,
                Math.min(
                    scrollTop + (currentSelectionBottom - scrollBottom),
                    scrollHeight - Math.min(clientHeight, visibleRowCount * rowHeight)
                )
            );
            this.element.scrollTop = newScrollTop;
            this._scrollTop = this.element.scrollTop;
            this._renderedScrollTop = null;
        }
    }

    private _handleResize = (): void => {
        this._scrollTop = this.element.scrollTop;
        this._clientHeight = this.element.clientHeight;
        this._scrollHeight = this.element.scrollHeight;

        this._ui.scheduleMainRender();
    };

    private _handleScroll = (event: Event): void => {
        this._scrollTop = this.element.scrollTop;
        this._clientHeight = this.element.clientHeight;
        this._scrollHeight = this.element.scrollHeight;

        this._ui.scheduleMainRender();
    };
}
