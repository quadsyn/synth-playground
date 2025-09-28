export interface ClipTransform {
    newStart: number;
    newEnd: number;

    // These are the original values. I'm storing these here for now.
    clipIndex: number;
    clipTrackIndex: number;
}
