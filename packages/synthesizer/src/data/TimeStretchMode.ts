export const enum TimeStretchMode {
    None,

    // Uses a specialized variant of "granular synthesis".
    LowQuality,

    // Uses https://github.com/Signalsmith-Audio/signalsmith-stretch
    HighQuality,
}
