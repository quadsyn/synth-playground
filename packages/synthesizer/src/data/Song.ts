import * as Uint64ToUint32Table from "@synth-playground/common/hash/table/Uint64ToUint32Table.js";
import * as Breakpoint from "./Breakpoint.js";
import * as Track from "./Track.js";
import * as Pattern from "./Pattern.js";
import * as TempoMap from "./TempoMap.js";

export interface Type {
    // "Pulses per quarter note".
    ppqn: number;

    // In quarter notes per minute.
    tempo: number;
    tempoEnvelope: Breakpoint.Type[] | null;

    beatsPerBar: number;
    // @TODO: Time signature map here? Or in Project?

    // In pulses per quarter note.
    duration: number;

    // The tempo map is technically derived data. It's here as a way to save
    // the audio thread from having to compute it.
    tempoMap: TempoMap.Type;

    // The minimum is 0, of course. This is an inclusive range.
    // May be turned into a constant.
    maxPitch: number;

    tracks: Track.Type[];

    // Don't index directly into this unless you know what you're doing.
    // Use patternsById instead. This is so that we don't need to care about
    // remapping indices if we use e.g. splice with this array.
    patterns: Pattern.Type[];
    patternsById: Uint64ToUint32Table.Type;
}

export function make(): Type {
    const ppqn: number = 24;
    const beatsPerBar: number = 4;
    const barCount: number = 16;
    const duration: number = barCount * beatsPerBar * ppqn;
    const pitchesPerOctave: number = 12;
    const octaves: number = 9;
    const maxPitch: number = pitchesPerOctave * octaves;
    const tempo: number = 120;
    const tempoEnvelope: Breakpoint.Type[] | null = null;
    // const tempoEnvelope: Breakpoint.Type[] | null = [makeBreakpoint(0, 10), makeBreakpoint(48, 120)];
    // const tempoEnvelope: Breakpoint.Type[] | null = [makeBreakpoint(0, 10)];
    // const tempoEnvelope: Breakpoint.Type[] | null = [];
    // for (let i = 0; i < 400; i++) {
    //     const t = i / 400;
    //     tempoEnvelope.push(Breakpoint.make(i * 1 + 50, Math.floor(10 + (500 - 10) * (Math.sin(5 * t * Math.PI * 2) * 0.5 + 0.5))));
    // }

    const tempoMap: TempoMap.Type = TempoMap.make();
    TempoMap.update(
        tempoMap,
        ppqn,
        duration,
        tempo,
        tempoEnvelope,
    );

    return {
        ppqn: ppqn,
        tempo: tempo,
        tempoEnvelope: tempoEnvelope,
        beatsPerBar: beatsPerBar,
        duration: duration,
        tempoMap: tempoMap,
        maxPitch: maxPitch,
        tracks: [
            Track.make(1, 0),
            Track.make(1, 0),
            Track.make(1, 0),
            Track.make(1, 0),
        ],
        patterns: [],
        patternsById: Uint64ToUint32Table.make(32),
    };
}
