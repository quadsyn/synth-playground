import {
    clamp,
    u8,
    u8ToI8,
    mostSignificantPowerOf,
    leastSignificantPowerOf,
} from "@synth-playground/common/math.js";
import * as Sound from "@synth-playground/synthesizer/data/Sound.js";

// This module contains an implementation of an "in-order segment tree", from
// https://github.com/havelessbemore/dastal/blob/a67a951e591f82ee4c16fc58fcf5d4cd2fccfe39/src/segmentTree/inOrderSegmentTree.ts
//
// ISC License
//
// Copyright (c) 2021, Michael Rojas
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

// See also:
// - https://thume.ca/2021/03/14/iforests/
// - https://www.mattkeeter.com/blog/2023-07-03-iforest/
// - https://www.kdab.com/a-speed-up-for-charting-on-embedded/
//   (similar, but not exactly this data structure)

// @TODO:
// - This actually uses a little bit more memory than "mipmaps". Not a lot more
//   (single to double digit difference), but still.
//   - Really I probably should use mipmaps here. But then that doesn't support
//     small updates efficiently (AFAIK), though I don't need that right now.
// - The amplitudes are severely quantized in case a different visual gain is
//   applied. I'm not sure that there's anything that can be done about this,
//   obviously besides using more memory.

export interface Type {
    soundId: number;
    soundVersion: number;

    /** The number of samples represented by each peak. */
    samplesPerBlock: number;

    /** 2 if stereo, 1 if mono. */
    channelCount: number;

    /**
     * Contains the leaves and internal nodes of a segment tree. Each element
     * is packed like this: `(min << 8) | max`. If stereo, each element is made
     * of two 16-bit integers, with the second containing the peaks of the right
     * channel.
     */
    data: Uint16Array;

    /**
     * Number of elements in the tree. This is _not_ affected by `channelCount`,
     * which means you need to multiply this by 2 to get the amount of elements
     * actually present in `data`.
     */
    length: number;
}

export function make(
    soundId: number,
    soundVersion: number,
    samplesPerBlock: number,
    channelCount: number,
    data: Uint16Array,
    length: number,
): Type {
    return {
        soundId: soundId,
        soundVersion: soundVersion,
        samplesPerBlock: samplesPerBlock,
        channelCount: channelCount,
        data: data,
        length: length,
    };
}

