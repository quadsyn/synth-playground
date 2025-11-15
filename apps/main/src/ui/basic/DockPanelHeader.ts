/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

import { Observable } from "@synth-playground/common/Observable.js";
import { DockPanel } from "./DockPanel.js";
import { DockStack } from "./DockStack.js";
import { DockView } from "./DockView.js";
import { ffClass } from "./FFShared.js";
import { defaultIcons, IconButton } from "./IconButton.js";
import { Registry } from "./Registry.js";
import type { Component } from "../types.js";
import { Button } from "./Button.js";

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

    private _element: HTMLButtonElement;
	private _elementText: Text;
	private _elementIcon: IconButton | null = null;
	public get element() { return this._element; }
    public readonly active = new Observable(false);
	public readonly id = DockPanelHeader.registry.add(this);

	public readonly panel: DockPanel;

    constructor(panel: DockPanel)
    {
		this.panel = panel;
        this._elementText = document.createTextNode(this.panel.text.data);

		this.renderIcon();

		this._element = new Button(this.panel.text.data ?? "", () => {}).element;
		this._element.classList.add(ffClass.text, DockPanelHeader.tagName);
		this._element.style.setProperty('flex', '0 0 auto');
		this._element.style.setProperty('display', 'block');
		this._element.style.setProperty('user-select', 'none');
		this._element.style.setProperty('cursor', 'pointer');
		if (this._elementIcon) {
			this._element.appendChild(this._elementIcon.element);
		}
		if (this.panel.movable.data) {
			this._element.setAttribute("draggable", "true");
		}

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

		panel.header.set(this, true);

		this.renderMovableChanged = this.renderMovableChanged.bind(this);
		this.renderIcon = this.renderIcon.bind(this);
		this.renderTextChanged = this.renderTextChanged.bind(this);

        this.active.onChanged.Sub(this.renderActiveChanged.bind(this));
        this.panel.movable.onChanged.Sub(this.renderMovableChanged);
		this.panel.movable.onChanged.Sub(this.renderIcon)
		this.panel.closable.onChanged.Sub(this.renderIcon)
		this.panel.text.onChanged.Sub(this.renderTextChanged);

		this.active.set(true, true);
    }

	private renderIcon() {
		let newIcon: IconButton | null;

		if (this.panel.closable.data) {
            newIcon = new IconButton(defaultIcons.close.val, this.onClickButton.bind(this))
            newIcon.element.style.setProperty('display', 'inline');
        } else if (this.panel.movable.data) {
            newIcon = new IconButton(defaultIcons.grip.val)
        } else {
			newIcon = null;
		}

		if (newIcon) {
			this._elementIcon?.element.replaceWith(newIcon.element);
			this._elementIcon = newIcon;
		} else {
			this._elementIcon?.element.remove();
			this._elementIcon?.dispose();
		}
	}

	private renderActiveChanged() {
		this.panel.active.set(this.active.data, true);
		if (this.active.data) {
			this.panel.element.setAttribute("active", "true");
		} else {
			this.panel.element.removeAttribute("active");
		}
	}

	private renderMovableChanged() {
		if (this.panel.movable.data) {
			this._element.setAttribute("draggable", "true");
		}
		else {
			this._element.removeAttribute("draggable");
		}
	}

	private renderTextChanged() {
		this._elementText.replaceWith(document.createTextNode(this.panel.text.data));
	}

	public dispose() {
		DockPanelHeader.registry.remove(this.id);

		this.panel.movable.onChanged.Unsub(this.renderMovableChanged);
		this.panel.movable.onChanged.Unsub(this.renderIcon)
		this.panel.closable.onChanged.Unsub(this.renderIcon)
		this.panel.text.onChanged.Unsub(this.renderTextChanged);
		this._element.removeEventListener("click", this.onClick);
        this._element.removeEventListener("dragstart", this.onDragStart);
        this._element.removeEventListener("dragover", this.onDragOver);
        this._element.removeEventListener("dragleave", this.onDragLeave);
        this._element.removeEventListener("drop", this.onDrop);
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