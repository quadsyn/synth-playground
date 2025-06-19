// # Background
//
// A common problem to solve around here is to quickly find out which intervals
// overlap another interval (or a point).
//
// If the intervals don't overlap each other, a binary search is sufficient,
// and is quite fast. This can be used with a tempo map, for example.
//
// If the intervals can overlap each other arbitrarily, then a well-known
// solution is to use an "interval tree", as described in this article:
// https://en.wikipedia.org/wiki/Interval_tree
//
// Typically, interval trees are built on top of some kind of self-balancing
// binary tree implementation. The ideal solution probably involves some type
// of B-tree. Those are rather complicated to implement though, so I'm leaving
// that for another day.
//
// In the meantime, an "implicit interval tree" should suffice. It's still just
// a sorted array of intervals, though each interval includes one extra field,
// denoting the maximum end point seen in the subtree formed by that interval
// and all of its children.
//
// The implementation here comes from https://github.com/lh3/cgranges (which
// is available under the MIT license), namely from the test/bedcov-cr.js file.
// The cpp/IITree.h file contains useful documentation. More information can be
// found in the associated article:
//
//     Heng Li, Jiazhen Rong, Bedtk: finding interval overlap with implicit
//     interval tree, Bioinformatics, Volume 37, Issue 9, May 2021,
//     Pages 1315–1316, https://doi.org/10.1093/bioinformatics/btaa827
//
// ...and in the notes_on_cgranges.md document from the iitii library, which
// can be found here: https://github.com/mlin/iitii
//
// # Usage
//
// After sorting the intervals by their start position, an "indexing" operation
// must be performed to set the correct maximum end point for all intervals.
// Then queries can be performed. Every edit to the interval array must be
// followed by sorting and indexing, which unfortunately gets slower for large
// numbers of intervals.
// Queries should remain fast, though.
//
// Note that this should not be used as-is. Actual use should be inlined
// wherever you need it, since we want things to be fast, but reusing the same
// code for several different types that match the Interval interface is
// slower, compared to sticking with one type only. Read up on "monomorphism"
// vs "polymorphism" in JavaScript engines for why (there's some links about
// this in the internal documentation here).

export interface Interval {
    // These should be part of the source data already. They're interpreted as
    // a half-open range, that is, inclusive on the lower bound, and exclusive
    // on the upper bound.
    start: number;
    end: number;

    // Interval tree augmentation data, used internally.
    maxEnd: number;
}

// Sort comparator, as used by Array.prototype.sort.
export function byStartAscending(a: Interval, b: Interval): number {
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
}

// This assumes the interval array is sorted already.
export function performIndexing(intervals: Interval[]): number {
    const intervalCount: number = intervals.length;

    if (intervalCount === 0) {
        return -1;
    }

    let lastMaxEnd: number = 0;
    let lastIndex: number = 0;

    for (let index: number = 0; index < intervalCount; index += 2) {
        const interval: Interval = intervals[index];
        const intervalEnd: number = interval.end;
        interval.maxEnd = intervalEnd;
        lastMaxEnd = intervalEnd;
        lastIndex = index;
    }

    let level: number = 1;
    for (; (1 << level) <= intervalCount; level++) {
        const firstIndex: number = computeFirstNodeIndex(level);
        const stride: number = computeStride(level);

        for (let index: number = firstIndex; index < intervalCount; index += stride) {
            const interval: Interval = intervals[index];
            const leftMaxEnd: number = intervals[computeLeftChildIndex(index, level)].maxEnd;
            const rightChildIndex: number = computeRightChildIndex(index, level);
            const rightMaxEnd: number = (
                rightChildIndex < intervalCount
                ? intervals[rightChildIndex].maxEnd
                : lastMaxEnd
            );

            let newMaxEnd: number = interval.end;
            if (newMaxEnd < leftMaxEnd) { newMaxEnd = leftMaxEnd; }
            if (newMaxEnd < rightMaxEnd) { newMaxEnd = rightMaxEnd; }

            interval.maxEnd = newMaxEnd;
        }

        lastIndex = computeParentIndex(lastIndex, level - 1);
        if (lastIndex < intervalCount) {
            const lastInterval: Interval = intervals[lastIndex];
            const lastIntervalMaxEnd: number = lastInterval.maxEnd;
            if (lastMaxEnd < lastIntervalMaxEnd) {
                lastMaxEnd = lastIntervalMaxEnd;
            }
        }
    }

    const maxLevel: number = level - 1;
    return maxLevel;
}

