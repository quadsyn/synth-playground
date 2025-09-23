# How the UI works

The first thing done is to wrap `document.createElement` in a more concise API,
which looks a bit like React's `createElement`:

```javascript
function H(elementType, attributes, ...children) {
    const element = document.createElement(elementType);
    for (const key in attributes) element.setAttribute(key, attributes[key]);
    for (const child of children) element.appendChild(
        typeof child === "string" ? document.createTextNode(child) : child
    );
    return element;
}
```

It's actually so similar that you could hook this up with TypeScript's JSX
support, but I haven't bothered because it doesn't save on much.

There's a similar function for SVG elements if you want that. Why a separate
function? Because some element names are ambiguous and exist in both contexts.
People try to disambiguate in various ways, but it's simpler to separate those
out.

After that, we could write programs like this:

```javascript
// State of our program (or component).
let value = 0;

// Create DOM nodes we'll need. We always have at least one, which is usually
// called `element`.
const decrement = H("button", { type: "button" }, "-");
const increment = H("button", { type: "button" }, "+");
const display = H("div", {});
const element = H("div", {}, decrement, increment, display);

// Register event listeners if we need any. Those should make a state change,
// then synchronize the DOM with the state.
decrement.addEventListener("click", () => { value--; render(); });
increment.addEventListener("click", () => { value++; render(); });

// Add our container DOM node somewhere so we can see it.
document.body.appendChild(element);

// Function that synchronizes the DOM with the state. To keep things easier to
// control, we should try to do all DOM manipulations only in this function.
// That way, whenever a state change happens, we know that we're always coming
// back here afterwards.
function render() {
    display.textContent = value;
}

// Synchronize the DOM with the state once to start with.
render();
```

This will work, but it will be inefficient, as we always change something in a
DOM node ("DOM write"), even if the state didn't change since the last call to
`render` (though in this counter example, the state will always change before a
`render` call, of course).

We can address that by doing "memoization" manually: in addition to some value,
we store the value that was rendered, and compare against that before doing a
DOM write. If the two are the same, we don't need to do anything. If they are
different, we of course need to store that new value for next time. Something
like the following:

```javascript
let value = 0;
let renderedValue = undefined;
// ...
function render() {
    if (value !== renderedValue) {
        display.textContent = value;
        renderedValue = value;
    }
}
```

