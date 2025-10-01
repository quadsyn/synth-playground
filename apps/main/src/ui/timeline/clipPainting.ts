import { remap, clamp, rangesOverlap } from "@synth-playground/common/math.js";
import * as Uint32ToUint32Table from "@synth-playground/common/hash/table/Uint32ToUint32Table.js";
import * as Uint64ToUint32Table from "@synth-playground/common/hash/table/Uint64ToUint32Table.js";
import * as Note from "@synth-playground/synthesizer/data/Note.js";
import * as Clip from "@synth-playground/synthesizer/data/Clip.js";
import * as Pattern from "@synth-playground/synthesizer/data/Pattern.js";
import * as Project from "@synth-playground/synthesizer/data/Project.js";
import * as Sound from "@synth-playground/synthesizer/data/Sound.js";
import * as TempoMap from "@synth-playground/synthesizer/data/TempoMap.js";
import * as Viewport from "../common/Viewport.js";
import { type PatternInfo } from "../../data/PatternInfo.js";
import { NotePitchBoundsTracker } from "../../data/NotePitchBoundsTracker.js";

const clipHeaderHeight: number = 15;

export function drawClip(
    canvasWidth: number,
    canvasHeight: number,
    context: CanvasRenderingContext2D,
    project: Project.Type,
    clip: Clip.Type,
    start: number,
    end: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    trackTop: number,
    trackHeight: number,
): void {
    drawClipBackground(
        canvasWidth,
        canvasHeight,
        context,
        clip,
        start,
        end,
        viewport,
        pixelsPerTick,
        trackTop,
        trackHeight,
    );
    drawClipTitle(
        canvasWidth,
        canvasHeight,
        context,
        project,
        clip,
        start,
        end,
        viewport,
        pixelsPerTick,
        trackTop,
        trackHeight,
    );
}

export function drawClipBackground(
    canvasWidth: number,
    canvasHeight: number,
    context: CanvasRenderingContext2D,
    clip: Clip.Type,
    start: number,
    end: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    trackTop: number,
    trackHeight: number,
): void {
    const viewportX0: number = viewport.x0;

    // const duration: number = end - start;

    const bodyHeight: number = (trackHeight - 1) - clipHeaderHeight;
    const x0: number = ((start - viewportX0) * pixelsPerTick);
    const x1: number = ((end - viewportX0) * pixelsPerTick);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    const y: number = trackTop - 1;
    const h: number = clipHeaderHeight + bodyHeight;

    // Draw clip background.
    // context.fillStyle = "#3090d0";
    context.fillStyle = "#0c6735";
    context.strokeStyle = "#000000";
    context.lineWidth = 1;
    context.fillRect(x, y, w, h);
}

export function drawClipTitle(
    canvasWidth: number,
    canvasHeight: number,
    context: CanvasRenderingContext2D,
    project: Project.Type,
    clip: Clip.Type,
    start: number,
    end: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    trackTop: number,
    trackHeight: number,
): void {
    const viewportX0: number = viewport.x0;

    const x0: number = ((start - viewportX0) * pixelsPerTick);
    const x1: number = ((end - viewportX0) * pixelsPerTick);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    const y: number = trackTop - 1;

    let title: string = "";

    if (clip.kind === Clip.Kind.Pattern) {
        const patternsById: Uint64ToUint32Table.Type = project.song.patternsById;
        const patternTableIndex: number = Uint64ToUint32Table.getIndexFromKey(
            patternsById,
            clip.patternIdLo,
            clip.patternIdHi,
        );
        if (patternTableIndex === -1) {
            throw new Error("Couldn't find pattern index");
        }
        const patternIndex: number = Uint64ToUint32Table.getValueFromIndex(patternsById, patternTableIndex);
        // const pattern: Pattern.Type = project.song.patterns[patternIndex];
        // const patternDuration: number = pattern.duration;

        // const loopCount: number = Math.max(1, Math.ceil(duration / patternDuration));

        // @TODO: Maybe use the ID instead. Although this probably should just
        // be an user-defined name.
        title = `Pattern ${patternIndex}`;
    } else if (clip.kind === Clip.Kind.Sound) {
        const soundsById: Uint32ToUint32Table.Type = project.soundsById;
        const soundTableIndex: number = Uint32ToUint32Table.getIndexFromKey(
            soundsById,
            clip.soundId,
        );
        if (soundTableIndex === -1) {
            throw new Error("Couldn't find sound index");
        }
        const soundIndex: number = Uint32ToUint32Table.getValueFromIndex(soundsById, soundTableIndex);

        // @TODO: Maybe use the ID instead. Although this probably should just
        // be an user-defined name.
        title = `Sample ${soundIndex}`;
    }

    // Draw clip title.
    context.fillStyle = "#ffffff";
    context.font = "8pt sans-serif";
    context.textBaseline = "top";

    const titleLength: number = title.length;
    // Actually measuring this is too slow, so I'll just pretend this is
    // monospace. In this case there's no problem, we'll just start moving
    // the text back earlier.
    // @TODO: A remaining problem with this is that it will be incorrect for
    // fonts that are wider than they are tall. I could maybe try doing some
    // measuring for it first, trying to figure out if a larger width factor
    // would help.
    const titleWidthEstimate: number = titleLength * 8;
    const titleGapX: number = 2;
    const titleMinX: number = titleGapX;
    const titleMaxX: number = x + w - titleWidthEstimate;
    const titleX: number = Math.min(Math.max(titleMinX, x + titleGapX), titleMaxX);
    if (w > titleWidthEstimate + titleGapX) {
        context.fillText(title, titleX, y + 2);
    }
}

