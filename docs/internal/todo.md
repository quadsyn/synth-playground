# Audio

- [ ] Split audio blocks at points where events happen, instead of splitting
      uniformly for every tick. This avoids loop overhead once the tick
      sizes start getting smaller. Also avoids issues with large PPQN/tempo
      values.
  - One problem with this is that envelopes or LFOs quantized in terms of PPQN
    still run into problems once the size of a tick gets small enough, as we'd
    probably still want to do the uniform splitting for those. I don't know
    what's a good way to deal with this. My understanding is that a lot of
    synthesizers will evaluate such things every few samples or so (i.e. a fixed
    rate), regardless of tick size/tempo. I don't love this, though since
    changing the sample rate often changes some things without any workaround
    anyway (e.g. aliasing), it's probably fine?
    - Would these fixed size blocks have to be positioned relative to the start
      of the notes? Making them "free-running" would probably not be great.
  - Another thing that some commercial synths do is quantize all events to fixed
    size blocks as well. Those probably have to be pretty tiny to not matter,
    though. Being able to make guarantees for SIMD-driven code seems related.
  - I guess higher precision in the position of notes could also result in tiny
    sub-blocks.
- [ ] State structure:
  - InstrumentState
    - `VoiceState[]` and `Map<[ClipId, NoteId], VoiceState>`
      - This needs 128-bit keys. It makes more sense if a maximum voice count is
        introduced. At first I thought of an intermediate `ClipState` structure,
        and each had its own list of voices, but it makes enforcing the max
        voice count annoying (besides being worse in terms of allocation as far
        as I can tell).
      - I'm actually not sure if I'll really still need this. I think it's
        necessary if I need to do the moral equivalent of React's "diffing" for
        voices, but if I just stop all current voices on edits (seeking will
        also do this, though I think looping won't), I don't think I will have a
        need for this.
- [ ] The interval tree search and id lookups can be skipped if no edits happen.
      The number of ticks until the next note on can be recorded per instrument,
      with 0 meaning that the tree search should happen (if there are notes).
      If clips overlap, this has to be the minimum tick distance between all
      relevant clips. In general, it's the tick position of the next
      "interesting" event.

## Audio graph

- [ ] Latency compensation
  - I want e.g. FFT-backed effects! Without this, they won't work properly.
  - <https://gareus.org/misc/thesis-p8/2017-12-Gareus-Lat.pdf>
  - <https://docs.reasonstudios.com/reason12/delay-compensation>
  - [ ] Automation and "MIDI" have to participate too
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
    - I think I'm just missing something here, and will probably only realize
      what it is once I try implementing it.
  - While sticking to the BeepBox timing model (see the "buffer splitting"
    thing in the Audio section above), I think that has to be switched so that
    it doesn't process "vertically" (i.e. for every run, process all
    channels/tracks), but rather "horizontally" (i.e. for every track, process
    an entire block). This should hopefully allow me to push the tick grid
    forward, which will be necessary for automation.
  - I still have no idea if time stretching will require this or not.
- [ ] Process nodes in mono whenever possible
  - That cuts down whatever workload in half! It's worth the complication.

# Data model

## Caching

- I want to use OPFS for things like caching audio file peaks. A first idea I
  have is to create session folders. Each would have a file-based lock inside,
  done by, in a worker, creating a file and getting a synchronous handle for it
  (AFAIK SQLite is doing something similar when running in the browser). Then,
  every time I create a new session, I also try cleaning up older ones, by
  trying to remove the lock. If that fails, then I leave it alone. Otherwise, I
  remove the containing folder.

## Serialization

