/**
 * Elements can't be hashed for use in a dictionary, so custom element classes may keep a static Registry instance
 * for this purpose, if they always add their elements and dispose registry entries when cleaned up. For that reason,
 * elements should implement the Component interface. A registry works for up to 2^32 elements.
 */
export class Registry<T extends { element: Element }>
{
	private uniqueIDCounter = 0;
	private readonly dict: { [key: number]: T } = {};

	/** iterates the internal dictionary to return all keys. */
	public getKeys(): string[] {
		return Object.keys(this.dict);
	}

	/** Returns every item in the registry. */
	public getValues(): T[] {
		return this.getKeys().map(key => this.get(+key) as T);
	}

	/**
	 * Adds the given element and returns a new unique ID. Unless skipCheck is provided, it will first search for
	 * an existing entry and return its existing ID if found.
	 */
	public add(item: T, skipCheck?: boolean): number {
		if (!skipCheck) {
			const keys = Object.keys(this.dict);
			for (const key of keys) {
				if (this.dict[+key] === item) {
					return +key;
				}
			}
		}

		this.dict[this.uniqueIDCounter] = item;
		return this.uniqueIDCounter++;
	}

	/** Deletes the provided entry, if found. */
	public remove(id: number) {
		delete this.dict[id];
	}

	/** Returns the element with the given ID, if found */
	public get(id: number): T | undefined {
		return this.dict[id];
	}

	/** Searches for the given element and returns the corresponding key, if found. */
	public find(idOrElement: Node | null | undefined): T | undefined {
		if (idOrElement) {
			const keys = Object.keys(this.dict);
			for (const key of keys) {
				if (this.dict[+key].element === idOrElement) {
					return this.dict[+key];
				}
			}
		}

		return undefined;
	}
}