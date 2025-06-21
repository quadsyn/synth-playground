import * as IITree from "@synth-playground/common/iitree.js";
import { splitmix32 } from "@synth-playground/common/splitmix32.js";
import { lerp } from "@synth-playground/common/math.js";
import { LongId } from "@synth-playground/common/LongId.js";
import * as Uint64ToUint32Table from "@synth-playground/common/hash/table/Uint64ToUint32Table.js";

// Rule of thumb: keep strings and the like outside of here. The synthesizer
// should mostly operate on numbers and lists of numbers. Code that deals with
// strings usually involves allocation, which you don't want here, at least not
// without care.
// (yes, I know this allocates a lot currently. That will be dealt with.)

// Generally, this code is working with plain objects and "free functions", as
// that makes life simpler when passing data around between threads. If you pass
// classes around, you need to handle the needed reattachment of prototypes, and
// probably other weird details like that.
//
// Passing data around between threads is also why this uses IDs instead of
// plain pointers/object references. Since we're copying, pointers are not
// stable. This of course introduces issues around ID allocation and the like,
// but it's manageable.
//
// One might wonder why 64-bit IDs (split into two 32-bit parts). The reason is
// that worrying about ID reuse complicates the code a bit further. With 64-bit
// IDs, and reasonable use cases (i.e. not gimmicks like trying to use the
// editor as a paint program), reuse should not be needed. Since this is all
// internal, it could be changed in the future, to improve e.g. memory usage.
//
// The objects should always be constructed via their corresponding `make*`
// functions, to keep object shapes consistent (from the perspective of the JS
// engines).

export interface Note {
    // In pulses per quarter note.
    start: number;
    end: number;

    // Not necessarily in semitones, depends on the song tuning.
    pitch: number;

    // For the "implicit interval tree" acceleration structure.
    maxEnd: number;

    // Internal ID. Don't serialize this.
    idLo: number;
    idHi: number;
}

export function makeNote(
    start: number,
    end: number,
    pitch: number,
    idLo: number,
    idHi: number,
): Note {
    return {
        start: start,
        end: end,
        pitch: pitch,
        maxEnd: end,
        idLo: idLo,
        idHi: idHi,
    };
}

export interface Song {
    ppqn: number;

    // In pulses per quarter note.
    patternDuration: number;

    beatsPerBar: number;

    // The minimum is 0, of course. This is an inclusive range.
    // May be turned into a constant.
    maxPitch: number;

    // Should remain sorted and indexed for playback.
    notes: Note[];

    // For the "implicit interval tree" acceleration structure.
    notesMaxLevel: number;
}

export function makeSong(): Song {
    const ppqn: number = 24;
    const beatsPerBar: number = 4;
    const barCount: number = 2;
    const pitchesPerOctave: number = 12;
    const octaves: number = 9;
    return {
        ppqn: ppqn,
        patternDuration: barCount * beatsPerBar * ppqn,
        beatsPerBar: beatsPerBar,
        maxPitch: pitchesPerOctave * octaves,
        notes: [],
        notesMaxLevel: -1,
    };
}

export function addRandomNotesToSong(
    song: Song,
    seed: number,
    idGenerator: LongId,
): void {
    song.patternDuration = (song.beatsPerBar * 2048) * song.ppqn;

    const noteRng: () => number = splitmix32(seed);
    const noteMinStart: number = 0;
    const noteMaxStart: number = song.patternDuration;
    const noteMinDuration: number = 1;
    const noteMaxDuration: number = song.ppqn;

    for (let i: number = 0; i < 100_000; i++) {
        const duration: number = lerp(noteRng(), noteMinDuration, noteMaxDuration) | 0;
        const start: number = lerp(noteRng(), noteMinStart, noteMaxStart - duration) | 0;
        const end: number = start + duration;
        const pitch: number = lerp(noteRng(), 40, song.maxPitch - 1) | 0;
        song.notes.push(makeNote(start, end, pitch, idGenerator.lo, idGenerator.hi));
        idGenerator.increment();
    }

    reindexNotesInSong(song);
}

