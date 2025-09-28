import { Synthesizer } from "@synth-playground/synthesizer/index.js";
import { MessageKind } from "./MessageKind.js";

class SynthesizerAudioWorklet extends AudioWorkletProcessor {
    public synthesizer: Synthesizer;

    private _quit: boolean;

    constructor() {
        super();

        this.synthesizer = new Synthesizer(sampleRate);

        this.port.onmessage = this._onMessageReceived;

        this._quit = false;
    }

    private _onMessageReceived = (event: MessageEvent): void => {
        switch (event.data["kind"] as MessageKind) {
            case MessageKind.LoadSong: {
                this.synthesizer.loadSong(event.data["song"]);
            } break;
            case MessageKind.Play: {
                this.synthesizer.seek(event.data["from"]);
                this.synthesizer.play();
            } break;
            case MessageKind.Pause: {
                this.synthesizer.pause();
            } break;
            case MessageKind.Stop: {
                this.synthesizer.stop();
            } break;
            case MessageKind.Seek: {
                this.synthesizer.seek(event.data["to"]);
            } break;
            case MessageKind.Quit: {
                this._quit = true;
            } break;
            case MessageKind.PlayPianoNote: {
                this.synthesizer.playPianoNote(event.data["pitch"]);
            } break;
            case MessageKind.StopPianoNote: {
                this.synthesizer.stopPianoNote(event.data["pitch"]);
            } break;
        }
    };

    public process(
        _inputs: Float32Array[][],
        outputs: Float32Array[][],
        _parameters: Record<string, Float32Array>
    ): boolean {
        const outputCount: number = outputs.length;
        const output: Float32Array[] = outputs[0];
        const outL: Float32Array = output[0];
        const outR: Float32Array = output[1];
        const playheadBuffer: Float32Array | null = outputCount > 1 ? outputs[1][0] : null;
        const timeTakenBuffer: Float32Array | null = outputCount > 2 ? outputs[2][0] : null;
        const blockSize: number = outL.length;
        if (this.synthesizer.playing || this.synthesizer.playingPianoNote) {
            this.synthesizer.processBlock(
                blockSize,
                outL,
                outR,
                playheadBuffer,
                timeTakenBuffer,
            );
        }
        if (this._quit) {
            return false;
        }
        return true;
    }
}

registerProcessor("SynthesizerAudioWorklet", SynthesizerAudioWorklet);
