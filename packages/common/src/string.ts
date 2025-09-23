/**
 * Check if the characters in the needle are present at the start of the
 * haystack.
 *
 * This assumes the needle is entirely lowercase.
 */
export function matchExactPrefix(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().startsWith(needle);
}

/**
 * Check if the characters in the needle are present anywhere in the haystack,
 * in the same order, with no extra characters between each match.
 *
 * This assumes the needle is entirely lowercase.
 */
export function matchExactSubstring(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().includes(needle);
}

/**
 * Check if the characters in the needle are present in the haystack, in the
 * same order, but allowing extra characters between each match.
 *
 * This assumes the needle is entirely lowercase.
 */
export function matchFuzzySubstring(haystack: string, needle: string): boolean {
    return scoreFuzzySubstring(haystack, needle) > 0;
}

/**
 * Same as `matchFuzzySubstring`, but returns a score. Higher values imply a
 * better match, 0 means no match.
 *
 * This assumes the needle is entirely lowercase.
 */
export function scoreFuzzySubstring(haystack: string, needle: string): number {
    return scoreFuzzySubstringInternal(haystack, needle, noop);
}

function noop(index: number): void {}

function scoreFuzzySubstringInternal(
    haystack: string,
    needle: string,
    onMatch: (index: number) => void,
): number {
    haystack = haystack.toLowerCase();

    const needleSize: number = needle.length;
    let score: number = 0;
    let haystackIndex: number = 0;
    for (let needleIndex: number = 0; needleIndex < needleSize; needleIndex++) {
        // @TODO: I don't know how this behaves wrt Unicode in general.
        // Very likely to be incorrect.
        const matchIndex: number = haystack.indexOf(needle.charAt(needleIndex), haystackIndex);
        if (matchIndex === -1) {
            // Drop this entirely if a character from the needle is not present.
            return 0;
        } else {
            onMatch(matchIndex);
            const distance: number = matchIndex - haystackIndex;
            score += 1 / (distance + 1);
            haystackIndex = matchIndex + 1;
        }
    }
    return score;
}

export interface HighlightRange {
    start: number;
    end: number;
}

export interface HighlightingResults {
    ranges: HighlightRange[] | undefined;
    score: number;
}

export function highlightFuzzySubstring(
    haystack: string,
    needle: string,
): HighlightingResults {
    let ranges: HighlightRange[] | undefined = undefined;
    const score: number = scoreFuzzySubstringInternal(
        haystack,
        needle,
        (index: number): void => {
            if (ranges == null) {
                ranges = [{ start: index, end: index + 1 }];
            } else {
                const range: HighlightRange = ranges[ranges.length - 1];
                if (index === range.end) {
                    range.end = index + 1;
                } else {
                    ranges.push({ start: index, end: index + 1 });
                }
            }
        },
    );
    return { ranges: ranges, score: score };
}
