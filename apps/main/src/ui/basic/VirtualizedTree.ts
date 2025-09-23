import { H } from "@synth-playground/browser/dom.js";
import { clamp, insideRange } from "@synth-playground/common/math.js";
import { matchExactSubstring } from "@synth-playground/common/string.js";
import { type Component } from "../types.js";
import { UIContext } from "../UIContext.js";

// @TODO: Generalize and allow the parent component to put arbitrary DOM nodes
// in here.
class TreeViewItem implements Component {
    public element: HTMLDivElement;

    private _textContainer: HTMLDivElement;
    private _text: string;
    private _top: string;
    private _renderedTop: string;
    private _visible: boolean;
    private _marginLeft: string;
    private _dataIsOpen: string;
    private _dataHasChildren: string;
    private _height: number;

    private _renderedText: string | null;
    private _renderedVisible: boolean;
    private _renderedMarginLeft: string | null;
    private _renderedDataIsOpen: string;
    private _renderedDataHasChildren: string;
    private _renderedHeight: number | null;

    constructor(height: number) {
        this._text = "";
        this._renderedText = null;
        this._top = "";
        this._renderedTop = "";
        this._visible = true;
        this._renderedVisible = true;
        this._marginLeft = "0px";
        this._renderedMarginLeft = null;
        this._dataIsOpen = "";
        this._renderedDataIsOpen = "";
        this._dataHasChildren = "";
        this._renderedDataHasChildren = "";
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
            class: "tree-view-item",
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
        if (this._dataIsOpen !== this._renderedDataIsOpen) {
            this.element.setAttribute("data-is-open", this._dataIsOpen);
            this._renderedDataIsOpen = this._dataIsOpen;
        }

        if (this._dataHasChildren !== this._renderedDataHasChildren) {
            this.element.setAttribute("data-has-children", this._dataHasChildren);
            this._renderedDataHasChildren = this._dataHasChildren;
        }

        if (this._marginLeft !== this._renderedMarginLeft) {
            this.element.style.paddingLeft = this._marginLeft;
            this._renderedMarginLeft = this._marginLeft;
        }

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

    public setMarginLeft(marginLeft: string): void {
        this._marginLeft = marginLeft;
    }

    public setText(text: string): void {
        this._text = text;
    }

    public setVisible(visible: boolean): void {
        this._visible = visible;
    }

    public setDataHasChildren(hasChildren: boolean): void {
        this._dataHasChildren = hasChildren + "";
    }

    public setDataIsOpen(isOpen: boolean): void {
        this._dataIsOpen = isOpen + "";
    }
}

interface TreeNode {
    name: string;
    children?: TreeNode[];
}

interface TreeViewState {
    root: TreeNode;
    expanded: Set<TreeNode>;
    filter: string | null;
    pointers: TreeNode[];
    depths: number[];
    parents: number[];
    rowCount: number;
}

function filteredNode(node: TreeNode, filter: string): TreeNode | null {
    if (node.children == null) {
        return matchExactSubstring(node.name, filter) ? node : null;
    } else {
        const newChildren: TreeNode[] = [];
        for (let i: number = 0; i < node.children.length; i++) {
            const child: TreeNode = node.children[i];
            const filtered: TreeNode | null = filteredNode(child, filter);
            if (filtered != null) {
                newChildren.push(filtered);
            }
        }
        return newChildren.length > 0 ? ({
            name: node.name, children: newChildren,
        }) : null;
    }
}

function filteredTree(roots: TreeNode[], filter: string): TreeNode[] {
    const newRoots: TreeNode[] = [];
    for (let i: number = 0; i < roots.length; i++) {
        const root: TreeNode = roots[i];
        const filtered: TreeNode | null = filteredNode(root, filter);
        if (filtered != null) {
            newRoots.push(filtered);
        }
    }
    return newRoots;
}

function rebuildTreeViewState(state: TreeViewState): void {
    // @TODO: This is very slow.
    let roots = state.root.children!;
    if (state.filter != null) {
        roots = filteredTree(roots, state.filter);
    }
    state.pointers.length = 0;
    state.depths.length = 0;
    state.parents.length = 0;
    interface StackFrame {
        node: TreeNode;
        depth: number;
        parent: number;
    }
    const stack: StackFrame[] = [];
    for (let i: number = roots.length - 1; i >= 0; i--) {
        stack.push({ node: roots[i], depth: 0, parent: -1 });
    }
    let flatIndex: number = 0;
    while (stack.length > 0) {
        const { node, depth, parent } = stack.pop()!;
        state.pointers.push(node);
        state.depths.push(depth);
        state.parents.push(parent);
        // If there's a filter, we ignore expanding/collapsing.
        if (node.children != null && (state.filter != null || state.expanded.has(node))) {
            const childCount: number = node.children.length;
            for (let i: number = childCount - 1; i >= 0; i--) {
                stack.push({ node: node.children[i], depth: depth + 1, parent: flatIndex });
            }
        }
        flatIndex++;
    }
    state.rowCount = flatIndex;
}

function range(n: number): number[] {
    return new Array(n).fill(0).map((_, i) => i);
}

function pick<T>(array: T[]): T {
    const count: number = array.length;
    // This is probably biased. Doesn't matter.
    const index: number = clamp(Math.floor(Math.random() * (count + 1)), 0, count - 1);
    return array[index];
}

const MAX_CONTAINER_HEIGHT: number = 7_000_000;

export class VirtualizedTree implements Component {
    public element: HTMLDivElement;

