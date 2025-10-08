/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

import { Observable } from "@synth-playground/common/Observable.js"
import type { Component } from "../types.js";
import { H } from "@synth-playground/browser/dom.js";
import { Registry } from "./Registry.js";

/** Horizontal splitters resize adjacent vertical elements, and vice versa. */
export enum SplitterDirection {
	horizontal,
	vertical
}

/** Splitter change events are used to update the screen while the user grabs and moves a splitter. */
export interface ISplitterChangeEvent extends CustomEvent
{
    target: HTMLDivElement;
    detail: {
        direction: SplitterDirection;
        position: number;
        isDragging: boolean;
    }
}

/** A splitter is a strip that resizes bounding spaces via click and drag user interaction. */
export class Splitter implements Component
{
    public static registry = new Registry<Splitter>();

	static readonly tagName = "ff-splitter";
    static readonly changeEvent = "ff-splitter-change";

	public readonly element: HTMLDivElement;
    public readonly direction = new Observable(SplitterDirection.horizontal);
    public readonly width = new Observable(5);
    public readonly margin = new Observable(20);
    public readonly detached = new Observable(false);
	public readonly id = Splitter.registry.add(this);

    private _isActive = false;
    private _offset = 0;
    private _position = 0;

	/** Splitters get event listeners added by dock strips, which need to be disposed properly. */
	private _dynamicListeners: { type: string, listener: (event: any) => void }[] = [];

    constructor() {
		this.element = H('div', {
			class: Splitter.tagName,
			style: `
				position: relative;
				display: block;
				z-index: 1;
				touch-action: none;
			`
		});

		this.direction.onChanged.Sub(() => this.renderHorizontalChanged);
		this.width.onChanged.Sub(() => this.renderWidthChanged);

        this.element.addEventListener("pointerdown", e => this.onPointerDown(e));
        this.element.addEventListener("pointermove", e => this.onPointerMove(e));
        this.element.addEventListener("pointerup", e => this.onPointerUpOrCancel(e));
        this.element.addEventListener("pointercancel", e => this.onPointerUpOrCancel(e));
    }

    public get position() {
        return this._position;
    }

    public get isHorizontal() {
        return this.direction.data === SplitterDirection.horizontal;
    }

	private renderHorizontalChanged() {
		this.element.style.setProperty('cursor', this.isHorizontal ? "col-resize" : "row-resize");
		this.renderWidthChanged();
	}

	private renderWidthChanged() {
		this.element.style.setProperty('padding', this.isHorizontal ? `0 ${this.width}px` : `${this.width}px 0`);
        this.element.style.setProperty('margin', this.isHorizontal ? `0 ${-this.width}px` : `${-this.width}px 0`);
	}

	/** Any event listeners registered on an element must be disposed. This manages disposing later. */
	public registerListener(type: string, listener: (event: any) => void) {
		this.element.addEventListener(type, listener);
		this._dynamicListeners.push({ type, listener });
	}

	public dispose() {
		Splitter.registry.remove(this.id);

		this.element.removeEventListener("pointerdown", e => this.onPointerDown(e));
        this.element.removeEventListener("pointermove", e => this.onPointerMove(e));
        this.element.removeEventListener("pointerup", e => this.onPointerUpOrCancel(e));
        this.element.removeEventListener("pointercancel", e => this.onPointerUpOrCancel(e));

		this._dynamicListeners.forEach(o =>
			this.element.removeEventListener(o.type, o.listener));
	}

    private onPointerDown(event: PointerEvent)
    {
        if (event.isPrimary) {
            event.stopPropagation();
            event.preventDefault();

            this._isActive = true;
            this.element.setPointerCapture(event.pointerId);

            const rect = this.element.getBoundingClientRect();
            this._offset = this.isHorizontal
                ? rect.left + rect.width * 0.5 - event.clientX
                : rect.top + rect.height * 0.5 - event.clientY;
        }
    }

    private onPointerMove(event: PointerEvent)
    {
        if (event.isPrimary && this._isActive) {
            event.stopPropagation();
            event.preventDefault();

            const parent = this.element.parentElement;
            if (!parent) {
                return;
            }

            const rect = parent.getBoundingClientRect();
            const isHorizontal = this.isHorizontal;
            const parentSize = isHorizontal ? rect.width : rect.height;

            let position = this._offset + (isHorizontal ? event.clientX - rect.left : event.clientY - rect.top);
            let relativePosition = position / parentSize;

            if (!this.detached.data) {
                const prevElement = this.element.previousElementSibling;
                const nextElement = this.element.nextElementSibling;

                if (prevElement instanceof HTMLElement && nextElement instanceof HTMLElement) {
                    const children = Array.from(parent.children);
                    let splitAreaStart = 0;
                    let splitAreaSize = parentSize;
                    let visited = false;

                    children.forEach(child => {
                        if (Splitter.registry.find(child)) {
                            return;
                        }
                        if (child === prevElement || child === nextElement) {
                            visited = true;
                            return;
                        }

                        const childRect = child.getBoundingClientRect();
                        const childSize = isHorizontal ? childRect.width : childRect.height;
                        splitAreaSize -= childSize;

                        if (!visited) {
                            splitAreaStart += childSize;
                        }
                    });

                    const minSize = this.margin.data;
                    const maxSize = splitAreaSize - minSize;

                    position = Math.min(Math.max(position - splitAreaStart, minSize), maxSize)

                    const nextSize = (splitAreaSize - position) / parentSize;
                    relativePosition = position / parentSize;

                    prevElement.style.flexBasis = (relativePosition * 100).toFixed(3) + "%";
                    nextElement.style.flexBasis = (nextSize * 100).toFixed(3) + "%";

                    // send global resize event so components can adjust to new size
                    setTimeout(() => window.dispatchEvent(new CustomEvent("resize")), 0);
                }
            }

            this._position = relativePosition;

            this.element.dispatchEvent(new CustomEvent(Splitter.changeEvent, {
                detail: {
                    direction: this.direction.data,
                    position: this._position,
                    isDragging: true
                }
            }) as ISplitterChangeEvent);
        }
    }

    private onPointerUpOrCancel(event: PointerEvent)
    {
        if (event.isPrimary) {
            event.preventDefault();

            this._isActive = false;

            if(this._position > 0) {
                event.stopPropagation();
                this.element.dispatchEvent(new CustomEvent(Splitter.changeEvent, {
                    detail: {
                        direction: this.direction.data,
                        position: this._position,
                        isDragging: false
                    }
                }) as ISplitterChangeEvent);
            }
        }
    }
}