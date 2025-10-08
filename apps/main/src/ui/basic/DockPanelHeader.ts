/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

import { H } from "@synth-playground/browser/dom.js";
import { Observable } from "@synth-playground/common/Observable.js";
import { DockPanel } from "./DockPanel.js";
import { DockStack } from "./DockStack.js";
import { DockView } from "./DockView.js";
import { ffClass } from "./FFShared.js";
import { defaultIcons, IconButton } from "./IconButton.js";
import { Registry } from "./Registry.js";
import type { Component } from "../types.js";

export interface IDockPanelCloseEvent extends CustomEvent {
    detail: {
        panelId: number;
    }
}

/** The titlebar with title, close/move buttons, etc. that attaches to a DockPanel. */
export class DockPanelHeader implements Component
{
    static readonly tagName = "ff-dock-panel-header";
    static readonly closeEvent = "ff-dock-panel-header-close";
	public static registry = new Registry<DockPanelHeader>();

    private _element!: HTMLLabelElement;
	public get element() { return this._element; }
    public readonly active = new Observable(false);
	public readonly id = DockPanelHeader.registry.add(this);

	public readonly panel: DockPanel;

    constructor(panel: DockPanel)
    {
		this.panel = panel;
        this.initialRender();

		panel.header.set(this, true);

        this.active.onChanged.Sub(() => this.renderActiveChanged);
        this.panel.movable.onChanged.Sub(() => this.renderMovableChanged)
		this.panel.text.onChanged.Sub(() => this.initialRender);
    }

    private initialRender() {
        let icon: HTMLButtonElement | null;
        if (this.panel.closable.data) {
            icon = new IconButton(defaultIcons.close.val, this.onClickButton.bind(this)).element
            icon.style.setProperty('display', 'inline');
            icon.classList.add(ffClass.button);
        } else if (this.panel.movable.data) {
            icon = new IconButton(defaultIcons.grip.val, () => {}).element
            icon.classList.add(ffClass.icon);
        } else {
            icon = null;
        }

		const children: (string | Node)[] = [this.panel.text.data];
		if (icon) { children.push(icon) };

		this.disposeElement();
		this._element = H('label', {
			class: `${ffClass.text} ${DockPanelHeader.tagName}`,
			style: `
            flex: 0 0 auto;
            display: block;
            user-select: none;
            cursor: pointer;
        	`},
			...children);

		this.onClick = this.onClick.bind(this);
        this.onDragStart = this.onDragStart.bind(this);
        this.onDragOver = this.onDragOver.bind(this);
        this.onDragLeave = this.onDragLeave.bind(this);
        this.onDrop = this.onDrop.bind(this);
        this._element.addEventListener("click", this.onClick);
        this._element.addEventListener("dragstart", this.onDragStart);
        this._element.addEventListener("dragover", this.onDragOver);
        this._element.addEventListener("dragleave", this.onDragLeave);
        this._element.addEventListener("drop", this.onDrop);
    }

	private renderActiveChanged() {
		this.panel.active.set(this.active.data, true);
        this.initialRender();
	}

	private renderMovableChanged() {
		if (this.panel.movable.data) {
			this._element.setAttribute("draggable", "true");
		}
		else {
			this._element.removeAttribute("draggable");
		}
	}

	public dispose() {
		DockPanelHeader.registry.remove(this.id);
		this.panel.movable.onChanged.Unsub(this.renderMovableChanged)
		this.panel.text.onChanged.Unsub(this.initialRender);
        this.disposeElement();
	}

	private disposeElement() {
		// Element is asserted assigned in constructor but this is called before that, so check.
		this._element?.removeEventListener("click", this.onClick);
        this._element?.removeEventListener("dragstart", this.onDragStart);
        this._element?.removeEventListener("dragover", this.onDragOver);
        this._element?.removeEventListener("dragleave", this.onDragLeave);
        this._element?.removeEventListener("drop", this.onDrop);
	}

    private onClick(event: MouseEvent)
    {
        this.panel.activatePanel();

        this._element.dispatchEvent(new CustomEvent(DockView.changeEvent, { bubbles: true }));
    }

    private onClickButton(event: MouseEvent)
    {
        this._element.dispatchEvent(new CustomEvent(DockPanelHeader.closeEvent, {
            detail: { panelId: this.panel.id },
            bubbles: true
        } as IDockPanelCloseEvent));

        this.panel.closePanel();
        event.stopPropagation();

        this._element.dispatchEvent(new CustomEvent(DockView.changeEvent, { bubbles: true }));
    }

    private onDragStart(event: DragEvent)
    {
		if (this.panel.element.parentElement) {
			const stack = DockStack.registry.find(this.panel.element.parentElement);
			stack?.activatePanel(this.panel);
		}

        if (event.dataTransfer) {
            event.dataTransfer.setData(DockPanel.dragDropMimeType, this.panel.id.toString());
            event.dataTransfer.dropEffect = "move";
        }
    }

    private onDragOver(event: DragEvent)
    {
        this.panel.parentStack?.onDragOver(event);
    }

    private onDragLeave(event: DragEvent)
    {
        this.panel.parentStack?.onDragLeave(event);
    }

    private onDrop(event: DragEvent)
    {
        this.panel.parentStack?.onDrop(event);
    }
}