export function addExampleNotesToSong(song: Song, idGenerator: LongId): void {
    for (let i: number = 0; i < song.ppqn; i++) {
        const duration: number = i + 1;
        const start: number = i;
        const end: number = start + duration;
        const pitch: number = 12 * 4 + i;
        song.notes.push(makeNote(start, end, pitch, idGenerator.lo, idGenerator.hi));
        idGenerator.increment();
    }

    reindexNotesInSong(song);
}

export function reindexNotesInSong(song: Song): void {
    // console.time("note sort");
    song.notes.sort(IITree.byStartAscending);
    // console.timeEnd("note sort");
    // console.time("note indexing");
    song.notesMaxLevel = IITree.performIndexing(song.notes);
    // console.timeEnd("note indexing");
}

class Tone {
    public note: Note;
    public phase: number;
    public phaseDelta: number;
    public volume: number;
    public volumeDelta: number;

    constructor(note: Note, phaseDelta: number) {
        this.note = note;
        this.phase = 0;
        this.phaseDelta = phaseDelta;
        this.volume = 1;
        this.volumeDelta = 0;
    }
}

export function pitchToFrequency(pitch: number): number {
    const referencePitch: number = 69.0;
    const referenceFrequency: number = 440.0;
    return referenceFrequency * Math.pow(2.0, (pitch - referencePitch) / 12.0);
}

export class Synthesizer {
    public samplesPerSecond: number;
    public song: Song;
    public playing: boolean;
    public tick: number;
    public isAtStartOfTick: boolean;
    public tickSampleCountdown: number;
    public samplesPerTick: number;
    // @TODO: Use a deque-backed pool of `Tone`s.
    public activeTones: Tone[];
    public activeTonesByNoteId: Uint64ToUint32Table.Type;
    public pianoNotePitch: number | null;
    public pianoNotePhase: number;
    public pianoNotePhaseDelta: number;
    public playingPianoNote: boolean;

    constructor(samplesPerSecond: number) {
        this.samplesPerSecond = samplesPerSecond;
        this.song = makeSong();
        this.playing = false;
        this.tick = 0;
        this.isAtStartOfTick = false;
        this.samplesPerTick = Math.ceil(this.getSamplesPerTick()); // @TODO: Not sure if this should always be rounded.
        this.tickSampleCountdown = 0;
        this.activeTones = [];
        this.activeTonesByNoteId = Uint64ToUint32Table.make(32);
        this.pianoNotePitch = null;
        this.pianoNotePhase = 0;
        this.pianoNotePhaseDelta = 0;
        this.playingPianoNote = false;
    }

    public loadSong(song: Song): void {
        this.song = song;
    }

    public play(): void {
        this.playing = true;
    }

    public pause(): void {
        this.playing = false;
    }

    public stop(): void {
        this.playing = false;
        this.tick = 0;
        this.isAtStartOfTick = false;
        this.tickSampleCountdown = 0;
        this.activeTones = [];
        Uint64ToUint32Table.clear(this.activeTonesByNoteId);
    }

    public getSamplesPerTick(): number {
        const beatsPerMinute: number = 120; // This is really quarter notes per minute, but whatever.
        const secondsPerBeat: number = 60 / beatsPerMinute;
        const ticksPerBeat: number = this.song.ppqn;
        const secondsPerTick: number = secondsPerBeat / ticksPerBeat;
        const samplesPerTick: number = this.samplesPerSecond * secondsPerTick;
        return samplesPerTick;
    }