    private _ui: UIContext;
    private _container: HTMLDivElement;
    private _scrollTop: number;
    private _height: string;
    private _rowHeight: number;
    private _clientHeight: number;
    private _scrollHeight: number;
    private _root: TreeNode;
    private _treeViewState: TreeViewState;

    private _renderedScrollTop: number | null;
    private _renderedHeight: string | null;
    private _renderedRowHeight: number | null;
    private _renderedTotalHeight: number | null;
    private _renderedRows: TreeViewItem[];

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

        this._root = {
            name: "root",
            children: [
                {
                    name: "folder 1",
                    children: [
                        ...range(20).map(i => ({
                            name: "folder " + i,
                            children: range(1000).map(
                                i => ({ name: pick(["large", "medium", "small"]) + " file " + i })
                            ),
                        })),
                        { name: "file 4" },
                    ],
                },
                {
                    name: "folder 3",
                    children: [
                        { name: "file 5" },
                        { name: "file 6" },
                        { name: "file 7" },
                    ],
                },
                { name: "file 8" },
                { name: "file 9" },
            ],
        };
        this._treeViewState = {
            root: this._root,
            expanded: new Set(),
            pointers: [],
            depths: [],
            parents: [],
            rowCount: 0,
            filter: null,
        };
        rebuildTreeViewState(this._treeViewState);

        this._renderedRows = [];
        this._container = H("div", {
            style: `
                overflow: hidden;
                position: relative;
                box-sizing: border-box;
            `,
        });
        this.element = H("div", {
            class: "tree-view",
            style: `
                height: ${this._height};
                overflow-y: auto;
                overflow-x: hidden;
                box-sizing: border-box;
            `,
        }, this._container);

        this.element.addEventListener("scroll", this._handleScroll);
        this.element.addEventListener("click", this._handleClick);
        this._ui.resizeObserver.register(this.element, this._handleResize);
        this._ui.resizeObserver.observe(this.element);
    }

    public dispose(): void {
        this.element.removeEventListener("scroll", this._handleScroll);
        this.element.removeEventListener("click", this._handleClick);
        this._ui.resizeObserver.unobserve(this.element);
        this._ui.resizeObserver.unregister(this.element, this._handleResize);
    }

    public expandAll(): void {
        const state = this._treeViewState;
        function inner(node: TreeNode): void {
            if (node.children != null) {
                state.expanded.add(node);
                for (let child of node.children) {
                    inner(child);
                }
            }
        }
        if (state.expanded.size === 0) {
            for (let child of state.root.children!) {
                inner(child);
            }
        } else {
            state.expanded.clear();
        }
        rebuildTreeViewState(this._treeViewState);
    }

    public getExpandedNodeCount(): number {
        return this._treeViewState.expanded.size;
    }

    public setFilter(newFilter: string | null): void {
        newFilter = newFilter === "" ? null : newFilter;
        const oldFilter: string | null = this._treeViewState.filter;
        if (newFilter !== oldFilter) {
            this._treeViewState.filter = newFilter;
            rebuildTreeViewState(this._treeViewState);
        }
    }

    public render(): void {
        if (this._height !== this._renderedHeight) {
            this.element.style.height = this._height;
            this._renderedHeight = this._height;
        }

        const state: TreeViewState = this._treeViewState;
        const rowCount: number = state.rowCount;

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
        const overscanCount: number = 10;
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
            for (let i: number = 0; i < presentRowCount; i++) {
                const row = new TreeViewItem(rowHeight);
                this._container.appendChild(row.element);
                this._renderedRows.push(row);
            }
        }

        for (let rowIndex: number = 0; rowIndex < this._renderedRows.length; rowIndex++) {
            const renderedRow: TreeViewItem = this._renderedRows[rowIndex];
            const y: number = scrollTop + (rowIndex - topRowIndexResidue - overscanCount) * rowHeight;
            const dataIndex: number = topRowIndex + rowIndex - overscanCount;
            if (insideRange(dataIndex, 0, rowCount - 1)) {
                const data: TreeNode = state.pointers[dataIndex];
                const indent: number = 20 * (state.depths[dataIndex] + 1);
                renderedRow.setMarginLeft(indent + "px");
                renderedRow.setTop(y + "px");
                renderedRow.setText(data.name);
                renderedRow.setVisible(true);
                renderedRow.setDataHasChildren(data.children != null);
                renderedRow.setDataIsOpen(state.filter != null || state.expanded.has(data));
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

    private _handleClick = (event: MouseEvent): void => {
        const bounds: DOMRect = this.element.getBoundingClientRect();
        const mouseY: number = event.clientY - bounds.top;

        // @TODO: Avoid duplicating this math here.
        const state: TreeViewState = this._treeViewState;
        const rowCount: number = state.rowCount;

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

        let shouldRender: boolean = false;

        for (let rowIndex: number = 0; rowIndex < this._renderedRows.length; rowIndex++) {
            const y: number = (rowIndex - topRowIndexResidue) * rowHeight;
            const dataIndex: number = topRowIndex + rowIndex;
            if (insideRange(mouseY, y, y + rowHeight) && insideRange(dataIndex, 0, rowCount - 1)) {
                const data: TreeNode = state.pointers[dataIndex];
                if (data.children != null && state.filter == null) {
                    if (state.expanded.has(data)) {
                        state.expanded.delete(data);
                    } else {
                        state.expanded.add(data);
                    }
                    rebuildTreeViewState(state);
                    shouldRender = true;
                }
                break;
            }
        }

        if (shouldRender) {
            this._ui.scheduleMainRender();
        }
    };
}
