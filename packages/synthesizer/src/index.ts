import * as IITree from "@synth-playground/common/iitree.js";
import * as Uint64ToUint32Table from "@synth-playground/common/hash/table/Uint64ToUint32Table.js";
import * as Uint32ToUint32Table from "@synth-playground/common/hash/table/Uint32ToUint32Table.js";
import * as Breakpoint from "./data/Breakpoint.js";
import * as Note from "./data/Note.js";
import * as Pattern from "./data/Pattern.js";
import * as Clip from "./data/Clip.js";
import * as SoundClipData from "./data/SoundClipData.js";
import * as Track from "./data/Track.js";
import * as Song from "./data/Song.js";
import * as Sound from "./data/Sound.js";
import * as TempoMap from "./data/TempoMap.js";

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

function computeSamplesPerTick(
    samplesPerSecond: number,
    tick: number,
    ppqn: number,
    tempo: number,
    tempoEnvelope: Breakpoint.Type[] | null,
): number {
    const tempoEnvelopeIndex: number = Breakpoint.findIndex(tempoEnvelope, tick);
    const beatsPerMinute: number = Breakpoint.evaluateTempoEnvelope(tempoEnvelope!, tick, tempoEnvelopeIndex, tempo);
    const secondsPerBeat: number = 60 / beatsPerMinute;
    const ticksPerBeat: number = ppqn;
    const secondsPerTick: number = secondsPerBeat / ticksPerBeat;
    const samplesPerTick: number = samplesPerSecond * secondsPerTick;
    return samplesPerTick;
}

// @TODO: Rename to Voice? VoiceState? NoteState?
class Tone {
    public note: Note.Type;
    public phase: number;
    public phaseDelta: number;
    public phaseDeltaScale: number;
    public volume: number;
    public volumeDelta: number;

    // If true, the corresponding note was found in the interval tree search in
    // determineActiveTones. This should be set to false once the control rate
    // calculations for the tone execute.
    // If we're running the control rate calculations and this is false, then
    // the tone is terminated. This means that the note was changed under us
    // (i.e. it was playing, but now it does not overlap the playhead, or it was
    // deleted).
    public seenInToneSearch: boolean;

    public isOnLastTick: boolean;

    constructor(note: Note.Type, phaseDelta: number) {
        this.note = note;
        this.phase = 0;
        this.phaseDelta = phaseDelta;
        this.phaseDeltaScale = 1.0;
        this.volume = 1;
        this.volumeDelta = 0;
        this.seenInToneSearch = false;
        this.isOnLastTick = false;
    }
}

export function pitchToFrequency(pitch: number): number {
    const referencePitch: number = 69.0;
    const referenceFrequency: number = 440.0;
    return referenceFrequency * Math.pow(2.0, (pitch - referencePitch) / 12.0);
}

class ClipState {
    public clip: Clip.Type;

    // If true, the corresponding clip was found in the interval tree search in
    // determineActiveClips. This should be set to false once the control rate
    // calculations for the clip execute.
    // If we're running the control rate calculations and this is false, then
    // the clip is terminated. This means that the clip was changed under us
    // (i.e. it was playing, but now it does not overlap the playhead, or it was
    // deleted).
    public seenInClipSearch: boolean;

    public isOnLastTick: boolean;
    // @TODO: Use a deque-backed pool of `Tone`s.
    public activeTones: (Tone | null)[];
    public activeTonesLength: number;
    public activeTonesByNoteId: Uint64ToUint32Table.Type;
    public absoluteStartTimeInSamples: number;

    constructor(clip: Clip.Type) {
        this.clip = clip;
        this.seenInClipSearch = false;
        this.isOnLastTick = false;
        this.activeTones = [];
        this.activeTonesLength = 0;
        this.activeTonesByNoteId = Uint64ToUint32Table.make(32);
        this.absoluteStartTimeInSamples = 0;
    }

    public pushActiveTone(tone: Tone): void {
        if (this.activeTonesLength === this.activeTones.length) {
            this.activeTones.push(tone);
        } else {
            this.activeTones[this.activeTonesLength] = tone;
        }
        this.activeTonesLength++;
    }

    public popActiveTone(): void {
        if (this.activeTonesLength <= 0) return;
        this.activeTones[this.activeTonesLength - 1] = null;
        this.activeTonesLength--;
    }
}

