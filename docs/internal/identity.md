A very common issue here is the one of identifying objects (not necessarily
class instances, or JS objects). Here are some options, and why you may not want
to use them.

## Array indices

```javascript
const things = [{ x: 1 }, { x: 2 }];
const thing0 = things[1 /* <- this value */];
```

Doesn't work if order in the array is meaningful, as every sort/removal/etc will
invalidate the indices. In particular, we store notes in an array-backed
interval tree, which always needs all notes sorted by their starting position.

You could simply expect care when doing changes, but it's fragile.

## Unique keys

Looking at the previous example, if `x` is always different for different items,
we can e.g. use it as a key in a `Map`. We can also use "composite" keys, made
up of different values, as long as the combination is unique. See also
[primary keys](https://en.wikipedia.org/wiki/Primary_key) in relational
databases.

JavaScript makes this rather awkward, since it doesn't have composite
[value types](https://en.wikipedia.org/wiki/Value_type_and_reference_type)
(there have been some proposals ([1], [2], [3], [4]), but still, nothing usable
today). The "natural" choice is to use "primitive" values (numbers mostly, but
also strings, booleans, ...). In fact, a common trick that people use for
composite keys in `Map`s is to convert the parts of the key into strings, and
concatenate them.

Of course, doesn't work if those keys are not actually unique, which is the case
for notes: it should be possible to have two notes that are identical, playing
on top of each other. Something else has to distinguish them, we can't look at
pitch (or volume, or automation, etc).

## Explicit IDs

```javascript
const things = [{ id: 1, x: 10 }, { id: 2, x: 10 }];
const thing0 = things.find(x => x.id === 1 /* <- this value */);

// Of course, linear search may not be great. Another option is to store these
// in a Map, with the ID as the key:
const thingsById = new Map([[1, things[0]], [2, things[1]]]);
console.log(thing0 === thingsById.get(1)); // Should be true.
```

This is related to the "unique keys" option. In this case, we make up a new
unique value, that is not really related to the data.

Array reordering (as a result of deletions or otherwise) doesn't matter here,
but as seen in the previous option, this breaks down if we reuse the IDs. This
can happen unintentionally if we e.g. use a 32-bit integer as the ID, and the ID
generator overflows. Depending on how deletion and undo are implemented, this
may occur rather quickly.

We can use a larger space of values (such as 64-bit integers), but that starts
to affect performance and memory use. In particular, this is really annoying to
use in JavaScript, at least if avoiding extra allocations is desirable
(otherwise you could just use `BigInt`).

## Reference/pointer equality

```javascript
const thing0 = { x: 10 };
const thing1 = { x: 10 };
const things = [thing0 /* <- this reference */, thing1];
```

Doesn't work across threads, unless we share memory (which may not be supported,
or we may not want to do).

## Other thoughts

When saving or loading, explicit IDs are unnecessary, and indices work fine. We
can reassign IDs on load. It's not even expensive to do this, as saving and
loading will happen more rarely here (though there's autosaving, but again, I
don't expect this to be a problem).

For undo, we can't really use indices or unique keys, generally. We can if it's
possible to guarantee a perfect restoration of the previous state of the world
(which is fairly necessary for undo to work in the single user case anyway).
Mostly, we'll use IDs or pointers. Pointers if IDs can be reused, and IDs
otherwise.

Efficiency is a problem, both because it discourages solutions that most people
would rather use (immutability can simplify code if you can afford it), but also
because the wrong choice here can end up impacting search/editing operations.

For example, if you use IDs to refer to notes, you can't easily find notes in
constant time, as you would be able to if you used an array index or an object
reference. Though in this case, you can still do that with an approach that's
roughly O(log n): in addition to the ID, store the start and end, then use those
for searching. That's the O(log n) part. From there, if there are multiple
results with the same start and end, you can do a linear search for the ID. It's
not as good as O(1), and the constant factors matter here (hash tables may
not save the day!), so specialized solutions may be very worthwhile.

Another example: if you always essentially update a list immutably, then array
"diffing" will probably be necessary. If you can maintain the pointers of
existing items on edits, then you can hold onto them and poll for the specific
per-element changes you care about.

[1]: https://github.com/tschneidereit/typed-objects-explainer/blob/master/valuetypes.md
[2]: https://github.com/sebmarkbage/ecmascript-immutable-data-structures
[3]: https://github.com/tc39/proposal-record-tuple
[4]: https://github.com/tc39/proposal-composites
