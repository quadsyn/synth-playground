import { StringId } from "./StringId.js";
import { LanguageId } from "./LanguageId.js";
import englishStrings from "./strings/en-US.json";

// @TODO:
// - Actually load other languages.
//   - I have no idea what is going to be a good way to store them. I'd like to
//     somehow support this even for single-file .html builds (it's how I like
//     to test), but I don't know if that's practical. The issue with that is,
//     if I don't just bundle everything into one giant file, loading things
//     dynamically can only be done by inserting `<script>`s that point to JS
//     code. That's rather icky for user-facing things.
//   - I think I'll need some way of loading a "preview language", which of
//     course can't be statically known here.
// - Do I need to parse language tags "fully"? If Intl.Locale is available I can
//   just use that I guess. Also this doesn't seem like it will matter for now,
//   as the tag->id matching doesn't actually care.
// - String interpolation.
//   - Is there some generic thing I can do for caching this?
// - Introduce some sort of description/"context" for translations. May need to
//   switch to a different format for this.
// - Consult related libraries, and steal good ideas.

export class LocalizationManager {
    private _fallbackTable: Map<StringId, string>;
    private _table: Map<StringId, string>;
    private _tableIsDirty: boolean;
    private _language: LanguageId;
    private _version: number;

    constructor() {
        // Not great for memory :/
        this._fallbackTable = parseNestedStringObject(englishStrings);

        this._table = new Map();
        this._tableIsDirty = true;

        this._language = LanguageId.PT_BR;

        this._version = 0;
    }

    /**
     * Use this to know if you need to re-render (and cache, etc) because the
     * language changed.
     */
    public getVersion(): number {
        return this._version;
    }

    private _bumpVersion(): void {
        this._version = (this._version + 1) >>> 0;
    }

    public translate(id: StringId): string {
        let found: string | undefined = this._table.get(id);

        if (found == null && this._table !== this._fallbackTable) {
            found = this._fallbackTable.get(id);
        }

        return found == null ? id : found;
    }

    public setLanguage(id: LanguageId): void {
        this._language = id;

        this._tableIsDirty = true;
    }

    /** Returns true if the string table changed. */
    public async populateStringTable(): Promise<boolean> {
        if (!this._tableIsDirty) {
            return false;
        }

        if (this._language === LanguageId.EN_US) {
            this._table = this._fallbackTable;

            this._bumpVersion();
            this._tableIsDirty = false;
        } else {
            const languageWeWanted: LanguageId = this._language;

            try {
                const data: Response = await fetch(
                    `./languages/${languageWeWanted}.json`,
                    // @TODO: I don't know how much this should wait.
                    { signal: AbortSignal.timeout(10_000) }
                );
                if (languageWeWanted !== this._language) {
                    // In this case, the language file is ready to be used but
                    // we changed to a different language while that was
                    // loading, so, as long as the caller was careful to call
                    // `populateStringTable` again after `setLanguage`, we'll
                    // let that take over.
                    return false;
                }
                const json: Object = await data.json();
                this._table = parseNestedStringObject(json);

                this._bumpVersion();
                this._tableIsDirty = false;
            } catch (error) {
                console.error(error);

                return false;
            }
        }

        return true;
    }
}

function parseNestedStringObject(source: Object): Map<StringId, string> {
    const destination: Map<StringId, string> = new Map();

    interface StackEntry {
        path: string;
        object: Object;
    }

    const stack: StackEntry[] = [{ path: "", object: source }];
    while (stack.length > 0) {
        const entry: StackEntry = stack.pop()!;
        const path: string = entry.path;
        const object: Object = entry.object;

        if (Array.isArray(object)) {
            // throw new Error("Can't have an array here");
        } else if (typeof object === "string") {
            destination.set(path as StringId, object);
        } else if (object != null && typeof object === "object") {
            for (const [key, value] of Object.entries(object)) {
                const p: string = path === "" ? key : (path + "." + key);
                stack.push({ path: p, object: value });
            }
        } else {
            // throw new Error("Can't have a " + Object.prototype.toString.call(object) + " value here");
        }
    }

    return destination;
}

// The following was borrowed from Eve's web-story.

// I have a soft rule to avoid code running at the top level like this (except
// for the entry point), but in this case it's fine.
const availableLanguages: Map<string, LanguageId> = new Map([]);
(<[LanguageId, string[]][]>[
    [LanguageId.EN_US, ["en", "en-us"]],
    [LanguageId.PT_BR, ["pt-br"]],
]).forEach(([id, aliases]) => {
    for (const alias of aliases) {
        availableLanguages.set(alias, id);
    }
});

export function computeLanguageId(candidates: readonly string[]): LanguageId {
    let id: LanguageId = LanguageId.EN_US;

    for (const candidate of candidates) {
        const parts: string[] = candidate.toLowerCase().split("-");
        const language: string = parts[0];
        const region: string = parts.length > 1 ? parts[1] : "";

        let found: LanguageId | undefined = availableLanguages.get(`${language}-${region}`);

        if (found == null) {
            found = availableLanguages.get(language);
        }

        if (found != null) {
            id = found;
            break;
        }
    }

    return id;
}

export function computeLanguageIdForPreferredLanguage(): LanguageId {
    return computeLanguageId(navigator.languages != null ? navigator.languages : [navigator.language]);
}