class TrackState {
    // @TODO: Use a deque-backed pool of `ClipStates`s.
    public activeClips: (ClipState | null)[];
    public activeClipsLength: number;
    public activeClipsByClipId: Uint64ToUint32Table.Type;
    public muted: boolean;

    constructor() {
        this.activeClips = [];
        this.activeClipsLength = 0;
        this.activeClipsByClipId = Uint64ToUint32Table.make(4);
        this.muted = false;
    }

    public pushActiveClip(clip: ClipState): void {
        if (this.activeClipsLength === this.activeClips.length) {
            this.activeClips.push(clip);
        } else {
            this.activeClips[this.activeClipsLength] = clip;
        }
        this.activeClipsLength++;
    }

    public popActiveClip(): void {
        if (this.activeClipsLength <= 0) {
            return;
        }
        // this.activeClips[this.activeClipsLength - 1] = null;
        this.activeClipsLength--;
    }
}

const WAVEFORM_TABLE_SIZE: number = 512;
const WAVEFORM_TABLE_MASK: number = WAVEFORM_TABLE_SIZE - 1;
const WAVEFORM_TABLE: Float64Array = new Float64Array(WAVEFORM_TABLE_SIZE);
for (let i: number = 0; i < WAVEFORM_TABLE_SIZE; i++) {
    const phase = i / WAVEFORM_TABLE_SIZE;
    WAVEFORM_TABLE[i] = Math.tanh(Math.sin(phase * Math.PI * 2) * 2);
}

function evaluateWaveform(phase: number): number {
    const scaled: number = phase * (+WAVEFORM_TABLE_SIZE);
    const i0: number = scaled & WAVEFORM_TABLE_MASK;
    const i1: number = (scaled + 1.0) & WAVEFORM_TABLE_MASK;
    const a: number = WAVEFORM_TABLE[i0];
    const b: number = WAVEFORM_TABLE[i1];
    const t: number = scaled - i0;
    return a * (1.0 - t) + b * t;
}

export class Synthesizer {
    public samplesPerSecond: number;
    public song: Song.Type;
    public playing: boolean;
    public tick: number;
    public isAtStartOfTick: boolean;
    public tickSampleCountdown: number;
    public samplesPerTick: number;
    public trackStates: TrackState[];
    public pianoNotePitch: number | null;
    public pianoNotePhase: number;
    public pianoNotePhaseDelta: number;
    public pianoNoteVolume: number;
    public pianoNoteVolumeDelta: number;
    public playingPianoNote: boolean;
    public assumptionsAreInvalid: boolean;
    public sounds: Sound.Type[];
    public soundsById: Uint32ToUint32Table.Type;
    public absoluteSongTimeInSamples: number;

    constructor(samplesPerSecond: number) {
        this.samplesPerSecond = samplesPerSecond;
        this.song = Song.make();
        this.playing = false;
        this.tick = 0;
        this.isAtStartOfTick = false;
        this.samplesPerTick = computeSamplesPerTick(
            this.samplesPerSecond,
            this.tick,
            this.song.ppqn,
            this.song.tempo,
            this.song.tempoEnvelope,
        );
        this.tickSampleCountdown = 0;
        this.trackStates = [];
        this.pianoNotePitch = null;
        this.pianoNotePhase = 0;
        this.pianoNotePhaseDelta = 0;
        this.pianoNoteVolume = 0;
        this.pianoNoteVolumeDelta = 0;
        this.playingPianoNote = false;
        this.assumptionsAreInvalid = false;
        this.sounds = [];
        this.soundsById = Uint32ToUint32Table.make(4);
        this.absoluteSongTimeInSamples = 0;
    }

    public loadSong(song: Song.Type): void {
        this.song = song;
        this.assumptionsAreInvalid = true;
    }

    public clearSounds(): void {
        // @TODO: This is a bit weird. I think loadSong probably should do this,
        // and then there should be another method for updating a loaded song,
        // which would not clear this.
        this.sounds = [];
        Uint32ToUint32Table.clear(this.soundsById);
        this.assumptionsAreInvalid = true;
    }

