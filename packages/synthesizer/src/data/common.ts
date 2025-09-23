import * as LongId from "@synth-playground/common/LongId.js";

export function makeIdGenerator(): LongId.Type {
    // We start at 1 here because 0 is used as a sentinel key in our custom
    // hash maps, indicating empty buckets.
    return LongId.make(/* lo */ 1, /* hi */ 0);
}
