/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

import { H } from "@synth-playground/browser/dom.js";
import { Observable } from "@synth-playground/common/Observable.js";
import { Splitter, SplitterDirection, type ISplitterChangeEvent } from "./Splitter.js"
import { getDockElement, type DockElement, type IDockStripLayout } from "./DockElement.js";
import { DockPanel, DropZone } from "./DockPanel.js";
import { DockStack } from "./DockStack.js";
import { type DockContentRegistry, DockView } from "./DockView.js";
import { Registry } from "./Registry.js";
import type { Component } from "../types.js";

/** A flexbox of DockStack or other DockStrip containers with splitters generated between each. This can be laid out in a DockView. */
export class DockStrip implements Component
{
	public static tagName = "ff-dock-strip";
    public static registry = new Registry<DockStrip>();

	public readonly element: HTMLElement;
	public readonly id = DockStrip.registry.add(this);
	public readonly direction = new Observable(SplitterDirection.horizontal);

    public get size() {
        return parseFloat(this.element.style.flexBasis) * 0.01;
    }
	public set size(value: number) {
        this.element.style.flexBasis = `${((value || 1) * 100).toFixed(3)}%`;
    }

    private hasInitialized = false;

	constructor() {
		this.element = H('div', {
			class: DockStrip.tagName,
			style: `
				flex: 1 1 auto;
				display: flex;
				align-items: stretch;
				overflow: hidden;
			`}
		);
		
		this.initialize(true);
		this.direction.onChanged.Sub(this.renderDirectionChanged.bind(this));
	}

    public insertPanel(panel: DockPanel, stack: DockStack, zone: DropZone) {
        const zoneDirection = (zone === DropZone.left || zone === DropZone.right) ? SplitterDirection.horizontal : SplitterDirection.vertical;
        const zoneBefore = zone === DropZone.left || zone === DropZone.top;
        const stackSize = stack.size;

        // wrap panel in new stack
        const newStack = new DockStack();
        newStack.insertPanel(panel);
        newStack.activatePanel(panel);

        // if there are less than two elements in this strip, we can adapt direction
        const elements = this.getDockElements();
        if (elements.length < 2) {
            this.direction.set(zoneDirection, true);
        }

        let insertBefore: DockElement | undefined = stack;
        if (!zoneBefore) {
            for (let i = 0, n = elements.length; i < n; ++i) {
                if (elements[i].element === stack.element) {
                    insertBefore = elements[i + 1]
                    break;
                }
            }
        }

        if (zoneDirection === this.direction.data) {
            // direction matches, insert new stack into strip
            this.insertDockElement(newStack, insertBefore);
            newStack.size = stack.size = stackSize * 0.5;
        }
        else {
            // create new strip in orthogonal direction, insert stack into new strip
            const newStrip = new DockStrip();
            this.element.insertBefore(newStrip.element, stack.element);
            newStrip.element.appendChild(stack.element);
            newStrip.insertDockElement(newStack, zoneBefore ? stack : undefined);

            newStrip.direction.set(zoneDirection, true);
            newStrip.size = stackSize;
            stack.size = newStack.size = 0.5;
        }
    }

    public insertDockElement(element: DockElement, before?: DockElement) {
        this.initialize(false);
        this.element.insertBefore(element.element, before?.element ?? null);
        this.updateSplitters();
    }

    public removeDockElement(item: DockElement) {
        let children = this.getDockElements();
        if (children.length === 1) {
            return;
        }

        // remove the element and get remaining elements
        this.element.removeChild(item.element);
		item.dispose();

        // if only one element remains and parent is also a dock strip, merge with parent
        children = this.getDockElements();
		const parentStrip = DockStrip.registry.find(this.element.parentElement);
        if (children.length < 2 && parentStrip) {
            this.element.removeChild(children[0].element);
            children[0].size = this.size;
            parentStrip.element.insertBefore(children[0].element, this.element);
            parentStrip.element.removeChild(this.element);
            parentStrip.updateSplitters();
			this.dispose();
        }
        else {
            this.updateSplitters();
        }
    }