    public loadSound(sound: Sound.Type): void {
        let index: number = this.sounds.length;
        const existingIndex: number | undefined = Uint32ToUint32Table.get(this.soundsById, sound.id);
        if (existingIndex != null) {
            index = existingIndex;
        }

        if (index === this.sounds.length) {
            this.sounds.push(sound);
        } else {
            this.sounds[index] = sound;
        }
        Uint32ToUint32Table.set(this.soundsById, sound.id, index);

        this.assumptionsAreInvalid = true;
    }

    public syncTrackStates(): void {
        const trackCount: number = this.song.tracks.length;
        while (trackCount > this.trackStates.length) {
            this.trackStates.push(new TrackState());
        }
        this.trackStates.length = trackCount;
        for (let i: number = 0; i < trackCount; i++) {
            const track: Track.Type = this.song.tracks[i];
            const trackState: TrackState = this.trackStates[i];
            if (trackState.muted !== track.muted) {
                trackState.muted = track.muted;
            }
        }
    }

    public goToStart(): void {
        this.tick = 0;
        this.tickSampleCountdown = 0;
        this.isAtStartOfTick = true;
        this.absoluteSongTimeInSamples = 0;
        this.assumptionsAreInvalid = true;
    }

    public seek(tick: number): void {
        const duration: number = this.song.duration;
        this.tick = ((tick | 0) % duration + duration) % duration;
        this.tickSampleCountdown = 0;
        this.isAtStartOfTick = true;
        this.assumptionsAreInvalid = true;
    }

    public play(): void {
        this.playing = true;
        this.assumptionsAreInvalid = true;
    }

    public pause(): void {
        this.playing = false;
        this.assumptionsAreInvalid = true;
    }

    public stop(): void {
        this.playing = false;
        this.tick = 0;
        this.isAtStartOfTick = false;
        this.tickSampleCountdown = 0;
        this.absoluteSongTimeInSamples = 0;
        const trackCount: number = this.trackStates.length;
        for (let i: number = 0; i < trackCount; i++) {
            const trackState: TrackState = this.trackStates[i];
            trackState.activeClips = [];
            trackState.activeClipsLength = 0;
            Uint64ToUint32Table.clear(trackState.activeClipsByClipId);
        }
        this.assumptionsAreInvalid = true;
    }

    private _determineActiveClips(trackIndex: number): void {
        // @TODO: Inline findOverlapping manually.
        const song: Song.Type = this.song;
        const track: Track.Type = song.tracks[trackIndex];
        const trackState: TrackState = this.trackStates[trackIndex];
        const activeClips: (ClipState | null)[] = trackState.activeClips;
        const activeClipsByClipId: Uint64ToUint32Table.Type = trackState.activeClipsByClipId;
        const tick: number = this.tick;
        // const samplesPerTick: number = this.samplesPerTick;
        // const samplesPerSecond: number = this.samplesPerSecond;
        // const secondsPerSample: number = 1 / samplesPerSecond;
        IITree.findOverlapping(
            track.clips,
            track.clipsMaxLevel,
            tick,
            tick + 1,
            (clip: Clip.Type, index: number) => {
                const activeClipTableIndex: number = Uint64ToUint32Table.getIndexFromKey(
                    activeClipsByClipId,
                    clip.idLo,
                    clip.idHi,
                );
                if (activeClipTableIndex === -1) {
                    if (tick >= clip.start && tick < clip.end) {
                        // Clip is supposed to be playing, but there's no active
                        // clip state associated with it (like note on).
                        const clipState: ClipState = new ClipState(clip);
                        Uint64ToUint32Table.set(
                            activeClipsByClipId,
                            clip.idLo,
                            clip.idHi,
                            trackState.activeClipsLength,
                        );
                        clipState.seenInClipSearch = true;
                        if (tick === clip.end - 1) clipState.isOnLastTick = true;
                        trackState.pushActiveClip(clipState);
                    }
                } else {
                    const activeClipIndex: number = Uint64ToUint32Table.getValueFromIndex(
                        activeClipsByClipId,
                        activeClipTableIndex,
                    );
                    const existing: ClipState = activeClips[activeClipIndex]!;
                    const existingClip: Clip.Type = existing.clip;
                    if (tick >= existingClip.end - 1) {
                        // Clip is done.
                        existing.isOnLastTick = true;
                    } else {
                        const oldStart: number = existingClip.start;
                        const oldEnd: number = existingClip.end;
                        const newStart: number = clip.start;
                        const newEnd: number = clip.end;
                        if (newStart !== oldStart || newEnd !== oldEnd) {
                            // Stop clip if it's longer, shorter, or it moved around.
                            existing.isOnLastTick = true;
                        }
                    }
                    existing.seenInClipSearch = true;
                    // Update reference.
                    existing.clip = clip;
                }
            },
        );
    }