    private _determineActiveTones(): void {
        // @TODO: Inline findOverlapping manually.
        const activeTones: Tone[] = this.activeTones;
        const activeTonesByNoteId: Uint64ToUint32Table.Type = this.activeTonesByNoteId;
        const song: Song = this.song;
        const tick: number = this.tick;
        const samplesPerTick: number = this.samplesPerTick;
        const samplesPerSecond: number = this.samplesPerSecond;
        const secondsPerSample: number = 1 / samplesPerSecond;
        IITree.findOverlapping(
            song.notes,
            song.notesMaxLevel,
            tick,
            tick + 1,
            (note: Note, index: number) => {
                const activeToneTableIndex: number = Uint64ToUint32Table.getIndexFromKey(
                    activeTonesByNoteId,
                    note.idLo,
                    note.idHi,
                );
                if (activeToneTableIndex === -1) {
                    if (tick >= note.start && tick < note.end) {
                        // Note is supposed to be playing, but there's no active
                        // tones associated with it (note on).
                        const phaseDelta: number = pitchToFrequency(note.pitch) * secondsPerSample;
                        const tone: Tone = new Tone(note, phaseDelta);
                        const duration: number = note.end - note.start;
                        tone.volumeDelta = (0 - 1) / (duration * samplesPerTick);
                        Uint64ToUint32Table.set(
                            activeTonesByNoteId,
                            note.idLo,
                            note.idHi,
                            activeTones.length,
                        );
                        activeTones.push(tone);
                    }
                } else {
                    const activeToneIndex: number = Uint64ToUint32Table.getValueFromIndex(
                        activeTonesByNoteId,
                        activeToneTableIndex,
                    );
                    const existing: Tone = activeTones[activeToneIndex];
                    if (tick >= note.end) {
                        // Note is done.
                        existing.phaseDelta = 0;
                        existing.volumeDelta = 0;
                        existing.volume = 0;
                    } else {
                        const existingNote: Note = existing.note;
                        const oldDuration: number = existingNote.end - existingNote.start;
                        const newDuration: number = note.end - note.start;
                        if (newDuration > oldDuration || newDuration < oldDuration) {
                            // @TODO: This isn't correct but will do for now.
                            // Restart playing note if it's longer or shorter.
                            const newRemainingDuration: number = note.end - tick;
                            const phaseDelta: number = pitchToFrequency(note.pitch) * secondsPerSample;
                            existing.phaseDelta = phaseDelta;
                            existing.volumeDelta = (0 - 1) / (newRemainingDuration * samplesPerTick);
                            existing.volume = 1;
                        }
                    }
                    // Update reference.
                    existing.note = note;
                }
            },
        );
        for (let i: number = activeTones.length - 1; i >= 0; i--) {
            const tone: Tone = activeTones[i];
            if (tick >= tone.note.end) {
                const other: Tone = activeTones[activeTones.length - 1];
                Uint64ToUint32Table.set(
                    activeTonesByNoteId,
                    other.note.idLo,
                    other.note.idHi,
                    i,
                );
                Uint64ToUint32Table.remove(
                    activeTonesByNoteId,
                    tone.note.idLo,
                    tone.note.idHi,
                );
                activeTones[activeTones.length - 1] = tone;
                activeTones[i] = other;
                activeTones.pop();
            }
        }
    }

