import { clamp, unlerp, linearToDecibels } from "@synth-playground/common/math.js";
import * as LongId from "@synth-playground/common/LongId.js";
import * as Uint64ToUint32Table from "@synth-playground/common/hash/table/Uint64ToUint32Table.js";
import * as Uint32ToUint32Table from "@synth-playground/common/hash/table/Uint32ToUint32Table.js";
import { ValueAnalyser } from "@synth-playground/browser/ValueAnalyser.js";
import * as Project from "@synth-playground/synthesizer/data/Project.js";
import * as Song from "@synth-playground/synthesizer/data/Song.js";
import * as Track from "@synth-playground/synthesizer/data/Track.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import * as SoundClipData from "@synth-playground/synthesizer/data/SoundClipData.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Breakpoint from "@synth-playground/synthesizer/data/Breakpoint.js";
import * as TempoMap from "@synth-playground/synthesizer/data/TempoMap.js";
import * as Sound from "@synth-playground/synthesizer/data/Sound.js";
import { TimeStretchMode } from "@synth-playground/synthesizer/data/TimeStretchMode.js";
import { makeIdGenerator } from "@synth-playground/synthesizer/data/common.js";
// import audioWorkletCode from "inlineworker!@synth-playground/main-audio-worklet";
import audioWorkletUrl from "inlineworker!@synth-playground/main-audio-worklet";
import { MessageKind } from "@synth-playground/main-audio-worklet/MessageKind.js";
import { NotePitchBoundsTracker } from "./data/NotePitchBoundsTracker.js";
import { type PatternInfo } from "./data/PatternInfo.js";
import * as Peaks from "./data/Peaks.js";
import * as TrackMeterState from "./data/TrackMeterState.js";

// @TODO: Use the vscode design where .event can be used to register a listener,
// but the emitter is not accessible from the outside.
type Listener = () => void;

class Emitter {
    private _listeners: Listener[];

    constructor() {
        this._listeners = [];
    }

    public addListener(listener: Listener): void {
        // It's slow to use linear search for finding duplicates like this, but
        // this shouldn't be an issue right now.
        const existingIndex: number = this._listeners.indexOf(listener);
        if (existingIndex === -1) {
            this._listeners.push(listener);
        }
    }

    public removeListener(listener: Listener): void {
        const existingIndex: number = this._listeners.indexOf(listener);
        if (existingIndex !== -1) {
            this._listeners.splice(existingIndex, 1);
        }
    }

    public notifyListeners(): void {
        const count: number = this._listeners.length;
        for (let index: number = 0; index < count; index++) {
            const listener: Listener = this._listeners[index];
            listener();
        }
    }
}

export class SongDocument {
    public project: Project.Type;
    public onProjectChanged: Emitter;
    public onStartedPlaying: Emitter;
    public onStoppedPlaying: Emitter;
    public onStartedPlayingPianoNote: Emitter;
    public onStoppedPlayingPianoNote: Emitter;
    public onChangedPianoRollPattern: Emitter;
    public onSeekAndMoveTimeCursor: Emitter;
    public onTracksChanged: Emitter;
    public playing: boolean; // @TODO: Use a bitfield for this?
    public playingPianoNote: boolean;
    public stopPianoNoteTimeout: number;
    public audioContext: AudioContext | null;
    public samplesPerSecond: number;
    public fftSize: number;
    public outputAnalyserNode: AnalyserNode | null;
    public outputAnalyserBuffer: Float32Array | null;
    public outputAnalyserFreqBuffer: Float32Array | null;
    public outputAnalyserFreqCounter: number | null;
    public outputAnalyserTimeCounter: number | null;
    public playheadAnalyser: ValueAnalyser<number | null>;
    public timeTakenAnalyser: ValueAnalyser<number>;
    public trackMeterStates: TrackMeterState.Type[];
    public trackMeterAnalyser: ValueAnalyser<void>;
    public audioWorkletNode: AudioWorkletNode | null;
    public sentSongForTheFirstTime: boolean; // @TODO: Use a version number?
    public patternInfoCache: WeakMap<Pattern.Type, PatternInfo>;
    public peaksCache: WeakMap<Sound.Type, Peaks.Type>;
    public pianoRollPatternIndex: number;
    public pianoRollTrackIndex: number;
    public pianoRollClipIndex: number;
    public timeCursor: number;
    public shouldShowTempoEnvelope: boolean;
    public soundVersionsPresentInAudioThread: Map<number, number>; // sound id -> sound version
    private _markProjectAsDirtyRequest: number | null;

