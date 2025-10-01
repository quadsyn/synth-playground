export const enum MessageKind {
    // Main thread -> audio thread
    Play,
    Pause,
    Stop,

    Seek,

    LoadSong,

    LoadSound,

    PlayPianoNote,
    StopPianoNote,

    Quit,

    // Audio thread -> main thread
    ReceivedSound,
}
