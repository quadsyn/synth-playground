export interface Component {
    /** DOM element used to display this component. */
    element: HTMLElement;

    /**
     * Called when the component is destroyed and removed from the DOM.
     *
     * Components have the responsibility to call this for their subcomponents.
     */
    dispose(): void;

    /**
     * Synchronizes the DOM element with the current state in memory.
     *
     * This function should be idempotent: multiple calls in a row should not
     * lead to different visual results, if the relevant state (of the program
     * or the component) didn't change.
     *
     * Components have the responsibility to call this for their subcomponents.
     * Note that this means calling `subcomponent.render()` inside their own
     * `render` function, but nowhere else. If a screen update is desired, it
     * should go through `UIContext` and its `scheduleMainRender` method.
     *
     * If you need to run something when the component is "mounted", track when
     * the first call to render happens. Something like this:
     *
     *     class Thing implements Component {
     *         private _mounted: boolean;
     *         constructor() { this._mounted = false; }
     *         public onDidMount(): void { this._mounted = true; }
     *         public render(): void { if (!this._mounted) this.onDidMount(); }
     *     }
     */
    render(): void;
}
