// @TODO: This is a total hack.
// But it's easier than setting up SharedArrayBuffer!
// ScriptProcessorNode would also work for this purpose. Though note that
// Chrome seems to require connecting SPN to the destination node as well.
export class ValueAnalyser<T> {
    public node: AnalyserNode | null;
    public buffer: Float32Array | null;
    public frame: number | null;

    private _processor: ValueAnalyserProcessor<T>;

    constructor(processor: ValueAnalyserProcessor<T>) {
        this.node = null;
        this.buffer = null;
        this.frame = null;
        this._processor = processor;
    }

    public create(audioContext: AudioContext): void {
        const fftSize: number = 32;
        this.node = new AnalyserNode(
            audioContext,
            {
                fftSize: fftSize,
                minDecibels: -90,
                maxDecibels: 0,
                smoothingTimeConstant: 0,
                channelCount: 1,
                channelCountMode: "explicit",
                channelInterpretation: "speakers",
            },
        );
        if (this.buffer == null || this.buffer.length !== fftSize) {
            this.buffer = new Float32Array(fftSize);
            this.frame = null;
        }
    }

    public destroy(): void {
        this.node?.disconnect();
        this.node = null;
        this.buffer = null;
    }

    public plug(otherNode: AudioNode, outputIndex: number): void {
        if (this.node == null) {
            return;
        }

        otherNode.connect(this.node, outputIndex, 0);
    }

    public getValue(frame: number): T {
        if (frame !== this.frame) {
            if (this.node != null && this.buffer != null) {
                this.node.getFloatTimeDomainData(this.buffer);
            }

            this.frame = frame;
        }

        return this._processor(this.buffer);
    }
}

export type ValueAnalyserProcessor<T> = (buffer: Float32Array | null) => T;
