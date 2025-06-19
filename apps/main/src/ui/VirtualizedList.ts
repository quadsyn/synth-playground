import { H } from "@synth-playground/dom/index.js";
import { type Component } from "./types.js";
import { UIContext } from "./UIContext.js";

// @TODO: Generalize and allow the parent component to put arbitrary DOM nodes
// in here.
class ListItem implements Component {
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
            style: `
                position: absolute;
                box-sizing: border-box;
                width: 100%;
                white-space: nowrap;
                overflow: hidden;
                display: flex;
                align-items: center;
                height: ${height}px;
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

export class VirtualizedList implements Component {
    public element: HTMLDivElement;
    private _ui: UIContext;
    private _container: HTMLDivElement;
    private _scrollTop: number;
    private _renderedScrollTop: number | null;
    private _height: string;
    private _renderedHeight: string | null;
    private _rowHeight: number;
    private _renderedRowHeight: number | null;
    private _renderedTotalHeight: number | null;
    private _clientHeight: number;
    private _scrollHeight: number;
    private _rows: string[];
    private _renderedRows: ListItem[];

    constructor(ui: UIContext, height: string, rowHeight: number) {
        this._ui = ui;

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
        for (let i = 0; i < 200_000; i++) {
            this._rows.push(`index ${i} ...`);
        }
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
            // @TODO: Probably should use keyed reconciliation if necessary.
            // Otherwise, only add or remove a delta, instead of removing all
            // every time.
            while (this._renderedRows.length > 0) {
                const row = this._renderedRows.pop()!;
                row.dispose();
                row.element.remove();
            }
            for (let i = 0; i < presentRowCount; i++) {
                const row = new ListItem(rowHeight);
                this._container.appendChild(row.element);
                this._renderedRows.push(row);
            }
        }

        for (let i = 0; i < this._renderedRows.length; i++) {
            const renderedRow: ListItem = this._renderedRows[i];
            const y: number = scrollTop + (i - topRowIndexResidue - overscanCount) * rowHeight;
            const dataIndex: number = topRowIndex + i - overscanCount;
            if (dataIndex >= 0 && dataIndex < rowCount) {
                const data: string = this._rows[dataIndex];
                renderedRow.setTop(y + "px");
                renderedRow.setText(data);
                renderedRow.setVisible(true);
            } else {
                renderedRow.setTop(y + "px");
                renderedRow.setVisible(false);
            }
            renderedRow.render();
        }

        if (this._rowHeight !== this._renderedRowHeight) {
            this._renderedRowHeight = this._rowHeight;
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