    public processBlock(
        size: number,
        outL: Float32Array,
        outR: Float32Array,
        playheadBuffer: Float32Array | null,
        timeTakenBuffer: Float32Array |  null,
    ): void {
        // @TODO: This shouldn't really be costing me much (I hope...), but in
        // case it is, add a way to only enable this for development builds.
        // Also what I really need is more precision than milliseconds (with
        // 128-sample blocks, our deadline is ~3ms!), but that depends on this:
        // https://github.com/WebAudio/web-audio-api/issues/2413
        const timeTakenStart: number = Date.now();

        const songDurationInTicks: number = this.song.patternDuration;

        let samplesRemaining: number = size;
        let bufferIndex: number = 0;

        if (this.playing)
        if (this.tickSampleCountdown <= 0) {
            this.isAtStartOfTick = true;
            this.tickSampleCountdown = this.samplesPerTick;
        }

        const previousTick: number = this.tick;
        const previousTickSampleCountdown: number = this.tickSampleCountdown;

        while (samplesRemaining > 0) {
            const runLength: number = Math.min(samplesRemaining, this.samplesPerTick);

            if (this.playing)
            if (this.isAtStartOfTick) {
                this._determineActiveTones();
            }

            const activeTones: Tone[] = this.activeTones;
            const activeToneCount: number = activeTones.length;
            for (let toneIndex: number = 0; toneIndex < activeToneCount; toneIndex++) {
                const tone: Tone = activeTones[toneIndex];

                let phase: number = tone.phase;
                let phaseDelta: number = tone.phaseDelta;
                let volume: number = tone.volume;
                let volumeDelta: number = tone.volumeDelta;

                for (let i: number = 0; i < runLength; i++) {
                    const outSample: number = Math.tanh(Math.sin(phase * Math.PI * 2) * 2) * 0.05 * volume;
                    phase += phaseDelta;
                    if (phase >= 1) phase -= 1;
                    volume += volumeDelta;

                    const outSampleL: number = outSample;
                    const outSampleR: number = outSample;

                    outL[bufferIndex + i] += outSampleL;
                    outR[bufferIndex + i] += outSampleR;
                }

                tone.phase = phase;
                tone.phaseDelta = phaseDelta;
                tone.volume = volume;
                tone.volumeDelta = volumeDelta;
            }

            if (this.playingPianoNote) {
                let phase: number = this.pianoNotePhase;
                let phaseDelta: number = this.pianoNotePhaseDelta;
                const volume: number = 1;

                for (let i: number = 0; i < runLength; i++) {
                    const outSample: number = Math.tanh(Math.sin(phase * Math.PI * 2) * 2) * 0.05 * volume;
                    phase += phaseDelta;
                    if (phase >= 1) phase -= 1;

                    const outSampleL: number = outSample;
                    const outSampleR: number = outSample;

                    outL[bufferIndex + i] += outSampleL;
                    outR[bufferIndex + i] += outSampleR;
                }

                this.pianoNotePhase = phase;
                this.pianoNotePhaseDelta = phaseDelta;
            }

            bufferIndex += runLength;
            if (this.playing) this.tickSampleCountdown -= runLength;
            samplesRemaining -= runLength;
            if (this.playing) this.isAtStartOfTick = false;

            if (this.playing)
            if (this.tickSampleCountdown <= 0) {
                this.isAtStartOfTick = true;
                this.tick++;
                this.tickSampleCountdown += this.samplesPerTick;

                // @TODO: I really need to look at voice allocation carefully.
                // This does seem less hacky than trying to figure out when wrap
                // around happens and use that in determineActiveTones (what I
                // initially did here just to get things going), but having to
                // defer wrapping around to after this seems fragile. It seems
                // that BeepBox doesn't defer this, but rather, if a note is on
                // its last tick, that's detected earlier, in the control-rate
                // code (i.e. computeTone).
                const activeTones: Tone[] = this.activeTones;
                const activeTonesByNoteId: Uint64ToUint32Table.Type = this.activeTonesByNoteId;
                for (let i: number = activeTones.length - 1; i >= 0; i--) {
                    const tone: Tone = activeTones[i];
                    if (this.tick >= tone.note.end) {
                        const other: Tone = activeTones[activeTones.length - 1];
                        Uint64ToUint32Table.set(
                            activeTonesByNoteId,
                            other.note.idLo,
                            other.note.idHi,
                            i,
                        );
                        Uint64ToUint32Table.remove(
                            activeTonesByNoteId,
                            tone.note.idLo,
                            tone.note.idHi,
                        );
                        activeTones[activeTones.length - 1] = tone;
                        activeTones[i] = other;
                        activeTones.pop();
                    }
                }

                if (this.tick >= songDurationInTicks) {
                    this.tick = 0;
                }
            }
        }

        if (this.playing)
        if (playheadBuffer != null) {
            const samplesPerTick: number = this.samplesPerTick;
            const invSamplesPerTick: number = 1 / samplesPerTick;
            const fraction: number = ((samplesPerTick - previousTickSampleCountdown) + (size - 1)) * invSamplesPerTick;
            playheadBuffer.fill(previousTick + fraction);
        }

        const timeTakenEnd: number = Date.now();
        if (timeTakenBuffer != null) timeTakenBuffer.fill(timeTakenEnd - timeTakenStart);
    }

    public playPianoNote(pitch: number): void {
        this.pianoNotePitch = pitch;
        this.pianoNotePhase = 0;
        this.pianoNotePhaseDelta = pitchToFrequency(pitch) / this.samplesPerSecond;
        this.playingPianoNote = true;
    }

    public stopPianoNote(pitch: number): void {
        this.pianoNotePitch = null;
        this.pianoNotePhase = 0;
        this.pianoNotePhaseDelta = 0;
        this.playingPianoNote = false;
    }
}
