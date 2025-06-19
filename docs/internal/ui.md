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

There is a TypeScript `interface` that components can implement, though that is
just a formality (as of this writing, I have not used the interface in a generic
way at runtime, i.e. polymorphism).

If you need to do something only when a component is mounted, you can keep track
of how many times `render` has been called. The first call should mean the
component was mounted. Something like this:

```javascript
class Button {
    constructor() { this._mounted = false; }
    onDidMount() { this._mounted = true; }
    render() { if (!this._mounted) this.onDidMount(); }
}
```

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