- [ ] Investigate [avsc](https://github.com/mtth/avsc) and see if there's good
      tricks I can use.
  - See also this article: <https://adamfaulkner.github.io/binary_formats_are_better_than_json_in_browsers.html>

## Autosaving

- [ ] Configurable granularity (every edit, every minute, etc)
- [ ] Keep track of project identifier in URL? That way, when reopening a tab
      with that URL again, the correct project will be loaded (and should
      have been autosaved, hopefully)
- [ ] Autosave based on `visibilitychange`

# UI

- [ ] After disposing a component, callbacks related to it may still run. Have
      to add a field to indicate that the component has been disposed of, to
      return early in those cases. Probably should solve this by introducing a
      "disposable" superclass? Maybe even a component superclass?
  - See also:
    - WinJS's [Dispose Pattern Guidelines](https://github.com/winjs/winjs/wiki/Dispose-Pattern-Guidelines)
- [ ] Order class fields for components consistently.
- Manual memoization is very tedious. Can that be shortened at runtime without
  much of a hit?
  - vscode's FastDomNode does cut down on this a bit, for setting attributes.
  - For lists, the reconciliation helpers should be the answer here.
  - Anything else would probably remain as is.

## UIContext

- [ ] Add scheduling for "layout" (DOM reads) functions? Those would be executed
      all before the render functions, which can do DOM writes.
      This will be very annoying so I'll leave it for much later when I have
      more components and can better judge whether it's worth it at all.
  - Hmm, do I even need this? DOM reads will happen in event handlers, but they
    always defer rendering with `requestAnimationFrame`, where the writes occur.
    That seems like it shouldn't cause any unnecessary reflows.
    The canvas-related ones can still happen I guess.
- How to render only some of the components instead of the entire component
  tree? The fused component tree traversal in the render functions makes this
  awkward. Retained mode GUI toolkits usually do that traversal automatically.
  It also seems I really need to track not just the depth but the entire tree.
  - The cases I have in mind are:
    - When scheduling a render for a child, don't bother if any of its parents
      will do it
    - When scheduling a render for a parent, clear out any scheduled functions
      for its entire subtree
  - I'm trying to avoid parent pointers. Seems like I can't avoid it for this.
- [ ] Use a scheme where we can register specific animation-related functions in
      an array. Then, if we're not doing a full top-down re-render, call only
      those specific functions every frame (when applicable of course, like
      whenever the song is playing). There is no need to clear them, except if
      the component that they belong to goes away, but the component is the one
      that should unregister them when disposing.
- Does [this](https://github.com/localvoid/ivi#using-requestanimationframe-for-scheduling-ui-updates)
  matter here? My intuition says no, because for the most part I'm trying to
  avoid depending on external state (which is the issue there, as far as I can
  tell).

## DOM

- [ ] Helper functions for reconciliation (keyed, non-keyed, etc)?
  - <https://github.com/Freak613/stage0>
    - Doesn't have unmounting, but that doesn't sound difficult to add.
  - <https://github.com/localvoid/ivi>
  - <https://github.com/WebReflection/udomdiff>
- [ ] Make the event listener names consistent: I'm using both `on*` and
      `handle*` randomly. The idea should be to use `handle*` for everything,
      and `on*` for callbacks given in the constructor of a component.
- Add a reusable event handler to discard events like `"dragstart"`?
- [ ] Once there's more code written, look at whether it will be okay to do
      something like BeepBox's auto-render after browser events are fired.
- <https://stackoverflow.com/questions/77842752/how-do-i-use-resizeobserver-with-requestanimationframe-correctly>

## CSS

- [ ] Move all the inline CSS to an external file for better minification.
- [ ] See if inlining all the CSS inside the entry point .html is better for
      load times.
- [-] Formalize the concept of "critical CSS" that's always inlined (right
      now I just have the background color and text color set on `<body>`)
  - Typical implementations of this idea seem to spin up a headless browser and
    extract "above the fold" CSS automatically, but I don't think I'll bother
    with that. So I think what I'll do is decide what CSS is critical myself.
    This still needs HTML parsing and rewriting. Maybe esbuild's potential
    [HTML entry point](https://github.com/evanw/esbuild/issues/31) support could
    also help here.
- [-] Use CSS modules to minify class names in stylesheets.
- [ ] Check if some kind of "normalization"/"reset" is necessary.

## WebGL

- [x] Virtualize contexts
  - Overlapping viewports (which can e.g. come from the dockable UI) make
    this really annoying to solve. When panels don't overlap, it's enough to
    use one screen-sized backbuffer and use scissor tests to trim the
    rendering to a specific rectangle. When panels overlap, my first idea is to
    make every panel have a canvas, and perform a copy.
  - <https://stackoverflow.com/questions/59140439/allowing-more-webgl-contexts>
  - <https://github.com/greggman/virtual-webgl>
  - <https://bugzilla.mozilla.org/show_bug.cgi?id=1163426>
  - <https://issues.chromium.org/issues/396208308>
  - [x] Need to track the panels that are using WebGL, and need to hide the one
        big canvas if no one is using it.
  - [x] How to prevent the flicker when going from one to multiple canvases?
    - Need to clear before applying styles.
  - Other ideas:
    - Make the large backbuffer contain all the overlapping areas, side by side.
      Somewhat like making a texture atlas, so this will need some kind of bin
      packing. There's also the concern with the maximum possible size for the
      backbuffer. Then this can either be used with multiple drawImage calls (if
      that's fast), or one drawImage call to a canvas of the same size as the
      backbuffer (rather bad for memory), then other drawImage calls using that
      one.
    - Draw the large backbuffer behind dockview, and make the relevant panels
      transparent. Doesn't work for floating groups, because those would need to
      punch holes through other DOM elements. Might that be part of why floating
      panels are not supported in <https://github.com/Smithsonian/dpo-voyager>?
      They use this technique as far as I can tell.
  - Some problems I've noticed from trying this:
    - I have to do some slow checking for overlapping render descriptors on
      every render.
    - The descriptor overlap check doesn't cover the tab area. I don't know if
      there's a good way to fix that. I guess I could just query in the panel
      more.
    - The WebGL overlay covers the dockview drop target indicator. Ideally
      dockview would let me poll quickly for that. Also maybe I'd need the
      ability to draw those drop target indicators in a separate part of the DOM.
    - There's some flickering because the positions I get when querying with
      getBoundingClientRect are not exactly where I should be drawing. Quite
      noticeable if you use page zooming. This is probably unfixable :( (high
      DPI screens probably make this worse too)
  - So far I feel like banning floating panels is the way to go. I will probably
    use something else instead of dockview for dialogs (modal-ish)/modals/etc.,
    and for what remains (like the visualizers), I can probably live without
    making those float on top of other things.
- [ ] Piano roll
- [ ] Timeline
- [ ] Audio visualizers
- [ ] Steal pixi's `DynamicBitmapFont`? Would be good for 2D canvases too.

## Docking

- [ ] Tab button for floating a panel (and maybe disable the shift shortcut?).
  - Disabling the shift shortcut seems difficult to do right now. Maybe I should
    make an issue on the Dockview repository asking about this. Maybe it will
    be done eventually anyway.
- [ ] Theme
- [-] Serialization
  - [ ] Should come up with an internal serialization format tailored for the
        application instead of using Dockview's built-in serializer.
  - [ ] Support multiple layouts.
- [ ] Add "always on" panels (namely for the transport and timeline ones).
- [ ] When using `floatingGroupBounds: "boundedWithinViewport"`, there's a bug
      where floating groups expand erroneously, covering the entire screen, and
      they can't be made any smaller. To reproduce, put a panel on a screen
      corner or edge, then resize from the opposite end. This is reproducible in
      the Dockview demos, like [this one](https://dockview.dev/docs/core/groups/floatingGroups).
- [ ] Locking.
- [x] Use only one `Panel` class? The React wrapper does something like that,
      should look at it more closely. Maybe one class per type of panel, like
      "modals" vs others.
    - I remain undecided on what's best here.
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
- [x] Figure out the proper way to handle resizing.
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
- Support detaching panels into a separate browser window? Seems pretty dicey.
- Floating groups seem to grow after reloading? Not sure what's up with that.
- [ ] It seems that dockview is leaking my elements, via `ACTUAL_TARGET`?
  - I should figure out exactly what is the problem here, but that seemed to be
    the problem from briefly looking at heap snapshots.

## Keyboard shortcuts

- <https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/>

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
- [ ] Leave a gap after the end for the x axis? Allow x < 0?
- [ ] Play notes when created
  - Also when moved?
- [x] Piano
  - [ ] Map horizontal position to volume
  - [ ] Generalize key colors
  - [ ] Draw pitch names
- [ ] Coalesce fillRect calls? Examples:
  - Catapult's `FastRectRenderer`: <https://github.com/catapult-project/catapult/blob/99a1dc34979a66d97407dd7559735c4ad45cdd84/tracing/tracing/ui/base/fast_rect_renderer.html>
  - <https://github.com/loov/spector/tree/javascript>

### Stretchy scrollbar

- [ ] Revise the CSS used for this.
- [-] `setZoom(centerPan: number, factor: number): void`
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
- [-] Make sizes configurable
  - [-] Handle size
  - [-] Container size
  - [ ] Minimum thumb size
- [ ] Revise internal and public names
- [ ] Arrow buttons?

### Search box

- [ ] Improve fuzzy matching

### Menu bar

- [ ] <https://www.w3.org/WAI/ARIA/apg/patterns/menubar/>
- <https://github.com/floating-ui/floating-ui>
- Try to match Electron's API?
  - <https://www.electronjs.org/docs/latest/api/menu>
  - <https://www.electronjs.org/docs/latest/api/menu-item>

### Modal

- [ ] Only allow one of these at a time.
- [ ] Maybe this should be called `ModalDialog`. Then the below could be called
      `ModelessDialog`.
- [ ] "Moveable" modal: blocks song data changes but allows e.g. scrolling
      through. Maybe "moveable" isn't the best name.
  - Weirdly enough, the equivalent of this in REAPER doesn't block song data
    changes (e.g. Quantize), which makes the current visual state look weird.
- [ ] "Dismissable" modal?: click outside and it will disappear.
- <https://doc.qt.io/qt-6/qt.html#WindowModality-enum>
- [ ] `MessageBox` equivalent? Probably should go in `UIContext`.

### Table

- <https://github.com/mui/mui-x/blob/39c867d3a9870a4840bed861ca49df0312698518/packages/x-data-grid/src/hooks/features/columns/gridColumnsUtils.ts>
- <https://github.com/microsoft/vscode/blob/f52e13bc6b127586b7c5c93e6c17147914aab8e0/src/vs/base/browser/ui/table/tableWidget.ts>
- [ ] Start with even column widths (on mount, since we need to see what is the
      total width available)
- Could measure at least visible cells on mount, optionally

## Mobile

- [ ] Alternative layout manager (instead of Dockview).
- Touch support
  - With `touch*` events? With `pointer*` events? Both?
    - Check EasyPointers to save time and effort.
  - [ ] `StretchyScrollBar`
  - [ ] Piano roll
  - [ ] Timeline

## Localization

- [ ] Script to check for string IDs defined that have no translated text

# Data structures and algorithms

- [x] Hash table
  - Generate these from a template (like fastutil)?
  - [ ] Try <https://thenumb.at/Hashtables/#robin-hood-linear-probing>?
  - [x] Store metadata in the typed array?
    - I tried this and it didn't seem much faster. It also makes the API even
      weirder, since resizes mean we need a new pointer to a new typed array.
- [x] Deque (can just borrow from BeepBox for now)
- [ ] Radix sort? At least a stable sort would be good, though newer JS versions
      guarantee a stable sort, so this may not be as necessary. Then the only
      reason to do anything else would be speed.
- [ ] B-tree? PhosphorJS has a B+tree, should look at that.

# JS

- Compare classes with objects+closures
  - I expect minification to be quite a bit better for the latter, since
    "private" fields will be local variables, which minifiers can do more with
    (maybe Closure Compiler would do an ok job either way? If that would even
    work here these days, that is).
  - Performance is a more interesting question. In the JS implementation of the
    TS compiler, they use the closure style, and have claimed it's faster.
  - Memory use is another interesting issue. Though I suppose that you can make
    it a non-issue by also having more "free functions" instead of keeping a 1:1
    correspondence between class methods and closures. Although, since those
    will need to operate on public APIs, minification will become worse again.
  - I'll only bother with this after I have a significant part of the program
    implemented. That should make for a more interesting comparison than a set
    of microbenchmarks.

# Meta

- [x] Split up `apps/main/src/ui`
  - Maybe move generic components to a dedicated package?
    - How to deal with UIContext? Clearly I need some interface there, but
      outside of that I don't know what to do.
    - How to handle the use of CSS modules with this?
    - Probably not super worth it unless I actually make several entry points.
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
- [ ] Tests
  - Probably mostly just for the core synthesizer things, data structures, etc.
    UI tests are less worthwhile I think. Slow tests in general are not worth
    it, I want something that ideally should be run locally before pushing,
    besides runs for every pull request.
- Automated releases
- If I get contributions:
  - Consider an autoformatter?
    - My aligned constants will have to go :(
    - Whatever I pick, it should be fast so it's not annoying.
    - Use the opportunity to switch to 2 spaces for indentation?
  - I'm not sure about a linter. Given that the context here is different than
    in most JS codebases (I assume), I don't expect they will help much.
