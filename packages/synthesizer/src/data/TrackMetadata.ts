export const DefaultHeight = 70;

export interface Type {
    name: string;
    height: number;
    collapsed: boolean;
}

export function make(
    name: string,
    height: number,
    collapsed: boolean,
): Type {
    return {
        name: name,
        height: height,
        collapsed: collapsed,
    };
}
