import { Event } from "../../common/src/Event.js";

type HTMLOrSVG = HTMLElement | SVGElement
type ElementOrArray = HTMLOrSVG | HTMLOrSVG[]
interface IEntry { action: DOMActionType, elements: ElementOrArray }
interface IEntryWithNodes extends IEntry { nodes: (string | Node)[] }
interface IEntryWithNode extends IEntry { node: Node }
interface IEntryAddEventListener extends IEntry { type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions }
type insertPosition = 'afterbegin' | 'afterend' | 'beforebegin' | 'beforeend'
interface IEntryInsertAdjacent extends IEntry { action: DOMActionType.InsertAdjacent, where: insertPosition, element: Element }
interface IEntryInsertBefore extends IEntry { action: DOMActionType.InsertBefore, node: Node, child: Node | null }
interface IEntryRemoveAttributes extends IEntry { action: DOMActionType.RemoveAttribute, name: string }
interface IEntryRemoveEventListener extends IEntry { action: DOMActionType.RemoveEventListener, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions }
interface IEntrySetAttributes extends IEntry { action: DOMActionType.SetAttribute, name: string, value: string }
interface IEntryToggleAttributes extends IEntry { action: DOMActionType.ToggleAttribute, name: string, force?: boolean }
interface IEntryWithAttribute extends IEntry { attribute: Attr }
interface IEntryRemove extends IEntry { action: DOMActionType.Remove }
interface IEntryReplaceChild extends IEntry { action: DOMActionType.ReplaceChild, node: Node, child: Node }
interface IEntryReplaceChildren extends IEntryWithNodes { action: DOMActionType.ReplaceChildren }
interface IEntryReplaceWith extends IEntryWithNodes { action: DOMActionType.ReplaceWith }
interface IEntrySetStyle extends IEntry { action: DOMActionType.SetStyle, key: keyof CSSStyleDeclaration, value: string }

type Entry = IEntrySetAttributes | IEntryToggleAttributes | IEntryRemoveAttributes | IEntryAddEventListener | IEntryRemoveEventListener
    | IEntryWithNodes | IEntryWithNode | IEntryInsertBefore | IEntryInsertAdjacent | IEntryWithAttribute
    | IEntryRemove | IEntryReplaceChild | IEntryReplaceChildren | IEntryReplaceWith | IEntrySetStyle

export enum DOMActionType {
    AddEventListener,
    After,
    Append,
    AppendChild,
    Before,
    InsertAdjacent,
    InsertBefore,
    Prepend,
    RemoveAttribute,
    RemoveEventListener,
    RemoveAttributeNode,
    RemoveChild,
    Remove,
    ReplaceChild,
    ReplaceChildren,
    ReplaceWith,
    SetAttributeNode,
    SetAttribute,
    ToggleAttribute,

    // These ones are not part of regular methods of an Element.
    SetStyle
}

/**
 * Queues updates to the DOM, flushing them synchronously at once every 10ms (default), with controls to adjust.
*/
export class DOMBatcher
{
    private _msFlushDelay = 10;
    private _timerID: number | undefined;
    private _batchHalted = false;
    private _queue: Entry[] = [];

    /** Fires when the batcher would update, just before it does. */
    public onBeforeUpdated = new Event<() => void>();

    /** Fires when the batcher has finished updates to the DOM. */
    public onAfterUpdated = new Event<() => void>();

    public constructor(doNotStartImmediately?: true) {
        if (!doNotStartImmediately) {
            this.setBatchDelay();
        }
    }

