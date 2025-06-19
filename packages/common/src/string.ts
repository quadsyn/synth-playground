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
    haystack = haystack.toLowerCase();

    const needleSize: number = needle.length;
    let haystackIndex: number = 0;
    for (let needleIndex: number = 0; needleIndex < needleSize; needleIndex++) {
        const matchIndex: number = haystack.indexOf(needle.charAt(needleIndex), haystackIndex);
        if (matchIndex === -1) {
            return false;
        } else {
            haystackIndex = matchIndex + 1;
        }
    }
    return true;
}
