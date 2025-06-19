# Meta

- [ ] New package guide. Right now I'm just relying on copy paste.
  - Maybe make a script for it?
    - Needs an option to generate different types of packages:
      - cross-platform: doesn't use browser APIs, just JS ones. Probably needs
        a better name.
      - browser: boils down to adding `"dom"` to `"lib"` in `tsconfig.json`,
        meant for the UI thread
      - worker
      - audio worklet
  - Minimum amount of files consists of:
    - `package.json`
    - `tsconfig.json`
    - `src/index.ts`
  - `npm install` needs to be executed after creating the package.
- For "cross-platform" packages (see above), `console.log` will show what looks
  like a compile error, but if imported (and thus bundled) for the UI thread,
  no errors will show up. I don't know what (if anything) needs to be done
  about this, but I think it's best to note it down anyway, in case of
  confusion while debugging.
- `scripts/build.js`
  - [ ] Use fs instead of esbuild for copying public files
  - [ ] Is there something faster than `npx tsc` that's cross-platform?
  - [ ] Web server?
  - [ ] Watch mode?
  - [ ] Actual command-line option parser
  - [ ] Option to build without inlining the audio worklet.
  - Maybe use import attributes for the inline worker plugin instead?
- How to best avoid including the Synthesizer code twice?
- [ ] Development-only asserts?

# Audio

## Audio graph

- [ ] Latency compensation
  - I want e.g. FFT-backed effects! Without this, they won't work properly.
  - <https://gareus.org/misc/thesis-p8/2017-12-Gareus-Lat.pdf>
  - <https://docs.reasonstudios.com/reason12/delay-compensation>
  - [ ] Automation and "MIDI" have to participate too
    - I may just leave this for each effect to deal with for now.
    - Note that if you have one latent effect then another, the second one
      has to receive automation delayed by however much latency the first
      effect adds.
  - [ ] Propagate latencies through graph
    - I think that this should be done as follows:
      - Toposort
      - Latencies in sequence add up
        (incoming.length = 1)
      - Latencies at junction points are the maximum of the incoming latencies
        (incoming.length > 1)
  - REAPER rounds up latencies so that they match the block size.
    Is that necessary? I can't think of any reason for it, which is not good
    for my case, since there is probably a good reason for that.
- [ ] Process nodes in mono whenever possible

# UI

- [ ] After disposing a component, callbacks related to it may still run. Have
      to add a field to indicate that the component has been disposed of, to
      return early in those cases. Probably should solve this by introducing a
      "disposable" superclass? Maybe even a component superclass?
- [ ] Make the event listener names consistent: I'm using both `on*` and
      `handle*` randomly. The idea should be to use `handle*` for everything,
      and `on*` for callbacks given in the constructor of a component.
- [ ] Order class fields for components consistently.

## DOM

- [ ] Helper functions for reconciliation (keyed, non-keyed, etc)?
  - <https://github.com/Freak613/stage0>
    - Doesn't have unmounting, but that doesn't sound difficult to add.
  - <https://github.com/localvoid/ivi>
  - <https://github.com/WebReflection/udomdiff>
- Add a reusable event handler to discard events like `"dragstart"`?

## CSS

- [ ] Move all the inline CSS to an external file for better minification.
- [ ] See if inlining all the CSS inside the entry point .html is better for
      load times.
- [ ] Formalize the concept of "critical CSS" that's always inlined (right
      now I just have the background color and text color set on `<body>`)
- [ ] Use CSS modules to minify class names in stylesheets.
- [ ] Check if some kind of "normalization"/"reset" is necessary.

## WebGL

- [ ] Virtualize contexts
  - Overlapping viewports (which can e.g. come from the dockable UI) make
    this really annoying to solve. When panels don't overlap, it's enough to
    use one screen-sized backbuffer and use scissor tests to trim the
    rendering to a specific rectangle. When panels overlap, my first idea is to
    make every panel have a canvas, and perform a copy.
  - <https://stackoverflow.com/questions/59140439/allowing-more-webgl-contexts>
  - <https://github.com/greggman/virtual-webgl>
  - <https://bugzilla.mozilla.org/show_bug.cgi?id=1163426>
  - <https://issues.chromium.org/issues/396208308>
- [ ] Piano roll
- [ ] Timeline
- [ ] Audio visualizers

## Docking

- [ ] Update to Dockview 4.3.1
- [ ] Use only one `Panel` class? The React wrapper does something like that,
      should look at it more closely. Maybe one class per type of panel, like
      "modals" vs others.
- [x] Stop rendering when the panel DOM nodes are hidden. There's a visibility
      change event which is what I probably should use to know this. Although
      maybe I can also poll for that?
