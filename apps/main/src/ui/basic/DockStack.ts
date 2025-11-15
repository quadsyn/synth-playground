/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

import { H } from "@synth-playground/browser/dom.js";
import { Observable } from "@synth-playground/common/Observable.js";
import type { IDockStackLayout } from "./DockElement.js";
import { DockPanel, DropZone } from "./DockPanel.js";
import { DockPanelHeader } from "./DockPanelHeader.js";
import { DockStrip } from "./DockStrip.js";
import { type DockContentRegistry, DockView } from "./DockView.js";
import { Registry } from "./Registry.js";
import type { Component } from "../types.js";

/** A flexbox of dockable containers without splitters; use DockStrip for that. This can be laid out in a DockView. */
export class DockStack implements Component
{
	static readonly tagName = "ff-dock-stack";
	public static registry = new Registry<DockStack>();

    public readonly activeIndex = new Observable(0);

	public get size() {
        return parseFloat(this._element.style.flexBasis) * 0.01;
    }
    public set size(value: number) {
        this._element.style.flexBasis = `${((value || 1) * 100).toFixed(3)}%`;
    }

	private _element!: HTMLDivElement;
	public get element() { return this._element; }
	public readonly id = DockStack.registry.add(this);

    private headers!: HTMLElement;
    private activeHeader: DockPanelHeader | null = null;
    private dropTarget: DockPanel | null = null;
    private dropZone = DropZone.none;

    constructor() {
		this.initialRender();
    }

	/** Loads the provided panel data, unloads the previous if any. It should be inserted in the DockStack first. */
    public activatePanel(panel: DockPanel)
    {
        if (this.activeHeader?.panel === panel) {
            return;
        }

		this.activeHeader?.active.set(false, true);
        this.activeHeader = panel.header.data ?? null;
		this.activeHeader?.active.set(true, true);
    }

	/** Adds a panel to the DockStack. If beforePanel is provided, it will be inserted before that panel. */
    public insertPanel(panel: DockPanel, beforePanel?: DockPanel)
    {
		this._element.appendChild(panel.element);

		panel.header.data?.dispose();
		panel.header.data?.element.remove();
        const header = new DockPanelHeader(panel);

        if (beforePanel?.header.data?.element) {
            this.headers.insertBefore(header.element, beforePanel.header.data.element);
        }
        else {
            this.headers.appendChild(header.element);
        }
    }

	/**
	 * Removes a panel from the DockStack. If it's the active panel, the first panel (if any) is selected, and if
	 * there are no panels, the DockStack is destroyed.
	 */
    public removePanel(panel: DockPanel)
    {
        const header = panel.header;
		if (header.data?.element) {
			this.headers.removeChild(header.data.element);
			header.data.dispose();
		}
        
        this._element.removeChild(panel.element);
		panel.dispose();

        if (this.getPanelCount() === 0) {
            const strip = DockStrip.registry.find(this._element.parentElement);
			if (strip) {
				strip.removeDockElement(this);
			} else {
				this.element.remove();
				this.dispose();
			}
        }
        else if (this.activeHeader === header.data) {
            const firstHeader = DockPanelHeader.registry.find(this.headers.firstChild);
			if (firstHeader) {
				this.activatePanel(firstHeader.panel);
			}
        }
    }

	/** Returns how many panels are actively loaded. */
    public getPanelCount()
    {
        return this.headers.childElementCount;
    }

    public setLayout(layout: IDockStackLayout, registry: DockContentRegistry)
    {
        // remove existing children/panels
        const children = Array.from(this._element.children);
        for (let child of children) {
            if (child !== this.headers) {
                this._element.removeChild(child);
				DockPanel.registry.find(this._element)?.dispose();
            }
        }

        this.size = layout.size;

        layout.panels.forEach(layout => {
            const panel = new DockPanel();
            panel.setLayout(layout, registry);
            this.insertPanel(panel);
        });

        const firstHeader = DockPanelHeader.registry.find(this.headers.firstElementChild);
        if (firstHeader) {
            this.activatePanel(firstHeader.panel);
        }
    }

    public getLayout(): IDockStackLayout
    {
		const panels = DockPanel.registry.getValues();
        const panelLayouts = panels.map(panel => panel.getLayout());
        let activePanelIndex = -1;

        for (let i = 0, n = panels.length; i < n; ++i) {
            if (panels[i] === this.activeHeader?.panel) {
                activePanelIndex = i;
                break;
            }
        }

        return {
            type: "stack",
            size: this.size,
            activePanelIndex,
            panels: panelLayouts
        };
    }

    public onDragOver(event: DragEvent)
    {
		if (event.dataTransfer) {
			const items = Array.from(event.dataTransfer.items);
			if (items.find(item => item.type === DockPanel.dragDropMimeType)) {
				this.updateDropMarker(event);
				event.stopPropagation();
				event.preventDefault();
			}
		}
    }

