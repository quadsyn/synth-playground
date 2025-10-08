import type { SplitterDirection } from "./Splitter.js";
import type { IDockPanelLayout } from "./DockPanel.js";
import { DockStack } from "./DockStack.js";
import { DockStrip } from "./DockStrip.js";

export type DockElement = DockStrip | DockStack;

export interface IDockStackLayout
{
	type: "stack";
	size: number;
	activePanelIndex: number;
	panels: IDockPanelLayout[];
}

export interface IDockStripLayout
{
	type: "strip";
	size: number;
	direction: SplitterDirection;
	elements: IDockElementLayout[];
}

export type IDockElementLayout = Omit<IDockStripLayout | IDockStackLayout, "type"> & { type: "stack" | "strip" };

export const getDockElement = (e: Element): DockElement | undefined => 
	DockStrip.registry.find(e) ?? DockStack.registry.find(e);