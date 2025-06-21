import { LongId } from "@synth-playground/common/LongId.js";
import {
    type Song,
    makeSong,
    type Note,
    makeNote,
    // addRandomNotesToSong,
    // addExampleNotesToSong,
    reindexNotesInSong,
} from "@synth-playground/synthesizer/index.js";
// import audioWorkletCode from "inlineworker!@synth-playground/main-audio-worklet";
import audioWorkletUrl from "inlineworker!@synth-playground/main-audio-worklet";

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
        if (existingIndex === -1) this._listeners.push(listener);
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
    public song: Song;
    public idGenerator: LongId;
    public onSongChanged: Emitter;
    public onStartedPlaying: Emitter;
    public onStoppedPlaying: Emitter;
    public onStartedPlayingPianoNote: Emitter;
    public onStoppedPlayingPianoNote: Emitter;
    public playing: boolean;
    public playingPianoNote: boolean;
    public audioContext: AudioContext | null;
    public samplesPerSecond: number;
    public fftSize: number;
    public visualizationCounter: number;
    public outputAnalyserNode: AnalyserNode | null;
    public outputAnalyserBuffer: Float32Array | null;
    public outputAnalyserFreqBuffer: Float32Array | null;
    public outputAnalyserFreqCounter: number | null;
    public outputAnalyserTimeCounter: number | null;
    // @TODO: This is a total hack.
    // But it's easier than setting up SharedArrayBuffer!
    public playheadAnalyserNode: AnalyserNode | null;
    public playheadAnalyserBuffer: Float32Array | null;
    public playheadAnalyserCounter: number | null;
    public timeTakenAnalyserNode: AnalyserNode | null;
    public timeTakenAnalyserBuffer: Float32Array | null;
    public timeTakenAnalyserCounter: number | null;
    public audioWorkletNode: AudioWorkletNode | null;
    public sentSongForTheFirstTime: boolean;

    constructor() {
        this.song = makeSong();

        // We start at 1 here because 0 is used as a sentinel key in our custom
        // hash maps, indicating empty buckets.
        this.idGenerator = new LongId(/* lo */ 1, /* hi */ 0);

        // addRandomNotesToSong(this.song, 1, this.idGenerator);
        // addExampleNotesToSong(this.song, this.idGenerator);

        this.onSongChanged = new Emitter();
        this.onStartedPlaying = new Emitter();
        this.onStoppedPlaying = new Emitter();
        this.onStartedPlayingPianoNote = new Emitter();
        this.onStoppedPlayingPianoNote = new Emitter();

        this.playing = false;
        this.playingPianoNote = false;

        // @TODO: Formalize this value as the default for projects.
        this.samplesPerSecond = 48000;

        this.audioContext = null;
        this.fftSize = 2048;
        this.visualizationCounter = 0;
        this.outputAnalyserNode = null;
        this.outputAnalyserBuffer = null;
        this.outputAnalyserFreqBuffer = null;
        this.outputAnalyserFreqCounter = null;
        this.outputAnalyserTimeCounter = null;
        this.playheadAnalyserNode = null;
        this.playheadAnalyserBuffer = null;
        this.playheadAnalyserCounter = null;
        this.timeTakenAnalyserNode = null;
        this.timeTakenAnalyserBuffer = null;
        this.timeTakenAnalyserCounter = null;
        this.audioWorkletNode = null;
        this.sentSongForTheFirstTime = false;
    }

    async createAudioContext(): Promise<void> {
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
        const dataFftSize: number = 32;
        this.playheadAnalyserNode = new AnalyserNode(
            this.audioContext,
            {
                fftSize: dataFftSize,
                minDecibels: -90,
                maxDecibels: 0,
                smoothingTimeConstant: 0,
                channelCount: 1,
                channelCountMode: "explicit",
                channelInterpretation: "speakers",
            },
        );
        if (this.playheadAnalyserBuffer == null || this.playheadAnalyserBuffer.length !== dataFftSize) {
            this.playheadAnalyserBuffer = new Float32Array(dataFftSize);
            this.playheadAnalyserCounter = null;
        }
        this.timeTakenAnalyserNode = new AnalyserNode(
            this.audioContext,
            {
                fftSize: dataFftSize,
                minDecibels: -90,
                maxDecibels: 0,
                smoothingTimeConstant: 0,
                channelCount: 1,
                channelCountMode: "explicit",
                channelInterpretation: "speakers",
            },
        );
        if (this.timeTakenAnalyserBuffer == null || this.timeTakenAnalyserBuffer.length !== dataFftSize) {
            this.timeTakenAnalyserBuffer = new Float32Array(dataFftSize);
            this.timeTakenAnalyserCounter = null;
        }
        this.audioWorkletNode = new AudioWorkletNode(
            this.audioContext,
            "SynthesizerAudioWorklet",
            {
                numberOfInputs: 0,
                numberOfOutputs: 3,
                outputChannelCount: [2, 1, 1],
                parameterData: {},
                processorOptions: {},
            },
        );
        this.audioWorkletNode.connect(this.audioContext.destination, 0, 0);
        this.audioWorkletNode.connect(this.outputAnalyserNode, 0, 0);
        this.audioWorkletNode.connect(this.playheadAnalyserNode, 1, 0);
        this.audioWorkletNode.connect(this.timeTakenAnalyserNode, 2, 0);
    }

    public destroyAudioContext(): void {
        if (this.audioContext != null) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    // @TODO: Check what happens if this is called more than once before it
    // finishes executing.
    public async startPlaying(): Promise<void> {
        if (this.audioContext == null) return;
        if (this.audioWorkletNode == null) return;

        await this.audioContext.resume();

        if (!this.sentSongForTheFirstTime) {
            this.audioWorkletNode.port.postMessage({
                type: "loadSong",
                song: this.song,
            });
            this.sentSongForTheFirstTime = true;
        }
        this.audioWorkletNode.port.postMessage({
            type: "play",
        });

        this.playing = true;
        this.onStartedPlaying.notifyListeners();
    }

    public async stopPlaying(): Promise<void> {
        if (this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                type: "stop",
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

        this.playing = false;
        this.onStoppedPlaying.notifyListeners();
    }

    public async togglePlaying(): Promise<void> {
        if (this.audioContext == null) await this.createAudioContext();
        if (!this.playing) {
            await this.startPlaying();
        } else {
            await this.stopPlaying();
        }
    }

    public advanceVisualizationsByOneFrame(): void {
        this.visualizationCounter++;
    }

    public getOutputTimeDomainData(): Float32Array | null {
        if (this.audioContext == null) return null;
        if (this.audioWorkletNode == null) return null;
        if (this.outputAnalyserNode == null) return null;
        if (!this.playing && !this.playingPianoNote) return null;
        const buffer: Float32Array | null = this.outputAnalyserBuffer;
        if (buffer == null) return null;
        if (this.visualizationCounter !== this.outputAnalyserTimeCounter) {
            this.outputAnalyserNode.getFloatTimeDomainData(buffer);
            this.outputAnalyserTimeCounter = this.visualizationCounter;
        }
        return buffer;
    }

    public getOutputFreqDomainData(): Float32Array | null {
        if (this.audioContext == null) return null;
        if (this.audioWorkletNode == null) return null;
        if (this.outputAnalyserNode == null) return null;
        if (!this.playing && !this.playingPianoNote) return null;
        const buffer: Float32Array | null = this.outputAnalyserFreqBuffer;
        if (buffer == null) return null;
        if (this.visualizationCounter !== this.outputAnalyserFreqCounter) {
            this.outputAnalyserNode.getFloatFrequencyData(buffer);
            this.outputAnalyserFreqCounter = this.visualizationCounter;
        }
        return buffer;
    }

    public getPlayheadInTicks(): number | null {
        if (this.audioContext == null) return null;
        if (this.audioWorkletNode == null) return null;
        if (this.playheadAnalyserNode == null) return null;
        if (!this.playing) return null;
        const buffer: Float32Array | null = this.playheadAnalyserBuffer;
        if (buffer == null) return null;
        // @TODO: I don't think this is really the proper way to throttle this
        // stuff but it will do for now.
        if (this.visualizationCounter !== this.playheadAnalyserCounter) {
            this.playheadAnalyserNode.getFloatTimeDomainData(buffer);
            this.playheadAnalyserCounter = this.visualizationCounter;
        }
        return buffer[buffer.length - 1];
    }

    public getTimeTaken(): number {
        if (this.audioContext == null) return 0.0;
        if (this.audioWorkletNode == null) return 0.0;
        if (this.timeTakenAnalyserNode == null) return 0.0;
        if (!this.playing && !this.playingPianoNote) return 0.0;
        const buffer: Float32Array | null = this.timeTakenAnalyserBuffer;
        if (buffer == null) return 0.0;
        if (this.visualizationCounter !== this.timeTakenAnalyserCounter) {
            this.timeTakenAnalyserNode.getFloatTimeDomainData(buffer);
            this.timeTakenAnalyserCounter = this.visualizationCounter;
        }
        const count: number = buffer.length;
        let max: number = 0.0;
        for (let index: number = 0; index < count; index++) {
            max = Math.max(max, buffer[index]);
        }
        return max;
    }

    public insertNote(start: number, end: number, pitch: number): void {
        const note: Note = makeNote(
            start,
            end,
            pitch,
            this.idGenerator.lo,
            this.idGenerator.hi,
        );
        this.idGenerator.increment();
        this.song.notes.push(note);
        this.markSongAsDirty();
    }

    // @TODO: Rename?
    public markSongAsDirty(): void {
        reindexNotesInSong(this.song);

        if (this.audioContext != null && this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                type: "loadSong",
                song: this.song,
            });
            this.sentSongForTheFirstTime = true;
        }

        this.onSongChanged.notifyListeners();
    }

    public async playPianoNote(pitch: number): Promise<void> {
        if (this.audioContext == null) await this.createAudioContext();
        if (this.audioContext != null && this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                type: "playPianoNote",
                pitch: pitch,
            });
        }
        this.playingPianoNote = true;
        this.onStartedPlayingPianoNote.notifyListeners();
    }

    public stopPianoNote(pitch: number): void {
        if (this.audioContext != null && this.audioWorkletNode != null) {
            this.audioWorkletNode.port.postMessage({
                type: "stopPianoNote",
                pitch: pitch,
            });
        }
        this.playingPianoNote = false;
        this.onStoppedPlayingPianoNote.notifyListeners();
    }
}