This kind of thing is similar to what's called the
["Update DOM Pattern" in the WinJS project](https://github.com/winjs/winjs/wiki/Update-DOM-Pattern),
and of course BeepBox.

Now, this only works if a simple equality check is sufficient. It will work fine
for DOM node attributes. In more complicated cases, you could use a "dirty flag":

```javascript
let value = { a: 1, b: 2 };
let dirty = true; // To ensure we render the first time.
// ...
function onClick() {
    value.a = Math.random();
    value.b = Math.random();
    dirty = true;
}
// ...
function render() {
    if (dirty) {
        display.textContent = `${value.a}, ${value.b}`;
        dirty = false;
    }
}
```

or a version counter:

```javascript
// ...
let version = 0;
let renderedVersion = undefined;
// ...
function onClick() {
    // ...
    version = (version + 1) >>> 0; // Keep this as an unsigned 32-bit integer.
}
// ...
function render() {
    if (version !== renderedVersion) {
        // ...
        renderedVersion = version;
    }
}
```

The benefit of the version counter approach is that you can share one data
source with multiple readers, each with their own cached version number. The
readers don't need to clear the equivalent of the dirty flag in this case, which
makes it easier to run them in any order.

If your state is immutable, these equality checks will work even for composite
data structures (e.g. objects), but that's pointer equality, not value equality.
If you always forge new pointers for value changes, then this doesn't matter
(and this is, as far as I know, best practice if you use immutable state), but
this is JavaScript, so you always have to pay attention to this. Generally, the
state here is mutable (similarly to BeepBox), so the above value comparisons are
what you'll often see instead.

Keep in mind that if some external update to the DOM node happens, we can't tell
if that happened, and we will erroneously skip updates. Why not just compare
against the actual DOM value? Generally, those can be a bit more expensive to
read as well (plus some values cause reflows if queried after a DOM write), so
it's better to not do that. This should not really happen unless you're using
something like a browser extension that messes with the DOM, so it should be
okay. Besides, any state update after that will result in a DOM write, unless
the reference to the DOM node has been lost (at which point you have other
problems anyway).

One might say this is all very tedious, enough that it's not worth doing. That
may be true. It shouldn't be terribly difficult to replace this with a more
generic JS UI library. The main obstacle is mutable state (most such libraries
assume state is immutable, and their main way of integrating external mutable
state involves taking immutable snapshots). Note, though, that these libraries
often make the render process quite a bit more expensive, often due to the more
ergonomic API, which typically will (or appears to) fuse creation and updates,
and makes use of object allocation everywhere. This slowness can be a problem
if one wants to "animate" by re-rendering: typically, whenever this is slow,
there will be mechanisms to do animations by bypassing the DOM<->state sync.

## Components

Usually, when building up some UI, we'll end up with some distinct "widgets"
that are useful in many places. It's a good idea to reuse the code for those if
it's not awkward. We bundle those up as "components".

Components here are classes. Besides a constructor, the required parts are:

- At least one DOM element, exposed as a field called `element`. Parents will
  insert this element somewhere to make the child component visible.
- A `dispose` method, which is almost an inverse of the constructor. If you
  register things like event listeners in the constructor, this is where they
  should be removed. Parent components call these manually as necessary.
- A `render` method, which synchronizes the DOM with the state of the component
  (or program). Ideally, this should be the only place where DOM manipulation
  happens.

There is a TypeScript `interface` that components should implement.

The singular `element` field means that we can't support components that have
multiple "top-level" DOM nodes (relative to the component), aka fragments. This
is a limitation of this style, but I haven't really needed it anywhere so far.
YMMV.

Another reason to introduce components is to cut down on some of the manual
"memoization" stuff: once you have a component that does that memoization
internally, you can (in basic cases) forget about that in the parent component.

### Mounting

You can keep track of how many times `render` has been called. The first call
should mean the component was mounted. Something like this:

```javascript
class Button {
    constructor() { this._mounted = false; }
    onDidMount() { this._mounted = true; }
    render() { if (!this._mounted) this.onDidMount(); }
}
```

The closest equivalent for unmounting is `dispose`.

### Props

If you need something akin to React's "props", you can follow this pattern:

```javascript
class Button {
    constructor() {
        this._disabled = false;
        this._renderedDisabled = undefined;
    }
    setDisabled(value) {
        this._disabled = value;
        // Don't render (or schedule that) here.
    }
    render() {
        if (this._disabled !== this._renderedDisabled) {
            this.element.disabled = this._disabled;
            this._renderedDisabled = this._disabled;
        }
    }
}
// ...
let button = new Button();
let disableButton = true;
// ...
function render() {
    // ...
    button.setDisabled(disableButton);
    button.render();
}
```

The setter is not actually necessary (and maybe it's just an annoying Java-ism),
but you may want to e.g. set some internal state as dirty there too.

# Counter example

```javascript
class Button {
    constructor(label, onClick) {
        this._onClick = onClick;
        this._disabled = false;
        this._renderedDisabled = undefined;
        this.element = H("button", { type: "button" }, label);
        this.element.addEventListener("click", this._handleClick);
    }
    dispose() { this.element.removeEventListener("click", this._handleClick); }
    setDisabled(value) { this._disabled = value; }
    render() { if (this._disabled !== this._renderedDisabled) this._renderedDisabled = this.element.disabled = this._disabled; }
    _handleClick = (event) => { this._onClick(); };
}
class Counter {
    constructor() {
        this._value = 0;
        this._renderedValue = null;
        this._decrement = new Button("-", () => { this._value--; this.render(); });
        this._increment = new Button("+", () => { this._value++; this.render(); });
        this._display = H("div", {});
        this.element = H("div", {}, this._decrement.element, this._increment.element, this._display);
    }
    dispose() { this._increment.dispose(); this._decrement.dispose(); }
    render() {
        if (this._value !== this._renderedValue) this._renderedValue = this._display.textContent = this._value;
        this._increment.setDisabled(this._value >= 10); this._increment.render();
        this._decrement.setDisabled(this._value <= 0); this._decrement.render();
    }
}
const counter = new Counter();
document.body.appendChild(counter.element);
counter.render();
```

# TODO

- Mention `UIContext` and the scheduled rendering stuff here.
- Also talk about these things, once they exist:
  - Helper functions for list reconciliation
  - System for animating things when the song is playing
  - A consistent way to use Dockview (and potentially something else for mobile)
  - Patterns for canvas-backed components
  - Patterns for avoiding reflows
  - Patterns for dealing with external state properly