    private _determineActiveTones(
        trackIndex: number,
        clipIndex: number,
        patternIndex: number,
    ): void {
        // @TODO: Inline findOverlapping manually.
        const song: Song.Type = this.song;
        // const track: Track = song.tracks[trackIndex];
        const trackState: TrackState = this.trackStates[trackIndex];
        const activeClips: (ClipState | null)[] = trackState.activeClips;
        const clipState: ClipState = activeClips[clipIndex]!;
        const clip: Clip.Type = clipState.clip;
        const clipStart: number = clip.start;
        // const clipEnd: number = clip.end;
        const pattern: Pattern.Type = song.patterns[patternIndex];
        const activeTones: (Tone | null)[] = clipState.activeTones;
        const activeTonesByNoteId: Uint64ToUint32Table.Type = clipState.activeTonesByNoteId;
        const tick: number = (this.tick - clipStart) % pattern.duration;
        // @TODO: Use startOffset
        const samplesPerTick: number = this.samplesPerTick;
        const ticksPerSample: number = 1 / samplesPerTick;
        const samplesPerSecond: number = this.samplesPerSecond;
        const secondsPerSample: number = 1 / samplesPerSecond;
        IITree.findOverlapping(
            pattern.notes,
            pattern.notesMaxLevel,
            tick,
            tick + 1,
            (note: Note.Type, index: number) => {
                const activeToneTableIndex: number = Uint64ToUint32Table.getIndexFromKey(
                    activeTonesByNoteId,
                    note.idLo,
                    note.idHi,
                );
                if (activeToneTableIndex === -1) {
                    if (tick >= note.start && tick < note.end) {
                        // Note is supposed to be playing, but there's no active
                        // tone associated with it (note on).
                        const phaseDelta: number = pitchToFrequency(note.pitch) * secondsPerSample;
                        const tone: Tone = new Tone(note, phaseDelta);
                        const progress0: number = tick - note.start;
                        const progress1: number = progress0 + 1;
                        const volumeEnvelope: Breakpoint.Type[] | null = note.volumeEnvelope;
                        const pitchEnvelope: Breakpoint.Type[] | null = note.pitchEnvelope;
                        if (volumeEnvelope != null) {
                            const volumeI: number = Breakpoint.findIndex(volumeEnvelope, progress0);
                            const volume0: number = Breakpoint.evaluateNoteEnvelope(volumeEnvelope, progress0, volumeI, 1.0);
                            const volume1: number = Breakpoint.evaluateNoteEnvelope(volumeEnvelope, progress1, volumeI, 1.0);
                            tone.volume = volume0;
                            tone.volumeDelta = (volume1 - volume0) * ticksPerSample;
                        } else {
                            tone.volume = 1;
                            tone.volumeDelta = 0;
                        }
                        if (pitchEnvelope != null) {
                            const pitch: number = note.pitch;
                            const pitchI: number = Breakpoint.findIndex(pitchEnvelope, progress0);
                            const pitch0: number = Breakpoint.evaluateNoteEnvelope(pitchEnvelope, progress0, pitchI, 0.0);
                            const pitch1: number = Breakpoint.evaluateNoteEnvelope(pitchEnvelope, progress1, pitchI, 0.0);
                            const phaseDelta0: number = pitchToFrequency(pitch + pitch0);
                            const phaseDelta1: number = pitchToFrequency(pitch + pitch1);
                            tone.phaseDelta = phaseDelta0 * secondsPerSample;
                            tone.phaseDeltaScale = Math.pow(phaseDelta1 / phaseDelta0, ticksPerSample);
                        }
                        Uint64ToUint32Table.set(
                            activeTonesByNoteId,
                            note.idLo,
                            note.idHi,
                            clipState.activeTonesLength,
                        );
                        tone.seenInToneSearch = true;
                        if (tick === note.end - 1) tone.isOnLastTick = true;
                        clipState.pushActiveTone(tone);
                    }
                } else {
                    const activeToneIndex: number = Uint64ToUint32Table.getValueFromIndex(
                        activeTonesByNoteId,
                        activeToneTableIndex,
                    );
                    const existing: Tone = activeTones[activeToneIndex]!;
                    const existingNote: Note.Type = existing.note;
                    if (tick >= existingNote.end - 1 || clipState.isOnLastTick) {
                        // Note is done.
                        // existing.volumeDelta = (0 - existing.volume) / (1 * samplesPerTick);
                        existing.isOnLastTick = true;
                    } else {
                        const oldStart: number = existingNote.start;
                        const oldEnd: number = existingNote.end;
                        const newStart: number = note.start;
                        const newEnd: number = note.end;
                        if (newStart !== oldStart || newEnd !== oldEnd || clipState.isOnLastTick) {
                            // Stop note if it's longer, shorter, or it moved around.
                            // const newRemainingDuration: number = Math.max(1, (newEnd - newStart) - (tick - newStart));
                            const newRemainingDuration: number = 1;
                            existing.volumeDelta = (0 - existing.volume) / (newRemainingDuration * samplesPerTick);
                            existing.isOnLastTick = true;
                        } else {
                            const progress0: number = tick - existingNote.start;
                            const progress1: number = progress0 + 1;
                            const volumeEnvelope: Breakpoint.Type[] | null = existingNote.volumeEnvelope;
                            const pitchEnvelope: Breakpoint.Type[] | null = existingNote.pitchEnvelope;
                            if (volumeEnvelope != null) {
                                const volumeI: number = Breakpoint.findIndex(volumeEnvelope, progress0);
                                const volume0: number = Breakpoint.evaluateNoteEnvelope(volumeEnvelope, progress0, volumeI, 1.0);
                                const volume1: number = Breakpoint.evaluateNoteEnvelope(volumeEnvelope, progress1, volumeI, 1.0);
                                existing.volume = volume0;
                                existing.volumeDelta = (volume1 - volume0) * ticksPerSample;
                            }
                            if (pitchEnvelope != null) {
                                const pitch: number = existingNote.pitch;
                                const pitchI: number = Breakpoint.findIndex(pitchEnvelope, progress0);
                                const pitch0: number = Breakpoint.evaluateNoteEnvelope(pitchEnvelope, progress0, pitchI, 0.0);
                                const pitch1: number = Breakpoint.evaluateNoteEnvelope(pitchEnvelope, progress1, pitchI, 0.0);
                                const phaseDelta0: number = pitchToFrequency(pitch + pitch0);
                                const phaseDelta1: number = pitchToFrequency(pitch + pitch1);
                                existing.phaseDelta = phaseDelta0 * secondsPerSample;
                                existing.phaseDeltaScale = Math.pow(phaseDelta1 / phaseDelta0, ticksPerSample);
                            }
                        }
                    }
                    existing.seenInToneSearch = true;
                    // Update reference.
                    existing.note = note;
                }
            },
        );
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

        const songDurationInTicks: number = this.song.duration;

        this.syncTrackStates();

        let bufferIndex: number = 0;

        if (this.tickSampleCountdown <= 0) {
            this.isAtStartOfTick = true;
            this.samplesPerTick = computeSamplesPerTick(
                this.samplesPerSecond,
                this.tick,
                this.song.ppqn,
                this.song.tempo,
                this.song.tempoEnvelope,
            );
            this.tickSampleCountdown = this.samplesPerTick;
        }

        if (this.playing && this.assumptionsAreInvalid) {
            const fractionalTick: number = (
                this.tick
                + (this.samplesPerTick - this.tickSampleCountdown) / this.samplesPerTick
            );

            const tempoMap: TempoMap.Type = this.song.tempoMap;
            this.absoluteSongTimeInSamples = TempoMap.computeSecondsFromTick(
                tempoMap.sections,
                TempoMap.findSectionIndexByTick(
                    tempoMap.sections,
                    fractionalTick,
                ),
                fractionalTick,
            ) * this.samplesPerSecond;
        }

        const previousTick: number = this.tick;
        const previousTickSampleCountdown: number = this.tickSampleCountdown;

        const song: Song.Type = this.song;
        // const patterns: Pattern[] = song.patterns;
        const patternsById: Uint64ToUint32Table.Type = song.patternsById;
        const tracks: Track.Type[] = song.tracks;
        const trackCount: number = tracks.length;
        const trackStates: TrackState[] = this.trackStates;

        while (bufferIndex < size) {
            const samplesLeftInBuffer: number = size - bufferIndex;
            const samplesLeftInTick: number = Math.ceil(this.tickSampleCountdown);
            const runLength: number = Math.min(samplesLeftInBuffer, samplesLeftInTick);

            if (this.playing)
            for (let trackIndex: number = 0; trackIndex < trackCount; trackIndex++) {
                // const track: Track = tracks[trackIndex];
                const trackState: TrackState = trackStates[trackIndex];

                if (this.isAtStartOfTick) {
                    this._determineActiveClips(trackIndex);

                    const activeClips: (ClipState | null)[] = trackState.activeClips;
                    const activeClipCount: number = trackState.activeClipsLength;
                    for (let clipIndex: number = 0; clipIndex < activeClipCount; clipIndex++) {
                        const activeClip: ClipState = activeClips[clipIndex]!;
                        const clip: Clip.Type = activeClip.clip;
                        if (clip.kind === Clip.Kind.Pattern) {
                            const patternIdLo: number = clip.patternIdLo;
                            const patternIdHi: number = clip.patternIdHi;
                            const patternTableIndex: number = Uint64ToUint32Table.getIndexFromKey(
                                patternsById,
                                patternIdLo,
                                patternIdHi,
                            );
                            if (patternTableIndex !== -1) {
                                const patternIndex: number = Uint64ToUint32Table.getValueFromIndex(patternsById, patternTableIndex);
                                this._determineActiveTones(trackIndex, clipIndex, patternIndex);
                            }
                        } else if (clip.kind === Clip.Kind.Sound) {
                            // @TODO: This only needs to be done for the equivalent of "note on" for clips.
                            const startTick: number = clip.start;
                            const tempoMap: TempoMap.Type = this.song.tempoMap;
                            const absoluteStartTimeInSeconds: number = TempoMap.computeSecondsFromTick(
                                tempoMap.sections,
                                TempoMap.findSectionIndexByTick(
                                    tempoMap.sections,
                                    startTick,
                                ),
                                startTick,
                            );
                            const absoluteStartTimeInSamples: number = absoluteStartTimeInSeconds * this.samplesPerSecond;
                            activeClip.absoluteStartTimeInSamples = absoluteStartTimeInSamples;
                        }
                    }
                }

                const activeClips: (ClipState | null)[] = trackState.activeClips;
                const activeClipCount: number = trackState.activeClipsLength;
                for (let clipIndex: number = 0; clipIndex < activeClipCount; clipIndex++) {
                    const activeClip: ClipState = activeClips[clipIndex]!;

                    if (this.isAtStartOfTick) {
                        if (activeClip.seenInClipSearch) {
                            activeClip.seenInClipSearch = false;
                        } else {
                            // Clip changed under us, and we couldn't find it
                            // with the playhead, so stop it.
                            activeClip.isOnLastTick = true;
                        }
                    }

                    if (activeClip.clip.kind === Clip.Kind.Pattern) {
                        const activeTones: (Tone | null)[] = activeClip.activeTones;
                        const activeToneCount: number = activeClip.activeTonesLength;
                        for (let toneIndex: number = 0; toneIndex < activeToneCount; toneIndex++) {
                            const tone: Tone = activeTones[toneIndex]!;

                            if (this.isAtStartOfTick) {
                                if (tone.seenInToneSearch) {
                                    tone.seenInToneSearch = false;
                                    if (activeClip.isOnLastTick) {
                                        // Clip is done, so stop here.
                                        tone.volumeDelta = (0 - tone.volume) / (1 * this.samplesPerTick);
                                        tone.isOnLastTick = true;
                                    }
                                } else {
                                    // Note changed under us, and we couldn't find
                                    // it with the playhead, so stop it.
                                    tone.volumeDelta = (0 - tone.volume) / (1 * this.samplesPerTick);
                                    tone.isOnLastTick = true;
                                }
                            }

                            let phase: number = tone.phase;
                            let phaseDelta: number = tone.phaseDelta;
                            let phaseDeltaScale: number = tone.phaseDeltaScale;
                            let volume: number = tone.volume;
                            let volumeDelta: number = tone.volumeDelta;

                            for (let i: number = 0; i < runLength; i++) {
                                // const outSample: number = Math.tanh(Math.sin(phase * Math.PI * 2) * 2) * 0.05 * volume;
                                const outSample: number = evaluateWaveform(phase) * 0.05 * volume;
                                phase += phaseDelta;
                                if (phase >= 1) phase -= 1;
                                phaseDelta *= phaseDeltaScale;
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
                    } else if (activeClip.clip.kind === Clip.Kind.Sound) {
                        const soundId: number = activeClip.clip.soundId;
                        const soundTableIndex: number = Uint32ToUint32Table.getIndexFromKey(this.soundsById, soundId);
                        if (soundTableIndex !== -1) {
                            const soundIndex: number = Uint32ToUint32Table.getValueFromIndex(
                                this.soundsById,
                                soundTableIndex
                            );
                            const sound: Sound.Type = this.sounds[soundIndex];
                            const dataL: Float32Array = sound.dataL;
                            const dataR: Float32Array = sound.dataR != null ? sound.dataR : sound.dataL;
                            const soundLength: number = dataL.length;

                            const soundClipData: SoundClipData.Type | null = activeClip.clip.soundClipData;
                            const startOffsetInSeconds: number = soundClipData != null ? soundClipData.startOffset : 0;
                            const startOffsetInSamples: number = startOffsetInSeconds * this.samplesPerSecond;

                            const speed: number = 1;
                            let t: number = (
                                (this.absoluteSongTimeInSamples - activeClip.absoluteStartTimeInSamples) * speed
                                + startOffsetInSamples
                            ) % soundLength;
                            for (let i: number = 0; i < runLength; i++) {
                                const sampleIndex0: number = Math.floor(t);
                                const sampleFract: number = t - sampleIndex0;
                                const sampleIndex1: number = (sampleIndex0 + 1) % soundLength;
                                const sampleL0: number = dataL[sampleIndex0];
                                const sampleL1: number = dataL[sampleIndex1];
                                const sampleR0: number = dataR[sampleIndex0];
                                const sampleR1: number = dataR[sampleIndex1];
                                const outSampleL: number = sampleL0 * (1 - sampleFract) + sampleL1 * sampleFract;
                                const outSampleR: number = sampleR0 * (1 - sampleFract) + sampleR1 * sampleFract;
                                outL[bufferIndex + i] += outSampleL;
                                outR[bufferIndex + i] += outSampleR;
                                t = (t + speed) % soundLength;
                            }
                        }
                    }
                }
            }

            if (this.playingPianoNote) {
                if (this.pianoNoteVolume <= 0) {
                    this.playingPianoNote = false;
                    this.pianoNotePitch = null;
                } else {
                    let phase: number = this.pianoNotePhase;
                    let phaseDelta: number = this.pianoNotePhaseDelta;
                    let volume: number = this.pianoNoteVolume;
                    let volumeDelta: number = this.pianoNoteVolumeDelta;

                    for (let i: number = 0; i < runLength; i++) {
                        // const outSample: number = Math.tanh(Math.sin(phase * Math.PI * 2) * 2) * 0.05 * volume;
                        const outSample: number = evaluateWaveform(phase) * 0.05 * volume;
                        phase += phaseDelta;
                        if (phase >= 1) phase -= 1;
                        volume += volumeDelta;

                        const outSampleL: number = outSample;
                        const outSampleR: number = outSample;

                        outL[bufferIndex + i] += outSampleL;
                        outR[bufferIndex + i] += outSampleR;
                    }

                    this.pianoNotePhase = phase;
                    this.pianoNotePhaseDelta = phaseDelta;
                    this.pianoNoteVolume = volume;
                    this.pianoNoteVolumeDelta = volumeDelta;
                }
            }

            bufferIndex += runLength;
            this.tickSampleCountdown -= runLength;
            if (this.playing) {
                this.absoluteSongTimeInSamples += runLength;
            }
            this.isAtStartOfTick = false;

            if (this.tickSampleCountdown <= 0) {
                this.isAtStartOfTick = true;
                this.tick++;
                this.samplesPerTick = computeSamplesPerTick(
                    this.samplesPerSecond,
                    this.tick,
                    this.song.ppqn,
                    this.song.tempo,
                    this.song.tempoEnvelope,
                );
                this.tickSampleCountdown += this.samplesPerTick;

                for (let trackIndex: number = 0; trackIndex < trackCount; trackIndex++) {
                    // const track: Track = tracks[trackIndex];
                    const trackState: TrackState = trackStates[trackIndex];
                    const activeClips: (ClipState | null)[] = trackState.activeClips;
                    const activeClipsByClipId: Uint64ToUint32Table.Type = trackState.activeClipsByClipId;
                    for (let clipIndex: number = trackState.activeClipsLength - 1; clipIndex >= 0; clipIndex--) {
                        const clipState: ClipState = activeClips[clipIndex]!;
                        const clip: Clip.Type = clipState.clip;
                        // const clipStart: number = clip.start;
                        // const clipEnd: number = clip.end;
                        const activeTones: (Tone | null)[] = clipState.activeTones;
                        const activeTonesByNoteId: Uint64ToUint32Table.Type = clipState.activeTonesByNoteId;
                        // const tick: number = this.tick - clipStart;
                        for (let toneIndex: number = clipState.activeTonesLength - 1; toneIndex >= 0; toneIndex--) {
                            const tone: Tone = activeTones[toneIndex]!;
                            if (tone.isOnLastTick || clipState.isOnLastTick) {
                                const other: Tone = activeTones[clipState.activeTonesLength - 1]!;
                                Uint64ToUint32Table.set(
                                    activeTonesByNoteId,
                                    other.note.idLo,
                                    other.note.idHi,
                                    toneIndex,
                                );
                                Uint64ToUint32Table.remove(
                                    activeTonesByNoteId,
                                    tone.note.idLo,
                                    tone.note.idHi,
                                );
                                activeTones[clipState.activeTonesLength - 1] = tone;
                                activeTones[toneIndex] = other;
                                clipState.popActiveTone();
                            }
                        }
                        if (clipState.isOnLastTick) {
                            const other: ClipState = activeClips[trackState.activeClipsLength - 1]!;
                            Uint64ToUint32Table.set(
                                activeClipsByClipId,
                                other.clip.idLo,
                                other.clip.idHi,
                                clipIndex,
                            );
                            Uint64ToUint32Table.remove(
                                activeClipsByClipId,
                                clip.idLo,
                                clip.idHi,
                            );
                            activeClips[trackState.activeClipsLength - 1] = clipState;
                            activeClips[clipIndex] = other;
                            trackState.popActiveClip();
                        }
                    }
                }

                if (this.tick >= songDurationInTicks) {
                    this.tick = 0;
                    this.absoluteSongTimeInSamples = 0;
                }
            }
        }

        this.assumptionsAreInvalid = false;

        if (this.playing)
        if (playheadBuffer != null) {
            const samplesPerTick: number = this.samplesPerTick;
            const invSamplesPerTick: number = 1 / samplesPerTick;
            const fraction: number = ((samplesPerTick - previousTickSampleCountdown) + (size - 1)) * invSamplesPerTick;
            const disambiguator: number = 1;
            playheadBuffer[playheadBuffer.length - 1] = (previousTick + fraction) + disambiguator;
        }

        const timeTakenEnd: number = Date.now();
        if (timeTakenBuffer != null) {
            const disambiguator: number = 1;
            timeTakenBuffer[timeTakenBuffer.length - 1] = (timeTakenEnd - timeTakenStart) + disambiguator;
        }
    }

    public playPianoNote(pitch: number): void {
        this.pianoNotePitch = pitch;
        this.pianoNotePhase = 0;
        this.pianoNotePhaseDelta = pitchToFrequency(pitch) / this.samplesPerSecond;
        this.pianoNoteVolume = 1;
        this.pianoNoteVolumeDelta = 0;
        this.playingPianoNote = true;
    }

    public stopPianoNote(pitch: number): void {
        // this.pianoNotePitch = null;
        // this.pianoNotePhase = 0;
        // this.pianoNotePhaseDelta = 0;
        // @TODO: This is sloppy. I should at the very least make this based on
        // the tick size in samples, that way there won't be issues with the
        // volume going negative.
        this.pianoNoteVolumeDelta = (0 - this.pianoNoteVolume) / (0.1 * this.samplesPerSecond);
        // this.playingPianoNote = false;
    }
}
