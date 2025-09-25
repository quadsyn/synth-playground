import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import * as esbuild from "esbuild";

async function main() {
    let showHelpAndExit = false;
    let shouldMinify = true;
    let skipTypeChecking = false;
    const outputDirectory = "./built"; // Relative to the repository root.

    const argv = process.argv;
    const argc = argv.length;
    for (let i = 2; i < argc; i++) {
        const arg = argv[i];
        switch (arg) {
            case "--dev": { shouldMinify = false; } break;
            case "--skip-type-checking": { skipTypeChecking = true; } break;
            case "-h": { showHelpAndExit = true; } break;
            case "--help": { showHelpAndExit = true } break;
        }
    }

    if (showHelpAndExit) {
        console.log(`\
Usage: ${argv[0]} ${argv[1]} [option]...
Options:
  --dev                Disable minification
  --skip-type-checking Don't run the TypeScript compiler
  -h, --help           Show this message
`
        );
        process.exit(0);
        return;
    }

    const appDirectories = [];
    for (const entry of await fs.readdir("./apps", { withFileTypes: true })) {
        if (entry.isDirectory()) {
            appDirectories.push(path.join(entry.parentPath, entry.name));
        }
    }

    await build(
        outputDirectory,
        appDirectories,
        shouldMinify,
        skipTypeChecking
    );
}

async function build(
    outputDirectory,
    appDirectories,
    shouldMinify,
    skipTypeChecking
) {
    await copyPublicFiles(shouldMinify, outputDirectory, ".");
    for (const appDirectory of appDirectories) {
        const name = appDirectory.split(path.sep).at(-1);
        await copyPublicFiles(
            shouldMinify,
            path.join(outputDirectory, name),
            appDirectory,
        );
        await copyLanguageFiles(
            path.join(path.join(outputDirectory, name), "languages"),
            appDirectory,
        );
        if (!skipTypeChecking) {
            await checkTypes(appDirectory);
        }
        await bundleApplication(
            name,
            appDirectory,
            outputDirectory,
            shouldMinify,
            skipTypeChecking
        );
    }
}

async function copyPublicFiles(shouldMinify, outputDirectory, inputDirectory) {
    try {
        await fs.access(path.join(inputDirectory, "public"));
        await esbuild.build({
            logOverride: {
                "empty-glob": "silent",
            },
            entryPoints: [
                path.join(inputDirectory, "public/**/*.html"),
                path.join(inputDirectory, "public/**/*.css"),
            ],
            loader: {
                ".html": "copy",
                ".css": "css",
            },
            minify: shouldMinify,
            outdir: outputDirectory,
        });
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
}

async function copyLanguageFiles(outputDirectory, inputDirectory) {
    // @TODO: Should I care to figure out how to minify these?
    try {
        await fs.access(path.join(inputDirectory, "src/localization/strings"));
        await esbuild.build({
            logOverride: {
                "empty-glob": "silent",
            },
            entryPoints: [
                path.join(inputDirectory, "src/localization/strings/*.json"),
            ],
            loader: {
                ".json": "copy",
            },
            outdir: outputDirectory,
        });
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
}

async function checkTypes(appDirectory) {
    try {
        await new Promise((resolve, reject) => {
            const tsc = spawn("npx", ["tsc", "--noEmit", "-p", `"${appDirectory}"`], {
                shell: true,
            });
            tsc.stdout.on("data", (data) => {
                process.stdout.write(data);
            });
            tsc.stderr.on("data", (data) => {
                process.stdout.write(data);
            });
            tsc.on("exit", (code, signal) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new FailedTypeChecking());
                }
            });
        });
    } catch (error) {
        if (error instanceof FailedTypeChecking) {
            process.exit(1);
        } else {
            throw error;
        }
    }
}

class FailedTypeChecking extends Error {
    constructor() {
        super();
    }
}

async function findTsConfigFor(sourcePath) {
    let currentFolder = path.dirname(sourcePath);
    while (currentFolder != null && (
        path.basename(currentFolder) !== "packages"
        && path.basename(currentFolder) !== "apps"
    )) {
        let hasTsConfig = true;
        try {
            await fs.access(path.join(currentFolder, "tsconfig.json"));
        } catch (error) {
            if (error.code === "ENOENT") {
                hasTsConfig = false;
            } else {
                throw error;
            }
        }
        if (hasTsConfig) {
            return currentFolder;
        }
        currentFolder = path.dirname(currentFolder);
    }
    throw new Error("Couldn't find tsconfig.json");
}

function inlineWorkerPlugin(shouldMinify, skipTypeChecking) {
    return {
        name: "inlineWorkerPlugin",
        setup(build) {
            build.onResolve({ filter: /^inlineworker!/ }, async (args) => {
                const workerPath = args.path.replace(/^inlineworker!/, "");
                const resolved = await build.resolve(workerPath, {
                    kind: "import-statement",
                    resolveDir: args.resolveDir,
                });
                if (resolved.errors.length > 0) {
                    return { errors: resolved.errors };
                }
                return {
                    // If you use the dataurl loader, you need to append a .js
                    // suffix unconditionally here so that the loader prepends
                    // the correct mimetype (application/javascript).
                    path: resolved.path + ".js",
                    pluginData: {
                        realPath: resolved.path,
                    },
                    namespace: "inlineWorker",
                };
            });
            build.onLoad({
                filter: /.*/,
                namespace: "inlineWorker",
            }, async (args) => {
                if (!skipTypeChecking) {
                    await checkTypes(await findTsConfigFor(args.path));
                }
                const { outputFiles } = await esbuild.build({
                    entryPoints: [args.pluginData.realPath],
                    bundle: true,
                    minify: shouldMinify,
                    write: false,
                });
                const contents = outputFiles[0].contents;
                return { contents: contents, loader: "dataurl" };
            });
        }
    };
}

async function bundleApplication(
    appName,
    appDirectory,
    outputDirectory,
    shouldMinify,
    skipTypeChecking
) {
    const packageJsonContents = JSON.parse(await fs.readFile(
        path.join(appDirectory, "package.json"), { encoding: "utf-8" }
    ));
    const entryPoint = packageJsonContents["main"];
    await esbuild.build({
        entryPoints: [path.join(appDirectory, entryPoint)],
        bundle: true,
        minify: shouldMinify,
        outdir: path.join(outputDirectory, appName),
        plugins: [inlineWorkerPlugin(shouldMinify, skipTypeChecking)],
        loader: {
            ".svg": "dataurl",
        },
    });
}

main();