- [ ] See if I'm using the `api` object correctly or not.
  - The Vue adapter does actually store that on `init`. Maybe I should just do
    that too.
- [ ] Tab button for floating a panel (and maybe disable the shift shortcut?).
  - Disabling the shift shortcut seems difficult to do right now. Maybe I should
    make an issue on the Dockview repository asking about this. Maybe it will
    be done eventually anyway.
- [x] Figure out how to get its drag-and-drop stuff to stop interfering with
      my mouse/touch interactions.
  - I could just do `event.preventDefault` and `event.stopPropagation`,
    but then the panel doesn't get marked as active wrt docking. I could
    try to mark it as active manually (there's probably an API for it)
    but doing that from inside e.g. `StretchyScrollBar` will be awkward.
  - It seems like I need to attach an event listener for `"dragstart"`. I also
    have set `"draggable"` to `"false"` but I'm not sure if that's necessary.
    That seems to have done the job. Still not sure what to do about the
    above point.
- [-] Figure out the proper way to handle resizing.
  - `onDidDimensionsChange` works but not in all cases as I expect. It's
    easier to use `CoordinatedResizeObserver`. That doesn't capture moves
    though, but `onDidDimensionsChange` does get called on moves. I probably
    can use this hybrid for now.
    What also bothers me is that Dockview internally has a bunch of
    `ResizeObserver`s but I can't do anything about them :/
    Maybe I should try harder to use only the Dockview events.
  - The `layout` method on panels also does fire for both resizes and moves, but
    it only gives me the width and height. I could just take the hit and query
    for that myself for now, but it bothers me that the info is right there but
    I can't access it.
- [ ] Theme
- [-] Prompts/popups
  - [x] Prevent these from being dropped into the other docked panels.
  - [ ] How to make dragging on the tab move the floating group?
    - It already works if you hold shift.
    - I'm not seeing an easy way of executing that. Maybe I could hide the
      built-in panel header (which is supported) and implement a replacement,
      but that's more effort than I want to spend right now.
  - Maybe this should have its own Dockview root component. Then maybe it'd
    simplify serialization, besides the drag and drop stuff above. Though that's
    not very helpful in the long run.
- [-] Serialization
  - [x] Floating groups seem to be serialized weirdly.
    - Actually, the weirdness I saw seems to have been caused by not calling
      `dockview.layout(...)` before deserializating, as the React wrapper
      seems to do. After that, this looks okay.
  - [x] How to exclude some floating groups from being serialized?
    - Can just edit the object returned by `toJSON` I guess.
  - [ ] Should come up with an internal serialization format tailored for the
        application instead of using Dockview's built-in serializer.
  - [ ] Support multiple layouts.
- Support detaching panels into a separate browser window? Seems pretty dicey.
- [ ] Add "always on" panels (namely for the transport and timeline ones).

## Keyboard shortcuts

- <https://blog.duvallj.pw/posts/2025-01-10-all-javascript-keyboard-shortcut-libraries-are-broken.html>
- <https://github.com/w3c/uievents/issues/377>
- [ ] I think I'll just do whatever vscode is doing for now.

## Drag and drop

- <https://medium.com/@alexandereardon/dragging-react-performance-forward-688b30d40a33>

## Virtualization

- <https://stackoverflow.com/questions/62400367/how-to-calculate-text-height-without-rendering-anything-to-the-dom>
- <https://github.com/codemirror/dev/issues/370>
- <https://github.com/6pac/SlickGrid>
  - <https://github.com/mleibman/SlickGrid/issues/22>
- <https://issues.chromium.org/issues/41441393>
- [ ] Custom scrollbar
  - [ ] Auto-switch if scrollable element is too large? Maybe this is too
        strange. I could instead just decide that some elements get a custom
        scrollbar, depending on whether they need to "scale" to millions of
        pixels.

## Widgets

### Piano roll

- [ ] Disable note stretch handles when `noteSizeInPixels < handleSize * 3`
- [ ] When resizing the panel, resize the viewport instead of stretching to
      fit.
- [ ] Leave a gap after the end for the x axis? Allow x < 0?
- [ ] Deal with this "tentative" note property business properly.
- [ ] Piano
- [ ] Coalesce fillRect calls? Examples:
  - Catapult's `FastRectRenderer`: <https://github.com/catapult-project/catapult/blob/99a1dc34979a66d97407dd7559735c4ad45cdd84/tracing/tracing/ui/base/fast_rect_renderer.html>
  - <https://github.com/loov/spector/tree/javascript>

### Stretchy scrollbar

- [ ] Revise the CSS used for this.
- [ ] `setZoom(centerPan: number, factor: number): void`
- [ ] `setPan(pan: number): void`
- [ ] I added this `deltaDivisor` thing to make scrolling easier in larger
      patterns. It's hardcoded to 128 when holding shift, but maybe I could
      make it different powers of two as you move the mouse along the axis
      perpendicular to the scrollbar's.
  - I ended up overwriting the previous and current values for pan/zoom/mouse
    position/etc to make this work better, but for the above I'll need to
    actually keep the initial mouse position so I can keep the x/y delta
    measure stable.
- [ ] Maybe switch to overwriting the previous and current values only after
      pressing shift once? I imagine the current behavior will be a bit odd
      to people used to most UI toolkits.
- [ ] Do something when clicking on the track
  - Move by one thumb size? Does that correspond to the search window?
  - Maybe I should just make this a concern of the parent.
- [ ] Do something with the scroll wheel
  - Zoom? Pan? Gate one with a modifier key and do both?
- [ ] Make sizes configurable
  - [ ] Handle size
  - [ ] Container size
  - [ ] Minimum thumb size
- [ ] Revise internal and public names
- [ ] Arrow buttons?

### Search box

- [ ] Fuzzy match with some kind of scoring and a flat result list?
  - One idea for scoring is downplaying haystacks that have larger distances
    between every matched needle character.

### Menu bar

- <https://www.w3.org/WAI/ARIA/apg/patterns/menubar/>
- <https://github.com/floating-ui/floating-ui>
- [ ] After clicking on one menu entry, make it possible to switch between them
      just by hovering, as that's what most desktop programs do. The same goes
      for submenus.
  - [ ] Implement the "safe triangle" navigation tweak

### Modal

- [ ] Only allow one of these at a time.
- [ ] "Moveable" modal: blocks song data changes but allows e.g. scrolling
      through. Maybe "moveable" isn't the best name.
  - Weirdly enough, the equivalent of this in REAPER doesn't block song data
    changes (e.g. Quantize), which makes the current visual state look weird.
- [ ] "Dismissable" modal?: click outside and it will disappear.

## Mobile

- [ ] Alternative layout manager (instead of Dockview).
- Touch support
  - With `touch*` events? With `pointer*` events? Both?
    - Check EasyPointers to save time and effort.
  - [ ] `StretchyScrollBar`
  - [ ] Piano roll
  - [ ] Timeline

## UIScheduler

- [ ] Pass timestamp to render functions?
- [ ] Add scheduling for "layout" (DOM reads) functions? Those would be executed
      all before the render functions, which can do DOM writes.
      This will be very annoying so I'll leave it for much later when I have
      more components and can better judge whether it's worth it at all.
- [ ] Instead of a Set, make callers not schedule redundant renders.
- How to render only some of the components instead of the entire component
  tree? The fused component tree traversal in the render functions makes this
  awkward. Retained mode GUI toolkits usually do that traversal automatically.
  It also seems I really need to track not just the depth but the entire tree.
  The cases I have in mind are:
  - When scheduling a render for a child, don't bother if any of its parents
    will do it
  - When scheduling a render for a parent, clear out any scheduled functions for
    its entire subtree
- [ ] Use a scheme where we can register specific animation-related functions in
      an array. Then, if we're not doing a full top-down re-render, call only
      those specific functions every frame (when applicable of course, like
      whenever the song is playing). There is no need to clear them. Maybe also
      get rid of the independent render stuff while doing this.

# Serialization

- [ ] Investigate [avsc](https://github.com/mtth/avsc) and see if there's good
      tricks I can use.
  - See also this article: <https://adamfaulkner.github.io/binary_formats_are_better_than_json_in_browsers.html>

## Autosaving

- [ ] Configurable granularity (every edit, every minute, etc)
- [ ] Keep track of project identifier in URL? That way, when reopening a tab
      with that URL again, the correct project will be loaded (and should
      have been autosaved, hopefully)
- [ ] Autosave based on `visibilitychange`

# Data structures and algorithms

- [x] Hash table
  - Generate these from a template (like fastutil)?
  - [ ] Try <https://thenumb.at/Hashtables/#robin-hood-linear-probing>?
  - [ ] Try [ahash](https://github.com/tkaitchuck/aHash)? It's supposedly better
        than both fxhash and FNV wrt collisions (probably not fast since we'd
        have to do a port of the fallback with only 32-bit operations, though).
  - [x] Store metadata in the typed array?
    - I tried this and it didn't seem much faster. It also makes the API even
      weirder, since resizes mean we need a new pointer to a new typed array.
- [ ] Deque (can just borrow from BeepBox for now)
- [ ] Radix sort? At least a stable sort would be good, though newer JS versions
      guarantee a stable sort, so this may not be as necessary. Then the only
      reason to do anything else would be speed.
- [ ] B-tree? PhosphorJS has a B+tree, should look at that.
