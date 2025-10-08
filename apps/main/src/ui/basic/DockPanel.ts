/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

import { H } from "@synth-playground/browser/dom.js";
import { Observable } from "@synth-playground/common/Observable.js";
import { DockPanelHeader } from "./DockPanelHeader.js";
import { DockStack } from "./DockStack.js";
import { DockStrip } from "./DockStrip.js";
import { type DockContentRegistry, DockView } from "./DockView.js";
import { ffClass } from "./FFShared.js";
import { Registry } from "./Registry.js";
import type { Component } from "../types.js";

export enum DropZone {
    none,
    before,
    after,
    left,
    right,
    top,
    bottom
}

export interface IDockPanelLayout
{
    contentId: string;
    text?: string;
    closable?: boolean;
    movable?: boolean;
}

/**
 * A container that follows layout and dragging patterns orchestrated by DockStack/DockStrip. These are supposed to
 * be managed in a DockStack or DockStrip, and the header element will be automatically generated for you after you
 * add it via insertPanel. The containing strip/stack element will include this element as a child of its own rendered
 * element, so you don't need to directly render it yourself.
 */
export class DockPanel implements Component
{
    static readonly tagName = "ff-dock-panel";
    static readonly dropMarkerTagName = "ff-dock-drop-marker";
    static readonly dragDropMimeType: string = "application/x-ff-dock-panel";
    public static registry = new Registry<DockPanel>();

    public readonly text: Observable<string>;
    public readonly closable: Observable<boolean>;
    public readonly movable: Observable<boolean>;
    public readonly active = new Observable(false);
    public readonly element: HTMLDivElement;
    public header = new Observable<DockPanelHeader | undefined>(undefined);
    public readonly id = DockPanel.registry.add(this);

    private dropMarkerElement: HTMLDivElement | undefined;
    private contentId: string;
    private dropZone: DropZone;

	/**
	 * Creates a new dockpanel with an optional header title, closable button and movable button. If any of these
	 * attributes are set, you are responsible for creating a DockPanelHeader and giving it a reference to this panel
	 * in order for those to display.
	 */
    constructor(title?: string, closable?: boolean, movable?: boolean)
    {
		this.text = new Observable(title ?? "");
		this.closable = new Observable(closable ?? true);
		this.movable = new Observable(movable ?? true);

		this.element = H('div', {
			class: DockPanel.tagName,
            style: `
                flex: 1 1 100%;
                position: relative;
                flex-direction: column;
                box-sizing: border-box;
                overflow: hidden;
            `
        });

		this.header.onChanging.Sub(() => this.renderHeaderChanging);
        this.active.onChanged.Sub(() => this.renderActiveChanged);

        this.onDragOver = this.onDragOver.bind(this);
        this.onDragLeave = this.onDragLeave.bind(this);
        this.onDrop = this.onDrop.bind(this);
        this.element.addEventListener("dragover", this.onDragOver);
        this.element.addEventListener("dragleave", this.onDragLeave);
        this.element.addEventListener("drop", this.onDrop);

        this.contentId = "";
        this.dropZone = DropZone.none;
    }

    get parentStack(): DockStack | undefined
    {
		return DockStack.registry.find(this.element.parentElement);
    }

    public setLayout(layout: IDockPanelLayout, registry: DockContentRegistry)
    {
        this.text.set(layout.text ?? "", true);
        this.closable.set(layout.closable ?? false, true);
        this.movable.set(layout.movable ?? false, true);
        this.contentId = layout.contentId;

        const factory = registry.get(layout.contentId);
        if (!factory) {
            console.warn(`failed to create dockpanel content element for id: ${layout.contentId}`);
        } else {
            const contentElement = factory();
            contentElement.classList.add(ffClass.fullsize);
            this.element.appendChild(contentElement);
        }
    }

    public getLayout(): IDockPanelLayout
    {
        return {
            contentId: this.contentId,
            text: this.text.data,
            closable: this.closable.data,
            movable: this.movable.data
        };
    }

