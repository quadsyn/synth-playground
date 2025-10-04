import { Event } from "./Event.js";
import { Lazy } from "@synth-playground/common/Lazy.js";
import { Observable } from "@synth-playground/common/Observable.js";

type TElement<T> = T | null
type TRenderedElement<T> = T | T[]
type TElOrArray<T> = TElement<T> | TElement<T>[]
type TChangedProperty<T> = { name: string, oldValue: T }

/**
 * Element(s) with DOM detection and updating, and observables that trigger updates to form the C in MVC.
 * 
 * This is written for composition, not subclassing. You provide render and properties in the constructor, and a DOM
 * update function will automatically fire for any property that changes to re-render if already in DOM. You must add
 * all element(s) to the DOM yourself with document.appendChild; try doing this at the end of render callback when
 * existsInDOM is false.
 * 
 * Return an array of elements from render to avoid wrapping top-level siblings in an empty div.  
 * Parent elements from render to different places in DOM and they will still update.  
 * Avoid lifecycle method calls (onDOMAdd and onDOMRemove) with setDOMWatching.  
 * Avoid automatic DOM updates with suspendPropertyRenders or returning false from render.  
 * Avoid consecutive DOM updates by wrapping suspendPropertyRenders=true and false around.  
 * Change the render method and properties at any time.
 */
export default class Connected<T extends Element>
{
    private _renderedElement!: TRenderedElement<T> | null;
    private _reactiveProperties: { [key: string]: Observable<any> };
    private _mutationObserver: Lazy<MutationObserver>;
    private _inRenderMethod: boolean; // track to avoid render loops

    /** The component can be constructed early, or will be lazy-rendered when needed. */
    private _renderMethod!: (changedProperty?: TChangedProperty<any>) => TRenderedElement<T> | false;

    /** When true, skips DOM updates that properties would trigger. Use for manual batching. */
    public suspendPropertyRenders: boolean;

    private _connectDOMWatcher: boolean; // track to defer until rendered and auto-apply dom watcher.
    private _onDOMAdd: Event<() => void>;
    private _onDOMRemove: Event<() => void>;

    /**
     * Creates a connectable component. To monitor when it loads, call .setWatchDOM(true) after.
     * @param render Used to generate or recreate the element via property changes. Return false to cancel.
     * @param properties If any of these change, render is called and if currently in DOM, it refreshes.
     * @param skipDOMWatching If true, will not watch the DOM or fire onDOMAdd, onDOMRemove.
    */
    constructor(render: (changedProperty?: TChangedProperty<any>) => TRenderedElement<T> | false, properties?: { [key: string]: Observable<any>}, skipDOMWatching?: boolean) {
        this._reactiveProperties = properties ?? {};
        this.render = render;
        this.suspendPropertyRenders = false;
        this._inRenderMethod = false;
        this._connectDOMWatcher = skipDOMWatching === true;
        this._onDOMAdd = new Event();
        this._onDOMRemove = new Event();
        this._mutationObserver = new Lazy(() => new MutationObserver((changes) => {
            for (let i = 0; i < changes.length; i++) {
                for (let j = 0; j < changes[i].addedNodes.length; j++) {
                    if ((Array.isArray(this._renderedElement) && this._renderedElement.length > 0 && changes[i].addedNodes[j] === this._renderedElement[0])
                    || (!Array.isArray(this._renderedElement) && changes[i].addedNodes[j] === this._renderedElement)) {
                        this._onDOMAdd?.Invoke();
                        return;
                    }
                }
                for (let j = 0; j < changes[i].removedNodes.length; j++) {
                    if ((Array.isArray(this._renderedElement) && this._renderedElement.length > 0 && changes[i].removedNodes[j] === this._renderedElement[0])
                    || (!Array.isArray(this._renderedElement) && changes[i].removedNodes[j] === this._renderedElement)) {
                        this._onDOMRemove?.Invoke();
                        return;
                    }
                }
            }
        }));
    }

    /**
     * Returns the actual element or array, which may or may not be in the DOM tree. Calls render to generate it if undefined.
     * If this is invoked in the render method before the element exists, it returns an empty array. Shorthands: see e and eArr.
     */
    public get element(): TRenderedElement<T> {
        return this._inRenderMethod
            ? this._renderedElement ?? []
            : this._renderedElement ?? this._renderMethod() as TRenderedElement<T>;
    }

    /** Shorthand for element as array (asserts type T[] for ease of use). Use if render always returns an array. */
    public get eArr(): T[] {
        return this.element as T[];
    }

    /** Shorthand for element as single value (asserts type T for ease of use). Use if render always returns an element, no array. */
    public get e(): T {
        return this.element as T;
    }

    /** Returns parent element(s) if rendered and in DOM, or returns an empty array. Unset parents are null. Shorthands: see p and pArr. */
    public get parent(): TElOrArray<Element> {
        if (Array.isArray(this._renderedElement)) {
            return this._renderedElement.map(o => o.parentElement);
        }
        return this._renderedElement?.parentElement ?? null;
    }