export function fromSound(sound: Sound.Type): Type {
    const soundId: number = sound.id;
    const soundVersion: number = sound.version;
    const soundDataL: Float32Array = sound.dataL;
    const soundDataR: Float32Array | null = sound.dataR;
    const channelCount: number = soundDataR != null ? 2 : 1;
    const soundDurationInSamples: number = soundDataL.length;

    // Higher values look worse/blocky, but use less memory.
    const samplesPerBlock: number = 128;

    // We want to include the last block, which may have less samples than the
    // amount we set for the block.
    const blockCount: number = Math.ceil(soundDurationInSamples / samplesPerBlock);

    const expectedLength: number = blockCount * 2 - 1;
    const data: Uint16Array = new Uint16Array(expectedLength * channelCount);

    // This is the number of "logical" elements, not the number of "physical"
    // array elements. This is so I can avoid having to choose between different
    // typed array constructors, which may be an issue (unwanted polymorphism)?
    // Does mean I have to spray `* 2` in a bunch of places, though, which is
    // annoying.
    let length: number = 0;

    let minL: number = Infinity;
    let maxL: number = -Infinity;
    let minR: number = Infinity;
    let maxR: number = -Infinity;

    let blockIndex: number = 0;

    if (channelCount === 1) {
        for (let inputIndex: number = 0; inputIndex < soundDurationInSamples; inputIndex++) {
            const sampleL: number = soundDataL[inputIndex];

            minL = Math.min(minL, sampleL);
            maxL = Math.max(maxL, sampleL);

            if (inputIndex === soundDurationInSamples - 1 || blockIndex === samplesPerBlock - 1) {
                // I don't care about the asymmetric range of values available
                // for signed 8-bit integers.
                const quantizedMinL: number = u8(clamp(minL, -1, 1) * 127);
                const quantizedMaxL: number = u8(clamp(maxL, -1, 1) * 127);
                const packed: number = (quantizedMinL << 8) | quantizedMaxL;

                // Push value into tree.
                if (length < 1) {
                    data[length++] = packed;
                } else {
                    data[length++] = packed;
                    data[length++] = packed;

                    // Aggregate tree values as needed.
                    let index: number = length - 1;
                    let packedElement: number = data[index++];
                    let elementMinL: number = u8ToI8(packedElement >> 8);
                    let elementMaxL: number = u8ToI8(packedElement & 0xFF);
                    for (let mask: number = 2; (index & mask) !== 0; mask *= 2) {
                        packedElement = data[index - mask - (mask >>> 1)];
                        elementMinL = Math.min(u8ToI8(packedElement >> 8), elementMinL);
                        elementMaxL = Math.max(u8ToI8(packedElement & 0xFF), elementMaxL);
                        data[index - mask] = (u8(elementMinL) << 8) | u8(elementMaxL);
                    }
                }

                blockIndex = 0;
                minL = Infinity;
                maxL = -Infinity;
            } else {
                blockIndex++;
            }
        }
    } else if (channelCount === 2) {
        for (let inputIndex = 0; inputIndex < soundDurationInSamples; inputIndex++) {
            const sampleL: number = soundDataL[inputIndex];
            const sampleR: number = soundDataR![inputIndex];

            minL = Math.min(minL, sampleL);
            maxL = Math.max(maxL, sampleL);
            minR = Math.min(minR, sampleR);
            maxR = Math.max(maxR, sampleR);

            if (inputIndex === soundDurationInSamples - 1 || blockIndex === samplesPerBlock - 1) {
                const quantizedMinL: number = u8(clamp(minL, -1, 1) * 127);
                const quantizedMaxL: number = u8(clamp(maxL, -1, 1) * 127);
                const quantizedMinR: number = u8(clamp(minR, -1, 1) * 127);
                const quantizedMaxR: number = u8(clamp(maxR, -1, 1) * 127);

                const packedL: number = (quantizedMinL << 8) | quantizedMaxL;
                const packedR: number = (quantizedMinR << 8) | quantizedMaxR;

                // Push value into tree.
                if (length < 1) {
                    data[length * 2 + 0] = packedL;
                    data[length * 2 + 1] = packedR;
                    length++;
                } else {
                    data[length * 2 + 0] = packedL;
                    data[length * 2 + 1] = packedR;
                    length++;
                    data[length * 2 + 0] = packedL;
                    data[length * 2 + 1] = packedR;
                    length++;

                    // Aggregate values in tree as needed.
                    let index: number = length - 1;
                    let packedElementL: number = data[index * 2 + 0];
                    let packedElementR: number = data[index * 2 + 1];
                    index++;
                    let elementMinL: number = u8ToI8(packedElementL >> 8);
                    let elementMaxL: number = u8ToI8(packedElementL & 0xFF);
                    let elementMinR: number = u8ToI8(packedElementR >> 8);
                    let elementMaxR: number = u8ToI8(packedElementR & 0xFF);
                    for (let mask: number = 2; (index & mask) !== 0; mask *= 2) {
                        packedElementL = data[(index - mask - (mask >>> 1)) * 2 + 0];
                        packedElementR = data[(index - mask - (mask >>> 1)) * 2 + 1];
                        elementMinL = Math.min(u8ToI8(packedElementL >> 8), elementMinL);
                        elementMaxL = Math.max(u8ToI8(packedElementL & 0xFF), elementMaxL);
                        elementMinR = Math.min(u8ToI8(packedElementR >> 8), elementMinR);
                        elementMaxR = Math.max(u8ToI8(packedElementR & 0xFF), elementMaxR);
                        data[(index - mask) * 2 + 0] = (u8(elementMinL) << 8) | u8(elementMaxL);
                        data[(index - mask) * 2 + 1] = (u8(elementMinR) << 8) | u8(elementMaxR);
                    }
                }

                blockIndex = 0;
                minL = Infinity;
                maxL = -Infinity;
                minR = Infinity;
                maxR = -Infinity;
            } else {
                blockIndex++;
            }
        }
    }

    if (length !== expectedLength) {
        throw new Error(`Unexpected length: ${length} != ${expectedLength}`);
    }

    return make(soundId, soundVersion, samplesPerBlock, channelCount, data, length);
}