    public getDockElements(): DockElement[] {
        return Array.from(this.element.children)
			.map(e => getDockElement(e))
			.filter(e => e !== undefined);
    }

    public setLayout(layout: IDockStripLayout, registry: DockContentRegistry) {
        this.initialize(false);

        // remove all children
        while(this.element.firstChild) {
			if (this.element.firstChild.nodeType === Node.ELEMENT_NODE) {
				const dockElement = getDockElement(this.element.firstChild as Element);
				dockElement?.dispose();
			}
        	
			this.element.removeChild(this.element.firstChild);
        }

        this.size = layout.size;
        this.direction.set(layout.direction, true);

        layout.elements.forEach(layout2 => {
            let dockElement: DockElement;

            switch(layout2.type) {
                case "strip":
                    dockElement = new DockStrip();
                    break;
                case "stack":
                    dockElement = new DockStack();
                    break;
            }

            dockElement.setLayout(layout2 as any, registry);
            this.element.appendChild(dockElement.element);
        });

        this.updateSplitters();
    }

    public getLayout(): IDockStripLayout
    {
		const elements = this.getDockElements().map(element => element.getLayout());

        return {
            type: "strip",
            size: this.size,
            direction: this.direction.data,
            elements
        };
    }

    public get isHorizontal() {
        return this.direction.data === SplitterDirection.horizontal;
    }

    private onSplitterChange(event: ISplitterChangeEvent)
    {
        if (!event.detail.isDragging) {
            this.element.dispatchEvent(new CustomEvent(DockView.changeEvent, { bubbles: true }));
        }
    }

    private updateSplitters()
    {
        if (!this.element.isConnected) {
            return;
        }

        const isHorizontal = this.isHorizontal;
        const dockElements: HTMLElement[] = [];
        const elementSizes = [];
        let childrenSize = 0;

		const children = Array.from(this.element.children);
        for (let i = 0, n = children.length; i < n; ++i) {
			if (children[i] === null) { continue; }
            const nextChild = children[i].nextElementSibling;

            // remove redundant splitter handles
			const splitterChild = Splitter.registry.find(children[i]);
            if (splitterChild) {
                if (i === 0 || !nextChild || Splitter.registry.find(nextChild)) {
                    this.element.removeChild(children[i]);
					splitterChild.dispose();
                    continue;
                }

                splitterChild.direction.set(this.direction.data, true);
            }

			const dockElement = getDockElement(children[i]);
            if (!dockElement) {
                continue;
            }

            // sum size of children
            const childRect = dockElement.element.getBoundingClientRect();
            const childSize = isHorizontal ? childRect.width : childRect.height;
            childrenSize += childSize;
            dockElements.push(dockElement.element);
            elementSizes.push(childSize);

            // add splitter between previous and this child if necessary
            const prevChild = children[i].previousElementSibling;
            if (prevChild && !Splitter.registry.find(prevChild)) {
                const splitter = new Splitter();
                splitter.direction.set(this.direction.data, true);

				splitter.registerListener(Splitter.changeEvent, this.onSplitterChange);
                this.element.insertBefore(splitter.element, children[i]);
            }
        }

        // adjust sizes
        for (let i = 0, n = dockElements.length; i < n; ++i) {
            dockElements[i].style.flexBasis = `${(elementSizes[i] / childrenSize * 100).toFixed(3)}%`;
        }
    }

    private initialize(parseChildren: boolean)
    {
        if (this.hasInitialized) {
            return;
        }

        this.hasInitialized = true;

        if (parseChildren) {
            // parse children and wrap them in dock stack elements
            Array.from(this.element.children).forEach(child => {
                if (!getDockElement(child)) {
                    const stack = new DockStack();
                    const nextSibling = child.nextSibling;
                    stack.element.appendChild(child);
                    this.element.insertBefore(stack.element, nextSibling);
                }
            });
        }
    }

	private renderDirectionChanged() {
		this.element.style.flexDirection = this.isHorizontal ? "row" : "column";
		this.updateSplitters();
	}

	public dispose() {
		DockStrip.registry.remove(this.id);
	}
}