    constructor() {
        this.patternInfoCache = new WeakMap();
        this.peaksCache = new WeakMap();

        this.project = Project.make();
        const pattern: Pattern.Type = this._insertPattern();
        const ticksPerBar: number = 1 * this.project.song.beatsPerBar * this.project.song.ppqn;
        this._insertClip(
            0,
            ticksPerBar * 0,
            ticksPerBar * 4,
            pattern.idLo,
            pattern.idHi,
            0,
        );
        const pattern2: Pattern.Type = this._insertPattern();
        this._insertClip(
            1,
            ticksPerBar * 0,
            ticksPerBar * 4,
            pattern2.idLo,
            pattern2.idHi,
            0,
        );
        const pattern3: Pattern.Type = this._insertPattern();
        this._insertClip(
            2,
            ticksPerBar * 0,
            ticksPerBar * 4,
            pattern3.idLo,
            pattern3.idHi,
            0,
        );
        // const pattern4: Pattern.Type = this._insertPattern();
        // this._insertClip(
        //     3,
        //     ticksPerBar * 0,
        //     ticksPerBar * 4,
        //     pattern4.idLo,
        //     pattern4.idHi,
        //     0,
        // );
        // this._insertClip(
        //     0,
        //     ticksPerBar * 1 - this.project.song.ppqn,
        //     ticksPerBar * 2 - this.project.song.ppqn,
        //     pattern.idLo,
        //     pattern.idHi,
        //     0,
        // );
        // this._insertClip(
        //     0,
        //     ticksPerBar * 2,
        //     ticksPerBar * 3,
        //     pattern.idLo,
        //     pattern.idHi,
        //     0,
        // );
        // this._insertClip(
        //     0,
        //     ticksPerBar * 3,
        //     ticksPerBar * 4,
        //     pattern.idLo,
        //     pattern.idHi,
        //     0,
        // );
        this.pianoRollPatternIndex = 0;
        this.pianoRollTrackIndex = 0;
        this.pianoRollClipIndex = 0;
        this.timeCursor = 0;
        this.shouldShowTempoEnvelope = false;
        this.soundVersionsPresentInAudioThread = new Map();

        this.onProjectChanged = new Emitter();
        this.onStartedPlaying = new Emitter();
        this.onStoppedPlaying = new Emitter();
        this.onStartedPlayingPianoNote = new Emitter();
        this.onStoppedPlayingPianoNote = new Emitter();
        this.onChangedPianoRollPattern = new Emitter();
        this.onSeekAndMoveTimeCursor = new Emitter();
        this.onTracksChanged = new Emitter();

        this.playing = false;
        this.playingPianoNote = false;
        this.stopPianoNoteTimeout = -1;

        // @TODO: Formalize this value as the default for projects.
        this.samplesPerSecond = 48000;

        this.audioContext = null;

        this.fftSize = 2048;
        this.outputAnalyserNode = null;
        this.outputAnalyserBuffer = null;
        this.outputAnalyserFreqBuffer = null;
        this.outputAnalyserFreqCounter = null;
        this.outputAnalyserTimeCounter = null;

        this.playheadAnalyser = new ValueAnalyser(buffer => {
            if (buffer == null || !this.playing) {
                return this.timeCursor;
            }

            const count: number = buffer.length;
            let playhead: number = this.timeCursor;
            for (let index: number = 0; index < count; index++) {
                const value: number = buffer[index];
                if (value !== 0) {
                    const disambiguator: number = 1;
                    playhead = value - disambiguator;
                    break;
                }
            }
            return playhead;
        });

        this.timeTakenAnalyser = new ValueAnalyser(buffer => {
            if (buffer == null || (!this.playing && !this.playingPianoNote)) {
                return 0.0;
            }

            const count: number = buffer.length;
            let timeTaken: number = 0.0;
            for (let index: number = 0; index < count; index++) {
                const value: number = buffer[index];
                if (value !== 0) {
                    const disambiguator: number = 1;
                    timeTaken = value - disambiguator;
                    break;
                }
            }
            return timeTaken;
        });

        this.trackMeterStates = [];
        const trackCount: number = this.project.song.tracks.length;
        for (let trackIndex: number = 0; trackIndex < trackCount; trackIndex++) {
            const state: TrackMeterState.Type = TrackMeterState.make();
            this.trackMeterStates.push(state);
        }

        // @TODO: I probably should add special code for this instead of reusing
        // ValueAnalyser.
        this.trackMeterAnalyser = new ValueAnalyser(buffer => {
            if (buffer == null || (!this.playing && !this.playingPianoNote)) {
                return;
            }

            const trackCount: number = this.project.song.tracks.length;
            const count: number = buffer.length;
            for (let index: number = count - 1; index >= 0; index--) {
                const value: number = buffer[index];
                const isFirstValue: boolean = (value & 1) !== 0;
                const hasNextValue: boolean = index > 0;
                if (isFirstValue && hasNextValue) {
                    const trackIndex: number = value >> 1;
                    const nextValue: number = buffer[index - 1] >> 1;
                    if (trackIndex >= 0 && trackIndex <= trackCount - 1) {
                        const state: TrackMeterState.Type = this.trackMeterStates[trackIndex];
                        // @TODO: Pass dt here somehow so I can call update.
                        const peakLeftLinear: number = ((nextValue >> 8) & 0xFF) * (1.0 / 255.0);
                        const peakRightLinear: number = (nextValue & 0xFF) * (1.0 / 255.0);
                        const peakLeftDecibels: number = clamp(
                            linearToDecibels(peakLeftLinear),
                            TrackMeterState.Constants.MinDecibels,
                            TrackMeterState.Constants.MaxDecibels
                        );
                        const peakRightDecibels: number = clamp(
                            linearToDecibels(peakRightLinear),
                            TrackMeterState.Constants.MinDecibels,
                            TrackMeterState.Constants.MaxDecibels
                        );
                        state.peakLeft = unlerp(
                            peakLeftDecibels,
                            TrackMeterState.Constants.MinDecibels,
                            TrackMeterState.Constants.MaxDecibels
                        );
                        state.peakRight = unlerp(
                            peakRightDecibels,
                            TrackMeterState.Constants.MinDecibels,
                            TrackMeterState.Constants.MaxDecibels
                        );
                    }
                }
            }
        });

        this.audioWorkletNode = null;

        this.sentSongForTheFirstTime = false;

        this._markProjectAsDirtyRequest = null;
    }

