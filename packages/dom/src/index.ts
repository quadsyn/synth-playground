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
