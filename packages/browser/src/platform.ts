export const userAgent: string = navigator.userAgent;

// Borrowed from https://github.com/microsoft/vscode/blob/2509d0f66d2b5866e9d8322e3f8f709b33e11352/src/vs/base/common/platform.ts
export const isWindows = userAgent.indexOf("Windows") >= 0;
export const isMac: boolean = userAgent.indexOf("Macintosh") >= 0;
export const isLinux: boolean = userAgent.indexOf("Linux") >= 0;
export const isChrome: boolean = userAgent.indexOf("Chrome") >= 0;
export const isSafari: boolean = !isChrome && userAgent.indexOf("Safari") >= 0;
export const isFirefox: boolean = userAgent.indexOf("Firefox") >= 0;
