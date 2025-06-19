// https://en.wikipedia.org/wiki/Binary_search#Procedure_for_finding_the_leftmost_element
export function binarySearchLeftmost(array: number[], target: number): number {
    const length: number = array.length;
    let left: number = 0;
    let right: number = length;
    while (left < right) {
        const middle: number = Math.floor(left + (right - left) / 2);
        if (array[middle] < target) {
            left = middle + 1;
        } else {
            right = middle;
        }
    }
    return left;
}