export function findOverlapping<T extends Interval>(
    intervals: T[],
    maxLevel: number,
    start: number,
    end: number,
    onFound: (interval: T, index: number) => void
): void {
    const intervalCount: number = intervals.length;
    // const maxLevel: number = findMaxLevel(intervals);

    const stack: [number, number, number][] = [];

    stack.push([computeRootNodeIndex(maxLevel), maxLevel, 0]);

    while (stack.length > 0) {
        let entry: number[] = stack.pop()!;

        let index: number = entry[0];
        let level: number = entry[1];
        let leftChildWasProcessed: number = entry[2];

        if (level <= 3) {
            const i0: number = computeLeftmostLeafIndex(index, level);
            let i1: number = i0 + computeSubtreeSize(level);
            if (i1 >= intervalCount) {
                i1 = intervalCount;
            }
            for (let i: number = i0; i < i1 && intervals[i].start < end; i++) {
                if (start < intervals[i].end) {
                    onFound(intervals[i], i);
                }
            }
        } else if (leftChildWasProcessed === 0) {
            stack.push([index, level, 1]);
            const y: number = computeLeftChildIndex(index, level);
            if (y >= intervalCount || intervals[y].maxEnd > start) {
                stack.push([y, level - 1, 0]);
            }
        } else if (index < intervalCount && intervals[index].start < end) {
            if (start < intervals[index].end) {
                onFound(intervals[index], index);
            }
            stack.push([computeRightChildIndex(index, level), level - 1, 0]);
        }
    }
}

export function findMaxLevel(intervals: Interval[]): number {
    const intervalCount: number = intervals.length;

    let level: number = 0;
    while((1 << level) <= intervalCount) {
        level++;
    }
    --level;

    return level;
}

export function computeStride(level: number): number {
    return 1 << (level + 1);
    // return 2 ** (level + 1);
}

export function computeFirstNodeIndex(level: number): number {
    return (1 << level) - 1;
    // return 2 ** level - 1;
}

export function computeRootNodeIndex(maxLevel: number): number {
    return (1 << maxLevel) - 1;
    // return 2 ** maxLevel - 1;
}

export function computeChildIndex(level: number): number {
    return 1 << (level - 1);
    // return 2 ** (level - 1);
}

export function computeLeftChildIndex(index: number, level: number): number {
    return index - computeChildIndex(level);
}

export function computeRightChildIndex(index: number, level: number): number {
    return index + computeChildIndex(level);
}

export function computeParentIndex(index: number, level: number): number {
    if (isRightChild(index, level)) {
        return index - (1 << level);
        // return index - 2 ** level;
    } else {
        return index + (1 << level);
        // return index + 2 ** level;
    }
}

export function isLeftChild(index: number, level: number): boolean {
    return ((index >> (level + 1)) & 1) === 0;
    // return (Math.floor(index / (2 ** (level + 1))) & 1) === 0;
}

export function isRightChild(index: number, level: number): boolean {
    return ((index >> (level + 1)) & 1) === 1;
    // return (Math.floor(index / (2 ** (level + 1))) & 1) === 1;
}

export function computeLeftmostLeafIndex(index: number, level: number): number {
    return (index >> level) << level;
    // return index & (~((1 << level) - 1));
}

export function computeSubtreeSize(level: number): number {
    return (1 << (level + 1)) - 1;
    // return 2 ** (level + 1) - 1;
}

export function computePossibleNodeCount(level: number, maxLevel: number): number {
    return 1 << (maxLevel - level);
    // return 2 ** (maxLevel - level);
}