export function drawClipContents(
    canvasWidth: number,
    canvasHeight: number,
    context: CanvasRenderingContext2D,
    project: Project.Type,
    patternInfoCache: WeakMap<Pattern.Type, PatternInfo>,
    tempoMap: TempoMap.Type,
    samplesPerSecond: number,
    clip: Clip.Type,
    start: number,
    end: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    trackTop: number,
    trackHeight: number,
): void {
    const viewportX0: number = viewport.x0;

    const bodyHeight: number = (trackHeight - 1) - clipHeaderHeight;
    const x0: number = ((start - viewportX0) * pixelsPerTick);
    const x1: number = ((end - viewportX0) * pixelsPerTick);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    const y: number = trackTop - 1;
    const h: number = clipHeaderHeight + bodyHeight;

    if (w >= 4) {
        if (clip.kind === Clip.Kind.Pattern) {
            drawPatternClipContents(
                canvasWidth,
                canvasHeight,
                context,
                project,
                patternInfoCache,
                clip,
                start,
                end,
                viewport,
                pixelsPerTick,
                trackTop,
                trackHeight,
            );
        } else if (clip.kind === Clip.Kind.Sound) {
            drawSoundClipContents(
                canvasWidth,
                canvasHeight,
                context,
                project,
                tempoMap,
                samplesPerSecond,
                clip,
                start,
                end,
                viewport,
                pixelsPerTick,
                trackTop,
                trackHeight,
            );
        }
    }

    context.strokeRect(x, y, w, h);
}