    async createAudioContext(): Promise<void> {
        if (this.audioContext != null) {
            return;
        }

        this.audioContext = new AudioContext({
            sampleRate: this.samplesPerSecond,
            latencyHint: "interactive",
        });

        // const blob: Blob = new Blob([audioWorkletCode], { type: "application/javascript" });
        // const audioWorkletUrl: string = URL.createObjectURL(blob);
        // await this.audioContext.audioWorklet.addModule(audioWorkletUrl);
        await this.audioContext.audioWorklet.addModule(audioWorkletUrl);

        // @TODO: Use a ChannelSplitterNode for stereo analysis.
        this.outputAnalyserNode = new AnalyserNode(
            this.audioContext,
            {
                fftSize: this.fftSize,
                minDecibels: -90,
                maxDecibels: 0,
                smoothingTimeConstant: 0,
                channelCount: 2,
                channelCountMode: "explicit",
                channelInterpretation: "speakers",
            },
        );
        if (this.outputAnalyserBuffer == null || this.outputAnalyserBuffer.length !== this.fftSize) {
            this.outputAnalyserBuffer = new Float32Array(this.fftSize);
            this.outputAnalyserFreqBuffer = new Float32Array(this.outputAnalyserNode.frequencyBinCount);
            this.outputAnalyserFreqCounter = null;
            this.outputAnalyserTimeCounter = null;
        }
        this.playheadAnalyser.create(this.audioContext);
        this.timeTakenAnalyser.create(this.audioContext);
        this.trackMeterAnalyser.create(this.audioContext);
        this.audioWorkletNode = new AudioWorkletNode(
            this.audioContext,
            "SynthesizerAudioWorklet",
            {
                numberOfInputs: 0,
                numberOfOutputs: 4,
                outputChannelCount: [2, 1, 1, 1],
                parameterData: {},
                processorOptions: {},
            },
        );
        this.audioWorkletNode.port.onmessage = this._onMessageReceivedFromAudioThread;
        this.audioWorkletNode.connect(this.audioContext.destination, 0, 0);
        this.audioWorkletNode.connect(this.outputAnalyserNode, 0, 0);
        this.playheadAnalyser.plug(this.audioWorkletNode, 1);
        this.timeTakenAnalyser.plug(this.audioWorkletNode, 2);
        this.trackMeterAnalyser.plug(this.audioWorkletNode, 3);
    }

    public destroyAudioContext(): void {
        if (this.audioContext != null) {
            this.playheadAnalyser.destroy();
            this.timeTakenAnalyser.destroy();
            this.trackMeterAnalyser.destroy();
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    private _onMessageReceivedFromAudioThread = (event: MessageEvent): void => {
        switch (event.data["kind"] as MessageKind) {
            case MessageKind.ReceivedSound: {
                const id: number = event.data["id"];
                const version: number = event.data["version"];
                this.soundVersionsPresentInAudioThread.set(id, version);
            } break;
        }
    };

    // @TODO: Check what happens if this is called more than once before it
    // finishes executing.
    public async startPlaying(): Promise<void> {
        if (this.playing) {
            return;
        }

        if (this.audioContext == null) {
            await this.createAudioContext();
        }

        if (this.audioContext == null || this.audioWorkletNode == null) {
            return;
        }

        await this.audioContext.resume();

        if (!this.sentSongForTheFirstTime) {
            this._sendSongToAudioThread();
        }
        this.audioWorkletNode.port.postMessage({
            kind: MessageKind.Play,
            from: clamp(this.timeCursor, 0, this.project.song.duration),
        });

        const trackCount: number = this.project.song.tracks.length;
        for (let trackIndex: number = 0; trackIndex < trackCount; trackIndex++) {
            const state: TrackMeterState.Type = this.trackMeterStates[trackIndex];
            TrackMeterState.clear(state);
        }

        this.playing = true;
        this.onStartedPlaying.notifyListeners();
    }

    public async stopPlaying(): Promise<void> {
        if (!this.playing) {
            return;
        }

        if (this.audioContext == null) {
            await this.createAudioContext();
        }

        if (this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                kind: MessageKind.Stop,
            });
            // this.audioWorkletNode.disconnect();
        }
        // @TODO: Figure out when I can safely get rid of the audio worklet.
        // The thing is that I don't think I want to destroy it, since if you
        // pause and play quickly, and the worklet is destroyed on pause, I
        // think I'd have to send everything to the audio thread again,
        // including large things like samples. So that's not great.
        // this.audioWorkletNode = null;

        // @TODO: Suspend the audio context?

        // @TODO: Clear track meter states?

        this.playing = false;
        this.onStoppedPlaying.notifyListeners();
    }

    public async togglePlaying(): Promise<void> {
        if (!this.playing) {
            await this.startPlaying();
        } else {
            await this.stopPlaying();
        }
    }