    public onDragLeave(event: DragEvent)
    {
        this.updateDropMarker();
        event.stopPropagation();
    }

    public onDrop(event: DragEvent)
    {
        event.stopPropagation();
        this.updateDropMarker();

        const panelId = event.dataTransfer?.getData(DockPanel.dragDropMimeType);

        if (this.dropTarget && this.dropZone !== DropZone.none && panelId) {
            this.dropTarget.movePanel(+panelId, this.dropZone);
        }

        this._element.dispatchEvent(new CustomEvent(DockView.changeEvent, { bubbles: true }));
    }

    private updateDropMarker(event?: DragEvent)
    {
        let marker = this._element.getElementsByClassName(DockPanel.dropMarkerTagName).item(0);

        if (!event) {
            if (marker) {
                this._element.removeChild(marker);
            }
            return;
        }

        if (!marker) {
			marker = H('div', {
				class: DockPanel.dropMarkerTagName,
				style: `
					pointer-events: none;
					width: 25px;
					position: absolute;
					z-index: 1;`
			});
            this._element.appendChild(marker);
            this.dropTarget = null;
            this.dropZone = DropZone.none;
        }

        let dropTarget = this.dropTarget;
        let dropZone = this.dropZone;
        let headerRect;

        if (event.currentTarget === this.element) {
            const lastHeader = DockPanelHeader.registry.find(this.headers?.lastChild);
			if (lastHeader) {
				headerRect = lastHeader.element.getBoundingClientRect();
				dropTarget = lastHeader.panel;
				dropZone = DropZone.after;
			}
        }
		else {
			const panelHeader = DockPanelHeader.registry.find(event.currentTarget as Element);
			if (panelHeader) {
				headerRect = panelHeader.element.getBoundingClientRect();
				const x = (event.clientX - headerRect.left) / headerRect.width;
				dropTarget = panelHeader.panel;
				dropZone = x < 0.5 ? DropZone.before : DropZone.after;
			} else {
				dropTarget = null;
				dropZone = DropZone.none;
			}
		}

        if (dropTarget !== this.dropTarget || dropZone !== this.dropZone) {
            this.dropTarget = dropTarget;
            this.dropZone = dropZone;
            if (dropTarget) {
                const parentRect = this.headers.getBoundingClientRect();
                const stackRect = this._element.getBoundingClientRect();
                const pos = (dropZone === DropZone.before ? headerRect?.left : headerRect?.right) ?? 0;
				this._element.style.setProperty("top", (parentRect.top - stackRect.top) + "px");
				this._element.style.setProperty("height", parentRect.height + "px");
				this._element.style.setProperty("left", (pos - stackRect.left) + "px");
            }
            else {
                marker.remove();
            }
        }
    }

    private initialRender()
    {
		this._element = H('div', {
			class: DockStack.tagName,
			style: `
				flex: 1 1 auto;
				position: relative;
				display: flex;
				flex-direction: column;
				overflow: hidden;
			`}
		);

		this.headers = H("header", {
			style: `
				flex: 1 0 auto;
				flex-wrap: wrap;
				display: flex;
				flex-direction: row;
				overflow: hidden;
			`}
		);

		this.onDragOver = this.onDragOver.bind(this);
		this.onDragLeave = this.onDragLeave.bind(this);
		this.onDrop = this.onDrop.bind(this);
		this._element.addEventListener("dragover", this.onDragOver);
        this._element.addEventListener("dragleave", this.onDragLeave);
        this._element.addEventListener("drop", this.onDrop);
        this._element.insertBefore(this.headers, this._element.firstChild);

		// Ensures all child elements are in their own panels.
		// TODO: since this was erroneously called & ignored before, do I need to remove the prior element clearing?
		Array.from(this._element.children).forEach((child => {
			// Skips over (and therefore preserves) all headers, reinserting all panels while encapsulating
			// any other non-panel elements outside of the headers element into their own panels.
			if (child !== this.headers) {
				this._element.removeChild(child);
				const associatedPanel = DockPanel.registry.find(child);

				if (associatedPanel) {
					// Remove existing header element. TODO: This is not default FF implementation. Valuable?
					if (associatedPanel.header?.data) {
						associatedPanel.header.data.element.remove();
						associatedPanel.header.data.dispose();
					}

					this.insertPanel(associatedPanel);
				} else {
					const panel = new DockPanel();
					panel.element.appendChild(child);
					this.insertPanel(panel);
				}
			}
		}));

		// Activates the first one.
		const firstHeader = DockPanelHeader.registry.find(this.headers.firstElementChild);
		if (firstHeader) {
			this.activatePanel(firstHeader.panel);
		}
	}

	public dispose() {
		DockStack.registry.remove(this.id);

		this._element.removeEventListener("dragover", this.onDragOver);
        this._element.removeEventListener("dragleave", this.onDragLeave);
        this._element.removeEventListener("drop", this.onDrop);
	}
}