    /** Shorthand for parent as array (asserts type T[] for ease of use). Use if render always returns an array. */
    public get pArr(): (TElement<T> | null)[] {
        return this.parent as (TElement<T> | null)[];
    }

    /** Shorthand for parent as single value (asserts type T for ease of use). Use if render always returns an element, no array. */
    public get p(): TElement<T> | null {
        return this.parent as TElement<T> | null;
    }

    /**
     * Returns whether the element exists, or false for empty arrays. This only checks if it's been rendered.
     * Use @see existsInDOM to see if it exists AND is active in the DOM.
     */
    public exists(): boolean {
        if (Array.isArray(this._renderedElement) && this._renderedElement.length === 0) { return false; }
        return this._renderedElement === undefined;
    }

    /** Returns whether the element or every element in the array is in the document DOM. Returns false for empty arrays. */
    public existsInDOM(): boolean {
        return Array.isArray(this._renderedElement)
            ? this._renderedElement.length > 0 && this._renderedElement.every(el => document.contains(el))
            : document.contains(this._renderedElement)
    }

    /** Fired when the component is detected as being loaded into the DOM. Use a bool if you want to track first load. */
    public get onDOMAdd() {
        return this._onDOMAdd;
    }

    /** Fired when the component is detected as being removed from the DOM. Use this for event listener cleanup. */
    public get onDOMRemove() {
        return this._onDOMRemove;
    }

    /**
     * This will (re)create the element when called. Render is for generating the HTML; it does not get appended to DOM
     * yet. Add/remove your event listeners with the onDOM* events instead.
     * 
     * To avoid recursive renders, the render method will not lazy-render elements or process any DOMUpdate calls,
     * including re-render via property changes.
     */
    public get render() {
        return () => this._renderMethod();
    }

    /** Changes the render method (will not be ref-equals after set). */
    public set render(func: () => TRenderedElement<T> | false) {
        this._renderMethod = () => {
            this._inRenderMethod = true;
            const result = func();
            this._inRenderMethod = false;
            if (this._connectDOMWatcher) {
                this.SetDOMWatching(true);
            }
            return result;
        };
    }

    /** Use to suspend or resume the mutation observer, which is how we know if the element's DOM root changes. This doesn't affect updates, see suspendPropertyRenders for that. */
    public SetDOMWatching(watch: boolean) {
        // Always disconnect to avoid copied connections.
        this._mutationObserver.val.disconnect();

        if (watch) {
            if (!this._renderedElement) {
                this._connectDOMWatcher = true;
            }
            else if (Array.isArray(this._renderedElement)) {
                for (const item of this._renderedElement) {
                    this._mutationObserver.val.observe(item, { childList: true, subtree: true });
                }
            } else {
                this._mutationObserver.val.observe(this._renderedElement, { childList: true, subtree: true });
            }
        }
    }

    /** A copied list of all properties. */
    public get properties() {
        return { ...this._reactiveProperties };
    }

    /** Adds or updates reactive properties. */
    public propertiesAdd(properties: { [key: string]: Observable<any> }) {
        const keys = Object.keys(properties);
        for (let key of keys) {
            this._reactiveProperties[key] = properties[key];
            this._reactiveProperties[key].onAfterChanged.Sub(
                (old) => this._DOMUpdate({ name: key, oldValue: old }));
        }
    }

    /** Removes the reactive properties that exist. */
    public propertiesRemove(properties: { [key: string]: Observable<any> }) {
        const keys = Object.keys(properties);
        for (let key of keys) {
            this._reactiveProperties[key].onAfterChanged.Unsub(
                (old) => this._DOMUpdate({ name: key, oldValue: old }));
            delete this._reactiveProperties[key];
        }
    }

    private _DOMUpdate(changedProperty: TChangedProperty<any>) {
        if (!this.suspendPropertyRenders) { this.DOMUpdate(changedProperty); }
    }

    /** This is how reactive properties update in the DOM. Set suspendPropertyRenders and call manually to control updates. Non-manual updates always have a changed property set. */
    public DOMUpdate(changedProperty?: TChangedProperty<any>) {
        if (this._inRenderMethod || !this.element) {
            return;
        }

        const replaceInDOM = (el: T) => {
            if (document.contains(el) && el.parentElement !== null) {
                const newElements = this._renderMethod(changedProperty);
                if (newElements) {
                    if (Array.isArray(newElements)) {
                        for (const element of newElements) {
                            element.parentElement?.replaceChild(el, element)
                        }
                    } else {
                        newElements.parentElement?.replaceChild(el, newElements);
                    }
                }
            }
        }

        if (Array.isArray(this.element)) {
            for (let i = 0; i < this.element.length; i++) {
                replaceInDOM(this.element[i]);   
            }
        } else {
            replaceInDOM(this.element);
        }
    }
}