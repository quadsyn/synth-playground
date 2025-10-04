import { H } from "@synth-playground/browser/dom.js";
import Connected from "./Connected.js";
import "./Icon";
import { Observable } from "@synth-playground/common/Observable.js";
import { ffClass } from "./FFShared.js";
import { Icon, defaultIcons } from "./Icon.js";

/**
 * Custom element displaying a button with a text and/or an icon.
 * The button emits an IButtonClickEvent if clicked.
 */
export class Button
{
    private connected: Connected<(HTMLElement)>;
    private firstDOMAdd = false;
    private icon: Icon | null = null;

    public properties = {
        /** Optional name to identify the button. */
        name: new Observable(""),

        /** Optional index to identify the button. */
        index: new Observable(0),
        selectedIndex: new Observable(-1),
        tabbingIndex: new Observable(0),

        /** If true, adds "ff-selected" class to element. */
        selected: new Observable(false),

        /** If true, toggles selected state every time the button is clicked. */
        selectable: new Observable(false),
        disabled: new Observable(false),

        /** Optional text to be displayed on the button. */
        text: new Observable(""),

        /** Optional name of the icon to be displayed on the button. */
        icon: new Observable<keyof typeof defaultIcons>('empty'),

        /** Optional role - defaults to 'button'. */
        role: new Observable("button"),

        /** If true, displays a downward facing triangle at the right side. */
        caret: new Observable(false),
        inline: new Observable(false),
        transparent: new Observable(false)
    }

    constructor(icon?: keyof typeof defaultIcons, text?: string)
    {
        if (icon) { this.properties.icon.set(icon, true); }
        if (text) { this.properties.text.set(text, true); }
        this.connected = new Connected(this.render.bind(this), this.properties);
        this.connected.onDOMAdd.Sub(this.onDOMAdd.bind(this));
        this.connected.onDOMRemove.Sub(this.onDOMRemove.bind(this));
        this.connected.SetDOMWatching(true);
    }

    public get element() {
        return this.connected.e;
    }

    private onDOMAdd() {
        if (!this.firstDOMAdd) {
            this.firstDOMAdd = true;

            this.connected.e.tabIndex = this.properties.tabbingIndex.get();
            this.connected.e?.setAttribute("role", this.properties.role.get());
            this.connected.e?.classList.add(ffClass.button);

            this.connected.e?.addEventListener("click", () => this.onClick.bind(this));
            this.connected.e?.addEventListener("keydown", (e) => this.onKeyDown.bind(this));
        }
    }

    private onDOMRemove() {
        debugger
        this.connected.e?.removeEventListener("click", () => this.onClick);
        this.connected.e?.removeEventListener("keydown", (e) => this.onKeyDown);
    }

    public render(changedProperty?: { name: string, oldValue: any })
    {
        if (changedProperty) {
            switch (changedProperty.name as keyof typeof this.properties) {
                case 'selectedIndex':
                case 'index':
                    if (this.properties.selectedIndex.get() >= 0) {
                        this.properties.selected.set(this.properties.index.get() === this.properties.selectedIndex.get(), true);
                    }
                    break;
                case 'disabled':
                    if (this.properties.disabled) {
                        this.connected.e.classList.add(ffClass.disabled)    
                    } else {
                        this.connected.e.classList.remove(ffClass.disabled)
                    }
            }
        }

        // Mutate for speed
        else if (this.connected.existsInDOM()) {
            this.connected.e.classList.remove(ffClass.inline, ffClass.transparent, ffClass.control);

            if (this.properties.icon.get() !== this.icon?.properties.name.get()) {
                this.icon?.properties.name.set(this.properties.icon.get(), true)
            }

            if (this.properties.inline.get()) {
                this.connected.e.classList.add(ffClass.inline);
            }
            else if (this.properties.transparent.get()) {
                this.connected.e.classList.add(ffClass.transparent);
            }
            else {
                this.connected.e.classList.add(ffClass.control);
            }

            return this.connected.e;
        }

        // Initial render
        const inner: (HTMLElement | SVGElement)[] = [];
        if (this.properties.icon.get()) {
            inner.push(this.renderIcon())
        }
        if (this.properties.text.get()) {
            inner.push(H("div", { class: `${ffClass.text} ${ffClass.off}` }, this.properties.text.get()));
        }
        if (this.properties.caret.get()) {
            inner.push(H("div", { class: `${ffClass.caretDown} ${ffClass.off}` }));
        }

        const result = H("div", {
            tabIndex: this.properties.tabbingIndex.get().toString(),
            role: this.properties.role.get(),
            class: `${ffClass.button}`
        },
            ...inner
        );

        result.addEventListener("click", () => this.onClick.bind(this));
        result.addEventListener("keydown", (e) => this.onKeyDown.bind(this));
        return result;
    }

    private renderIcon() {
        this.icon ??= new Icon(this.properties.icon.get());
        this.icon.element.classList.add(ffClass.off);
        this.icon.properties.name.set(this.properties.icon.get(), true);
        return this.icon.element;
    }

    public onClick()
    {
        if (this.properties.selectable.get()) {
            this.properties.selected.set(!this.properties.selected, true);
        }
    }

    public onKeyDown(event: KeyboardEvent)
    {
        if (this.connected.element === document.activeElement
                && (event.code === "Space" || event.code === "Enter")) {
            event.preventDefault();
            this.connected.e.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
    }
}