function drawPatternClipContents(
    canvasWidth: number,
    canvasHeight: number,
    context: CanvasRenderingContext2D,
    project: Project.Type,
    patternInfoCache: WeakMap<Pattern.Type, PatternInfo>,
    clip: Clip.Type,
    start: number,
    end: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    trackTop: number,
    trackHeight: number,
): void {
    if (clip.kind !== Clip.Kind.Pattern) {
        return;
    }

    const viewportX0: number = viewport.x0;

    const duration: number = end - start;

    const bodyHeight: number = (trackHeight - 1) - clipHeaderHeight;
    const x0: number = ((start - viewportX0) * pixelsPerTick);
    const x1: number = ((end - viewportX0) * pixelsPerTick);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    const y: number = trackTop - 1;
    // const h: number = clipHeaderHeight + bodyHeight;

    const patternsById: Uint64ToUint32Table.Type = project.song.patternsById;
    const patternTableIndex: number = Uint64ToUint32Table.getIndexFromKey(
        patternsById,
        clip.patternIdLo,
        clip.patternIdHi,
    );
    if (patternTableIndex === -1) {
        throw new Error("Couldn't find pattern index");
    }
    const patternIndex: number = Uint64ToUint32Table.getValueFromIndex(patternsById, patternTableIndex);
    const pattern: Pattern.Type = project.song.patterns[patternIndex];
    const patternDuration: number = pattern.duration;

    const loopCount: number = Math.max(1, Math.ceil(duration / patternDuration));

    const notes: Note.Type[] = pattern.notes;
    const noteCount: number = notes.length;

    // @TODO: startOffset
    if (noteCount > 0) {
        const patternInfo: PatternInfo = patternInfoCache.get(pattern)!;
        const pitchBounds: NotePitchBoundsTracker = patternInfo.pitchBounds;
        const minPosition: number = 0;
        const maxPosition: number = minPosition + (end - start);
        let minNotePitch: number = pitchBounds.getMin() - 1;
        let maxNotePitch: number = pitchBounds.getMax();

        // Prevent huge notes in the pattern preview.
        const minPitchCount: number = 12; // @TODO: Use pitchesPerOctave here
        const diff: number = Math.max(0, (minPitchCount + 1) - (maxNotePitch - minNotePitch));
        const halfDiff: number = diff >>> 1;
        minNotePitch -= halfDiff;
        maxNotePitch += halfDiff;
        const noteH: number = bodyHeight / (maxNotePitch - minNotePitch);
        context.fillStyle = "#17d15b";
        for (let noteIndex: number = 0; noteIndex < noteCount; noteIndex++) {
            const note: Note.Type = notes[noteIndex];
            const noteStart: number = note.start;
            const noteEnd: number = note.end;
            const notePitch: number = note.pitch;
            const noteY: number = y + clipHeaderHeight + remap(notePitch, minNotePitch, maxNotePitch, bodyHeight - 4, 2);
            for (let loopIndex: number = 0; loopIndex < loopCount; loopIndex++) {
                const loopNoteStart: number = noteStart + patternDuration * loopIndex;
                const loopNoteEnd: number = noteEnd + patternDuration * loopIndex;
                const noteX0: number = clamp(remap(loopNoteStart, 0, maxPosition, 0, w), 0, w - 1);
                const noteX1: number = clamp(remap(loopNoteEnd, 0, maxPosition, 0, w), 0, w - 1);
                const noteX: number = x + noteX0;
                const noteW: number = noteX1 - noteX0;
                if (
                    rangesOverlap(noteX, noteX + noteW, 0, canvasWidth)
                    && rangesOverlap(noteY, noteY + noteH, 0, canvasHeight)
                ) {
                    context.fillRect(noteX, noteY, noteW, noteH);
                }
                if (loopNoteStart > duration) {
                    break;
                }
            }
            if (noteStart > duration) {
                break;
            }
        }
    }
    for (let loopIndex: number = 1; loopIndex < loopCount; loopIndex++) {
        const seamTick: number = patternDuration * loopIndex;
        const seamX: number = x + remap(seamTick, 0, duration, 0, w);
        if (seamX > x1) {
            break;
        }
        const dashCount: number = 5;
        const dashH: number = bodyHeight / dashCount;
        const dashGap: number = 2;
        for (let dashIndex: number = 0; dashIndex < dashCount; dashIndex++) {
            const y0: number = y + clipHeaderHeight + dashIndex * dashH + dashGap;
            const y1: number = y + clipHeaderHeight + (dashIndex + 1) * dashH - dashGap * 2;
            context.beginPath();
            context.moveTo(seamX, y0);
            context.lineTo(seamX, y1);
            context.stroke();
        }
    }
}