    public async seek(to: number): Promise<void> {
        if (!this.playing) {
            return;
        }

        if (this.audioContext == null) {
            return;
        }

        if (this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                kind: MessageKind.Seek,
                to: to,
            });
        }
    }

    public async seekAndMoveTimeCursor(to: number): Promise<void> {
        const duration: number = this.project.song.duration;
        to = ((to | 0) % duration + duration) % duration;
        this.timeCursor = to;
        this.seek(to);
        this.onSeekAndMoveTimeCursor.notifyListeners();
    }

    public toggleTempoEnvelope(): void {
        this.shouldShowTempoEnvelope = !this.shouldShowTempoEnvelope;
        this.onTracksChanged.notifyListeners();
    }

    public getOutputTimeDomainData(frame: number): Float32Array | null {
        if (
            this.audioContext == null
            || this.audioWorkletNode == null
            || this.outputAnalyserNode == null
            || (!this.playing && !this.playingPianoNote)
        ) {
            return null;
        }
        const buffer: Float32Array | null = this.outputAnalyserBuffer;
        if (buffer == null) {
            return null;
        }
        if (frame !== this.outputAnalyserTimeCounter) {
            this.outputAnalyserNode.getFloatTimeDomainData(buffer);
            this.outputAnalyserTimeCounter = frame;
        }
        return buffer;
    }

    public getOutputFreqDomainData(frame: number): Float32Array | null {
        if (
            this.audioContext == null
            || this.audioWorkletNode == null
            || this.outputAnalyserNode == null
            || (!this.playing && !this.playingPianoNote)
        ) {
            return null;
        }
        const buffer: Float32Array | null = this.outputAnalyserFreqBuffer;
        if (buffer == null) {
            return null;
        }
        if (frame !== this.outputAnalyserFreqCounter) {
            this.outputAnalyserNode.getFloatFrequencyData(buffer);
            this.outputAnalyserFreqCounter = frame;
        }
        return buffer;
    }

    public getPlayheadInTicks(frame: number): number | null {
        return this.playheadAnalyser.getValue(frame);
    }

    public getTimeTaken(frame: number): number {
        return this.timeTakenAnalyser.getValue(frame);
    }

    public updateTrackMeterStates(frame: number): void {
        this.trackMeterAnalyser.getValue(frame);
    }

    public setCurrentPattern(patternIndex: number, trackIndex: number, clipIndex: number): void {
        this.pianoRollPatternIndex = patternIndex;
        this.pianoRollTrackIndex = trackIndex;
        this.pianoRollClipIndex = clipIndex;
        this.onChangedPianoRollPattern.notifyListeners();
    }

    private _insertSound(
        samplesPerSecond: number,
        dataL: Float32Array,
        dataR: Float32Array | null,
    ): Sound.Type {
        // @TODO: Hash each sound and use that to know if we need to create or reuse?
        const id: number = this.project.soundIdGenerator;
        const version: number = 0;
        const sound: Sound.Type = Sound.make(
            id,
            version,
            samplesPerSecond,
            dataL,
            dataR,
        );
        const index: number = this.project.sounds.length;

        this.project.sounds.push(sound);
        Uint32ToUint32Table.set(this.project.soundsById, id, index);

        // Keep this as an unsigned 32-bit integer.
        this.project.soundIdGenerator = (this.project.soundIdGenerator + 1) >>> 0;

        // @TODO: Compute this in a worker.
        const peaks: Peaks.Type = Peaks.fromSound(sound);
        this.peaksCache.set(sound, peaks);

        return sound;
    }

    public insertSound(
        samplesPerSecond: number,
        dataL: Float32Array,
        dataR: Float32Array | null,
    ): Sound.Type {
        const sound: Sound.Type = this._insertSound(samplesPerSecond, dataL, dataR);
        this.markProjectAsDirty();
        return sound;
    }

    public insertTempoEnvelopePoint(pointTime: number, pointValue: number): Breakpoint.Type {
        if (this.project.song.tempoEnvelope == null) {
            this.project.song.tempoEnvelope = [];
        }
        // @TODO: Constrain time and value.
        const newPoint: Breakpoint.Type = Breakpoint.make(pointTime, pointValue);
        this.project.song.tempoEnvelope.push(newPoint);
        this.project.song.tempoEnvelope.sort(Breakpoint.byTimeAscending);

        this.computeTempoMap();
        this.markProjectAsDirty();

        return newPoint;
    }

    public removeTempoEnvelopePoint(pointIndex: number): void {
        if (this.project.song.tempoEnvelope == null) {
            // @TODO: Hmm.
            return;
        }

        if (this.project.song.tempoEnvelope.length === 1) {
            this.project.song.tempoEnvelope = null;
        } else {
            this.project.song.tempoEnvelope.splice(pointIndex, 1);
            this.project.song.tempoEnvelope.sort(Breakpoint.byTimeAscending);
        }

        this.computeTempoMap();
        this.markProjectAsDirty();
    }

    public changeTempoEnvelopePoint(
        pointIndex: number,
        pointTime: number,
        pointValue: number,
    ): void {
        if (this.project.song.tempoEnvelope == null) {
            // @TODO: Hmm.
            return;
        }

        // @TODO: Constrain time and value.
        this.project.song.tempoEnvelope![pointIndex].time = pointTime;
        this.project.song.tempoEnvelope![pointIndex].value = pointValue;
        // @TODO: Skip this when the move is bounded.
        this.project.song.tempoEnvelope!.sort(Breakpoint.byTimeAscending);

        this.computeTempoMap();
        this.markProjectAsDirty();
    }

    private _insertPattern(): Pattern.Type {
        const project: Project.Type = this.project;
        const song: Song.Type = project.song;
        const idGenerator: LongId.Type = project.patternIdGenerator;
        const pattern: Pattern.Type = Pattern.make(
            song.ppqn,
            song.beatsPerBar,
            /* barCount */ 4,
            idGenerator.lo,
            idGenerator.hi,
        );
        LongId.increment(idGenerator);
        song.patterns.push(pattern);
        project.noteIdGeneratorsByPatternIndex.push(makeIdGenerator());
        Uint64ToUint32Table.set(
            song.patternsById,
            pattern.idLo,
            pattern.idHi,
            song.patterns.length - 1,
        );
        this.patternInfoCache.set(pattern, {
            pitchBounds: new NotePitchBoundsTracker(song.maxPitch),

            viewportX0: null,
            viewportY0: null,
            viewportX1: null,
            viewportY1: null,
        });
        return pattern;
    }

    public insertPattern(): Pattern.Type {
        const pattern: Pattern.Type = this._insertPattern();
        this.markProjectAsDirty();
        return pattern;
    }

    private _insertClip(
        trackIndex: number,
        start: number,
        end: number,
        patternIdLo: number,
        patternIdHi: number,
        soundId: number,
    ): Clip.Type {
        const project: Project.Type = this.project;
        const song: Song.Type = project.song;
        const track: Track.Type = song.tracks[trackIndex];
        const idGenerator: LongId.Type = project.clipIdGenerator;
        const kind: Clip.Kind = (
            soundId !== 0
            ? Clip.Kind.Sound
            : Clip.Kind.Pattern
        );
        const clip: Clip.Type = Clip.make(
            start,
            end,
            kind,
            /* patternClipData */ null,
            /* soundClipData */ null,
            patternIdLo,
            patternIdHi,
            soundId,
            idGenerator.lo,
            idGenerator.hi,
        );
        LongId.increment(idGenerator);
        track.clips.push(clip);
        this.markTrackAsDirty(track);
        return clip;
    }

    public insertClip(
        trackIndex: number,
        start: number,
        end: number,
        patternIdLo: number,
        patternIdHi: number,
        soundId: number,
    ): Clip.Type {
        // @TODO: Check if the duration is 0 and don't insert if so?

        start = clamp(start, 0, this.project.song.duration - 1);
        end = clamp(end, 1, this.project.song.duration);

        const clip: Clip.Type = this._insertClip(
            trackIndex,
            start,
            end,
            patternIdLo,
            patternIdHi,
            soundId,
        );
        this.markProjectAsDirty();

        return clip;
    }

    public removeClips(trackIndex: number, clips: Clip.Type[]): void {
        const project: Project.Type = this.project;
        const song: Song.Type = project.song;
        const track: Track.Type = song.tracks[trackIndex];

        // @TODO: It may be better to take a map of notes.
        const clipSet: Set<Clip.Type> = new Set(clips);

        const clipCount: number = track.clips.length;
        for (let clipIndex: number = clipCount - 1; clipIndex >= 0; clipIndex--) {
            const clip: Clip.Type = track.clips[clipIndex];
            if (clipSet.has(clip)) {
                const otherClip: Clip.Type = track.clips[track.clips.length - 1];
                track.clips[clipIndex] = otherClip;
                track.clips[track.clips.length - 1] = clip;
                track.clips.pop();
            }
        }

        // @TODO: Remove the associated patterns as well if they end up unused?
        // Probably should be configurable.

        this.markTrackAsDirty(track);
        this.markProjectAsDirty();
    }

    public changeClipPosition(
        clip: Clip.Type,
        clipIndex: number,
        start: number,
        end: number,
        oldTrackIndex: number,
        newTrackIndex: number,
    ): void {
        // @TODO: I need to check if the clip is still in the song.

        const project: Project.Type = this.project;
        const song: Song.Type = project.song;
        const oldTrack: Track.Type = song.tracks[oldTrackIndex];
        const newTrack: Track.Type = song.tracks[newTrackIndex];
        clip.start = start;
        clip.end = end;
        const changedTracks: boolean = oldTrackIndex !== newTrackIndex;
        if (changedTracks) {
            oldTrack.clips.splice(clipIndex, 1);
            newTrack.clips.push(clip);
            this.markTrackAsDirty(oldTrack);
            this.markTrackAsDirty(newTrack);
        } else {
            this.markTrackAsDirty(newTrack);
        }
        this.markProjectAsDirty();
    }

    public changeSoundClipStartOffset(clip: Clip.Type, startOffset: number): void {
        if (clip.kind !== Clip.Kind.Sound) {
            return;
        }

        let soundClipData: SoundClipData.Type | null = clip.soundClipData;
        if (soundClipData == null) {
            soundClipData = SoundClipData.make(
                /* startOffset */ 0,
                /* playbackRate */ 1,
                /* timeStretchMode */ TimeStretchMode.None,
                /* pitchShift */ 1,
            );
            clip.soundClipData = soundClipData;
        }
        soundClipData.startOffset = startOffset;

        this.markProjectAsDirty();
    }

    public changeSoundClipPlaybackRate(clip: Clip.Type, playbackRate: number): void {
        if (clip.kind !== Clip.Kind.Sound) {
            return;
        }

        let soundClipData: SoundClipData.Type | null = clip.soundClipData;
        if (soundClipData == null) {
            soundClipData = SoundClipData.make(
                /* startOffset */ 0,
                /* playbackRate */ 1,
                /* timeStretchMode */ TimeStretchMode.None,
                /* pitchShift */ 1,
            );
            clip.soundClipData = soundClipData;
        }
        // @TODO:
        // - Don't set if NaN
        // - Keep bounded
        soundClipData.playbackRate = playbackRate;

        this.markProjectAsDirty();
    }

    public changeSoundClipPitchShift(clip: Clip.Type, pitchShift: number): void {
        if (clip.kind !== Clip.Kind.Sound) {
            return;
        }

        let soundClipData: SoundClipData.Type | null = clip.soundClipData;
        if (soundClipData == null) {
            soundClipData = SoundClipData.make(
                /* startOffset */ 0,
                /* playbackRate */ 1,
                /* timeStretchMode */ TimeStretchMode.None,
                /* pitchShift */ 1,
            );
            clip.soundClipData = soundClipData;
        }
        // @TODO:
        // - Don't set if NaN
        // - Keep bounded
        soundClipData.pitchShift = pitchShift;

        this.markProjectAsDirty();
    }

    public changeSoundClipTimeStretchMode(clip: Clip.Type, timeStretchMode: TimeStretchMode): void {
        if (clip.kind !== Clip.Kind.Sound) {
            return;
        }

        let soundClipData: SoundClipData.Type | null = clip.soundClipData;
        if (soundClipData == null) {
            soundClipData = SoundClipData.make(
                /* startOffset */ 0,
                /* playbackRate */ 1,
                /* timeStretchMode */ TimeStretchMode.None,
                /* pitchShift */ 1,
            );
            clip.soundClipData = soundClipData;
        }
        soundClipData.timeStretchMode = timeStretchMode;

        this.markProjectAsDirty();
    }

    public changeClips(
        clipsAndTrackIndices: [Clip.Type, number][],
        timeDelta: number,
    ): void {
        // @TODO: I need to check if the clip is still in the song.

        const project: Project.Type = this.project;
        const song: Song.Type = project.song;

        for (let index: number = 0; index < clipsAndTrackIndices.length; index++) {
            const entry: [Clip.Type, number] = clipsAndTrackIndices[index];
            const clip: Clip.Type = entry[0];

            const oldStart: number = clip.start;
            const oldEnd: number = clip.end;
            const newStart: number = oldStart + timeDelta;
            const newEnd: number = oldEnd + timeDelta;

            clip.start = newStart;
            clip.end = newEnd;
        }

        for (let index: number = 0; index < clipsAndTrackIndices.length; index++) {
            const entry: [Clip.Type, number] = clipsAndTrackIndices[index];
            const trackIndex: number = entry[1];
            this.markTrackAsDirty(song.tracks[trackIndex]);
        }
        this.markProjectAsDirty();
    }

    public insertNote(
        pattern: Pattern.Type,
        start: number,
        end: number,
        pitch: number,
        pitchEnvelope: Breakpoint.Type[] | null,
        volumeEnvelope: Breakpoint.Type[] | null,
    ): void {
        // @TODO: I need to check if the pattern is still in the song.

        const project: Project.Type = this.project;
        const song: Song.Type = project.song;

        const patternsById: Uint64ToUint32Table.Type = song.patternsById;
        const patternTableIndex: number = Uint64ToUint32Table.getIndexFromKey(patternsById, pattern.idLo, pattern.idHi);
        if (patternTableIndex === -1) {
            throw new Error("Couldn't find pattern index");
        }
        const patternIndex: number = Uint64ToUint32Table.getValueFromIndex(patternsById, patternTableIndex);
        const idGenerator: LongId.Type = project.noteIdGeneratorsByPatternIndex[patternIndex];

        const note: Note.Type = Note.make(
            start,
            end,
            pitch,
            idGenerator.lo,
            idGenerator.hi,
            pitchEnvelope,
            volumeEnvelope,
        );
        LongId.increment(idGenerator);

        pattern.notes.push(note);

        let cachedInfo: PatternInfo | undefined = this.patternInfoCache.get(pattern);
        if (cachedInfo == null) {
            this._createPatternInfoCacheFor(song, pattern);
        } else {
            cachedInfo.pitchBounds.add(pitch);
        }

        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    // @TODO: Rename to duplicateNotes, and add pitch/time deltas.
    public copyNotes(pattern: Pattern.Type, notes: Note.Type[]): Note.Type[] {
        // @TODO: I need to check if the pattern is still in the song.

        const project: Project.Type = this.project;
        const song: Song.Type = project.song;
        const patternsById: Uint64ToUint32Table.Type = song.patternsById;
        const patternTableIndex: number = Uint64ToUint32Table.getIndexFromKey(patternsById, pattern.idLo, pattern.idHi);
        if (patternTableIndex === -1) {
            throw new Error("Couldn't find pattern index");
        }
        const patternIndex: number = Uint64ToUint32Table.getValueFromIndex(patternsById, patternTableIndex);
        const idGenerator: LongId.Type = project.noteIdGeneratorsByPatternIndex[patternIndex];
        const newNotes: Note.Type[] = [];
        let cachedInfo: PatternInfo | undefined = this.patternInfoCache.get(pattern);
        for (const oldNote of notes) {
            let newPitchEnvelope: Breakpoint.Type[] | null = null;
            if (oldNote.pitchEnvelope != null) {
                newPitchEnvelope = [];
                for (const oldPoint of oldNote.pitchEnvelope) {
                    newPitchEnvelope.push(Breakpoint.make(
                        oldPoint.time,
                        oldPoint.value,
                    ));
                }
            }
            let newVolumeEnvelope: Breakpoint.Type[] | null = null;
            if (oldNote.volumeEnvelope != null) {
                newVolumeEnvelope = [];
                for (const oldPoint of oldNote.volumeEnvelope) {
                    newVolumeEnvelope.push(Breakpoint.make(
                        oldPoint.time,
                        oldPoint.value,
                    ));
                }
            }
            const newNote: Note.Type = Note.make(
                oldNote.start,
                oldNote.end,
                oldNote.pitch,
                idGenerator.lo,
                idGenerator.hi,
                newPitchEnvelope,
                newVolumeEnvelope,
            );
            LongId.increment(idGenerator);
            newNotes.push(newNote);
            pattern.notes.push(newNote);

            if (cachedInfo != null) {
                cachedInfo.pitchBounds.add(oldNote.pitch);
            }
        }
        if (cachedInfo == null) {
            // This will iterate over all the notes, but the order doesn't
            // matter, so it's fine to do it before we reindex.
            this._createPatternInfoCacheFor(song, pattern);
        }
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
        return newNotes;
    }

    public removeNote(pattern: Pattern.Type, index: number): void {
        // @TODO: I need to check if the pattern is still in the song.

        const project: Project.Type = this.project;
        const song: Song.Type = project.song;
        const pitch: number = pattern.notes[index].pitch;

        pattern.notes.splice(index, 1);

        let cachedInfo: PatternInfo | undefined = this.patternInfoCache.get(pattern);
        if (cachedInfo == null) {
            this._createPatternInfoCacheFor(song, pattern);
        } else {
            cachedInfo.pitchBounds.remove(pitch);
        }

        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    public removeNotes(pattern: Pattern.Type, notes: Note.Type[]): void {
        // @TODO: I need to check if the pattern is still in the song.

        const project: Project.Type = this.project;
        const song: Song.Type = project.song;

        // @TODO: It may be better to take a map of notes.

        const noteSet: Set<Note.Type> = new Set(notes);

        let cachedInfo: PatternInfo | undefined = this.patternInfoCache.get(pattern);

        for (let i: number = pattern.notes.length - 1; i >= 0; i--) {
            const note: Note.Type = pattern.notes[i];
            const pitch: number = note.pitch;

            if (noteSet.has(note)) {
                const otherNote: Note.Type = pattern.notes[pattern.notes.length - 1];
                pattern.notes[i] = otherNote;
                pattern.notes[pattern.notes.length - 1] = note;
                pattern.notes.pop();

                if (cachedInfo != null) {
                    cachedInfo.pitchBounds.remove(pitch);
                }
            }
        }

        if (cachedInfo == null) {
            // This will iterate over all the notes, but the order doesn't
            // matter, so it's fine to do it before we reindex.
            this._createPatternInfoCacheFor(song, pattern);
        }

        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    public changeNote(
        pattern: Pattern.Type,
        note: Note.Type,
        newStart: number,
        newEnd: number,
        newPitch: number,
    ): void {
        // @TODO: I need to check if the pattern is still in the song.

        const project: Project.Type = this.project;
        const song: Song.Type = project.song;
        const oldPitch: number = note.pitch;

        note.start = newStart;
        note.end = newEnd;
        note.pitch = newPitch;

        let cachedInfo: PatternInfo | undefined = this.patternInfoCache.get(pattern);
        if (cachedInfo == null) {
            this._createPatternInfoCacheFor(song, pattern);
        } else {
            cachedInfo.pitchBounds.change(oldPitch, newPitch);
        }

        // @TODO: Skip sorting if not needed. Reindexing is always necessary
        // though, I think.
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    public changeNotes(
        pattern: Pattern.Type,
        notes: Note.Type[],
        timeDelta: number,
        pitchDelta: number,
    ): void {
        // @TODO: I need to check if the pattern is still in the song.

        const project: Project.Type = this.project;
        const song: Song.Type = project.song;

        let cachedInfo: PatternInfo | undefined = this.patternInfoCache.get(pattern);

        for (let noteIndex: number = 0; noteIndex < notes.length; noteIndex++) {
            const note: Note.Type = notes[noteIndex];

            const oldPitch: number = note.pitch;
            const oldStart: number = note.start;
            const oldEnd: number = note.end;
            const newPitch: number = oldPitch + pitchDelta;
            const newStart: number = oldStart + timeDelta;
            const newEnd: number = oldEnd + timeDelta;

            note.start = newStart;
            note.end = newEnd;
            note.pitch = newPitch;

            if (cachedInfo != null) {
                cachedInfo.pitchBounds.change(oldPitch, newPitch);
            }
        }

        if (cachedInfo == null) {
            // This will iterate over all the notes, but the order doesn't
            // matter, so it's fine to do it before we reindex.
            this._createPatternInfoCacheFor(song, pattern);
        }

        // @TODO: Skip sorting if not needed. Reindexing is always necessary
        // though, I think.
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    public insertNoteVolumePoint(
        pattern: Pattern.Type,
        note: Note.Type,
        pointTime: number,
        pointValue: number,
    ): Breakpoint.Type {
        // @TODO: I need to check if the pattern is still in the song.

        if (note.volumeEnvelope == null) {
            note.volumeEnvelope = [];
        }
        // @TODO: Constrain time and value.
        const newPoint: Breakpoint.Type = Breakpoint.make(pointTime, pointValue);
        note.volumeEnvelope.push(newPoint);
        note.volumeEnvelope.sort(Breakpoint.byTimeAscending);

        // @TODO: Skip sorting and reindexing as we're not changing note positions.
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();

        return newPoint;
    }

    public insertNotePitchPoint(
        pattern: Pattern.Type,
        note: Note.Type,
        pointTime: number,
        pointValue: number,
    ): Breakpoint.Type {
        // @TODO: I need to check if the pattern is still in the song.

        if (note.pitchEnvelope == null) {
            note.pitchEnvelope = [];
        }
        // @TODO: Constrain time and value.
        const newPoint: Breakpoint.Type = Breakpoint.make(pointTime, pointValue);
        note.pitchEnvelope.push(newPoint);
        note.pitchEnvelope.sort(Breakpoint.byTimeAscending);

        // @TODO: Skip sorting and reindexing as we're not changing note positions.
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();

        return newPoint;
    }

    public removeNoteVolumePoint(
        pattern: Pattern.Type,
        note: Note.Type,
        pointIndex: number,
    ): void {
        // @TODO: I need to check if the pattern is still in the song.

        if (note.volumeEnvelope == null) {
            // @TODO: Hmm.
            return;
        }

        // @TODO: If .length === 1, I can just set this to null.

        note.volumeEnvelope.splice(pointIndex, 1);
        note.volumeEnvelope.sort(Breakpoint.byTimeAscending);

        // @TODO: Skip sorting and reindexing as we're not changing note positions.
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    public removeNotePitchPoint(
        pattern: Pattern.Type,
        note: Note.Type,
        pointIndex: number,
    ): void {
        // @TODO: I need to check if the pattern is still in the song.

        if (note.pitchEnvelope == null) {
            // @TODO: Hmm.
            return;
        }

        // @TODO: If .length === 1, I can just set this to null.

        note.pitchEnvelope.splice(pointIndex, 1);
        note.pitchEnvelope.sort(Breakpoint.byTimeAscending);

        // @TODO: Skip sorting and reindexing as we're not changing note positions.
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    public changeNoteVolumePoint(
        pattern: Pattern.Type,
        note: Note.Type,
        pointIndex: number,
        pointTime: number,
        pointValue: number,
    ): void {
        // @TODO: I need to check if the pattern is still in the song.

        if (note.volumeEnvelope == null) {
            // @TODO: Hmm.
            return;
        }

        note.volumeEnvelope![pointIndex].time = pointTime;
        note.volumeEnvelope![pointIndex].value = pointValue;
        // @TODO: Skip this when the move is bounded.
        note.volumeEnvelope!.sort(Breakpoint.byTimeAscending);

        // @TODO: Skip sorting and reindexing as we're not changing note positions.
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    public changeNotePitchPoint(
        pattern: Pattern.Type,
        note: Note.Type,
        pointIndex: number,
        pointTime: number,
        pointValue: number,
    ): void {
        // @TODO: I need to check if the pattern is still in the song.

        if (note.pitchEnvelope == null) {
            // @TODO: Hmm.
            return;
        }

        note.pitchEnvelope![pointIndex].time = pointTime;
        note.pitchEnvelope![pointIndex].value = pointValue;
        // @TODO: Skip this when the move is bounded.
        note.pitchEnvelope!.sort(Breakpoint.byTimeAscending);

        // @TODO: Skip sorting and reindexing as we're not changing note positions.
        this.markPatternAsDirty(pattern);
        this.markProjectAsDirty();
    }

    public toggleMuteTrack(trackIndex: number): void {
        const tracks: Track.Type[] = this.project.song.tracks;
        const trackCount: number = tracks.length;

        if (trackIndex < 0 || trackIndex >= trackCount) {
            return;
        }

        tracks[trackIndex].muted = !tracks[trackIndex].muted;
        this.markProjectAsDirty();
    }

    public toggleSoloTrack(trackIndex: number): void {
        const tracks: Track.Type[] = this.project.song.tracks;
        const trackCount: number = tracks.length;

        if (trackIndex < 0 || trackIndex >= trackCount) {
            return;
        }

        let givenTrackIsMuted: boolean = true;
        let allOthersAreMuted: boolean = true;
        for (let otherTrackIndex: number = 0; otherTrackIndex < trackCount; otherTrackIndex++) {
            const track: Track.Type = tracks[otherTrackIndex];
            if (otherTrackIndex === trackIndex) {
                givenTrackIsMuted = track.muted;
            } else {
                if (!track.muted) {
                    allOthersAreMuted = false;
                }
            }
        }

        if (!givenTrackIsMuted && allOthersAreMuted) {
            // Unsolo.
            for (let otherTrackIndex: number = 0; otherTrackIndex < trackCount; otherTrackIndex++) {
                const track: Track.Type = tracks[otherTrackIndex];
                track.muted = false;
            }
        } else {
            // Solo.
            for (let otherTrackIndex: number = 0; otherTrackIndex < trackCount; otherTrackIndex++) {
                const track: Track.Type = tracks[otherTrackIndex];
                track.muted = otherTrackIndex !== trackIndex;
            }
        }

        this.markProjectAsDirty();
    }

    public setTrackGain(trackIndex: number, gain: number): void {
        const tracks: Track.Type[] = this.project.song.tracks;
        const trackCount: number = tracks.length;

        if (trackIndex < 0 || trackIndex >= trackCount) {
            return;
        }

        const track: Track.Type = tracks[trackIndex];
        const normalized: number = clamp(gain, 0, 1);
        track.gain = normalized;

        this.markProjectAsDirty();
    }

    private _createPatternInfoCacheFor(song: Song.Type, pattern: Pattern.Type): void {
        const patternInfo: PatternInfo = {
            pitchBounds: new NotePitchBoundsTracker(song.maxPitch),

            viewportX0: null,
            viewportY0: null,
            viewportX1: null,
            viewportY1: null,
        };
        this.patternInfoCache.set(pattern, patternInfo);
        patternInfo.pitchBounds.populate(pattern.notes);
    }

    public computeTempoMap(): void {
        TempoMap.update(
            this.project.song.tempoMap,
            this.project.song.ppqn,
            this.project.song.duration,
            this.project.song.tempo,
            this.project.song.tempoEnvelope,
        );
    }

    public markPatternAsDirty(pattern: Pattern.Type): void {
        Pattern.reindexNotes(pattern);
    }

    public markTrackAsDirty(track: Track.Type): void {
        Track.reindexClips(track);
    }

    // @TODO: Rename?
    public markProjectAsDirty(): void {
        if (this._markProjectAsDirtyRequest != null) {
            return;
        }

        this._markProjectAsDirtyRequest = requestAnimationFrame(() => {
            this._markProjectAsDirtyRequest = null;
            this._sendSongToAudioThread();
            this.onProjectChanged.notifyListeners();
        });
    }

    private _sendSongToAudioThread(): void {
        if (this.audioContext != null && this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                kind: MessageKind.LoadSong,
                song: this.project.song,
                clearSounds: !this.sentSongForTheFirstTime,
            });

            this.sentSongForTheFirstTime = true;

            const sounds: Sound.Type[] = this.project.sounds;
            const soundCount: number = sounds.length;
            for (let soundIndex: number = 0; soundIndex < soundCount; soundIndex++) {
                const sound: Sound.Type = sounds[soundIndex];
                const id: number = sound.id;
                const versionInMainThread: number = sound.version;
                const versionInAudioThread: number | undefined = this.soundVersionsPresentInAudioThread.get(id);
                if (versionInAudioThread !== versionInMainThread) {
                    this.audioWorkletNode.port.postMessage({
                        kind: MessageKind.LoadSound,
                        sound: sound,
                    });
                }
            }
        }
    }

    public async playPianoNote(pitch: number): Promise<void> {
        if (this.audioContext == null) {
            await this.createAudioContext();
        }
        if (this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                kind: MessageKind.PlayPianoNote,
                pitch: pitch,
            });
        }
        clearTimeout(this.stopPianoNoteTimeout);
        this.playingPianoNote = true;
        this.onStartedPlayingPianoNote.notifyListeners();
    }

    public stopPianoNote(pitch: number): void {
        if (this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                kind: MessageKind.StopPianoNote,
                pitch: pitch,
            });
        }
        this.stopPianoNoteTimeout = setTimeout(() => {
            this.playingPianoNote = false;
            this.onStoppedPlayingPianoNote.notifyListeners();
        }, 200);
    }
}
