import * as LongId from "@synth-playground/common/LongId.js";
import { makeIdGenerator } from "./common.js";
import * as TrackMetadata from "./TrackMetadata.js";
import * as Song from "./Song.js";

// This is separated out from Song, because we don't really want to send this
// structure to the audio thread, even though it's defined here. It's full of
// things that we don't need there like track names, etc.
// It makes the code more error-prone, but edits should happen in a "controlled"
// way anyhow, to enable things like undo.
export interface Type {
    song: Song.Type;

    title: string;
    author: string;
    description: string;

    // Should remain in sync with song.tracks.
    tracksMetadata: TrackMetadata.Type[];

    patternIdGenerator: LongId.Type;
    clipIdGenerator: LongId.Type;
    // Should remain in sync with song.patterns.
    noteIdGeneratorsByPatternIndex: LongId.Type[];
}

export function make(): Type {
    const song: Song.Type = Song.make();
    return {
        song: song,
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
    };
}
