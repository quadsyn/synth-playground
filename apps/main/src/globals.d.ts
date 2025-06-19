// Similar to https://vite.dev/guide/env-and-mode#intellisense-for-typescript
// This is just so TypeScript won't complain, esbuild is responsible for making
// it actually work.
declare module "inlineworker!*" {
    const value: string;
    export = value;
}