	/** Moves this panel relative to other panels in its parent stack. */
    public movePanel(originPanelId: number, zone: DropZone)
    {
        const panel = DockPanel.registry.get(originPanelId);
        if (!panel) { return; }

        const originStack = panel.parentStack;

		// If this is the only panel in the stack, there's nothing to move it relative to.
        if (panel === this && originStack?.getPanelCount() === 1) {
            return;
        }

        const stack = panel === this
			? originStack // reuse for speed if available.
			: this.parentStack;

        if (zone === DropZone.before || zone === DropZone.after) {
			// Placing before/after means to place before/after a ref ID, so it fails if you ref the same panel to move.
            if (panel === this) {
                return;
            }

            let anchorPanel: DockPanel | null = null;
            if (zone === DropZone.after) {
                const currentHeader = this.header.data?.element?.nextElementSibling;
                if (currentHeader instanceof HTMLElement) {
                    const nextHeader = DockPanelHeader.registry.find(currentHeader);
                    anchorPanel = nextHeader?.panel ?? null;
                }
            }

            if (panel === anchorPanel) {
                return;
            }

            originStack?.removePanel(panel);
            stack?.insertPanel(panel, anchorPanel ?? undefined);
            stack?.activatePanel(panel);
        }
        else {
            originStack?.removePanel(panel);
			if (stack?.element.parentElement) {
				const parentStrip = DockStrip.registry.find(stack.element.parentElement)
				parentStrip?.insertPanel(panel, stack, zone);
			}
        }

        // panel configuration has changed, send global resize event so components can adjust to new size
        setTimeout(() => window.dispatchEvent(new CustomEvent("resize")), 0);
    }

	/** If this panel is part of a DockStack, it becomes the active panel in its stack. */
    public activatePanel()
    {
        this.parentStack?.activatePanel(this);
    }

	/** Removes this panel from its DockStack, or if not in one, unloads the element and disposes the panel. */
    public closePanel()
    {
		if (this.parentStack) {
			this.parentStack.removePanel(this);
		} else {
			if (this.header.data?.element) {
				this.header.data.element.remove();
				this.header.data.dispose();
			}

			this.element.remove();
		}
        
		this.dispose();

        // panel configuration has changed, send global resize event so components can adjust to new size
        setTimeout(() => window.dispatchEvent(new CustomEvent("resize")), 0);
    }

	private renderHeaderChanging() {
		this.header.data?.dispose();
	}
	private renderActiveChanged() {
		this.element.style.setProperty("display", this.active.data ? "flex" : "none");
	}

    public dispose() {
        DockPanel.registry.remove(this.id);

		this.element.removeEventListener("dragover", this.onDragOver);
        this.element.removeEventListener("dragleave", this.onDragLeave);
        this.element.removeEventListener("drop", this.onDrop);
    }

    private onDragOver(event: DragEvent)
    {
        if (event.dataTransfer) {
            const items = Array.from(event.dataTransfer.items);
            if (items.some(item => item.type === DockPanel.dragDropMimeType)) {
                const dropZone = this.getDropZone(event);
                if (dropZone !== this.dropZone) {
                    this.dropZone = dropZone;
                    this.updateDropMarker(true);
                }

                event.stopPropagation();
                event.preventDefault();
            }
        }
    }

    private onDragLeave(_: DragEvent)
    {
        if (this.dropZone !== DropZone.none) {
            this.dropZone = DropZone.none;
            this.updateDropMarker(false);
        }
    }

    private onDrop(event: DragEvent)
    {
        if (event.dataTransfer) {
            const items = Array.from(event.dataTransfer.items);
            if (items.some(item => item.type === DockPanel.dragDropMimeType)) {
                const zone = this.dropZone;

                if (zone !== DropZone.none) {
                    this.dropZone = DropZone.none;
                    this.updateDropMarker(false);
                }

                event.stopPropagation();

                const panelId = +event.dataTransfer.getData(DockPanel.dragDropMimeType);
                this.movePanel(panelId, zone);

                this.element.dispatchEvent(new CustomEvent(DockView.changeEvent, { bubbles: true }));
            }
        }
    }

    private getDropZone(event: DragEvent): DropZone
    {
        const rect = this.element.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;

        const zone: DropZone = (x > 0.33 && x < 0.67 && y > 0.33 && y < 0.67)
            ? DropZone.after : (x < y)
            ? (x + y < 1) ? DropZone.left : DropZone.bottom
            : (x + y < 1) ? DropZone.top : DropZone.right;

        return zone;
    }

    private updateDropMarker(show: boolean)
    {
        const getStyle = () => `
            pointer-events: none;
            z-index: 1;
            position: absolute;
            left: ${this.dropZone === DropZone.right ? "50%" : "0"};
            right: ${this.dropZone === DropZone.left ? "50%" : "0"};
            top: ${this.dropZone === DropZone.bottom ? "50%" : "0"};
            bottom: ${this.dropZone === DropZone.top ? "50%" : "0"};`;

        // Remove
        if (!show && this.dropMarkerElement !== undefined) {
            this.dropMarkerElement.remove();
        // Update
        } else if (show && this.dropMarkerElement !== undefined) {
            this.dropMarkerElement.style = getStyle();
        // Insert
        } else if (show && this.dropMarkerElement === undefined) {
            this.dropMarkerElement = H('div', {
                class: DockPanel.dropMarkerTagName,
                style: getStyle()
            });

            this.element.appendChild(this.dropMarkerElement);
        }
    }
}