    public addEventListener(elements: ElementOrArray, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
        if (options) {
            this._queue.push({ action: DOMActionType.AddEventListener, elements, type, listener, options });
        } else {
            this._queue.push({ action: DOMActionType.AddEventListener, elements, type, listener });
        }
    }
    public after(elements: ElementOrArray, ...nodes: (string | Node)[]) {
        this._queue.push({ action: DOMActionType.After, elements, nodes });
    }
    public append(elements: ElementOrArray, ...nodes: (string | Node)[]) {
        this._queue.push({ action: DOMActionType.Append, elements, nodes });
    }
    public appendChild(elements: ElementOrArray, node: Node) {
        this._queue.push({ action: DOMActionType.AppendChild, elements, node });
    }
    public before(elements: ElementOrArray, ...nodes: (string | Node)[]) {
        this._queue.push({ action: DOMActionType.Before, elements, nodes });
    }
    public insertAdjacent(elements: ElementOrArray, where: insertPosition, element: Element) {
        this._queue.push({ action: DOMActionType.InsertAdjacent, elements, where, element });
    }
    public insertBefore(elements: ElementOrArray, node: Node, child: Node | null) {
        this._queue.push({ action: DOMActionType.InsertBefore, elements, node, child });
    }
    public prepend(elements: ElementOrArray, ...nodes: (string | Node)[]) {
        this._queue.push({ action: DOMActionType.Prepend, elements, nodes });
    }
    public removeAttribute(elements: ElementOrArray, name: string) {
        this._queue.push({ action: DOMActionType.RemoveAttribute, elements, name });
    }
    public removeEventListener(elements: ElementOrArray, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) {
        if (options) {
            this._queue.push({ action: DOMActionType.RemoveEventListener, elements, type, listener, options });
        } else {
            this._queue.push({ action: DOMActionType.RemoveEventListener, elements, type, listener });
        }
    }
    public removeAttributeNode(elements: ElementOrArray, attribute: Attr) {
        this._queue.push({ action: DOMActionType.RemoveAttributeNode, elements, attribute });
    }
    public removeChild(elements: ElementOrArray, node: Node) {
        this._queue.push({ action: DOMActionType.RemoveChild, elements, node });
    }
    public remove(elements: ElementOrArray) {
        this._queue.push({ action: DOMActionType.Remove, elements });
    }
    public replaceChild(elements: ElementOrArray, node: Node, child: Node) {
        this._queue.push({ action: DOMActionType.ReplaceChild, elements, node, child });
    }
    public replaceChildren(elements: ElementOrArray, ...nodes: (string | Node)[]) {
        this._queue.push({ action: DOMActionType.ReplaceChildren, elements, nodes });
    }
    public replaceWith(elements: ElementOrArray, ...nodes: (string | Node)[]) {
        this._queue.push({ action: DOMActionType.ReplaceWith, elements, nodes });
    }
    public setAttributeNode(elements: ElementOrArray, attribute: Attr) {
        this._queue.push({ action: DOMActionType.SetAttributeNode, elements, attribute });
    }
    public setAttribute(elements: ElementOrArray, name: string, value: string) {
        this._queue.push({ action: DOMActionType.SetAttribute, elements, name, value });
    }
    public toggleAttribute(elements: ElementOrArray, name: string, force?: boolean) {
        if (force) {
            this._queue.push({ action: DOMActionType.ToggleAttribute, elements, name, force });
        } else {
            this._queue.push({ action: DOMActionType.ToggleAttribute, elements, name });
        }
    }
    public setStyle(element: HTMLOrSVG, key: keyof CSSStyleDeclaration, value: string) {
        this._queue.push({ action: DOMActionType.SetStyle, elements: element, key, value })
    }

    /** Returns whether batching is paused. */
    public get paused() {
        return this._batchHalted;
    }

    /** Pauses or resumes batching. (Elapsed time is not accounted.) */
    public set paused(pause: boolean) {
        if (this._batchHalted && !pause) {
            this.setBatchDelay();
        }

        this._batchHalted = pause;

        if (this._timerID && this._batchHalted) {
            clearTimeout(this._timerID);
        }
    }

    /** Restarts the current batch countdown under the same or a new timing. (Elapsed time will not roll over.) */
    public setBatchDelay(msDelay?: number) {
        if (this._timerID) {
            clearTimeout(this._timerID);
        }

        this.batch();
        this._timerID = setTimeout(this.setBatchDelay, msDelay ?? this._msFlushDelay);
    }

