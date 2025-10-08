/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

import { H } from "@synth-playground/browser/dom.js";
import { getDockElement, type IDockElementLayout, type IDockStackLayout, type IDockStripLayout } from "./DockElement.js";
import { DockStrip } from "./DockStrip.js";
import { DockStack } from "./DockStack.js";
import type { Component } from "../types.js";

export type DockContentRegistry = Map<string, () => HTMLElement>;

/** Creates a DockStrip or DockStack instance as a child element from the given layout information. A top-level dock control. */
export class DockView implements Component
{
	static readonly tagName = "ff-dock-view";
    static readonly changeEvent = "ff-dock-view-change";

	public readonly element: HTMLDivElement;

	constructor() {
		this.element = H('div', {
			class: DockView.tagName,
			style: `
				display: flex;
				align-items: stretch;
			`}
		);
	}

	/** Creates a DockStack or DockStrip with the given layout. */
    public setLayout(layout: IDockElementLayout, registry: DockContentRegistry)
    {
		while(this.element.firstChild) {
			if (this.element.firstChild.nodeType === Node.ELEMENT_NODE) {
				getDockElement(this.element.firstChild as Element)?.dispose();
			}

			this.element.removeChild(this.element.firstChild);
        }

		switch(layout.type) {
			case "strip":
				const strip = new DockStrip();
				strip.setLayout(layout as IDockStripLayout, registry);
				this.element.appendChild(strip.element);
				break;
			case "stack":
				const stack = new DockStack();
				stack.setLayout(layout as IDockStackLayout, registry);
				this.element.appendChild(stack.element);
				break;
			default:
				layout.type satisfies never // catch missing cases in TS
				break;
		}

        // panel configuration has changed, send global resize event so components can adjust to new size
        setTimeout(() => window.dispatchEvent(new CustomEvent("resize")), 0);
    }

	/** Returns the current layout. */
    public getLayout(): IDockElementLayout | null
    {
        const element = this.element.firstElementChild;
		if (element) {
			const dockElement = getDockElement(element);
			return dockElement?.getLayout() ?? null;
		}

		return null;
    }

	public dispose() {
		// Nothing to dispose of here
	}
}