/**
 * C#-like event. Anyone can un/subscribe, subscribers are not aware of each other, and invoking will invoke all.
 * Subscribing returns a unique number used to unsubscribe lambdas easily.
*/
export class Event<T extends Function>
{
    private counter = 0;
    private funcs: {[key: string]: T} = {};

	/** If there are any subscribers, calls all of them in whatever order they were added. */
    public Invoke(...params: (T extends (...args: infer A) => void ? A : any)) {
        const keys = Object.keys(this.funcs);

        for (let i = 0; i < keys.length; i++) {
            this.funcs[keys[i]](...params as T[]);
        }
    }

	/** The function will execute whenever the event is invoked. */
    public Sub(func: T): number {
        this.funcs[this.counter] = func;
        return this.counter++;
    }

	/**
     * The function, if subscribed, will no longer execute when the event is invoked. You may pass a token returned by subscribing, or the function. */
    public Unsub(tokenOrFunction: number | T) {
        if (typeof tokenOrFunction === "number") {
            delete this.funcs[tokenOrFunction];
        } else {
            const keys = Object.keys(this.funcs);

            for (let i = 0; i < keys.length; i++) {
                if (this.funcs[keys[i]] === tokenOrFunction) {
                    delete this.funcs[keys[i]];
                    break;
                }
            }
        }
        
    }
}
