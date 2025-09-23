export function promptToDownloadUrl(url: string, filename: string): void {
    const anchor: HTMLAnchorElement = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    // @TODO: BeepBox has some extra code when anchor.download is undefined.
    // What are the browsers that need it?
    anchor.download = filename;
    // @TODO: BeepBox doesn't bother adding the anchor to the document, and it
    // still works, but Perfetto does it. Why?
    anchor.click();
    // @TODO: Doing this immediately seems to be okay (see e.g. Perfetto), but
    // it's not done in BeepBox. Why?
    URL.revokeObjectURL(url);
}

export function promptToDownloadBlob(blob: Blob, filename: string): void {
    const url: string = URL.createObjectURL(blob);
    promptToDownloadUrl(url, filename);
}