// The following functions are only here for reference.

export function queryMono(peaks: Type, index0: number, index1: number): [number, number] {
    const leafCount: number = (peaks.length + 1) >>> 1;
    if ((index0 < 0 && index1 <= 0) || (index0 >= leafCount && index1 > leafCount)) {
        return [0, 0];
    } else {
        if (index0 >= index1) {
            // Query range is empty.
            index1 = index0 + 1;
        }
        index0 = clamp(index0, 0, leafCount - 1) * 2;
        index1 = clamp(index1, 0, leafCount) * 2;
        let offset: number = leastSignificantPowerOf(index0 | mostSignificantPowerOf(index1 - index0));
        let packed: number = peaks.data[index0 - 1 + (offset >>> 1)];
        let minL: number = u8ToI8((packed >> 8) & 0xFF);
        let maxL: number = u8ToI8(packed & 0xFF);
        for (index0 += offset; index0 < index1; index0 += offset) {
            offset = leastSignificantPowerOf(index0 | mostSignificantPowerOf(index1 - index0));
            packed = peaks.data[index0 - 1 + (offset >>> 1)];
            minL = Math.min(minL, u8ToI8((packed >> 8) & 0xFF));
            maxL = Math.max(maxL, u8ToI8(packed & 0xFF));
        }
        return [minL / 127, maxL / 127];
    }
}

export function queryStereo(peaks: Type, index0: number, index1: number): [number, number, number, number] {
    const leafCount: number = (peaks.length + 1) >>> 1;
    if ((index0 < 0 && index1 <= 0) || (index0 >= leafCount && index1 > leafCount)) {
        return [0, 0, 0, 0];
    } else {
        if (index0 >= index1) {
            // Query range is empty.
            index1 = index0 + 1;
        }
        index0 = clamp(index0, 0, leafCount - 1) * 2;
        index1 = clamp(index1, 0, leafCount) * 2;
        let offset: number = leastSignificantPowerOf(index0 | mostSignificantPowerOf(index1 - index0));
        let packedIndex: number = (index0 - 1 + (offset >>> 1)) * 2;
        let packedL: number = peaks.data[packedIndex + 0];
        let packedR: number = peaks.data[packedIndex + 1];
        let minL: number = u8ToI8((packedL >> 8) & 0xFF);
        let maxL: number = u8ToI8(packedL & 0xFF);
        let minR: number = u8ToI8((packedR >> 8) & 0xFF);
        let maxR: number = u8ToI8(packedR & 0xFF);
        for (index0 += offset; index0 < index1; index0 += offset) {
            offset = leastSignificantPowerOf(index0 | mostSignificantPowerOf(index1 - index0));
            packedIndex = (index0 - 1 + (offset >>> 1)) * 2;
            packedL = peaks.data[packedIndex + 0];
            packedR = peaks.data[packedIndex + 1];
            minL = Math.min(minL, u8ToI8((packedL >> 8) & 0xFF));
            maxL = Math.max(maxL, u8ToI8(packedL & 0xFF));
            minR = Math.min(minR, u8ToI8((packedR >> 8) & 0xFF));
            maxR = Math.max(maxR, u8ToI8(packedR & 0xFF));
        }
        return [minL / 127, maxL / 127, minR / 127, maxR / 127];
    }
}