    /** Performs all queued actions on the DOM at once. */
    public batch() {
        this.onBeforeUpdated.Invoke();

        for (let i = 0; i < this._queue.length; i++) {
            const item = this._queue[i];
            if (Array.isArray(item.elements)) {
                for (let j = 0; j < item.elements.length; j++) {
                    perElement(item, item.elements[j]);
                }
            } else {
                perElement(item, item.elements);
            }
        }

        function perElement(entry: Entry, element: HTMLOrSVG) {
            switch (entry.action) {
                case DOMActionType.SetAttribute:
                    element.setAttribute((entry as IEntrySetAttributes).name, (entry as IEntrySetAttributes).value);
                    break;
                case DOMActionType.ToggleAttribute:
                    element.toggleAttribute((entry as IEntryToggleAttributes).name, (entry as IEntryToggleAttributes).force);
                    break;
                case DOMActionType.RemoveAttribute:
                    element.removeAttribute((entry as IEntryRemoveAttributes).name);
                    break;
                case DOMActionType.AddEventListener:
                    element.addEventListener((entry as IEntryAddEventListener).type, (entry as IEntryAddEventListener).listener, (entry as IEntryAddEventListener).options )
                    break;
                case DOMActionType.RemoveEventListener:
                    element.removeEventListener((entry as IEntryRemoveEventListener).type, (entry as IEntryRemoveEventListener).listener, (entry as IEntryRemoveEventListener).options )
                    break;
                case DOMActionType.After:
                    element.after(...(entry as IEntryWithNodes).nodes);
                    break;
                case DOMActionType.Before:
                    element.before(...(entry as IEntryWithNodes).nodes);
                    break;
                case DOMActionType.Prepend:
                    element.prepend(...(entry as IEntryWithNodes).nodes);
                    break;
                case DOMActionType.Append:
                    element.append(...(entry as IEntryWithNodes).nodes);
                    break;
                case DOMActionType.AppendChild:
                    element.appendChild((entry as IEntryWithNode).node);
                    break;
                case DOMActionType.InsertAdjacent:
                    element.insertAdjacentElement((entry as IEntryInsertAdjacent).where, (entry as IEntryInsertAdjacent).element);
                    break;
                case DOMActionType.InsertBefore:
                    element.insertBefore((entry as IEntryInsertBefore).node, (entry as IEntryInsertBefore).child);
                    break;
                case DOMActionType.Remove:
                    element.remove();
                    break;
                case DOMActionType.RemoveAttributeNode:
                    element.removeAttributeNode((entry as IEntryWithAttribute).attribute)
                    break;
                case DOMActionType.RemoveChild:
                    element.removeChild((entry as IEntryWithNode).node)
                    break;
                case DOMActionType.ReplaceChild:
                    element.replaceChild((entry as IEntryReplaceChild).node, ((entry as IEntryReplaceChild).child))
                    break;
                case DOMActionType.ReplaceChildren:
                    element.replaceChildren(...(entry as IEntryWithNodes).nodes)
                    break;
                case DOMActionType.ReplaceWith:
                    element.replaceWith(...(entry as IEntryWithNodes).nodes)
                    break;
                case DOMActionType.SetAttributeNode:
                    element.setAttributeNode((entry as IEntryWithAttribute).attribute)
                    break;
                case DOMActionType.SetStyle:
                    element.style.setProperty((entry as IEntrySetStyle).key as string, (entry as IEntrySetStyle).value);
                    break;
                default:
                    entry satisfies never;
            }
        }

        this.onAfterUpdated.Invoke();
    }

    /** Performs style updates on a copy of style. */
    public batchStyles(element: HTMLOrSVG, property: string, ...values: (CSSStyleValue | string)[]) {
        element.attributeStyleMap.set(property, values);
        element.style.accentColor
    }
}

// TODO: dependency virtuals --> virtual nodes that resolve when available
// .style, .textContent, .shadowRoot
// TODO: Consider structuring DockView components to use a shadow DOM