import * as Breakpoint from "./Breakpoint.js";

// @TODO:
// - Store the section count separately, and reallocate less often when
//   updating.
// - Store the sections in a flat array of numbers. It should be better for
//   scanning through them. Could also use a typed array but I don't know if
//   that would be much better than a plain JS array.

export interface Type {
    // These should cover the entire song.
    // It's always expected that at least one section must exist.
    sections: Section[];

    songDurationInSeconds: number;
}

export function make(): Type {
    return {
        sections: [],
        songDurationInSeconds: 0.0,
    };
}

export function update(
    tempoMap: Type,
    ticksPerBeat: number,
    songDurationInTicks: number,
    beatsPerMinute: number,
    tempoEnvelope: Breakpoint.Type[] | null,
): void {
    const newSections: Section[] = [];

    if (tempoEnvelope == null) {
        const positionInTicks: number = 0;
        const positionInSeconds: number = 0.0;

        const secondsPerBeat: number = 60.0 / beatsPerMinute;
        const secondsPerTick: number = secondsPerBeat / ticksPerBeat;

        const durationInTicks: number = songDurationInTicks;
        const durationInSeconds: number = durationInTicks * secondsPerTick;

        newSections.push(makeSection(
            positionInTicks,
            positionInSeconds,
            durationInTicks,
            durationInSeconds,
            beatsPerMinute,
            secondsPerTick,
        ));
        tempoMap.songDurationInSeconds = durationInSeconds;
    } else {
        const tempoEnvelopeLength: number = tempoEnvelope.length;

        // 0 points -> 1 section
        // 1 point  -> 2 sections
        // 2 points -> 3 sections
        // ...
        const sectionCount: number = 1 + tempoEnvelopeLength;
        let sectionIndex: number = 0;

        let songDurationInSeconds: number = 0;

        let positionInTicks0: number = 0;
        let positionInSeconds0: number = 0.0;
        let beatsPerMinute0: number = beatsPerMinute;
        let positionInTicks1: number = songDurationInTicks;
        let beatsPerMinute1: number = beatsPerMinute0;

        let pointIndex: number = 0;
        if (tempoEnvelopeLength > 0) {
            const next: Breakpoint.Type = tempoEnvelope[pointIndex++];
            beatsPerMinute0 = next.value;
            beatsPerMinute1 = beatsPerMinute0;
            positionInTicks1 = next.time;
        }

        while (sectionIndex < sectionCount) {
            const durationInTicks0: number = positionInTicks1 - positionInTicks0;
            const secondsPerTick0: number = (60.0 / beatsPerMinute0) / ticksPerBeat;
            const durationInSeconds0: number = durationInTicks0 * secondsPerTick0;
            const positionInSeconds1: number = positionInSeconds0 + durationInSeconds0;

            if (durationInTicks0 > 0) {
                newSections.push(makeSection(
                    positionInTicks0,
                    positionInSeconds0,
                    durationInTicks0,
                    durationInSeconds0,
                    beatsPerMinute0,
                    secondsPerTick0,
                ));

                songDurationInSeconds += durationInSeconds0;
            }

            positionInSeconds0 = positionInSeconds1;
            positionInTicks0 = positionInTicks1;
            beatsPerMinute0 = beatsPerMinute1;
            if (pointIndex < tempoEnvelopeLength) {
                const next: Breakpoint.Type = tempoEnvelope[pointIndex++];
                beatsPerMinute1 = next.value;
                positionInTicks1 = next.time;
            } else {
                positionInTicks1 = songDurationInTicks;
            }
            sectionIndex++;
        }

        tempoMap.songDurationInSeconds = songDurationInSeconds;
    }

    tempoMap.sections = newSections;
}

export function findSectionIndexByTick(
    sections: Section[],
    tick: number,
): number {
    const length: number = sections.length;

    // @TODO: Accept a previous index, and do a linear search from there.

    // https://en.wikipedia.org/wiki/Binary_search#Procedure_for_finding_the_rightmost_element
    let left: number = 0;
    let right: number = length;
    while (left < right) {
        const middle: number = Math.floor(left + (right - left) / 2);
        if (sections[middle].positionInTicks > tick) {
            // Consider the lower half.
            right = middle;
        } else {
            // Consider the upper half.
            left = middle + 1;
        }
    }

    const result: number = right - 1;
    if (result >= length) {
        return length - 1;
    } else if (result < 0) {
        return 0;
    } else {
        return result;
    }
}

export function computeSecondsFromTick(
    sections: Section[],
    sectionIndex: number,
    songTick: number,
): number {
    const section: Section = sections[sectionIndex];
    const sectionTick: number = songTick - section.positionInTicks;
    return section.positionInSeconds + sectionTick * section.secondsPerTick;
}

export interface Section {
    positionInTicks: number;
    positionInSeconds: number;

    durationInTicks: number;
    // @TODO: Drop `durationInSeconds`? It's always `durationInTicks * secondsPerTick`
    // which should not be an issue to calculate where used.
    durationInSeconds: number;

    beatsPerMinute: number;
    // @TODO: Drop `secondsPerTick`? It should be fine to always calculate it from
    // `beatsPerMinute` and the PPQN value when needed.
    secondsPerTick: number;
}

export function makeSection(
    positionInTicks: number,
    positionInSeconds: number,
    durationInTicks: number,
    durationInSeconds: number,
    beatsPerMinute: number,
    secondsPerTick: number,
): Section {
    return {
        positionInTicks: positionInTicks,
        positionInSeconds: positionInSeconds,
        durationInTicks: durationInTicks,
        durationInSeconds: durationInSeconds,
        beatsPerMinute: beatsPerMinute,
        secondsPerTick: secondsPerTick,
    };
}