function drawSoundClipContents(
    canvasWidth: number,
    canvasHeight: number,
    context: CanvasRenderingContext2D,
    project: Project.Type,
    tempoMap: TempoMap.Type,
    samplesPerSecond: number,
    clip: Clip.Type,
    start: number,
    end: number,
    viewport: Viewport.Type,
    pixelsPerTick: number,
    trackTop: number,
    trackHeight: number,
): void {
    if (clip.kind !== Clip.Kind.Sound) {
        return;
    }

    const viewportX0: number = viewport.x0;
    const viewportX1: number = viewport.x1;
    // const viewportY0: number = viewport.y0;
    // const viewportY1: number = viewport.y1;

    const headerHeight: number = 14;
    const bodyHeight: number = (trackHeight - 1) - headerHeight;
    const x0: number = ((start - viewportX0) * pixelsPerTick);
    const x1: number = ((end - viewportX0) * pixelsPerTick);
    const w: number = Math.max(1, x1 - x0);
    const x: number = x0;
    const y: number = trackTop - 1;
    // const h: number = headerHeight + bodyHeight;

    const soundsById: Uint64ToUint32Table.Type = project.soundsById;
    const soundTableIndex: number = Uint32ToUint32Table.getIndexFromKey(
        soundsById,
        clip.soundId,
    );
    if (soundTableIndex === -1) {
        throw new Error("Couldn't find sound index");
    }
    const soundIndex: number = Uint32ToUint32Table.getValueFromIndex(soundsById, soundTableIndex);
    const sound: Sound.Type = project.sounds[soundIndex];
    const dataL: Float32Array = sound.dataL;
    const soundDurationInSamples: number = dataL.length;

    context.fillStyle = "#17d15b";

    const halfBodyHeight: number = bodyHeight * 0.5;
    const peakW: number = 1;

    const startTick: number = start;
    const endTick: number = end;
    const visibleStartTick: number = clamp(startTick, viewportX0, viewportX1);
    const visibleEndTick: number = clamp(endTick, viewportX0, viewportX1);
    if (visibleStartTick === visibleEndTick) {
        return;
    }

    const tempoMapSections: TempoMap.Section[] | null = tempoMap.sections;
    const tempoMapSectionCount: number = tempoMapSections != null ? tempoMapSections.length : 0;

    const startAbsoluteTimeInSeconds: number = TempoMap.computeSecondsFromTick(
        tempoMapSections,
        TempoMap.findSectionIndexByTick(tempoMapSections, startTick),
        startTick,
    );
    const visibleStartTempoMapSectionIndex: number = TempoMap.findSectionIndexByTick(tempoMapSections, visibleStartTick);
    const visibleStartAbsoluteTimeInSeconds: number = TempoMap.computeSecondsFromTick(
        tempoMapSections,
        visibleStartTempoMapSectionIndex,
        visibleStartTick,
    );
    const visibleEndAbsoluteTimeInSeconds: number = TempoMap.computeSecondsFromTick(
        tempoMapSections,
        TempoMap.findSectionIndexByTick(tempoMapSections, visibleEndTick),
        visibleEndTick,
    );

    let absoluteTimeInSeconds0: number = visibleStartAbsoluteTimeInSeconds;
    let absoluteTimeInTicks0: number = visibleStartTick;
    let absoluteTimeInSeconds1: number = visibleEndAbsoluteTimeInSeconds;
    let absoluteTimeInTicks1: number = visibleEndTick;
    let tempoMapSectionIndex: number = clamp(visibleStartTempoMapSectionIndex - 1, 0, tempoMapSectionCount);
    while (tempoMapSectionIndex < tempoMapSectionCount) {
        const section: TempoMap.Section = tempoMapSections[tempoMapSectionIndex++];
        if (section.positionInSeconds > absoluteTimeInSeconds0) {
            absoluteTimeInSeconds1 = section.positionInSeconds;
            absoluteTimeInTicks1 = section.positionInTicks;
            break;
        }
    }
    let regionDurationInTicks: number = absoluteTimeInTicks1 - absoluteTimeInTicks0;
    let regionDurationInSeconds: number = absoluteTimeInSeconds1 - absoluteTimeInSeconds0;
    let samplesPerPixel: number = (
        (regionDurationInSeconds * samplesPerSecond)
        / (regionDurationInTicks * pixelsPerTick)
    ) * peakW;
    // @TODO: What needs to happen if the sample rates don't match? I guess I have
    // to make use of the playback rate here first, then that sample rate mismatch
    // would be factored into it.
    let relativeTimeInSamples0: number = ((absoluteTimeInSeconds0 - startAbsoluteTimeInSeconds) * samplesPerSecond) | 0;
    let relativeTimeInSamples1: number = ((absoluteTimeInSeconds1 - startAbsoluteTimeInSeconds) * samplesPerSecond) | 0;

    let peakX: number = ((visibleStartTick - viewportX0) * pixelsPerTick) | 0;
    let peakNextX: number = ((absoluteTimeInTicks1 - viewportX0) * pixelsPerTick) | 0;
    const peakEndX: number = Math.min(x + w, ((visibleEndTick - viewportX0) * pixelsPerTick) | 0);
    const peakTopY: number = y + headerHeight;
    let hasPrevPeakY: boolean = false;
    let prevPeakY0: number = 0;
    let prevPeakY1: number = 0;

    while (peakX < peakEndX) {
        if (regionDurationInTicks > 0) {
            // @TODO: Store a downsampled copy of the sound's peaks. This gets
            // slower and slower the more times we loop through the sound.
            let peakMin: number = Infinity;
            let peakMax: number = -Infinity;
            let peakSampleIndex: number = clamp(
                (relativeTimeInSamples0 % soundDurationInSamples) | 0,
                0,
                soundDurationInSamples - 1
            );
            const peakSampleEndIndex: number = peakSampleIndex + Math.max(1, samplesPerPixel | 0);
            while (peakSampleIndex < peakSampleEndIndex) {
                if (peakSampleIndex >= soundDurationInSamples || peakSampleIndex > relativeTimeInSamples1) {
                    break;
                }
                const sample: number = dataL[peakSampleIndex];
                peakMin = Math.min(peakMin, sample);
                peakMax = Math.max(peakMax, sample);
                peakSampleIndex++;
            }
            if (peakMin === Infinity) {
                peakMin = 0;
                peakMax = 0;
            }
            relativeTimeInSamples0 += samplesPerPixel;

            const visualGain: number = 1;
            const nextPeakY0: number = (
                (peakTopY + halfBodyHeight - clamp(peakMax * visualGain, -1, 1) * halfBodyHeight) | 0
            );
            const nextPeakY1: number = (
                (peakTopY + halfBodyHeight - clamp(peakMin * visualGain, -1, 1) * halfBodyHeight) | 0
            );
            const peakY0: number = hasPrevPeakY ? Math.min(prevPeakY1, nextPeakY0) : nextPeakY0;
            const peakY1: number = hasPrevPeakY ? Math.max(prevPeakY0, nextPeakY1) : nextPeakY1;
            const peakY: number = peakY0;
            const peakH: number = Math.max(1, peakY1 - peakY0);
            hasPrevPeakY = true;
            prevPeakY0 = peakY0;
            prevPeakY1 = peakY1;

            const peakX0: number = peakX;
            const peakX1: number = Math.min(x + w, peakX0 + peakW);

            context.fillRect(peakX, peakY, peakX1 - peakX0, peakH);

            peakX += peakW;
        }

        if (regionDurationInTicks <= 0 || peakX >= peakNextX) {
            absoluteTimeInSeconds0 = absoluteTimeInSeconds1;
            absoluteTimeInTicks0 = absoluteTimeInTicks1;
            if (tempoMapSectionIndex < tempoMapSectionCount) {
                const section: TempoMap.Section = tempoMapSections[tempoMapSectionIndex++];
                absoluteTimeInSeconds1 = section.positionInSeconds;
                absoluteTimeInTicks1 = section.positionInTicks;
            } else {
                absoluteTimeInSeconds1 = visibleEndAbsoluteTimeInSeconds;
                absoluteTimeInTicks1 = visibleEndTick;
            }
            regionDurationInTicks = absoluteTimeInTicks1 - absoluteTimeInTicks0;
            regionDurationInSeconds = absoluteTimeInSeconds1 - absoluteTimeInSeconds0;
            samplesPerPixel = (
                (regionDurationInSeconds * samplesPerSecond)
                / (regionDurationInTicks * pixelsPerTick)
            ) * peakW;
            relativeTimeInSamples0 = ((absoluteTimeInSeconds0 - startAbsoluteTimeInSeconds) * samplesPerSecond) | 0;
            relativeTimeInSamples1 = ((absoluteTimeInSeconds1 - startAbsoluteTimeInSeconds) * samplesPerSecond) | 0;

            peakNextX = ((absoluteTimeInTicks1 - viewportX0) * pixelsPerTick) | 0;
        }
    }
}
