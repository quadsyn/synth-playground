export type GraphNodeId = number;

export interface GraphNode {
    incoming: GraphNodeId[];
}

export interface ToposortResult {
    orderIds: GraphNodeId[];
    cycleIds: GraphNodeId[];
}

// This is https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm
// Specifically, it's derived from https://www.embeddedrelated.com/showarticle/799.php
// which is a bit simpler in our case since we only store incoming edges. I
// haven't seen a lot of other instances of this reversed variant of Kahn's
// algorithm besides the embeddedrelated article.
export function toposort(graph: GraphNode[]): ToposortResult {
    // @TODO: Could reuse these allocations. They can only be as large as
    // graph.length, so we don't need to resize unless that becomes larger.

    const outgoingCounts: Uint32Array = new Uint32Array(graph.length);
    for (const node of graph) for (const otherId of node.incoming) outgoingCounts[otherId]++;

    const pending: GraphNodeId[] = [];
    // @TODO: Could skip this search if the final destination node is given.
    for (let nodeId: number = 0; nodeId < graph.length; nodeId++) {
        if (outgoingCounts[nodeId] === 0) pending.push(nodeId);
    }

    const orderIds: GraphNodeId[] = [];
    while (pending.length > 0) {
        const nodeId: GraphNodeId = pending.pop()!;
        orderIds.push(nodeId);
        for (const otherId of graph[nodeId].incoming) {
            outgoingCounts[otherId]--;
            if (outgoingCounts[otherId] === 0) pending.push(otherId);
        }
    }
    orderIds.reverse();

    const cycleIds: GraphNodeId[] = [];
    for (let nodeId: number = 0; nodeId < graph.length; nodeId++) {
        if (outgoingCounts[nodeId] > 0) cycleIds.push(nodeId);
    }

    return { orderIds: orderIds, cycleIds: cycleIds };
}
