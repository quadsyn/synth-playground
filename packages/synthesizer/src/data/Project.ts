import * as LongId from "@synth-playground/common/LongId.js";
import { makeIdGenerator } from "./common.js";
import * as TrackMetadata from "./TrackMetadata.js";
import * as Song from "./Song.js";
import * as Sound from "./Sound.js";
import * as Uint32ToUint32Table from "@synth-playground/common/hash/table/Uint32ToUint32Table.js";

// This is separated out from Song, because we don't really want to send this
// structure to the audio thread, even though it's defined here. It's full of
// things that we don't need there like track names, etc.
// It makes the code more error-prone, but edits should happen in a "controlled"
// way anyhow, to enable things like undo.
export interface Type {
    song: Song.Type;

    // Don't index directly into this unless you know what you're doing.
    // Most of the time you'll instead want to go through soundsById first.
    sounds: Sound.Type[];
    soundsById: Uint32ToUint32Table.Type;
    // @TODO: soundsMetadata

    title: string;
    author: string;
    description: string;

    // Should remain in sync with song.tracks.
    tracksMetadata: TrackMetadata.Type[];

    patternIdGenerator: LongId.Type;
    clipIdGenerator: LongId.Type;
    // Should remain in sync with song.patterns.
    noteIdGeneratorsByPatternIndex: LongId.Type[];
    soundIdGenerator: number;
}

export function make(): Type {
    const song: Song.Type = Song.make();
    return {
        song: song,
        sounds: [],
        soundsById: Uint32ToUint32Table.make(4),
        title: "Untitled", // @TODO: Localization
        author: "",
        description: "",
        tracksMetadata: song.tracks.map((_, i) => TrackMetadata.make(
            /* name */ `Track ${i + 1}`, // @TODO: Localization
            /* height */ TrackMetadata.DefaultHeight,
            /* collapsed */ false,
        )),
        patternIdGenerator: makeIdGenerator(),
        clipIdGenerator: makeIdGenerator(),
        noteIdGeneratorsByPatternIndex: song.patterns.map(_ => makeIdGenerator()),
        // We start at 1 here because 0 is used as a sentinel key in our custom
        // hash maps, indicating empty buckets.
        soundIdGenerator: 1,
    };
}
