/**
 * Creates an HTML element with attributes and children, e.g.  
 * H('div', { class: 'one two' })
 * 
 * Use document.createTextNode() for unknown text, or T() for localized text  
 * Use S() for SVG elements which are different than HTML.
 */
export function H<K extends keyof HTMLElementTagNameMap>(
    elementType: K,
    attributes: { [key: string]: string },
    ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
    const element: HTMLElementTagNameMap[K] = document.createElement(elementType);
    for (const key in attributes) {
        const value: string = attributes[key];
        element.setAttribute(key, value);
    }
    for (const child of children) {
        element.appendChild(
            typeof child === "string" ? document.createTextNode(child) : child
        );
    }
    return element;
}

/**
 * Creates an SVG element with attributes and children, e.g.
 * S('svg', {}, S('path', { d: 'values here' }))
 * 
 * Use H() for HTML elements.
 * Use parse() to convert an HTML string to elements without type safety. This is practical for static SVGs.
 */
export function S<K extends keyof SVGElementTagNameMap>(
    elementType: K,
    attributes: { [key: string]: string },
    ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
    const element: SVGElementTagNameMap[K] = document.createElementNS(
        "http://www.w3.org/2000/svg", elementType
    );
    for (const key in attributes) {
        const value: string = attributes[key];
        element.setAttribute(key, value);
    }
    for (const child of children) {
        element.appendChild(
            typeof child === "string" ? document.createTextNode(child) : child
        );
    }
    return element;
}

/**
 * Parses an HTML string to html element(s) and returns them. This can inject script nodes; do not expose to user
 * input. Chunks of static HTML are ideal for SVGs; prefer H() and S() to generate HTML or SVG elements normally.
 */
export function parse(htmlStr: string): ChildNode | NodeListOf<ChildNode> | null {
    const template = document.createElement('template');
    template.innerHTML = htmlStr.trim();

    return template.content.childNodes.length === 0 ? null
        : template.content.childNodes.length === 1 ? template.content.firstChild
        : template.content.childNodes;
}