// @TODO: Formalize color use along with themes.

export const gridBackgroundColor: string = "#303030";
export const gridOctaveColor: string = "#886644";
export const gridFifthColor: string = "#446688";
export const gridLineColor: string = "#000000";

export const noteBackgroundColor: string = "#0c6735";
export const noteForegroundColor: string = "#17d15b";

export const noteEdgeHoverColor: string = "rgba(255, 255, 255, 0.4)";

export const noteEnvelopePointColor: string = "rgb(14, 48, 1)";

export const selectedNoteLineColor: string = "rgb(167, 250, 178)";

export const boxSelectionLineColor: string = "#ffffff";
export const boxSelectionFillColor: string = "rgba(255, 255, 255, 0.2)";

export const noteFlashColorTable: string[] = [];
{
    const n: number = 256;
    for (let i: number = 0; i < n; i++) {
        const alpha: number = i / n;
        noteFlashColorTable.push("rgba(255, 255, 255, " + alpha + ")");
    }
}

export const playheadColor: string = "#ffffff";

// I could call these white and black but it's a bit funny to have a color in
// the name but potentially some other color as the value.
export const pianoNaturalKeyColor: string = "#a5a5a5";
export const pianoAccidentalKeyColor: string = "#131313";
